"""
Projects API endpoints — database-backed project creation, listing, retrieval, and updates.
"""

import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Project, Scenario, Location, SimulationResult

router = APIRouter()


class LocationInput(BaseModel):
    name: str = "Leh, Ladakh"
    latitude: float
    longitude: float
    elevation: float = 3500.0
    climate_zone: str = "Cold and Sunny (High Altitude)"


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=2)
    description: Optional[str] = ""
    location: Optional[LocationInput] = None
    geometry: Optional[Dict[str, Any]] = None
    envelope: Optional[Dict[str, Any]] = None
    operating: Optional[Dict[str, Any]] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    location: Optional[Dict[str, Any]] = None
    geometry: Optional[Dict[str, Any]] = None
    envelope_summary: Optional[str] = None
    baseline_energy_kwh: Optional[float] = None
    comfort_percentage: Optional[float] = None
    created_at: str


@router.get("", response_model=List[Dict[str, Any]])
async def list_projects(db: AsyncSession = Depends(get_db)):
    """Returns database-stored engineering projects."""
    stmt = select(Project).order_by(Project.created_at.desc())
    res = await db.execute(stmt)
    projects = res.scalars().all()

    output = []
    for p in projects:
        # Check for scenarios
        scen_stmt = select(Scenario).where(Scenario.project_id == p.id).limit(1)
        scen_res = await db.execute(scen_stmt)
        scen = scen_res.scalar_one_or_none()

        loc_data = {"name": "Himalayan Frontier", "latitude": 34.15, "longitude": 77.58, "elevation": 3500.0, "climate_zone": "Cold Desert"}
        geo_data = {"length": 6.0, "width": 4.0, "height": 3.0, "orientation": 180.0, "roof_type": "gable"}
        env_summary = "Stone Masonry + EPS / XPS Composite"
        energy_kwh = 38.6
        comfort_pct = 75.0

        if scen and scen.canonical_json:
            try:
                c = json.loads(scen.canonical_json)
                if "location" in c:
                    loc_data = c["location"]
                if "geometry" in c:
                    geo_data = c["geometry"]
            except Exception:
                pass

        # Check latest simulation result
        if scen:
            sim_stmt = select(SimulationResult).where(SimulationResult.scenario_id == scen.id).order_by(SimulationResult.created_at.desc()).limit(1)
            sim_res = await db.execute(sim_stmt)
            latest_sim = sim_res.scalar_one_or_none()
            if latest_sim:
                energy_kwh = latest_sim.heating_demand_kwh
                comfort_pct = latest_sim.comfort_compliance_pct

        output.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "location": loc_data,
            "geometry": geo_data,
            "envelope_summary": env_summary,
            "baseline_energy_kwh": round(energy_kwh, 1),
            "comfort_percentage": round(comfort_pct, 1),
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    return output


@router.post("", response_model=Dict[str, Any])
async def create_project(req: CreateProjectRequest, db: AsyncSession = Depends(get_db)):
    """Create a new project and authoritative canonical scenario in PostgreSQL."""
    import uuid
    project_id = str(uuid.uuid4())

    proj = Project(
        id=project_id,
        name=req.name,
        description=req.description,
    )
    db.add(proj)

    loc = None
    if req.location:
        loc = Location(
            project_id=project_id,
            name=req.location.name,
            latitude=req.location.latitude,
            longitude=req.location.longitude,
            elevation=req.location.elevation,
            elevation_source="user",
            climate_zone=req.location.climate_zone,
        )
        db.add(loc)
        await db.flush()

    # Create associated canonical scenario
    canonical = {
        "id": f"scen-{project_id[:8]}",
        "project_id": project_id,
        "name": req.name,
        "location": req.location.model_dump() if req.location else {
            "name": "Leh, Ladakh", "latitude": 34.15, "longitude": 77.58, "elevation": 3500.0, "climate_zone": "Cold Desert"
        },
        "geometry": req.geometry or {"length": 6.0, "width": 4.0, "height": 3.0, "roof_type": "gable", "roof_pitch": 15.0, "orientation": 180.0},
        "envelope": req.envelope or {},
        "operating": req.operating or {"occupants": 4, "metabolic_rate": 100, "internal_gains": 200, "target_temp": 18, "comfort_band": 2, "hvac_mode": "heated"},
    }

    scenario = Scenario(
        project_id=project_id,
        name=req.name,
        version=1,
        location_id=loc.id if loc else None,
        canonical_json=json.dumps(canonical)
    )
    db.add(scenario)
    await db.commit()

    return {
        "id": proj.id,
        "scenario_id": scenario.id,
        "name": proj.name,
        "description": proj.description,
        "location": canonical["location"],
        "created_at": proj.created_at.isoformat()
    }


@router.get("/{project_id}", response_model=Dict[str, Any])
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch project details by ID."""
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    proj = res.scalar_one_or_none()

    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    scen_stmt = select(Scenario).where(Scenario.project_id == project_id).order_by(Scenario.created_at.desc()).limit(1)
    scen_res = await db.execute(scen_stmt)
    scen = scen_res.scalar_one_or_none()

    scen_data = json.loads(scen.canonical_json) if (scen and scen.canonical_json) else {}

    return {
        "id": proj.id,
        "name": proj.name,
        "description": proj.description,
        "scenario": scen_data,
        "created_at": proj.created_at.isoformat() if proj.created_at else None
    }
