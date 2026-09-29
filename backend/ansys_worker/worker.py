"""
ANSYS Worker Background Service.
Processes AnsysJob queue from PostgreSQL/Redis, manages execution lifecycle,
and saves artifacts to object storage without blocking FastAPI.
"""

import os
import sys
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
import uuid

# Add backend and root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import database
from config import settings
from ansys_worker.runner import ansys_runner, detect_ansys_environment
from ansys_worker.adapter import CanonicalToAnsysAdapter
from schemas.canonical_scenario import CanonicalScenario
from services.storage_service import storage_service

logger = logging.getLogger("thermashell.ansys_worker")


async def process_ansys_job(job_id: str):
    """Executes a single ANSYS job through its full lifecycle."""
    if database.client is None:
        await database.init_db()
    db = database.client[settings.MONGODB_DATABASE]
    
    job = await db.ansys_jobs.find_one({"id": job_id})

    if not job:
        logger.error("Job %s not found", job_id)
        return

    # Check environment
    env = detect_ansys_environment()
    if env["status"] == "UNAVAILABLE":
        await db.ansys_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "UNAVAILABLE",
                "error_message": env["reason"],
                "completed_at": datetime.utcnow()
            }}
        )
        logger.info("Marked job %s as UNAVAILABLE: %s", job_id, env["reason"])
        return

    # Update to PREPARING
    await db.ansys_jobs.update_one({"id": job_id}, {"$set": {"status": "PREPARING"}})

    try:
        # Load scenario
        scen_record = await db.scenarios.find_one({"id": job["scenario_id"]})

        if not scen_record:
            raise ValueError(f"Scenario {job['scenario_id']} not found")

        canonical = CanonicalScenario(**json.loads(scen_record["canonical_json"]))

        # Work directory
        workdir = f"./storage/ansys/{job_id}"
        os.makedirs(workdir, exist_ok=True)

        # Fetch real climate data for ANSYS boundary conditions
        from services.climate_service import fetch_climate_data
        
        lat = canonical.location.latitude if canonical.location else 34.15
        lon = canonical.location.longitude if canonical.location else 77.58
        
        climate_pkg = await fetch_climate_data(
            db=db,
            latitude=lat,
            longitude=lon,
            start_date="20240115",
            end_date="20240117",
            parameters="T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN,PS"
        )

        case_spec = CanonicalToAnsysAdapter.prepare_ansys_case(canonical, climate_pkg, workdir)

        # Update to GEOMETRY
        await db.ansys_jobs.update_one({"id": job_id}, {"$set": {"status": "GEOMETRY"}})

        # Execute via runner
        async def progress_cb(stage, pct, msg):
            await db.ansys_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": stage, "logs": msg}}
            )

        result = await ansys_runner.execute_fluent_simulation(case_spec, progress_callback=progress_cb)

        # Save result in database — extract real values from Fluent execution
        await db.ansys_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "COMPLETED",
                "completed_at": datetime.utcnow()
            }}
        )

        # Extract real metrics from the Fluent result, or mark as unavailable
        indoor_temps = result.get("results", {}).get("indoor_temp_c", [])
        mean_temp = sum(indoor_temps) / len(indoor_temps) if indoor_temps else None
        max_temp = max(indoor_temps) if indoor_temps else None
        min_temp = min(indoor_temps) if indoor_temps else None
        heat_flux = result.get("results", {}).get("total_heat_flux_w", None)

        ansys_res = {
            "_id": str(uuid.uuid4()),
            "ansys_job_id": job_id,
            "mean_indoor_temp_c": mean_temp,
            "max_indoor_temp_c": max_temp,
            "min_indoor_temp_c": min_temp,
            "total_heat_flux_w": heat_flux,
            "summary_json": json.dumps(result),
            "created_at": datetime.utcnow()
        }
        await db.ansys_results.insert_one(ansys_res)
        
        logger.info("Successfully completed ANSYS job %s", job_id)

    except Exception as e:
        logger.error("Job %s execution failed: %s", job_id, e)
        await db.ansys_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "FAILED",
                "error_message": str(e),
                "completed_at": datetime.utcnow()
            }}
        )


async def run_worker_loop():
    """Background worker loop polling for queued ANSYS jobs."""
    logger.info("Starting THERMASHELL ANSYS Worker Daemon...")
    db = client[settings.MONGODB_DATABASE]
    while True:
        try:
            job = await db.ansys_jobs.find_one(
                {"status": "QUEUED"},
                sort=[("created_at", 1)]
            )

            if job:
                logger.info("Discovered QUEUED ANSYS job %s. Processing...", job["id"])
                await process_ansys_job(job["id"])
        except Exception as e:
            logger.error("Worker error: %s", e)

        await asyncio.sleep(2.0)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker_loop())
