"""
Projects API endpoints — database-backed project creation, listing, retrieval, and updates.
"""

import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

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
async def list_projects(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns database-stored engineering projects."""
    cursor = db.projects.find().sort("created_at", -1)
    projects = await cursor.to_list(length=100)

    output = []
    for p in projects:
        # Check for scenarios
        scen = await db.scenarios.find_one({"project_id": p["id"]})

        loc_data = None
        geo_data = None
        env_summary = None
        energy_kwh = None
        comfort_pct = None

        if scen and scen.get("canonical_json"):
            try:
                c = json.loads(scen["canonical_json"])
                loc_data = c.get("location")
                geo_data = c.get("geometry")
                # Build envelope summary from actual layer data
                envelope_cfg = c.get("envelope", {})
                wall_layers = envelope_cfg.get("wall_layers", [])
                if wall_layers:
                    layer_names = list(dict.fromkeys(l.get("name", "") for l in wall_layers))
                    env_summary = " + ".join(layer_names[:3])
                    if len(layer_names) > 3:
                        env_summary += f" (+{len(layer_names) - 3} more)"
            except Exception:
                pass

        # Check latest simulation result
        if scen:
            latest_sim = await db.simulation_results.find_one(
                {"scenario_id": scen["id"]}, 
                sort=[("created_at", -1)]
            )
            if latest_sim:
                energy_kwh = latest_sim.get("heating_demand_kwh")
                comfort_pct = latest_sim.get("comfort_compliance_pct")

        created_at = p.get("created_at")
        output.append({
            "id": p["id"],
            "scenario_id": scen["id"] if scen else None,
            "name": p["name"],
            "description": p.get("description"),
            "location": loc_data,
            "geometry": geo_data,
            "envelope_summary": env_summary,
            "baseline_energy_kwh": round(energy_kwh, 1) if energy_kwh is not None else None,
            "comfort_percentage": round(comfort_pct, 1) if comfort_pct is not None else None,
            "created_at": created_at.isoformat() if isinstance(created_at, datetime) else str(created_at)
        })

    return output

@router.post("", response_model=Dict[str, Any])
async def create_project(req: CreateProjectRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Create a new project and authoritative canonical scenario in MongoDB."""
    import uuid
    project_id = str(uuid.uuid4())
    now = datetime.utcnow()

    proj = {
        "_id": project_id,
        "id": project_id,
        "name": req.name,
        "description": req.description,
        "created_at": now,
        "updated_at": now
    }
    await db.projects.insert_one(proj)

    loc_id = None
    if req.location:
        loc_id = str(uuid.uuid4())
        loc = {
            "_id": loc_id,
            "id": loc_id,
            "project_id": project_id,
            "name": req.location.name,
            "latitude": req.location.latitude,
            "longitude": req.location.longitude,
            "elevation": req.location.elevation,
            "elevation_source": "user",
            "climate_zone": req.location.climate_zone,
            "created_at": now
        }
        await db.locations.insert_one(loc)

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

    scenario_id = str(uuid.uuid4())
    scenario = {
        "_id": scenario_id,
        "id": scenario_id,
        "project_id": project_id,
        "name": req.name,
        "version": 1,
        "location_id": loc_id,
        "canonical_json": json.dumps(canonical),
        "created_at": now,
        "updated_at": now
    }
    await db.scenarios.insert_one(scenario)

    return {
        "id": proj["id"],
        "scenario_id": scenario["id"],
        "name": proj["name"],
        "description": proj["description"],
        "location": canonical["location"],
        "created_at": proj["created_at"].isoformat()
    }

@router.get("/{project_id}", response_model=Dict[str, Any])
async def get_project(project_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Fetch project details by ID."""
    proj = await db.projects.find_one({"id": project_id})

    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    scen = await db.scenarios.find_one(
        {"project_id": project_id},
        sort=[("created_at", -1)]
    )

    scen_data = json.loads(scen["canonical_json"]) if (scen and scen.get("canonical_json")) else {}

    created_at = proj.get("created_at")
    return {
        "id": proj["id"],
        "name": proj["name"],
        "description": proj.get("description"),
        "scenario": scen_data,
        "created_at": created_at.isoformat() if isinstance(created_at, datetime) else str(created_at)
    }
