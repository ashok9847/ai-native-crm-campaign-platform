"""Shared Pydantic schemas used across multiple routers."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorResponse(BaseModel):
    """Standard error envelope returned on 4xx/5xx responses."""

    detail: str
    code: str


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated list wrapper."""

    total: int
    page: int
    page_size: int
    items: list[T]


class HealthResponse(BaseModel):
    status: str
