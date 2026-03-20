"""FastAPI dependencies for JWT authentication and authorization.

Supabase issues HS256-signed JWTs.  The JWT secret lives in
Settings.supabase_jwt_secret (Supabase dashboard → Settings → API → JWT Secret).

Token payload shape:
    {
        "sub":  "<user-uuid>",          # always present for authenticated users
        "role": "authenticated",        # Supabase role claim
        "app_metadata": {
            "role": "admin"            # set this to grant admin access
        },
        ...
    }
"""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer()


def _decode_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    """Validate and decode the Supabase JWT; return the full payload dict."""
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth is not configured on this server (missing JWT secret).",
        )
    try:
        return jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    payload: Annotated[dict, Depends(_decode_token)],
) -> uuid.UUID:
    """Extract the authenticated user's UUID from the JWT `sub` claim."""
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the subject (sub) claim.",
        )
    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is not a valid UUID.",
        )


def require_admin(
    current_user: Annotated[uuid.UUID, Depends(get_current_user)],
    payload: Annotated[dict, Depends(_decode_token)],
) -> uuid.UUID:
    """Gate an endpoint to admin users only.

    Admin is indicated by ``app_metadata.role == "admin"`` in the JWT payload,
    which is set via Supabase's admin API or dashboard.
    """
    app_metadata = payload.get("app_metadata") or {}
    if app_metadata.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )
    return current_user


# Convenience type aliases for endpoint signatures
CurrentUser = Annotated[uuid.UUID, Depends(get_current_user)]
AdminUser = Annotated[uuid.UUID, Depends(require_admin)]
