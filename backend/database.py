import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ---------------------------------------------------------
# Database Configuration via Environment Variables
# ---------------------------------------------------------
# Default values align with the Kanban PostgreSQL container configuration
DB_USER = os.getenv("POSTGRES_USER", "kanban_user")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "kanban_password")
DB_HOST = os.getenv("POSTGRES_HOST", "db")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "kanban_db")

# Priority 1: Use DATABASE_URL if explicitly provided in the environment
# Priority 2: Construct the connection string from individual environment variables
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# SQLAlchemy 1.4+ and 2.0+ require postgresql:// instead of postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create the SQLAlchemy engine that manages the connection pool
engine = create_engine(DATABASE_URL)

# SessionLocal class for generating database sessions per request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base for defining ORM models
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a database session per HTTP request
    and ensures it is properly closed when the request is done.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
