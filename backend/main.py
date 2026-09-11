from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

# Support running as a package or as a standalone script inside the backend directory
try:
    from .database import Base, engine, get_db
    from .models import (
        Task,
        TaskCreate,
        TaskResponse,
        TaskStatus,
        TaskUpdate,
    )
except ImportError:
    from database import Base, engine, get_db
    from models import (
        Task,
        TaskCreate,
        TaskResponse,
        TaskStatus,
        TaskUpdate,
    )


# ---------------------------------------------------------
# Application Lifespan (Startup / Shutdown)
# ---------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on application startup.
    Initializes database tables and ensures required columns (e.g. position) exist.
    """
    try:
        Base.metadata.create_all(bind=engine)
        # Ensure position column exists in existing tables (Build Step 1 schema migration)
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0 NOT NULL;"))
            conn.commit()
        print("Database tables verified/migrated successfully.")
    except Exception as exc:
        print(f"Notice: Database initialization notice: {exc}")
    yield


# ---------------------------------------------------------
# FastAPI App Initialization
# ---------------------------------------------------------
app = FastAPI(
    title="Task Board (Kanban) API",
    description="DevOps Kanban Board REST API backed by PostgreSQL. Implements GET, POST, PATCH, and DELETE on /tasks.",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# General & Health Endpoints
# =========================================================
@app.get("/", tags=["General"])
def read_root():
    """Root welcome endpoint with pointers to interactive API docs."""
    return {
        "message": "Welcome to the Task Board (Kanban) API!",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
    }


@app.get("/health", tags=["General"])
def health_check():
    """Health check endpoint used by Docker, load balancers, and monitoring."""
    return {"status": "healthy"}


# =========================================================
# Required Endpoints: GET, POST, PATCH, DELETE /tasks
# =========================================================
@app.get("/tasks", response_model=List[TaskResponse], tags=["Tasks"])
def list_tasks(
    status_filter: Optional[TaskStatus] = Query(
        None,
        alias="status",
        description="Filter tasks by status ('To Do', 'In Progress', 'Done')"
    ),
    db: Session = Depends(get_db)
):
    """
    List all tasks ordered by status and position.
    Can optionally filter by column status: '?status=To Do', '?status=In Progress', or '?status=Done'.
    """
    query = db.query(Task)
    if status_filter:
        query = query.filter(Task.status == status_filter.value)
    return query.order_by(Task.position.asc(), Task.id.asc()).all()


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, tags=["Tasks"])
def create_task(task_in: TaskCreate, db: Session = Depends(get_db)):
    """
    Create a new task on the Kanban board.
    Defaults: status='To Do', position=0.
    """
    new_task = Task(
        title=task_in.title,
        description=task_in.description,
        status=task_in.status.value if task_in.status else TaskStatus.TODO.value,
        position=task_in.position if task_in.position is not None else 0,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@app.patch("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def patch_task(task_id: int, task_in: TaskUpdate, db: Session = Depends(get_db)):
    """
    Partially update a task (e.g. status or position when dragged across columns).
    Specifically required by Build Step 2 & Step 3.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found."
        )

    if task_in.title is not None:
        task.title = task_in.title
    if task_in.description is not None:
        task.description = task_in.description
    if task_in.status is not None:
        task.status = task_in.status.value
    if task_in.position is not None:
        task.position = task_in.position

    db.commit()
    db.refresh(task)
    return task


@app.put("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def update_task(task_id: int, task_in: TaskUpdate, db: Session = Depends(get_db)):
    """
    Full or partial update of an existing task (supports title, description, status, position).
    """
    return patch_task(task_id, task_in, db)


@app.delete("/tasks/{task_id}", status_code=status.HTTP_200_OK, tags=["Tasks"])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """
    Delete a task from the board by its ID.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found."
        )

    db.delete(task)
    db.commit()
    return {"message": f"Task with ID {task_id} has been deleted successfully."}
