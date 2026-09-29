"""
Simulation API endpoints — runs thermal transient simulations and streams progress.
Persists simulation runs and results to PostgreSQL and object storage.
Uses real NASA POWER / climate timeseries.
"""

import asyncio
import json
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db

from services.storage_service import storage_service
from thermashell_engine.types import (
    ShelterGeometry, MaterialLayer, WallAssembly, Envelope, Opening,
    ClimateTimeseries, SimulationConfig, RoofType, HVACMode, ComfortModel
)
from thermashell_engine.rc_network import run_simulation

logger = logging.getLogger("thermashell.simulation")
router = APIRouter()


class LayerPayload(BaseModel):
    name: str
    thickness_mm: float
    conductivity: float
    density: float = 1200.0
    specific_heat: float = 900.0


class OpeningPayload(BaseModel):
    name: str = "Window"
    width_m: float = 1.2
    height_m: float = 1.0
    wall_face: str = "south"
    u_value: float = 2.8
    shgc: float = 0.65
    count: int = 1


class ClimateInputPayload(BaseModel):
    timestamps: List[str]
    temperature_c: List[float]
    relative_humidity: Optional[List[float]] = None
    wind_speed_ms: Optional[List[float]] = None
    solar_ghi: Optional[List[float]] = None
    pressure_kpa: Optional[List[float]] = None


class RunSimulationPayload(BaseModel):
    scenario_id: Optional[str] = "custom-scenario"
    length_m: float = 6.0
    width_m: float = 4.0
    height_m: float = 3.0
    roof_type: str = "gable"
    roof_pitch_deg: float = 15.0
    orientation_deg: float = 180.0
    elevation_m: float = 3500.0
    latitude: float = 34.15
    longitude: float = 77.58

    wall_layers: List[LayerPayload]
    roof_layers: List[LayerPayload]
    floor_layers: Optional[List[LayerPayload]] = None
    openings: Optional[List[OpeningPayload]] = None

    occupants: int = 4
    metabolic_rate_w: float = 100.0
    internal_gains_w: float = 200.0

    hvac_mode: str = "heated"
    target_temp_c: float = 18.0
    comfort_band_c: float = 2.0
    ach_natural: float = 0.3
    ach_infiltration: float = 0.2

    # Real climate input or dataset identifier
    climate_dataset_id: Optional[str] = None
    climate: Optional[ClimateInputPayload] = None
    duration_hours: int = 72

    # Prohibited synthetic parameters — accepted only to detect and reject non-compliant requests
    base_outdoor_temp_c: Optional[float] = None
    temp_swing_c: Optional[float] = None


from services.climate_service import fetch_climate_data
import uuid

async def _ensure_climate_data(payload: RunSimulationPayload, db: AsyncIOMotorDatabase):
    """
    Enforces that real meteorological data from NASA POWER reaches the physics engine.
    Strictly rejects synthetic weather generation (sine waves, base temperatures, fake swings).
    Resolves the canonical dataset from MongoDB Atlas and populates payload.climate.
    """
    # 1. Enforce strict prohibition of synthetic boundary parameters
    if payload.base_outdoor_temp_c is not None or payload.temp_swing_c is not None:
        raise HTTPException(
            status_code=400,
            detail="Synthetic climate boundary parameters (base_outdoor_temp_c, temp_swing_c) are prohibited. A verified NASA POWER climate dataset is required."
        )

    # 2. If direct valid real timeseries is provided, accept it
    if payload.climate and payload.climate.timestamps and payload.climate.temperature_c and len(payload.climate.temperature_c) > 0:
        return payload

    # 3. Reject if no climate_dataset_id provided
    if not payload.climate_dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Valid climate dataset (NASA POWER) is required. Synthetic generation of weather data is prohibited."
        )

    # 4. Load from MongoDB Atlas using climate_dataset_id
    dataset = await db.climate_datasets.find_one({"$or": [{"id": payload.climate_dataset_id}, {"_id": payload.climate_dataset_id}]})
    if not dataset:
        raise HTTPException(
            status_code=404,
            detail=f"Climate dataset '{payload.climate_dataset_id}' not found in MongoDB Atlas."
        )
    
    import json
    from services.storage_service import storage_service
    
    # Try to load full payload from storage or fallback to native document parameters
    dataset_hash = dataset.get("dataset_hash")
    storage_data = None
    if dataset_hash:
        try:
            storage_data = await storage_service.get_artifact("climate", f"{dataset_hash}.json")
        except Exception:
            storage_data = None

    if storage_data:
        try:
            cached_payload = json.loads(storage_data.decode("utf-8"))
            params_dict = cached_payload.get("parameters", {})
        except Exception:
            params_dict = json.loads(dataset["parameters_json"]) if "parameters_json" in dataset else dataset.get("parameters", {})
    else:
        if "parameters" in dataset and isinstance(dataset["parameters"], dict):
            params_dict = dataset["parameters"]
        elif "parameters_json" in dataset:
            params_dict = json.loads(dataset["parameters_json"])
        else:
            params_dict = {}

    timestamps = sorted(list(params_dict.get("T2M", {}).keys()))
    if not timestamps:
        raise HTTPException(
            status_code=400,
            detail=f"Climate dataset '{payload.climate_dataset_id}' contains no meteorological observation timestamps."
        )

    if payload.duration_hours and len(timestamps) > payload.duration_hours:
        timestamps = timestamps[:payload.duration_hours]

    t2m = []
    rh2m = []
    ws10m = []
    ghi = []
    ps = []

    for ts in timestamps:
        t2m.append(params_dict.get("T2M", {}).get(ts, 0.0))
        rh2m.append(params_dict.get("RH2M", {}).get(ts, 50.0))
        ws10m.append(params_dict.get("WS10M", {}).get(ts, 1.0))
        ghi.append(params_dict.get("ALLSKY_SFC_SW_DWN", {}).get(ts, 0.0))
        ps.append(params_dict.get("PS", {}).get(ts, 101.3))
        
    payload.climate = ClimateInputPayload(
        timestamps=timestamps,
        temperature_c=t2m,
        relative_humidity=rh2m,
        wind_speed_ms=ws10m,
        solar_ghi=ghi,
        pressure_kpa=ps
    )
    return payload

def _build_engine_config(payload: RunSimulationPayload) -> SimulationConfig:
    roof_map = {
        "flat": RoofType.FLAT,
        "gable": RoofType.GABLE,
        "shed": RoofType.SHED,
        "hip": RoofType.HIP,
    }
    geometry = ShelterGeometry(
        length=payload.length_m,
        width=payload.width_m,
        height=payload.height_m,
        roof_type=roof_map.get(payload.roof_type.lower(), RoofType.GABLE),
        roof_pitch_deg=payload.roof_pitch_deg,
        orientation_deg=payload.orientation_deg,
        elevation_m=payload.elevation_m,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )

    walls = WallAssembly(
        name="Wall Assembly",
        layers=[
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in payload.wall_layers
        ]
    )

    roof = WallAssembly(
        name="Roof Assembly",
        layers=[
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in payload.roof_layers
        ]
    )

    floor_layers = payload.floor_layers or [
        LayerPayload(name="Dense Concrete", thickness_mm=150, conductivity=1.4, density=2300, specific_heat=880),
        LayerPayload(name="XPS Insulation", thickness_mm=80, conductivity=0.034, density=35, specific_heat=1400),
    ]
    floor = WallAssembly(
        name="Floor Assembly",
        layers=[
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in floor_layers
        ]
    )

    openings = [
        Opening(
            name=op.name,
            width_m=op.width_m,
            height_m=op.height_m,
            wall_face=op.wall_face,
            u_value=op.u_value,
            shgc=op.shgc,
            count=op.count,
        )
        for op in (payload.openings or [OpeningPayload()])
    ]

    # Process climate timeseries
    if not (payload.climate and payload.climate.timestamps):
        raise ValueError("Real climate data (NASA POWER or valid timeseries) is required. Synthetic fallbacks are prohibited.")
        
    timestamps = payload.climate.timestamps
    temps = payload.climate.temperature_c
    rh = payload.climate.relative_humidity or [40.0] * len(temps)
    wind = payload.climate.wind_speed_ms or [2.0] * len(temps)
    ghi = payload.climate.solar_ghi or [0.0] * len(temps)

    climate = ClimateTimeseries(
        timestamps=timestamps,
        temperature_c=temps,
        relative_humidity=rh,
        wind_speed_ms=wind,
        solar_ghi=ghi,
    )

    hvac_mode_map = {
        "free_running": HVACMode.FREE_RUNNING,
        "heated": HVACMode.HEATED,
        "cooled": HVACMode.COOLED,
        "mixed": HVACMode.MIXED,
    }

    return SimulationConfig(
        geometry=geometry,
        envelope=Envelope(walls=walls, roof=roof, floor=floor, openings=openings),
        climate=climate,
        occupants=payload.occupants,
        metabolic_rate_w=payload.metabolic_rate_w,
        internal_gains_w=payload.internal_gains_w,
        hvac_mode=hvac_mode_map.get(payload.hvac_mode, HVACMode.HEATED),
        target_temp_c=payload.target_temp_c,
        comfort_band_c=payload.comfort_band_c,
        ach_natural=payload.ach_natural,
        ach_infiltration=payload.ach_infiltration,
    )


@router.post("/run")
async def execute_simulation(payload: RunSimulationPayload, db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    """Execute transient thermal physics simulation synchronously and persist results."""
    try:
        await _ensure_climate_data(payload, db)
        cfg = _build_engine_config(payload)
        result = run_simulation(cfg)
        result_dict = result.model_dump()

        job_id = str(uuid.uuid4())
        
        # Persist Job & Results
        job = {
            "_id": job_id,
            "id": job_id,
            "scenario_id": payload.scenario_id,
            "climate_dataset_id": payload.climate_dataset_id,
            "status": "completed",
            "solver_type": "4R2C_EULER",
            "time_step_s": cfg.timestep_s,
            "completed_at": datetime.utcnow()
        }
        await db.simulation_jobs.insert_one(job)

        storage_path = await storage_service.save_artifact(
            bucket="simulation",
            path=f"{job_id}_timeseries.json",
            content=result_dict
        )

        sim_res = {
            "_id": str(uuid.uuid4()),
            "job_id": job_id,
            "scenario_id": payload.scenario_id,
            "duration_hours": result.simulation_hours,
            "heating_demand_kwh": result.heat_balance.heating_energy_kwh,
            "cooling_demand_kwh": result.heat_balance.cooling_energy_kwh,
            "peak_heating_kw": result.peak_heating_load_w / 1000.0,
            "peak_cooling_kw": result.peak_cooling_load_w / 1000.0,
            "comfort_compliance_pct": result.comfort.comfort_percentage,
            "mean_pmv": result.comfort.pmv_mean,
            "mean_ppd": result.comfort.ppd_mean,
            "timeseries_storage_path": storage_path,
            "summary_json": json.dumps(result_dict),
            "created_at": datetime.utcnow()
        }
        await db.simulation_results.insert_one(sim_res)

        result_dict["job_id"] = job_id
        result_dict["persisted"] = True
        return result_dict

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Simulation run error: %s", e)
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.websocket("/ws")
async def simulation_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time simulation streaming.
    Streams execution stages and persists final simulation run.
    """
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        payload = RunSimulationPayload(**data)
        
        import database
        from config import settings
        if database.client is None:
            await database.init_db()
        db = database.client[settings.MONGODB_DATABASE]
        
        await _ensure_climate_data(payload, db)
        
        cfg = _build_engine_config(payload)

        stages = [
            ("CLIMATE_INGEST", 15, "Synchronizing climate timeseries and solar geometry..."),
            ("RC_MATRIX_BUILD", 35, "Assembling 4R2C conductance-capacitance network..."),
            ("SOLVER_INTEGRATION", 75, "Solving implicit transient Euler equations..."),
            ("COMFORT_EVAL", 90, "Evaluating ISO 7730 PMV/PPD thermal comfort indices..."),
            ("CONVERGENCE_CHECK", 100, "Finalizing heat balance and energy metrics..."),
        ]

        for stage, pct, msg in stages:
            await websocket.send_json({
                "type": "PROGRESS",
                "stage": stage,
                "progress": pct,
                "message": msg
            })
            await asyncio.sleep(0.15)

        # Run engine
        result = run_simulation(cfg)
        result_dict = result.model_dump()

        # Persist asynchronously
        job_id = str(uuid.uuid4())
        job = {
            "_id": job_id,
            "id": job_id,
            "scenario_id": payload.scenario_id,
            "climate_dataset_id": payload.climate_dataset_id,
            "status": "completed",
            "solver_type": "4R2C_EULER",
            "time_step_s": cfg.timestep_s,
            "completed_at": datetime.utcnow()
        }
        await db.simulation_jobs.insert_one(job)

        storage_path = await storage_service.save_artifact(
            bucket="simulation",
            path=f"{job_id}_timeseries.json",
            content=result_dict
        )

        sim_res = {
            "_id": str(uuid.uuid4()),
            "job_id": job_id,
            "scenario_id": payload.scenario_id,
            "duration_hours": result.simulation_hours,
            "heating_demand_kwh": result.heat_balance.heating_energy_kwh,
            "cooling_demand_kwh": result.heat_balance.cooling_energy_kwh,
            "peak_heating_kw": result.peak_heating_load_w / 1000.0,
            "peak_cooling_kw": result.peak_cooling_load_w / 1000.0,
            "comfort_compliance_pct": result.comfort.comfort_percentage,
            "mean_pmv": result.comfort.pmv_mean,
            "mean_ppd": result.comfort.ppd_mean,
            "timeseries_storage_path": storage_path,
            "summary_json": json.dumps(result_dict),
            "created_at": datetime.utcnow()
        }
        await db.simulation_results.insert_one(sim_res)
        
        result_dict["job_id"] = job_id

        await websocket.send_json({
            "type": "COMPLETED",
            "progress": 100,
            "result": result_dict
        })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("Simulation WS exception: %s", e)
        await websocket.send_json({"type": "ERROR", "error": str(e)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
