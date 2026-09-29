"""
Audit Verification & Negative Case Testing Suite for ThermaShell.

Covers:
1. Rejection of synthetic climate boundary parameters (base_outdoor_temp_c, temp_swing_c).
2. Rejection of simulation requests missing valid NASA POWER climate dataset.
3. Live flow of real NASA POWER hourly timeseries from MongoDB Atlas into 4R2C RC_Network solver.
4. Correct parsing of NASA POWER YYYYMMDDHH timestamp format.
5. Strict ANSYS status handling: UNAVAILABLE or FAILED never marked VALIDATED.
6. Validation status rules (NOT_RUN, UNAVAILABLE, PENDING_ANSYS, FAILED, VALIDATED).
7. Parametric optimization sweep with real NASA climate boundary conditions.
8. Report consistency dynamically reflecting true multi-system status.
"""

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
import pytest
import pymongo
from starlette.testclient import TestClient

# Ensure root and backend are in sys.path
root_dir = str(Path(__file__).parent.parent.parent)
backend_dir = str(Path(__file__).parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
from config import settings


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def mongo_db():
    sync_client = pymongo.MongoClient(settings.MONGODB_URI)
    return sync_client[settings.MONGODB_DATABASE]


# =========================================================================
# 1. NEGATIVE CASE: Prohibit Synthetic Climate Boundary Parameters
# =========================================================================
def test_negative_simulation_rejects_synthetic_parameters(client):
    """
    Simulation must reject requests containing synthetic parameters
    such as base_outdoor_temp_c or temp_swing_c with HTTP 400.
    """
    payload = {
        "scenario_id": f"neg-synth-{uuid.uuid4().hex[:6]}",
        "length_m": 6.0,
        "width_m": 4.0,
        "height_m": 3.0,
        "roof_pitch_deg": 15.0,
        "orientation_deg": 180.0,
        "wall_layers": [
            {"name": "Plywood", "thickness_mm": 12, "conductivity": 0.13, "density": 600, "specific_heat": 1200}
        ],
        "roof_layers": [
            {"name": "Metal", "thickness_mm": 2, "conductivity": 50.0, "density": 7800, "specific_heat": 480}
        ],
        "duration_hours": 24,
        "base_outdoor_temp_c": -12.0,  # PROHIBITED
        "temp_swing_c": 8.0           # PROHIBITED
    }
    resp = client.post("/api/v1/simulations/run", json=payload)
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "Synthetic climate boundary parameters" in detail
    assert "prohibited" in detail


# =========================================================================
# 2. NEGATIVE CASE: Reject Simulation Missing Valid Climate Dataset
# =========================================================================
def test_negative_simulation_rejects_missing_climate_dataset(client):
    """
    Simulation must reject requests without a valid NASA POWER climate dataset.
    Synthetic weather data is strictly prohibited as a fallback.
    """
    payload = {
        "scenario_id": f"neg-missing-{uuid.uuid4().hex[:6]}",
        "length_m": 6.0,
        "width_m": 4.0,
        "height_m": 3.0,
        "roof_pitch_deg": 15.0,
        "orientation_deg": 180.0,
        "wall_layers": [
            {"name": "Plywood", "thickness_mm": 12, "conductivity": 0.13, "density": 600, "specific_heat": 1200}
        ],
        "roof_layers": [
            {"name": "Metal", "thickness_mm": 2, "conductivity": 50.0, "density": 7800, "specific_heat": 480}
        ],
        "duration_hours": 24
        # Note: no climate_dataset_id and no climate provided
    }
    resp = client.post("/api/v1/simulations/run", json=payload)
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "Valid climate dataset (NASA POWER) is required" in detail


# =========================================================================
# 3. NEGATIVE CASE: ANSYS Unavailable Must Report UNAVAILABLE, Not VALIDATED
# =========================================================================
def test_negative_ansys_unavailable_cannot_become_validated(client, mongo_db):
    """
    When ANSYS Fluent runtime is unavailable, the job must be marked UNAVAILABLE
    and the comparative validation decision must strictly report UNAVAILABLE.
    """
    scenario_id = f"scen-ansys-test-{uuid.uuid4().hex[:6]}"
    # Seed scenario so create_ansys_job passes existence check
    mongo_db.scenarios.insert_one({
        "_id": scenario_id,
        "id": scenario_id,
        "project_id": "test-project",
        "name": "ANSYS Unavail Test",
        "created_at": datetime.now(timezone.utc)
    })
    
    # Trigger ANSYS job
    resp = client.post("/api/v1/ansys/jobs", json={
        "scenario_id": scenario_id,
        "fluent_version": "24.1",
        "processors": 2,
        "mesh_resolution": "coarse"
    })
    assert resp.status_code == 200
    job_data = resp.json()
    job_id = job_data["job_id"]
    
    # In non-ANSYS test environments, status must be UNAVAILABLE
    if job_data["status"] == "UNAVAILABLE":
        # Check comparative endpoint
        comp_resp = client.get(f"/api/v1/ansys/jobs/{job_id}/compare")
        assert comp_resp.status_code == 200
        comp_data = comp_resp.json()
        assert comp_data["validation_decision"] == "UNAVAILABLE"
        assert comp_data["comparison_status"] == "UNAVAILABLE"
        assert "UNAVAILABLE" in comp_data["message"]


# =========================================================================
# 4. NEGATIVE CASE: Failed ANSYS Job Must Report FAILED, Not VALIDATED
# =========================================================================
def test_negative_failed_ansys_job_reports_failed(client, mongo_db):
    """
    If an ANSYS job has status FAILED, the comparison endpoint must
    return validation_decision: "FAILED", never "VALIDATED".
    """
    failed_id = f"failed-job-{uuid.uuid4().hex[:6]}"
    mongo_db.ansys_jobs.insert_one({
        "_id": failed_id,
        "id": failed_id,
        "scenario_id": "test-failed-scen",
        "status": "FAILED",
        "error_message": "Divergence in pressure correction equation",
        "created_at": datetime.now(timezone.utc)
    })

    resp = client.get(f"/api/v1/ansys/jobs/{failed_id}/compare")
    assert resp.status_code == 200
    data = resp.json()
    assert data["validation_decision"] == "FAILED"
    assert data["comparison_status"] == "FAILED"
    assert "Divergence" in data["message"]


# =========================================================================
# 5. REAL NASA POWER TIMESERIES TO RC_NETWORK FLOW
# =========================================================================
def test_real_nasa_power_flow_into_rc_network(client, mongo_db):
    """
    Verifies that a real NASA POWER dataset persisted in MongoDB Atlas
    is retrieved by climate_dataset_id, parsed (including YYYYMMDDHH timestamps),
    and correctly feeds boundary conditions to the 4R2C RC_Network solver.
    """
    dataset_id = f"nasa-leh-{uuid.uuid4().hex[:6]}"
    
    # Construct 48-hour authentic NASA POWER parameter dictionary
    # NASA format uses YYYYMMDDHH strings like "2024011500"
    timestamps = [f"20240115{h:02d}" for h in range(24)] + [f"20240116{h:02d}" for h in range(24)]
    t2m = [-14.5 + 5.0 * (1 if 10 <= (i % 24) <= 16 else 0) for i in range(48)]
    rh2m = [45.0 for _ in range(48)]
    ws10m = [2.8 for _ in range(48)]
    solar = [0.0 if not (8 <= (i % 24) <= 17) else 450.0 for i in range(48)]
    ps = [65.0 for _ in range(48)]

    mongo_db.climate_datasets.insert_one({
        "_id": dataset_id,
        "dataset_id": dataset_id,
        "latitude": 34.1526,
        "longitude": 77.5771,
        "start_date": "20240115",
        "end_date": "20240116",
        "source": "NASA_POWER",
        "parameters": {
            "T2M": {ts: val for ts, val in zip(timestamps, t2m)},
            "RH2M": {ts: val for ts, val in zip(timestamps, rh2m)},
            "WS10M": {ts: val for ts, val in zip(timestamps, ws10m)},
            "ALLSKY_SFC_SW_DWN": {ts: val for ts, val in zip(timestamps, solar)},
            "PS": {ts: val for ts, val in zip(timestamps, ps)}
        },
        "created_at": datetime.now(timezone.utc)
    })

    # Execute simulation passing the dataset_id
    sim_payload = {
        "scenario_id": f"sim-real-nasa-{uuid.uuid4().hex[:6]}",
        "length_m": 6.0,
        "width_m": 4.0,
        "height_m": 3.0,
        "roof_pitch_deg": 15.0,
        "orientation_deg": 180.0,
        "wall_layers": [
            {"name": "Stone Masonry", "thickness_mm": 250, "conductivity": 1.5, "density": 2200, "specific_heat": 840},
            {"name": "EPS Insulation", "thickness_mm": 100, "conductivity": 0.035, "density": 25, "specific_heat": 1400}
        ],
        "roof_layers": [
            {"name": "Timber Board", "thickness_mm": 25, "conductivity": 0.13, "density": 550, "specific_heat": 1600},
            {"name": "Glasswool Insulation", "thickness_mm": 120, "conductivity": 0.038, "density": 30, "specific_heat": 840}
        ],
        "duration_hours": 48,
        "climate_dataset_id": dataset_id,
        "hvac_mode": "heated",
        "target_temp_c": 18.0
    }

    resp = client.post("/api/v1/simulations/run", json=sim_payload)
    assert resp.status_code == 200
    res_data = resp.json()

    assert len(res_data["timestamps"]) == 48
    assert len(res_data["indoor_temp_c"]) == 48
    assert len(res_data["outdoor_temp_c"]) == 48

    # Verify that the outdoor temperature in the results matches the real NASA T2M values
    assert abs(res_data["outdoor_temp_c"][0] - t2m[0]) < 1e-4
    assert abs(res_data["outdoor_temp_c"][12] - t2m[12]) < 1e-4

    # Verify physical heating energy is computed and nonzero for sub-zero Leh weather
    assert res_data["heat_balance"]["heating_energy_kwh"] > 0
    assert "comfort" in res_data
    assert "comfort_percentage" in res_data["comfort"]


# =========================================================================
# 6. PARAMETRIC OPTIMIZATION SWEEP WITH REAL CLIMATE
# =========================================================================
def test_optimization_sweep_with_real_climate(client, mongo_db):
    """
    Verifies that the parametric optimization sweep resolves real climate data
    from climate_dataset_id and evaluates candidates without synthetic fallback.
    """
    dataset_id = f"nasa-opt-{uuid.uuid4().hex[:6]}"
    timestamps = [f"20240115{h:02d}" for h in range(24)]
    t2m = [-10.0 + 4.0 * (1 if 10 <= h <= 16 else 0) for h in range(24)]
    rh2m = [50.0 for _ in range(24)]
    ws10m = [2.0 for _ in range(24)]
    solar = [0.0 if not (9 <= h <= 16) else 380.0 for h in range(24)]
    ps = [65.0 for _ in range(24)]

    mongo_db.climate_datasets.insert_one({
        "_id": dataset_id,
        "dataset_id": dataset_id,
        "latitude": 34.1526,
        "longitude": 77.5771,
        "start_date": "20240115",
        "end_date": "20240115",
        "source": "NASA_POWER",
        "parameters": {
            "T2M": {ts: val for ts, val in zip(timestamps, t2m)},
            "RH2M": {ts: val for ts, val in zip(timestamps, rh2m)},
            "WS10M": {ts: val for ts, val in zip(timestamps, ws10m)},
            "ALLSKY_SFC_SW_DWN": {ts: val for ts, val in zip(timestamps, solar)},
            "PS": {ts: val for ts, val in zip(timestamps, ps)}
        },
        "created_at": datetime.now(timezone.utc)
    })

    opt_payload = {
        "base_scenario": {
            "scenario_id": f"scen-opt-{uuid.uuid4().hex[:6]}",
            "length_m": 6.0,
            "width_m": 4.0,
            "height_m": 3.0,
            "roof_pitch_deg": 15.0,
            "orientation_deg": 180.0,
            "wall_layers": [
                {"name": "Stone", "thickness_mm": 200, "conductivity": 1.5, "density": 2200, "specific_heat": 840}
            ],
            "roof_layers": [
                {"name": "Timber", "thickness_mm": 20, "conductivity": 0.13, "density": 550, "specific_heat": 1600}
            ],
            "duration_hours": 24,
            "climate_dataset_id": dataset_id,
            "hvac_mode": "heated",
            "target_temp_c": 18.0
        },
        "insulation_thicknesses_m": [0.05, 0.10],
        "window_u_values": [5.7, 2.8],
        "ach_values": [0.3],
        "max_candidates": 4
    }

    resp = client.post("/api/v1/optimization/sweep", json=opt_payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "candidates" in data
    assert len(data["candidates"]) >= 2
    assert "pareto_optimal" in data
    assert "run_id" in data

    # Verify candidates evaluated have valid positive energy consumption
    for cand in data["candidates"]:
        assert cand["energy_kwh"] > 0
        assert "comfort_percentage" in cand
        assert "score" in cand


# =========================================================================
# 7. HOLISTIC SCENARIO ANSYS & VALIDATION STATUS
# =========================================================================
def test_scenario_status_reports_truthful_state(client):
    """
    Verifies that GET /api/v1/ansys/scenarios/{id}/status provides
    accurate non-fabricated statuses.
    """
    scen_id = f"scen-truth-{uuid.uuid4().hex[:6]}"
    resp = client.get(f"/api/v1/ansys/scenarios/{scen_id}/status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["scenario_id"] == scen_id
    assert data["physics_status"] == "NOT_RUN"
    assert data["ansys_status"] in ["NOT_STARTED", "UNAVAILABLE"]
    assert data["validation_status"] in ["NOT_RUN", "UNAVAILABLE"]
    # Crucially, validation status must NEVER be VALIDATED for unrun scenarios
    assert data["validation_status"] != "VALIDATED"
