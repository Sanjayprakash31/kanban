from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Support running as a package or as a standalone script inside the backend directory
try:
    from .database import Base, engine, get_db
    from .models import (
        Task,
        TaskCreate,
        TaskResponse,
        TaskStatus,
        TaskStatusUpdate,
        TaskUpdate,
    )
except ImportError:
    from database import Base, engine, get_db
    from models import (
        Task,
        TaskCreate,
        TaskResponse,
        TaskStatus,
        TaskStatusUpdate,
        TaskUpdate,
    )


# ---------------------------------------------------------
# Application Lifespan (Startup / Shutdown)
# ---------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on application startup.
    Attempts to initialize database tables automatically if connection succeeds.
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables verified/created successfully.")
    except Exception as exc:
        print(f"Notice: Could not auto-create tables on startup (PostgreSQL may be starting up): {exc}")
    yield


# ---------------------------------------------------------
# FastAPI App Initialization
# ---------------------------------------------------------
app = FastAPI(
    title="Task Board (Kanban) API",
    description="REST API for the DevOps Kanban Task Board application backed by PostgreSQL.",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------
# Allows the frontend (running on a different port/host) to communicate with this backend API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for development and demo purposes
    allow_credentials=True,
    allow_methods=["*"],  # Allows GET, POST, PUT, PATCH, DELETE, OPTIONS
    allow_headers=["*"],
)


# =========================================================
# General & Health Endpoints
# =========================================================
@app.get("/", tags=["General"])
def read_root():
    """
    Root welcome endpoint with pointers to interactive API docs.
    """
    return {
        "message": "Welcome to the Task Board (Kanban) API!",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
    }


@app.get("/health", tags=["General"])
def health_check():
    """
    Health check endpoint used by Docker, load balancers, and monitoring.
    """
    return {"status": "healthy"}


# =========================================================
# Kanban Task Endpoints (CRUD + Column Movement)
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
    List all tasks.
    Optionally filter by column status: '?status=To Do', '?status=In Progress', or '?status=Done'.
    """
    query = db.query(Task)
    if status_filter:
        query = query.filter(Task.status == status_filter.value)
    return query.order_by(Task.id.asc()).all()


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, tags=["Tasks"])
def create_task(task_in: TaskCreate, db: Session = Depends(get_db)):
    """
    Create a new task on the Kanban board.
    Default status is 'To Do' if none is specified.
    """
    new_task = Task(
        title=task_in.title,
        description=task_in.description,
        status=task_in.status.value if task_in.status else TaskStatus.TODO.value,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@app.get("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def get_task(task_id: int, db: Session = Depends(get_db)):
    """
    Retrieve details of a specific task by its ID.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found."
        )
    return task


@app.put("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def update_task(task_id: int, task_in: TaskUpdate, db: Session = Depends(get_db)):
    """
    Update an existing task's title, description, or status.
    Only provided fields will be updated.
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

    db.commit()
    db.refresh(task)
    return task


@app.patch("/tasks/{task_id}/status", response_model=TaskResponse, tags=["Tasks"])
def update_task_status(task_id: int, status_in: TaskStatusUpdate, db: Session = Depends(get_db)):
    """
    Move a task between Kanban columns ('To Do' -> 'In Progress' -> 'Done').
    Specifically optimized for drag-and-drop or status quick-change actions.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found."
        )

    task.status = status_in.status.value
    db.commit()
    db.refresh(task)
    return task


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
