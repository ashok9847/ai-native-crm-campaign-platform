"""Security helper functions for password hashing using bcrypt directly and JWT token generation."""

import datetime
from typing import Any, Dict, Optional

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    """Hash a plain text password using bcrypt directly."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hashed version using bcrypt directly."""
    try:
        plain_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(
    subject: str | int,
    tenant_id: int,
    expires_delta: Optional[datetime.timedelta] = None
) -> str:
    """Create a signed JWT access token containing subject (user ID) and tenant_id."""
    if expires_delta:
        expire = datetime.datetime.now(datetime.timezone.utc) + expires_delta
    else:
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            minutes=settings.access_token_expire_minutes
        )
    
    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "tenant_id": tenant_id,
        "exp": expire
    }
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm
    )
    return encoded_jwt
