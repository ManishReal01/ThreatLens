"""ThreatLens API — FastAPI entry point with APScheduler feed ingestion."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.config import settings
from app.feeds.scheduler import create_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start the feed scheduler on startup; shut it down cleanly on exit."""
    scheduler = create_scheduler(settings)
    scheduler.start()
    logger.info("Feed scheduler started")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        logger.info("Feed scheduler stopped")


app = FastAPI(
    title="ThreatLens API",
    description="Threat intelligence aggregation and IOC search platform",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", tags=["ops"])
async def health() -> dict:
    """Liveness probe — returns 200 if the process is running."""
    return {"status": "ok"}
