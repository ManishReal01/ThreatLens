"""FastAPI dependencies — authentication removed, all endpoints are open."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends

# Fixed system user UUID used for all user-scoped workspace data (tags, notes, watchlist).
_SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def get_current_user() -> uuid.UUID:
    """Return the fixed system user UUID (auth disabled)."""
    return _SYSTEM_USER_ID


def require_admin() -> uuid.UUID:
    """Return the fixed system user UUID (auth disabled — all users are admin)."""
    return _SYSTEM_USER_ID


# Convenience type aliases for endpoint signatures
CurrentUser = Annotated[uuid.UUID, Depends(get_current_user)]
AdminUser = Annotated[uuid.UUID, Depends(require_admin)]
