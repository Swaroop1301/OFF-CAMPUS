"""
Parametric optimization API endpoints — Pareto frontier, candidate persistence, and ANSYS verification.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
import json

from database import get_db
from thermashell_engine.optimizer import run_optimization
from api.v1.simulations import RunSimulationPayload, _build_engine_config, _ensure_climate_data
from ansys_worker.worker import process_ansys_job
from ansys_worker.runner import detect_ansys_environment

router = APIRouter()


class OptimizationRequest(BaseModel):
    base_scenario: RunSimulationPayload
    insulation_thicknesses_m: Optional[List[float]] = [0.04, 0.08, 0.12, 0.16]
    window_u_values: Optional[List[float]] = [5.7, 2.8, 1.4]
    ach_values: Optional[List[float]] = [0.3, 0.5]
    w_energy: float = 0.4
    w_comfort: float = 0.4
    w_cost: float = 0.2
    max_candidates: int = 24
    verify_top_in_ansys: bool = False


@router.post("/sweep")
async def run_parametric_sweep(
    req: OptimizationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    """
    Executes a deterministic parametric sweep, filters Pareto frontier, and persists candidates.
    """
    try:
        await _ensure_climate_data(req.base_scenario, db)
        base_cfg = await _build_engine_config(req.base_scenario, db) if hasattr(_build_engine_config, "__await__") else _build_engine_config(req.base_scenario)
        frontier = run_optimization(
            base_config=base_cfg,
            insulation_thicknesses=req.insulation_thicknesses_m,
            window_u_values=req.window_u_values,
            ach_values=req.ach_values,
            w_energy=req.w_energy,
            w_comfort=req.w_comfort,
            w_cost=req.w_cost,
            max_candidates=req.max_candidates,
        )
        frontier_dict = frontier.model_dump()

        # Persist OptimizationRun
        weights_dict = {
            "w_energy": req.w_energy,
            "w_comfort": req.w_comfort,
            "w_cost": req.w_cost,
        }
        
        run_id = str(uuid.uuid4())
        run_record = {
            "_id": run_id,
            "id": run_id,
            "scenario_id": req.base_scenario.scenario_id,
            "objective_weights_json": json.dumps(weights_dict),
            "candidate_count": frontier.total_evaluated,
            "pareto_count": len(frontier.pareto_optimal),
            "status": "completed",
            "completed_at": datetime.utcnow()
        }
        await db.optimization_runs.insert_one(run_record)

        pareto_ids = {p.design_id for p in frontier.pareto_optimal}
        
        candidates = []
        for idx, cand in enumerate(frontier.candidates):
            is_pareto = 1 if cand.design_id in pareto_ids else 0
            cand_id = str(uuid.uuid4())
            candidates.append({
                "_id": cand_id,
                "id": cand_id,
                "run_id": run_id,
                "candidate_index": idx,
                "design_id": cand.design_id,
                "parameters_json": json.dumps(cand.parameters),
                "metrics_json": json.dumps({
                    "energy_kwh": cand.energy_kwh,
                    "comfort_percentage": cand.comfort_percentage,
                    "cost_factor": cand.estimated_cost_factor,
                    "score": cand.score
                }),
                "is_pareto": is_pareto,
                "ansys_verification_status": "unverified"
            })
            
        if candidates:
            await db.optimization_candidates.insert_many(candidates)

        frontier_dict["run_id"] = run_id

        # Optional ANSYS verification of top candidate
        if req.verify_top_in_ansys and frontier.recommended:
            env = detect_ansys_environment()
            
            ansys_job_id = str(uuid.uuid4())
            ansys_job = {
                "_id": ansys_job_id,
                "id": ansys_job_id,
                "scenario_id": req.base_scenario.scenario_id,
                "status": "QUEUED" if env["status"] != "UNAVAILABLE" else "UNAVAILABLE",
                "mode": env["mode"],
                "error_message": env["reason"] if env["status"] == "UNAVAILABLE" else None,
                "created_at": datetime.utcnow()
            }
            await db.ansys_jobs.insert_one(ansys_job)
            
            if env["status"] != "UNAVAILABLE":
                background_tasks.add_task(process_ansys_job, ansys_job_id)

            frontier_dict["ansys_verification_job_id"] = ansys_job_id

        return frontier_dict

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.get("/runs/{run_id}")
async def get_optimization_run(run_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Fetch stored optimization run and candidate evaluations."""
    run_rec = await db.optimization_runs.find_one({"id": run_id})

    if not run_rec:
        raise HTTPException(status_code=404, detail="Optimization run not found.")

    cands_cursor = db.optimization_candidates.find({"run_id": run_id}).sort("candidate_index", 1)
    cands = await cands_cursor.to_list(length=1000)

    return {
        "run_id": run_rec["id"],
        "scenario_id": run_rec["scenario_id"],
        "objective_weights": json.loads(run_rec["objective_weights_json"]),
        "candidate_count": run_rec["candidate_count"],
        "pareto_count": run_rec["pareto_count"],
        "candidates": [
            {
                "id": c["id"],
                "design_id": c["design_id"],
                "parameters": json.loads(c["parameters_json"]),
                "metrics": json.loads(c["metrics_json"]),
                "is_pareto": bool(c["is_pareto"]),
                "ansys_status": c.get("ansys_verification_status", "unverified")
            }
            for c in cands
        ]
    }
