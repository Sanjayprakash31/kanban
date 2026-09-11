from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Column, DateTime, Integer, String, Text

# Support running as a package or as a standalone script inside the backend directory
try:
    from .database import Base
except ImportError:
    from database import Base


# =========================================================
# Task Status Enum
# =========================================================
class TaskStatus(str, Enum):
    """
    Allowed Kanban board status values.
    Tasks transition between: 'To Do', 'In Progress', and 'Done'.
    """
    TODO = "To Do"
    IN_PROGRESS = "In Progress"
    DONE = "Done"


# =========================================================
# SQLAlchemy Database Model
# Schema: tasks(id, title, status, position, created_at)
# =========================================================
class Task(Base):
    """
    Database table representation for tasks stored in PostgreSQL.
    Matches schema: tasks(id, title, status, position, created_at)
    """
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default=TaskStatus.TODO.value, nullable=False)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# =========================================================
# Pydantic Schemas (Request Validation & Serialization)
# =========================================================
class TaskBase(BaseModel):
    """Base schema with common task attributes."""
    title: str
    description: Optional[str] = None
    status: Optional[TaskStatus] = TaskStatus.TODO
    position: Optional[int] = 0


class TaskCreate(BaseModel):
    """Schema for creating a new task."""
    title: str
    description: Optional[str] = None
    status: Optional[TaskStatus] = TaskStatus.TODO
    position: Optional[int] = 0


class TaskUpdate(BaseModel):
    """Schema for updating task fields (all fields are optional for partial updates)."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    position: Optional[int] = None


class TaskResponse(BaseModel):
    """Schema returned to clients representing a task."""
    id: int
    title: str
    description: Optional[str] = None
    status: str
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
