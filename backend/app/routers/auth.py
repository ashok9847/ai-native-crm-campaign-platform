"""Authentication router for JWT token issuance."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.models.tenant import User, Tenant
from app.schemas.tenant import Token, UserProfileResponse, TenantRegisterRequest
from app.services.tenant_service import register_tenant_and_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=201, summary="Register a new tenant workspace and admin user")
async def register_tenant(
    payload: TenantRegisterRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Register a new tenant workspace and create the administrator account."""
    try:
        token_data = await register_tenant_and_user(
            db=db,
            tenant_name=payload.tenant_name,
            email=payload.email,
            password=payload.password
        )
        return token_data
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/token", response_model=Token, summary="Authenticate user and return JWT token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """OAuth2 password flow token endpoint.

    Accepts username (email) and password in urlencoded form data,
    verifies the credentials, and returns a bearer JWT access token.
    """
    logger.info("Authentication request received for: %s", form_data.username)
    
    # Temporarily bypass RLS on users table to allow finding user by email
    await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))
    
    # Retrieve user from the database
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    logger.info("[auth] User lookup query executed for %s", form_data.username)
    if user:
        pw_ok = verify_password(form_data.password, user.hashed_password)
        logger.info("[auth] User verification result evaluated")
    else:
        logger.info("[auth] User registration not found for %s", form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Failed authentication attempt for: %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Generate the access token including tenant_id context
    access_token = create_access_token(subject=user.id, tenant_id=user.tenant_id)
    
    logger.info("Authentication successful for: %s (Tenant ID: %d)", user.email, user.tenant_id)
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserProfileResponse, summary="Get current user details and workspace")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Retrieve authenticated user details and active tenant workspace name."""
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()
    tenant_name = tenant.name if tenant else "Unknown Workspace"
    
    return {
        "id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "email": current_user.email,
        "tenant_name": tenant_name
    }
