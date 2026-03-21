"""ThreatLens API — FastAPI entry point with APScheduler feed ingestion."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import feeds, iocs
from app.api.routers.workspace import ioc_workspace_router, watchlist_router
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

# CORS — set ALLOWED_ORIGINS in .env (comma-separated) for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(iocs.router)
app.include_router(feeds.router)
app.include_router(watchlist_router)
app.include_router(ioc_workspace_router)


@app.get("/health", tags=["ops"])
async def health() -> dict:
    """Liveness probe — returns 200 if the process is running."""
    return {"status": "ok"}
