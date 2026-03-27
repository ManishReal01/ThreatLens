"""Run a single feed worker directly (outside uvicorn).

Usage:
    cd backend
    .venv/bin/python scripts/run_feed.py <feed_name>

Example:
    .venv/bin/python scripts/run_feed.py sslbl
    .venv/bin/python scripts/run_feed.py feodotracker
    .venv/bin/python scripts/run_feed.py malwarebazaar
"""

import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


_WORKERS = {
    "urlhaus":       "app.feeds.urlhaus:URLhausWorker",
    "otx":           "app.feeds.otx:OTXWorker",
    "threatfox":     "app.feeds.threatfox:ThreatFoxWorker",
    "cisa_kev":      "app.feeds.cisa_kev:CISAKEVWorker",
    "mitre_attack":  "app.feeds.mitre_attack:MITREAttackWorker",
    "virustotal":    "app.feeds.virustotal:VirusTotalWorker",
    "feodotracker":  "app.feeds.feodotracker:FeodoTrackerWorker",
    "malwarebazaar": "app.feeds.malwarebazaar:MalwareBazaarWorker",
    "sslbl":         "app.feeds.sslbl:SSLBLWorker",
}


async def run(feed_name: str) -> None:
    if feed_name not in _WORKERS:
        print(f"Unknown feed: {feed_name!r}. Available: {', '.join(_WORKERS)}")
        sys.exit(1)

    module_path, cls_name = _WORKERS[feed_name].split(":")
    module = __import__(module_path, fromlist=[cls_name])
    worker_cls = getattr(module, cls_name)

    from app.config import settings
    from app.db.session import AsyncSessionLocal

    logger.info("Running %s feed...", feed_name)
    async with worker_cls(settings) as worker:
        async with AsyncSessionLocal() as session:
            result = await worker.run(session)

    print(
        f"\n{'='*50}\n"
        f"  Feed:    {feed_name}\n"
        f"  Status:  {result.status}\n"
        f"  Fetched: {result.iocs_fetched}\n"
        f"  New:     {result.iocs_new}\n"
        f"  Updated: {result.iocs_updated}\n"
        + (f"  Error:   {result.error_msg}\n" if result.error_msg else "")
        + f"{'='*50}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <feed_name>")
        print(f"Available feeds: {', '.join(_WORKERS)}")
        sys.exit(1)

    asyncio.run(run(sys.argv[1]))
