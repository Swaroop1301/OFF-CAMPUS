"""
ANSYS Fluent API endpoints: status, job dispatch, lifecycle tracking, and physics comparison.
"""

import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import uuid
import json

from database import get_db
from ansys_worker.runner import detect_ansys_environment
from ansys_worker.worker import process_ansys_job
from ansys_worker.postprocess import FluentPostProcessor

router = APIRouter()


class CreateAnsysJobRequest(BaseModel):
    scenario_id: str
    simulation_job_id: Optional[str] = None
    fluent_version: str = "24.1"
    processors: int = 4
    mesh_resolution: str = "medium"


class AnsysStatusResponse(BaseModel):
    status: str  # CONNECTED, BUSY, OFFLINE, UNAVAILABLE
    mode: str    # LOCAL, REMOTE, UNAVAILABLE
    pyfluent_installed: bool
    pyfluent_version: Optional[str] = None
    fluent_executable: Optional[str] = None
    has_local_fluent: bool
    worker_host: str
    worker_port: int
    reason: str
    timestamp: str


@router.get("/status", response_model=AnsysStatusResponse)
async def get_ansys_status():
    """Returns live ANSYS Fluent environment and worker connectivity status."""
    env = detect_ansys_environment()
    return AnsysStatusResponse(**env)


@router.post("/jobs")
async def create_ansys_job(
    req: CreateAnsysJobRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Creates an ANSYS Fluent CFD job.
    Kicks off worker execution asynchronously without blocking the web server.
    """
    # Verify scenario exists
    scen = await db.scenarios.find_one({"id": req.scenario_id})
    if not scen:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    env = detect_ansys_environment()

    job_id = str(uuid.uuid4())
    job = {
        "_id": job_id,
        "id": job_id,
        "scenario_id": req.scenario_id,
        "simulation_job_id": req.simulation_job_id,
        "status": "QUEUED" if env["status"] != "UNAVAILABLE" else "UNAVAILABLE",
        "mode": env["mode"],
        "fluent_version": req.fluent_version,
        "processors": req.processors,
        "error_message": env["reason"] if env["status"] == "UNAVAILABLE" else None,
        "created_at": datetime.utcnow()
    }
    await db.ansys_jobs.insert_one(job)

    # Trigger background worker process
    background_tasks.add_task(process_ansys_job, job_id)

    return {
        "job_id": job_id,
        "scenario_id": job["scenario_id"],
        "status": job["status"],
        "mode": job["mode"],
        "created_at": job["created_at"].isoformat(),
        "diagnostic_message": env["reason"]
    }


@router.get("/jobs/{job_id}")
async def get_ansys_job(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns lifecycle status, logs, and results of an ANSYS job."""
    job = await db.ansys_jobs.find_one({"id": job_id})

    if not job:
        raise HTTPException(status_code=404, detail=f"ANSYS job '{job_id}' not found.")

    result_data = None
    result = await db.ansys_results.find_one({"ansys_job_id": job_id})
    if result:
        result_data = {
            "mean_indoor_temp_c": result.get("mean_indoor_temp_c"),
            "max_indoor_temp_c": result.get("max_indoor_temp_c"),
            "min_indoor_temp_c": result.get("min_indoor_temp_c"),
            "total_heat_flux_w": result.get("total_heat_flux_w"),
            "summary": result.get("summary_json")
        }

    return {
        "job_id": job["id"],
        "scenario_id": job["scenario_id"],
        "status": job["status"],
        "mode": job["mode"],
        "fluent_version": job["fluent_version"],
        "logs": job.get("logs"),
        "error_message": job.get("error_message"),
        "created_at": job.get("created_at").isoformat() if isinstance(job.get("created_at"), datetime) else None,
        "completed_at": job.get("completed_at").isoformat() if isinstance(job.get("completed_at"), datetime) else None,
        "result": result_data
    }


@router.get("/jobs/{job_id}/compare")
async def compare_physics_and_ansys(job_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Executes a formal comparison between THERMASHELL Lumped-RC physics and ANSYS Fluent CFD.
    Calculates MAE, RMSE, MBE, and R² from actual runs.
    Strictly prohibits false VALIDATED status.
    """
    job = await db.ansys_jobs.find_one({"id": job_id})

    if not job:
        raise HTTPException(status_code=404, detail=f"ANSYS job '{job_id}' not found.")

    status = job.get("status")
    if status == "UNAVAILABLE":
        return {
            "comparison_status": "UNAVAILABLE",
            "validation_decision": "UNAVAILABLE",
            "message": f"ANSYS Fluent is UNAVAILABLE on the worker environment: {job.get('error_message') or 'Worker offline or executable missing'}",
            "job_id": job["id"],
            "job_status": "UNAVAILABLE",
            "error_message": job.get("error_message")
        }

    if status == "FAILED":
        return {
            "comparison_status": "FAILED",
            "validation_decision": "FAILED",
            "message": f"ANSYS CFD simulation failed: {job.get('error_message') or 'Solver divergence or process error'}",
            "job_id": job["id"],
            "job_status": "FAILED",
            "error_message": job.get("error_message")
        }

    if status in ("QUEUED", "RUNNING", "PREPARING", "GEOMETRY"):
        return {
            "comparison_status": "RUNNING",
            "validation_decision": "RUNNING",
            "message": f"ANSYS job is currently in progress ({status}).",
            "job_id": job["id"],
            "job_status": status
        }

    if status != "COMPLETED":
        return {
            "comparison_status": "PENDING_OR_UNAVAILABLE",
            "validation_decision": "PENDING",
            "message": f"ANSYS job is in state '{status}'. A completed Fluent run is required for comparison.",
            "job_id": job["id"],
            "job_status": status,
            "error_message": job.get("error_message")
        }

    # Fetch corresponding physics simulation
    physics_run = await db.simulation_results.find_one(
        {"scenario_id": job["scenario_id"]},
        sort=[("created_at", -1)]
    )

    physics_temps = []
    if physics_run and physics_run.get("summary_json"):
        try:
            p_data = json.loads(physics_run["summary_json"])
            physics_temps = p_data.get("indoor_temp_c", [])
        except Exception:
            pass

    # Extract ansys temps
    ansys_temps = []
    result = await db.ansys_results.find_one({"ansys_job_id": job_id})
    if result and result.get("summary_json"):
        try:
            a_data = json.loads(result["summary_json"])
            ansys_temps = a_data.get("results", {}).get("indoor_temp_c", [])
        except Exception:
            pass

    if not physics_temps or not ansys_temps:
        return {
            "comparison_status": "PENDING_RESULTS",
            "validation_decision": "UNAVAILABLE",
            "message": "Incomplete timeseries data from physics engine or ANSYS Fluent solver.",
            "job_id": job["id"],
            "job_status": status
        }

    # Compute validation metrics
    metrics = FluentPostProcessor.calculate_validation_metrics(physics_temps, ansys_temps)
    
    # Strict validation criteria: MAE <= 2.0°C and R² >= 0.80
    is_valid = bool(metrics["mae"] <= 2.0 and metrics["r_squared"] >= 0.80 and metrics.get("sample_count", 0) > 0)
    decision = "VALIDATED" if is_valid else "FAILED"

    # Persist validation record in MongoDB Atlas
    validation_record = {
        "_id": str(uuid.uuid4()),
        "ansys_job_id": job_id,
        "scenario_id": job["scenario_id"],
        "comparison_status": "COMPLETED",
        "validation_decision": decision,
        "metrics": metrics,
        "completed_at": datetime.utcnow()
    }
    await db.validation_records.insert_one(validation_record)

    return {
        "comparison_status": "COMPLETED",
        "validation_decision": decision,
        "job_id": job["id"],
        "scenario_id": job["scenario_id"],
        "metrics": metrics,
        "thermashell_physics": {
            "source": "THERMASHELL 4R2C Lumped Network",
            "samples": len(physics_temps),
            "values": physics_temps
        },
        "ansys_fluent": {
            "source": f"ANSYS Fluent v{job.get('fluent_version')} CFD",
            "samples": len(ansys_temps),
            "values": ansys_temps
        },
        "residuals": [round(p - a, 3) for p, a in zip(physics_temps, ansys_temps)] if len(physics_temps) == len(ansys_temps) else []
    }


@router.get("/scenarios/{scenario_id}/status")
async def get_scenario_ansys_validation_status(scenario_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Returns current holistic validation status for a scenario:
    - physics_status: NOT_RUN | COMPLETED
    - ansys_status: NOT_STARTED | QUEUED | RUNNING | COMPLETED | FAILED | UNAVAILABLE
    - validation_status: NOT_RUN | PENDING_ANSYS | UNAVAILABLE | RUNNING | FAILED | VALIDATED
    """
    env = detect_ansys_environment()
    latest_physics = await db.simulation_results.find_one({"scenario_id": scenario_id}, sort=[("created_at", -1)])
    latest_job = await db.ansys_jobs.find_one({"scenario_id": scenario_id}, sort=[("created_at", -1)])
    
    physics_status = "COMPLETED" if latest_physics else "NOT_RUN"
    
    if not latest_job:
        ansys_status = "NOT_STARTED"
        validation_status = "NOT_RUN" if not latest_physics else ("UNAVAILABLE" if env["status"] == "UNAVAILABLE" else "PENDING_ANSYS")
    else:
        ansys_status = latest_job.get("status", "UNAVAILABLE")
        if ansys_status == "UNAVAILABLE":
            validation_status = "UNAVAILABLE"
        elif ansys_status in ("QUEUED", "RUNNING", "PREPARING", "GEOMETRY"):
            validation_status = "RUNNING"
        elif ansys_status == "FAILED":
            validation_status = "FAILED"
        elif ansys_status == "COMPLETED":
            rec = await db.validation_records.find_one({"ansys_job_id": latest_job["id"]}, sort=[("completed_at", -1)])
            validation_status = rec.get("validation_decision", "VALIDATED") if rec else "PENDING_COMPARISON"
        else:
            validation_status = "PENDING_ANSYS"
            
    return {
        "scenario_id": scenario_id,
        "environment": env,
        "physics_status": physics_status,
        "ansys_status": ansys_status,
        "validation_status": validation_status,
        "latest_job_id": latest_job.get("id") if latest_job else None,
        "error_message": latest_job.get("error_message") if latest_job else (env["reason"] if env["status"] == "UNAVAILABLE" else None)
    }
