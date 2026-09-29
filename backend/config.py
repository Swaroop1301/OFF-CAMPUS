"""THERMASHELL Backend — Configuration via pydantic-settings."""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "THERMASHELL"
    API_VERSION: str = "v1"
    DEBUG: bool = True

    # Database: MongoDB Atlas
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "thermashell")

    def validate_mongodb(self):
        if not self.MONGODB_URI:
            raise ValueError("MONGODB_URI environment variable is missing. Configure MongoDB Atlas to start the application.")

    # Storage: "local" or "supabase"
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")
    STORAGE_LOCAL_DIR: str = os.getenv("STORAGE_LOCAL_DIR", "./storage")

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    GEOCODING_PROVIDER: str = os.getenv("GEOCODING_PROVIDER", "nominatim")
    ELEVATION_PROVIDER: str = os.getenv("ELEVATION_PROVIDER", "open-elevation")

    # NASA POWER API
    NASA_POWER_BASE_URL: str = "https://power.larc.nasa.gov/api/temporal/hourly/point"
    NASA_POWER_CACHE_TTL_HOURS: int = 168  # 7 days

    # Redis Queue for Worker
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Simulation Constraints
    MAX_SIMULATION_HOURS: int = 8760  # 1 year
    SIMULATION_TIMEOUT_S: int = 300

    # ANSYS Fluent Configuration
    ANSYS_PRODUCT_VERSION: str = os.getenv("ANSYS_PRODUCT_VERSION", "24.1")
    ANSYS_INSTALL_PATH: Optional[str] = os.getenv("ANSYS_INSTALL_PATH", None)
    ANSYS_FLUENT_EXECUTABLE: Optional[str] = os.getenv("ANSYS_FLUENT_EXECUTABLE", None)
    ANSYS_LICENSE_SERVER: Optional[str] = os.getenv("ANSYS_LICENSE_SERVER", None)
    ANSYS_WORKER_HOST: str = os.getenv("ANSYS_WORKER_HOST", "localhost")
    ANSYS_WORKER_PORT: int = int(os.getenv("ANSYS_WORKER_PORT", "50051"))
    ANSYS_PROCESSORS: int = int(os.getenv("ANSYS_PROCESSORS", "4"))
    ANSYS_PRECISION: str = os.getenv("ANSYS_PRECISION", "double")
    ANSYS_MODE: str = os.getenv("ANSYS_MODE", "detect")  # local, remote, unavailable, detect

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
