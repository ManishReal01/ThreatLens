"""Workspace endpoints: watchlist, analyst tags, and notes per IOC."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.api.schemas import IOCListItem, NoteResponse, TagResponse
from app.db.session import get_db
from app.models import IOCModel, NoteModel, TagModel, WatchlistModel

# ---------------------------------------------------------------------------
# Watchlist  (prefix: /api/workspace)
# ---------------------------------------------------------------------------

watchlist_router = APIRouter(prefix="/api/workspace", tags=["workspace"])


class WatchlistAddRequest(BaseModel):
    ioc_id: uuid.UUID


class WatchlistResponse(BaseModel):
    items: list[IOCListItem]


@watchlist_router.get("/watchlist", response_model=WatchlistResponse)
async def get_watchlist(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchlistResponse:
    """Return all IOCs on the current user's watchlist."""
    result = await session.execute(
        select(WatchlistModel).where(WatchlistModel.user_id == current_user)
    )
    entries = result.scalars().all()
    ioc_ids = [e.ioc_id for e in entries]

    if not ioc_ids:
        return WatchlistResponse(items=[])

    ioc_result = await session.execute(
        select(IOCModel).where(IOCModel.id.in_(ioc_ids))
    )
    iocs = ioc_result.scalars().all()
    return WatchlistResponse(items=[IOCListItem.model_validate(ioc) for ioc in iocs])


@watchlist_router.post("/watchlist", status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    body: WatchlistAddRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Add an IOC to the current user's watchlist (idempotent)."""
    ioc = await session.get(IOCModel, body.ioc_id)
    if ioc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found.")

    existing = await session.execute(
        select(WatchlistModel).where(
            WatchlistModel.user_id == current_user,
            WatchlistModel.ioc_id == body.ioc_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        session.add(WatchlistModel(user_id=current_user, ioc_id=body.ioc_id))
        await session.commit()
    return {"status": "ok"}


@watchlist_router.delete("/watchlist/{ioc_id}")
async def remove_from_watchlist(
    ioc_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Remove an IOC from the current user's watchlist."""
    await session.execute(
        delete(WatchlistModel).where(
            WatchlistModel.user_id == current_user,
            WatchlistModel.ioc_id == ioc_id,
        )
    )
    await session.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Tags & Notes  (prefix: /api/iocs — matches frontend calls)
# ---------------------------------------------------------------------------

ioc_workspace_router = APIRouter(prefix="/api/iocs", tags=["workspace"])


class TagAddRequest(BaseModel):
    tag: str


class NoteAddRequest(BaseModel):
    body: str


class NoteUpdateRequest(BaseModel):
    body: str


@ioc_workspace_router.post("/{ioc_id}/tags", status_code=status.HTTP_201_CREATED, response_model=TagResponse)
async def add_tag(
    ioc_id: uuid.UUID,
    body: TagAddRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TagResponse:
    """Add an analyst tag to an IOC (idempotent per user+ioc+tag)."""
    ioc = await session.get(IOCModel, ioc_id)
    if ioc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found.")

    existing = await session.execute(
        select(TagModel).where(
            TagModel.user_id == current_user,
            TagModel.ioc_id == ioc_id,
            TagModel.tag == body.tag,
        )
    )
    tag = existing.scalar_one_or_none()
    if tag is None:
        tag = TagModel(user_id=current_user, ioc_id=ioc_id, tag=body.tag)
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
    return TagResponse.model_validate(tag)


@ioc_workspace_router.delete("/{ioc_id}/tags/{tag_value}")
async def remove_tag(
    ioc_id: uuid.UUID,
    tag_value: str,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Remove an analyst tag from an IOC."""
    await session.execute(
        delete(TagModel).where(
            TagModel.user_id == current_user,
            TagModel.ioc_id == ioc_id,
            TagModel.tag == tag_value,
        )
    )
    await session.commit()
    return Response(status_code=204)


@ioc_workspace_router.post("/{ioc_id}/notes", status_code=status.HTTP_201_CREATED, response_model=NoteResponse)
async def add_note(
    ioc_id: uuid.UUID,
    body: NoteAddRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NoteResponse:
    """Add an analyst note to an IOC."""
    ioc = await session.get(IOCModel, ioc_id)
    if ioc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found.")

    note = NoteModel(user_id=current_user, ioc_id=ioc_id, body=body.body)
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return NoteResponse.model_validate(note)


@ioc_workspace_router.put("/{ioc_id}/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    ioc_id: uuid.UUID,
    note_id: uuid.UUID,
    body: NoteUpdateRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NoteResponse:
    """Update an analyst note."""
    result = await session.execute(
        select(NoteModel).where(
            NoteModel.id == note_id,
            NoteModel.ioc_id == ioc_id,
            NoteModel.user_id == current_user,
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
    note.body = body.body
    await session.commit()
    await session.refresh(note)
    return NoteResponse.model_validate(note)


@ioc_workspace_router.delete("/{ioc_id}/notes/{note_id}")
async def delete_note(
    ioc_id: uuid.UUID,
    note_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Delete an analyst note."""
    await session.execute(
        delete(NoteModel).where(
            NoteModel.id == note_id,
            NoteModel.ioc_id == ioc_id,
            NoteModel.user_id == current_user,
        )
    )
    await session.commit()
    return Response(status_code=204)
