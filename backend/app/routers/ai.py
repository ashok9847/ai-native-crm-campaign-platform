"""AI Chat Assistant Router."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.schemas.ai import AIChatRequest, AIChatResponse
from app.services.agent_service import run_agent_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

@router.post(
    "/chat",
    response_model=AIChatResponse,
    summary="Ask the AI copilot an analysis, creation, or comparison question.",
)
async def ai_chat(
    body: AIChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AIChatResponse:
    """Conversational AI agent endpoint using Nebius (primary) and GitHub Models (backup) with function calling.

    Retrieves tenant-specific context and executes database operations/visualizations on the fly.
    """
    logger.info("AI Chat request from user %s (tenant %d): prompt=%r", current_user.email, current_user.tenant_id, body.prompt)
    try:
        return await run_agent_chat(
            prompt=body.prompt,
            history=body.history,
            db=db,
            tenant_id=current_user.tenant_id
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error running AI Chat agent: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"AI agent error: {str(exc)}"
        )
