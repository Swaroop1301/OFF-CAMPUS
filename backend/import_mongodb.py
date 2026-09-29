"""
Imports the exported PostgreSQL/SQLite legacy data (thermashell_export.json) into MongoDB Atlas.
"""

import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("thermashell.import")

async def import_data(json_path: str):
    if not Path(json_path).exists():
        logger.error(f"Export file not found: {json_path}")
        return

    logger.info(f"Connecting to MongoDB at {settings.MONGODB_URI}")
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DATABASE]
    
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Convert date strings to datetime objects
    def parse_dates(doc):
        for k, v in doc.items():
            if isinstance(v, str) and (k.endswith("_at") or k == "timestamp"):
                try:
                    doc[k] = datetime.fromisoformat(v)
                except ValueError:
                    pass
        return doc

    collections = {
        "projects": data.get("projects", []),
        "locations": data.get("locations", []),
        "climate_datasets": data.get("climate_datasets", []),
        "scenarios": data.get("scenarios", []),
        "simulation_jobs": data.get("simulation_jobs", []),
        "simulation_results": data.get("simulation_results", []),
        "ansys_jobs": data.get("ansys_jobs", []),
        "ansys_results": data.get("ansys_results", []),
        "optimization_runs": data.get("optimization_runs", []),
        "reports": data.get("reports", [])
    }

    for col_name, docs in collections.items():
        if docs:
            # Map SQLite 'id' to MongoDB '_id' if not present
            for doc in docs:
                if "id" in doc and "_id" not in doc:
                    doc["_id"] = doc["id"]
                parse_dates(doc)

            try:
                # Clear existing to prevent duplicate key errors during migration
                await db[col_name].delete_many({})
                await db[col_name].insert_many(docs)
                logger.info(f"Imported {len(docs)} documents into collection '{col_name}'.")
            except Exception as e:
                logger.error(f"Error importing collection '{col_name}': {e}")
        else:
            logger.info(f"No documents found for collection '{col_name}', skipping.")

    logger.info("Data import completed successfully.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = "thermashell_export.json"
    
    # We must have MONGODB_URI configured
    if not settings.MONGODB_URI:
        logger.error("MONGODB_URI environment variable is missing. Cannot run import.")
        sys.exit(1)
        
    asyncio.run(import_data(path))
