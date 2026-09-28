"""
ANSYS Fluent API endpoints: status, job dispatch, lifecycle tracking, and physics comparison.
"""

import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import AnsysJob, AnsysResult, Scenario, SimulationResult
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
    db: AsyncSession = Depends(get_db)
):
    """
    Creates an ANSYS Fluent CFD job.
    Kicks off worker execution asynchronously without blocking the web server.
    """
    # Verify scenario exists
    stmt = select(Scenario).where(Scenario.id == req.scenario_id)
    res = await db.execute(stmt)
    scen = res.scalar_one_or_none()
    if not scen:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    env = detect_ansys_environment()

    job = AnsysJob(
        scenario_id=req.scenario_id,
        simulation_job_id=req.simulation_job_id,
        status="QUEUED" if env["status"] != "UNAVAILABLE" else "UNAVAILABLE",
        mode=env["mode"],
        fluent_version=req.fluent_version,
        processors=req.processors,
        error_message=env["reason"] if env["status"] == "UNAVAILABLE" else None
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger background worker process
    background_tasks.add_task(process_ansys_job, job.id)

    return {
        "job_id": job.id,
        "scenario_id": job.scenario_id,
        "status": job.status,
        "mode": job.mode,
        "created_at": job.created_at.isoformat(),
        "diagnostic_message": env["reason"]
    }


@router.get("/jobs/{job_id}")
async def get_ansys_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Returns lifecycle status, logs, and results of an ANSYS job."""
    stmt = select(AnsysJob).where(AnsysJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail=f"ANSYS job '{job_id}' not found.")

    result_data = None
    if job.result:
        result_data = {
            "mean_indoor_temp_c": job.result.mean_indoor_temp_c,
            "max_indoor_temp_c": job.result.max_indoor_temp_c,
            "min_indoor_temp_c": job.result.min_indoor_temp_c,
            "total_heat_flux_w": job.result.total_heat_flux_w,
            "summary": job.result.summary_json
        }

    return {
        "job_id": job.id,
        "scenario_id": job.scenario_id,
        "status": job.status,
        "mode": job.mode,
        "fluent_version": job.fluent_version,
        "logs": job.logs,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "result": result_data
    }


@router.get("/jobs/{job_id}/compare")
async def compare_physics_and_ansys(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Executes a formal comparison between THERMASHELL Lumped-RC physics and ANSYS Fluent CFD.
    Calculates MAE, RMSE, MBE, and R² from actual runs.
    """
    stmt = select(AnsysJob).where(AnsysJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail=f"ANSYS job '{job_id}' not found.")

    if job.status != "COMPLETED":
        return {
            "comparison_status": "PENDING_OR_UNAVAILABLE",
            "message": f"ANSYS job is in state '{job.status}'. A completed Fluent run is required for comparison.",
            "job_id": job.id,
            "job_status": job.status,
            "error_message": job.error_message
        }

    # Fetch corresponding physics simulation
    sim_stmt = select(SimulationResult).where(SimulationResult.scenario_id == job.scenario_id).order_by(SimulationResult.created_at.desc())
    sim_res = await db.execute(sim_stmt)
    physics_run = sim_res.scalar_one_or_none()

    import json
    physics_temps = []
    if physics_run and physics_run.summary_json:
        try:
            p_data = json.loads(physics_run.summary_json)
            physics_temps = p_data.get("indoor_temp_c", [])
        except Exception:
            pass

    # Extract ansys temps
    ansys_temps = []
    if job.result and job.result.summary_json:
        try:
            a_data = json.loads(job.result.summary_json)
            ansys_temps = a_data.get("results", {}).get("indoor_temp_c", [])
        except Exception:
            pass

    # Compute validation metrics
    metrics = FluentPostProcessor.calculate_validation_metrics(physics_temps, ansys_temps)

    return {
        "comparison_status": "COMPLETED",
        "job_id": job.id,
        "scenario_id": job.scenario_id,
        "metrics": metrics,
        "thermashell_physics": {
            "source": "THERMASHELL 4R2C Lumped Network",
            "samples": len(physics_temps),
            "values": physics_temps
        },
        "ansys_fluent": {
            "source": f"ANSYS Fluent v{job.fluent_version} CFD",
            "samples": len(ansys_temps),
            "values": ansys_temps
        },
        "residuals": [round(p - a, 3) for p, a in zip(physics_temps, ansys_temps)]
    }
