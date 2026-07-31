"""Token authentication for write endpoints of the Community API.

Reads a shared secret from the ``ZETTELFLOW_TOKEN`` environment variable and
compares it, in constant time, against the ``X-ZettelFlow-Token`` request
header. Read (``GET``) endpoints stay public; only writes depend on this guard.
"""

import os
import secrets

from fastapi import Header, HTTPException, status

TOKEN_HEADER_NAME = "X-ZettelFlow-Token"
TOKEN_ENV_VAR = "ZETTELFLOW_TOKEN"


def require_token(
    token: str | None = Header(default=None, alias=TOKEN_HEADER_NAME),
) -> None:
    """FastAPI dependency guarding write endpoints with a shared token.

    - If ``ZETTELFLOW_TOKEN`` is unset the server is misconfigured and every
      write fails closed with HTTP 503.
    - If the header is missing or does not match (constant-time compare) the
      request is rejected with HTTP 401.

    The env var is read on each call (not at import time) so the process can be
    configured after the module is imported.
    """
    expected = os.getenv(TOKEN_ENV_VAR)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured on the server.",
        )
    if token is None or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token.",
        )
