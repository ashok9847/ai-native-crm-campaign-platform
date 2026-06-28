"""Declarative base — imported by all ORM models and Alembic env.py.

Kept in its own module so that neither the engine (database.py) nor
any model file is imported as a side-effect of needing Base.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all Nudge ORM models."""
