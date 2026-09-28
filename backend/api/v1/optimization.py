"""
Parametric optimization API endpoints — Pareto frontier, candidate persistence, and ANSYS verification.
"""

import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import OptimizationRun, OptimizationCandidate, Scenario, AnsysJob
from thermashell_engine.optimizer import run_optimization
from api.v1.simulations import RunSimulationPayload, _build_engine_config
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
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Executes a deterministic parametric sweep, filters Pareto frontier, and persists candidates.
    """
    try:
        base_cfg = _build_engine_config(req.base_scenario)
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
        run_record = OptimizationRun(
            scenario_id=req.base_scenario.scenario_id,
            objective_weights_json=json.dumps(weights_dict),
            candidate_count=frontier.total_evaluated,
            pareto_count=len(frontier.pareto_optimal),
            status="completed",
            completed_at=datetime.utcnow()
        )
        db.add(run_record)
        await db.flush()

        pareto_ids = {p.design_id for p in frontier.pareto_optimal}

        for idx, cand in enumerate(frontier.candidates):
            is_pareto = 1 if cand.design_id in pareto_ids else 0
            cand_db = OptimizationCandidate(
                run_id=run_record.id,
                candidate_index=idx,
                design_id=cand.design_id,
                parameters_json=json.dumps(cand.parameters),
                metrics_json=json.dumps({
                    "energy_kwh": cand.energy_kwh,
                    "comfort_percentage": cand.comfort_percentage,
                    "cost_factor": cand.estimated_cost_factor,
                    "score": cand.score
                }),
                is_pareto=is_pareto,
                ansys_verification_status="unverified"
            )
            db.add(cand_db)

        await db.commit()
        frontier_dict["run_id"] = run_record.id

        # Optional ANSYS verification of top candidate
        if req.verify_top_in_ansys and frontier.recommended:
            env = detect_ansys_environment()
            ansys_job = AnsysJob(
                scenario_id=req.base_scenario.scenario_id,
                status="QUEUED" if env["status"] != "UNAVAILABLE" else "UNAVAILABLE",
                mode=env["mode"],
                error_message=env["reason"] if env["status"] == "UNAVAILABLE" else None
            )
            db.add(ansys_job)
            await db.commit()
            if env["status"] != "UNAVAILABLE":
                background_tasks.add_task(process_ansys_job, ansys_job.id)

            frontier_dict["ansys_verification_job_id"] = ansys_job.id

        return frontier_dict

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.get("/runs/{run_id}")
async def get_optimization_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch stored optimization run and candidate evaluations."""
    stmt = select(OptimizationRun).where(OptimizationRun.id == run_id)
    res = await db.execute(stmt)
    run_rec = res.scalar_one_or_none()

    if not run_rec:
        raise HTTPException(status_code=404, detail="Optimization run not found.")

    cand_stmt = select(OptimizationCandidate).where(OptimizationCandidate.run_id == run_id).order_by(OptimizationCandidate.candidate_index)
    cand_res = await db.execute(cand_stmt)
    cands = cand_res.scalars().all()

    return {
        "run_id": run_rec.id,
        "scenario_id": run_rec.scenario_id,
        "objective_weights": json.loads(run_rec.objective_weights_json),
        "candidate_count": run_rec.candidate_count,
        "pareto_count": run_rec.pareto_count,
        "candidates": [
            {
                "id": c.id,
                "design_id": c.design_id,
                "parameters": json.loads(c.parameters_json),
                "metrics": json.loads(c.metrics_json),
                "is_pareto": bool(c.is_pareto),
                "ansys_status": c.ansys_verification_status
            }
            for c in cands
        ]
    }
