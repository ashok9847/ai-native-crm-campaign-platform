"""Schemas for AI Chat Assistant."""

from typing import Any, Optional
from pydantic import BaseModel

class AIChatMessage(BaseModel):
    role: str  # "user" | "agent"
    content: str

class AIChatRequest(BaseModel):
    prompt: str
    history: Optional[list[AIChatMessage]] = None

class AIChatAction(BaseModel):
    name: str
    description: str
    args: dict[str, Any]

class AIChatStructuredData(BaseModel):
    type: str  # "datagrid" | "chart" | "prediction"
    data: dict[str, Any]

class AIChatResponse(BaseModel):
    reply: str
    actions: list[AIChatAction]
    structured: Optional[AIChatStructuredData] = None
