"""Pydantic schemas for the message editing endpoint."""

from pydantic import BaseModel, Field

from app.core.constants import MAX_EDITED_BODY_LENGTH


class EditMessageRequest(BaseModel):
    """Request body for PATCH /campaigns/{id}/messages/{message_id}."""

    edited_body: str = Field(..., max_length=MAX_EDITED_BODY_LENGTH)


class MessagePreviewResponse(BaseModel):
    """Response after a successful message edit."""

    id: int
    customer_id: int
    customer_name: str
    body: str
    edited: bool
    edited_body: str | None
    effective_body: str

    model_config = {"from_attributes": True}
