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
    Tasks can transition between: 'To Do', 'In Progress', and 'Done'.
    """
    TODO = "To Do"
    IN_PROGRESS = "In Progress"
    DONE = "Done"


# =========================================================
# SQLAlchemy Database Model (PostgreSQL 'tasks' table)
# =========================================================
class Task(Base):
    """
    Database table representation for tasks stored in PostgreSQL.
    """
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default=TaskStatus.TODO.value, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# =========================================================
# Pydantic Schemas (Request Validation & Serialization)
# =========================================================
class TaskBase(BaseModel):
    """Base schema with common attributes."""
    title: str
    description: Optional[str] = None
    status: Optional[TaskStatus] = TaskStatus.TODO


class TaskCreate(TaskBase):
    """Schema for creating a new task. Title is required."""
    pass


class TaskUpdate(BaseModel):
    """Schema for updating task fields (all fields are optional for partial updates)."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None


class TaskStatusUpdate(BaseModel):
    """Dedicated schema for moving tasks between Kanban columns."""
    status: TaskStatus


class TaskResponse(BaseModel):
    """Schema for returning task information to the client."""
    id: int
    title: str
    description: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
