"""
Database engine and session factory — MongoDB Atlas via Motor.
Seeds verified material library and preset scenarios on startup.
"""

import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger("thermashell.database")

# Global MongoDB client
client = None

async def get_db():
    if client is None:
        raise RuntimeError("MongoDB client not initialized.")
    db = client[settings.MONGODB_DATABASE]
    yield db

async def init_db():
    """Initializes MongoDB connection, collections, indexes and seeds data."""
    global client
    logger.info(f"Connecting to MongoDB Atlas...")
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DATABASE]
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.projects.create_index("user_id")
    await db.scenarios.create_index("project_id")
    await db.locations.create_index("project_id")
    await db.climate_datasets.create_index("dataset_hash")
    await db.materials.create_index("category")
    await db.simulation_jobs.create_index("scenario_id")
    await db.simulation_results.create_index("job_id", unique=True)
    await db.optimization_runs.create_index("scenario_id")
    await db.ansys_jobs.create_index("scenario_id")
    await db.ansys_jobs.create_index("status")
    await db.ansys_results.create_index("ansys_job_id", unique=True)
    
    # Check and seed materials if empty
    material_count = await db.materials.count_documents({})
    if material_count == 0:
        logger.info("Seeding verified materials into database...")
        from models import VERIFIED_MATERIALS_SEED
        for mat_data in VERIFIED_MATERIALS_SEED:
            # Add _id for MongoDB or use id as string
            mat_data["_id"] = mat_data["id"]
            mat_data["is_custom"] = 0
            mat_data["version"] = 1
        await db.materials.insert_many(VERIFIED_MATERIALS_SEED)
        logger.info("Successfully seeded verified materials.")
        
    # Check and seed preset projects
    project_count = await db.projects.count_documents({})
    if project_count == 0:
        logger.info("Seeding preset projects into database...")
        from models import PRESET_PROJECTS
        for p in PRESET_PROJECTS:
            await db.projects.insert_one(p["project"])
            await db.locations.insert_one(p["location"])
            await db.scenarios.insert_one(p["scenario"])
        logger.info("Successfully seeded preset projects.")

async def close_db():
    global client
    if client:
        client.close()
