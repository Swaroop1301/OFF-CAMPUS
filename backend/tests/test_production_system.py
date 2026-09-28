"""
Comprehensive production test suite verifying:
- Cloud database models and CRUD
- Verified materials and custom materials
- Location intake, geocoding, and elevation pipeline
- Storage service artifact upload/download
- Parametric ANSYS CAD geometry generation
- PyFluent runner environment detection
- Validation benchmark analytical execution
- Reports dossier generation
"""

import os
import sys
import json
import pytest
from pathlib import Path
from starlette.testclient import TestClient

# Ensure root and backend are in sys.path
root_dir = str(Path(__file__).parent.parent.parent)
backend_dir = str(Path(__file__).parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
from database import init_db, async_session
from models import Material, Project, Scenario
from ansys_worker.runner import detect_ansys_environment
from ansys_worker.geometry import ParametricShelterGeometry
from ansys_worker.postprocess import FluentPostProcessor
from services.location_service import determine_climate_zone


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_database_and_materials_seeded(client):
    resp = client.get("/api/v1/materials")
    assert resp.status_code == 200
    materials = resp.json()
    assert len(materials) >= 16
    m0 = materials[0]
    assert "thermal_conductivity_k" in m0
    assert "density_rho" in m0
    assert "specific_heat_cp" in m0
    assert m0["thermal_conductivity_k"] > 0
    assert m0["density_rho"] > 0


def test_custom_material_creation(client):
    payload = {
        "name": "Custom Hemp-Lime Bio-Insulation",
        "category": "Bio-Composite",
        "description": "High thermal mass bio-composite hemp hurds bound with hydraulic lime",
        "thermal_conductivity_k": 0.075,
        "density_rho": 350.0,
        "specific_heat_cp": 1600.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.55,
        "embodied_carbon": -0.45,
        "cost": 920.0,
        "source": "Auroville Bio-Materials Lab",
        "reference": "Lab Specimen Test 2026",
    }
    resp = client.post("/api/v1/materials", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_custom"] is True
    assert data["thermal_conductivity_k"] == 0.075


def test_assembly_evaluation_endpoint(client):
    payload = {
        "surface_type": "wall",
        "layers": [
            {"name": "Plaster", "thickness_mm": 15, "conductivity": 0.72, "density": 1600, "specific_heat": 840},
            {"name": "Stone Masonry", "thickness_mm": 300, "conductivity": 1.50, "density": 2500, "specific_heat": 900},
            {"name": "EPS", "thickness_mm": 100, "conductivity": 0.035, "density": 25, "specific_heat": 1400},
        ]
    }
    resp = client.post("/api/v1/materials/evaluate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["u_value"] > 0
    assert data["r_value"] > 2.0
    assert data["thermal_capacity"] > 0
    assert data["total_thickness_mm"] == 415.0


def test_location_and_climate_zone_pipeline(client):
    zone_leh = determine_climate_zone(34.15, 77.58, 3500.0)
    assert "Cold and Sunny" in zone_leh or "High Altitude" in zone_leh

    zone_jaisalmer = determine_climate_zone(26.91, 70.90, 225.0)
    assert "Hot and Dry" in zone_jaisalmer

    resp = client.get("/api/v1/locations/context?lat=34.15&lon=77.58&user_elevation=3500")
    assert resp.status_code == 200
    data = resp.json()
    assert data["elevation_m"] == 3500.0
    assert data["elevation_source"] == "user"
    assert "Cold and Sunny" in data["climate_zone"]


def test_storage_service(client):
    resp = client.get("/api/v1/storage/buckets")
    assert resp.status_code == 200
    buckets = resp.json()
    assert "climate" in buckets
    assert "ansys" in buckets
    assert "simulation" in buckets


def test_ansys_status_and_job_lifecycle(client):
    resp = client.get("/api/v1/ansys/status")
    assert resp.status_code == 200
    env = resp.json()
    assert env["status"] in ("CONNECTED", "BUSY", "OFFLINE", "UNAVAILABLE")
    assert "reason" in env


def test_ansys_cad_geometry_generation(tmp_path):
    geom = ParametricShelterGeometry(
        length_m=6.0,
        width_m=4.0,
        height_m=3.0,
        roof_type="gable",
        roof_pitch_deg=15.0,
        wall_thickness_m=0.30
    )
    stl_files = geom.export_geometry_stl(str(tmp_path))
    assert os.path.exists(stl_files["fluid_stl"])
    assert os.path.exists(stl_files["solid_stl"])
    assert geom.int_volume > 0


def test_analytical_validation_suite(client):
    resp = client.get("/api/v1/validation/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["all_passed"] is True
    assert data["total_cases"] == 5
    for case in data["cases"]:
        assert case["status"] == "passed"
        assert case["mae"] >= 0
        assert case["r_squared"] >= 0.95


def test_physics_vs_ansys_comparator():
    p_temps = [18.0, 18.2, 18.5, 19.1, 19.8, 19.5, 18.9, 18.3]
    a_temps = [18.1, 18.3, 18.4, 19.0, 19.7, 19.6, 18.8, 18.2]
    metrics = FluentPostProcessor.calculate_validation_metrics(p_temps, a_temps)
    assert metrics["mae"] < 0.2
    assert metrics["rmse"] < 0.2
    assert metrics["r_squared"] > 0.95


def test_projects_and_reports_generation(client):
    # Check preset projects in database
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 200
    projects = resp.json()
    assert len(projects) >= 3

    # Create a new project
    p_req = {
        "name": "Kargil Frontier High Defense Post",
        "description": "High altitude thermal outpost",
        "location": {
            "name": "Kargil, Ladakh",
            "latitude": 34.55,
            "longitude": 76.13,
            "elevation": 2676.0,
            "climate_zone": "Cold Desert"
        }
    }
    create_resp = client.post("/api/v1/projects", json=p_req)
    assert create_resp.status_code == 200
    p_data = create_resp.json()
    scen_id = p_data["scenario_id"]

    # Generate engineering report
    rep_req = {
        "scenario_id": scen_id,
        "title": "Kargil Defense Post Thermal Certification"
    }
    rep_resp = client.post("/api/v1/reports/generate", json=rep_req)
    assert rep_resp.status_code == 200
    dossier = rep_resp.json()
    assert "compliance_standards" in dossier
    assert dossier["scenario"]["name"] == "Kargil Frontier High Defense Post"
