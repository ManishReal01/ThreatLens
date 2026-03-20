"""Base feed worker: HTTP client, exponential backoff retry, feed run lifecycle."""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import ClassVar, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_random_exponential

from app.config import Settings
from app.models.feed_run import FeedRunModel

logger = logging.getLogger(__name__)


class FeedWorkerError(Exception):
    """Base error for feed worker failures."""


class RateLimitError(FeedWorkerError):
    """Raised when a feed API returns HTTP 429."""


class BaseFeedWorker(ABC):
    """Abstract base for all feed adapters.

    Manages the HTTP client lifecycle and feed run tracking.
    Each adapter must define FEED_NAME and implement fetch_and_normalize().

    Usage::

        async with AbuseIPDBWorker(settings) as worker:
            async with AsyncSessionLocal() as session:
                await worker.run(session)
    """

    FEED_NAME: ClassVar[str]

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------
    # Context manager — open/close the shared HTTP client once per run
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "BaseFeedWorker":
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
            headers={"User-Agent": "ThreatLens/1.0"},
        )
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            raise RuntimeError("Worker not started — use 'async with worker'")
        return self._client

    # ------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if all required API keys/settings are present."""
        ...

    @abstractmethod
    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        """Fetch IOCs from the feed, normalize, and upsert to the database.

        Returns:
            (fetched, new, updated) — IOC counts for the run record.
        """
        ...

    # ------------------------------------------------------------------
    # Feed run lifecycle
    # ------------------------------------------------------------------

    async def run(self, session: AsyncSession) -> FeedRunModel:
        """Execute a complete feed run and write a feed_runs row regardless of outcome."""
        if not self.is_configured():
            logger.warning(
                "%s feed is not configured (missing API key) — skipping", self.FEED_NAME
            )
            feed_run = FeedRunModel(
                feed_name=self.FEED_NAME,
                status="error",
                error_msg="Feed not configured — set the required API key in .env",
                completed_at=datetime.now(timezone.utc),
            )
            session.add(feed_run)
            await session.commit()
            return feed_run

        feed_run = FeedRunModel(feed_name=self.FEED_NAME, status="running")
        session.add(feed_run)
        await session.flush()  # assign UUID without committing the transaction
        run_id = str(feed_run.id)
        logger.info("Starting %s feed run %s", self.FEED_NAME, run_id)

        try:
            fetched, new, updated = await self.fetch_and_normalize(session, run_id)

            feed_run.status = "success"
            feed_run.iocs_fetched = fetched
            feed_run.iocs_new = new
            feed_run.iocs_updated = updated
            feed_run.completed_at = datetime.now(timezone.utc)
            feed_run.last_successful_sync = datetime.now(timezone.utc)
            feed_run.consecutive_failure_count = 0
            await session.commit()
            logger.info(
                "%s run %s complete: %d fetched, %d new, %d updated",
                self.FEED_NAME,
                run_id,
                fetched,
                new,
                updated,
            )

        except Exception as exc:
            logger.exception("%s run %s failed: %s", self.FEED_NAME, run_id, exc)
            await session.rollback()

            # Re-add feed_run to the session (rolled back above) to record the failure
            feed_run.status = "error"
            feed_run.error_msg = str(exc)[:1000]
            feed_run.completed_at = datetime.now(timezone.utc)
            feed_run.consecutive_failure_count = (feed_run.consecutive_failure_count or 0) + 1
            session.add(feed_run)
            await session.commit()
            raise

        return feed_run

    # ------------------------------------------------------------------
    # HTTP helpers with retry/backoff
    # ------------------------------------------------------------------

    async def _request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        """Make an HTTP request with exponential backoff retry (3 attempts, full jitter).

        Raises RateLimitError on HTTP 429 (which is also retried).
        Raises httpx.HTTPStatusError on other 4xx/5xx after all retries are exhausted.
        """
        retryable = (httpx.HTTPError, httpx.TimeoutException, RateLimitError)

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_random_exponential(min=2, max=60),
            retry=retry_if_exception_type(retryable),
            reraise=True,
        ):
            with attempt:
                logger.debug("%s %s", method.upper(), url)
                response = await self.client.request(method, url, **kwargs)
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After", "unknown")
                    raise RateLimitError(
                        f"{self.FEED_NAME} rate limited (Retry-After: {retry_after})"
                    )
                response.raise_for_status()
                return response

        # unreachable: AsyncRetrying with reraise=True always raises on exhaustion
        raise RuntimeError("Retry loop exited without a result")  # pragma: no cover

    async def _get(self, url: str, **kwargs: object) -> httpx.Response:
        return await self._request("GET", url, **kwargs)

    async def _post(self, url: str, **kwargs: object) -> httpx.Response:
        return await self._request("POST", url, **kwargs)
