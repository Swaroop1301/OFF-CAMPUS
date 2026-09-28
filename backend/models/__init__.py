"""
SQLAlchemy 2.0 async models for THERMASHELL.

Defines all 24 core engineering entities:
users, projects, scenarios, locations, climate_datasets, climate_records,
materials, material_versions, custom_materials, envelope_assemblies,
envelope_layers, windows, geometry_configurations, operating_conditions,
simulation_jobs, simulation_results, optimization_runs, optimization_candidates,
ansys_jobs, ansys_results, validation_runs, validation_metrics, reports, audit_events.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean, Index
)
from sqlalchemy.orm import relationship

from database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


# ── 1. Users ────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="engineer")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


# ── 2. Projects ─────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    scenarios = relationship("Scenario", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="project")


# ── 3. Locations ────────────────────────────────────────────────────────────
class Location(Base):
    __tablename__ = "locations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation = Column(Float, nullable=False, default=0.0)
    elevation_source = Column(String(50), default="provider")  # 'provider' or 'user'
    timezone = Column(String(50), default="UTC+05:30")
    climate_zone = Column(String(100), default="Cold and Sunny")
    created_at = Column(DateTime, default=datetime.utcnow)

    scenarios = relationship("Scenario", back_populates="location")
    climate_datasets = relationship("ClimateDataset", back_populates="location")


# ── 4. Climate Datasets & Records ───────────────────────────────────────────
class ClimateDataset(Base):
    __tablename__ = "climate_datasets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    location_id = Column(String(36), ForeignKey("locations.id"), nullable=True, index=True)
    source = Column(String(100), default="NASA POWER", nullable=False)
    start_date = Column(String(8), nullable=False)  # YYYYMMDD
    end_date = Column(String(8), nullable=False)    # YYYYMMDD
    dataset_hash = Column(String(64), nullable=False, index=True)
    parameters_json = Column(Text, nullable=False)
    raw_metadata_json = Column(Text, nullable=True)
    is_validated = Column(Integer, default=1)
    retrieval_timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    location = relationship("Location", back_populates="climate_datasets")
    records = relationship("ClimateRecord", back_populates="dataset", cascade="all, delete-orphan")


class ClimateRecord(Base):
    __tablename__ = "climate_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(String(36), ForeignKey("climate_datasets.id"), nullable=False, index=True)
    timestamp = Column(String(30), nullable=False)
    temperature_c = Column(Float, nullable=False)
    relative_humidity = Column(Float, nullable=False)
    wind_speed_ms = Column(Float, nullable=False)
    solar_ghi = Column(Float, nullable=False)
    surface_pressure_kpa = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("ClimateDataset", back_populates="records")


# Backward compatibility table
class ClimateSnapshot(Base):
    __tablename__ = "climate_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    start_date = Column(String(8), nullable=False)
    end_date = Column(String(8), nullable=False)
    params_hash = Column(String(64), nullable=False, index=True)
    data_json = Column(Text, nullable=False)
    source = Column(String(50), default="nasa_power")
    is_fallback = Column(Integer, default=0)
    fetched_at = Column(DateTime, default=datetime.utcnow)


# ── 5. Materials & Versions ─────────────────────────────────────────────────
class Material(Base):
    __tablename__ = "materials"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    thermal_conductivity_k = Column(Float, nullable=False)
    density_rho = Column(Float, nullable=False)
    specific_heat_cp = Column(Float, nullable=False)
    emissivity = Column(Float, nullable=False, default=0.90)
    solar_absorptivity = Column(Float, nullable=False, default=0.60)
    solar_reflectivity = Column(Float, nullable=True, default=0.40)
    embodied_carbon = Column(Float, nullable=False, default=0.0)
    cost = Column(Float, nullable=False, default=0.0)
    units = Column(String(50), default="SI (W/mK, kg/m³, J/kgK)")
    source = Column(String(255), default="IS 3792 / NBC 2016")
    reference = Column(String(255), default="Indian Standard / ASHRAE Handbook")
    valid_temperature_range = Column(String(100), default="-40°C to 100°C")
    is_custom = Column(Integer, default=0)
    created_by = Column(String(36), nullable=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    versions = relationship("MaterialVersion", back_populates="material", cascade="all, delete-orphan")


class MaterialVersion(Base):
    __tablename__ = "material_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    material_id = Column(String(100), ForeignKey("materials.id"), nullable=False, index=True)
    version_num = Column(Integer, nullable=False)
    properties_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    material = relationship("Material", back_populates="versions")


class CustomMaterial(Base):
    __tablename__ = "custom_materials"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=True, index=True)
    base_material_id = Column(String(100), nullable=True)
    properties_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── 6. Geometry, Operating, Envelope ────────────────────────────────────────
class GeometryConfiguration(Base):
    __tablename__ = "geometry_configurations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), nullable=True, index=True)
    length_m = Column(Float, nullable=False, default=6.0)
    width_m = Column(Float, nullable=False, default=4.0)
    height_m = Column(Float, nullable=False, default=3.0)
    roof_type = Column(String(50), default="gable")
    roof_pitch_deg = Column(Float, default=15.0)
    orientation_deg = Column(Float, default=180.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class OperatingCondition(Base):
    __tablename__ = "operating_conditions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), nullable=True, index=True)
    occupants = Column(Integer, default=4)
    metabolic_rate_w = Column(Float, default=100.0)
    internal_gains_w = Column(Float, default=200.0)
    hvac_mode = Column(String(50), default="heated")
    target_temp_c = Column(Float, default=18.0)
    comfort_band_c = Column(Float, default=2.0)
    ach_natural = Column(Float, default=0.3)
    ach_infiltration = Column(Float, default=0.2)
    created_at = Column(DateTime, default=datetime.utcnow)


class EnvelopeAssembly(Base):
    __tablename__ = "envelope_assemblies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), nullable=True, index=True)
    assembly_type = Column(String(50), nullable=False)  # 'wall', 'roof', 'floor'
    name = Column(String(255), nullable=False)
    calculated_r_value = Column(Float, nullable=False, default=0.0)
    calculated_u_value = Column(Float, nullable=False, default=0.0)
    calculated_thermal_capacity = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    layers = relationship("EnvelopeLayer", back_populates="assembly", cascade="all, delete-orphan")


class EnvelopeLayer(Base):
    __tablename__ = "envelope_layers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    assembly_id = Column(String(36), ForeignKey("envelope_assemblies.id"), nullable=False, index=True)
    material_id = Column(String(100), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String(255), nullable=False)
    thickness_mm = Column(Float, nullable=False)
    conductivity = Column(Float, nullable=False)
    density = Column(Float, nullable=False, default=1000.0)
    specific_heat = Column(Float, nullable=False, default=1000.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    assembly = relationship("EnvelopeAssembly", back_populates="layers")


class Window(Base):
    __tablename__ = "windows"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), nullable=True, index=True)
    name = Column(String(255), default="Window")
    face = Column(String(50), default="south")
    width_m = Column(Float, default=1.2)
    height_m = Column(Float, default=1.0)
    count = Column(Integer, default=1)
    u_value = Column(Float, default=2.8)
    shgc = Column(Float, default=0.65)
    emissivity = Column(Float, default=0.84)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── 7. Scenario ─────────────────────────────────────────────────────────────
class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    version = Column(Integer, default=1)
    location_id = Column(String(36), ForeignKey("locations.id"), nullable=True)
    geometry_id = Column(String(36), nullable=True)
    operating_id = Column(String(36), nullable=True)
    canonical_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="scenarios")
    location = relationship("Location", back_populates="scenarios")
    simulation_jobs = relationship("SimulationJob", back_populates="scenario", cascade="all, delete-orphan")
    ansys_jobs = relationship("AnsysJob", back_populates="scenario", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="scenario")


# ── 8. Simulations ──────────────────────────────────────────────────────────
class SimulationJob(Base):
    __tablename__ = "simulation_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), ForeignKey("scenarios.id"), nullable=True, index=True)
    climate_dataset_id = Column(String(36), nullable=True)
    status = Column(String(50), default="queued")  # queued, running, completed, failed
    solver_type = Column(String(50), default="4R2C_EULER")
    time_step_s = Column(Integer, default=3600)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    scenario = relationship("Scenario", back_populates="simulation_jobs")
    result = relationship("SimulationResult", back_populates="job", uselist=False, cascade="all, delete-orphan")


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("simulation_jobs.id"), nullable=False, unique=True, index=True)
    scenario_id = Column(String(36), nullable=True, index=True)
    duration_hours = Column(Integer, default=72)
    heating_demand_kwh = Column(Float, default=0.0)
    cooling_demand_kwh = Column(Float, default=0.0)
    peak_heating_kw = Column(Float, default=0.0)
    peak_cooling_kw = Column(Float, default=0.0)
    comfort_compliance_pct = Column(Float, default=0.0)
    mean_pmv = Column(Float, default=0.0)
    mean_ppd = Column(Float, default=0.0)
    timeseries_storage_path = Column(String(255), nullable=True)
    summary_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("SimulationJob", back_populates="result")


# ── 9. Optimization ─────────────────────────────────────────────────────────
class OptimizationRun(Base):
    __tablename__ = "optimization_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), ForeignKey("scenarios.id"), nullable=True, index=True)
    objective_weights_json = Column(Text, nullable=False)
    candidate_count = Column(Integer, default=0)
    pareto_count = Column(Integer, default=0)
    status = Column(String(50), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    candidates = relationship("OptimizationCandidate", back_populates="run", cascade="all, delete-orphan")


class OptimizationCandidate(Base):
    __tablename__ = "optimization_candidates"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_id = Column(String(36), ForeignKey("optimization_runs.id"), nullable=False, index=True)
    candidate_index = Column(Integer, nullable=False)
    design_id = Column(String(100), nullable=False)
    parameters_json = Column(Text, nullable=False)
    metrics_json = Column(Text, nullable=False)
    is_pareto = Column(Integer, default=0)
    ansys_verification_status = Column(String(50), default="unverified")
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("OptimizationRun", back_populates="candidates")


# ── 10. ANSYS Fluent ────────────────────────────────────────────────────────
class AnsysJob(Base):
    __tablename__ = "ansys_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(36), ForeignKey("scenarios.id"), nullable=True, index=True)
    simulation_job_id = Column(String(36), nullable=True)
    status = Column(String(50), default="QUEUED", index=True)  # QUEUED, PREPARING, GEOMETRY, MESHING, SETUP, SOLVING, POST_PROCESSING, UPLOADING, COMPLETED, FAILED, CANCELLED, UNAVAILABLE
    mode = Column(String(50), default="LOCAL")  # LOCAL, REMOTE, UNAVAILABLE
    fluent_version = Column(String(50), default="24.1")
    processors = Column(Integer, default=4)
    case_path = Column(String(255), nullable=True)
    data_path = Column(String(255), nullable=True)
    mesh_info_json = Column(Text, nullable=True)
    solver_info_json = Column(Text, nullable=True)
    logs = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    scenario = relationship("Scenario", back_populates="ansys_jobs")
    result = relationship("AnsysResult", back_populates="job", uselist=False, cascade="all, delete-orphan")


class AnsysResult(Base):
    __tablename__ = "ansys_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    ansys_job_id = Column(String(36), ForeignKey("ansys_jobs.id"), nullable=False, unique=True, index=True)
    mean_indoor_temp_c = Column(Float, nullable=True)
    max_indoor_temp_c = Column(Float, nullable=True)
    min_indoor_temp_c = Column(Float, nullable=True)
    total_heat_flux_w = Column(Float, nullable=True)
    heating_load_kw = Column(Float, nullable=True)
    cooling_load_kw = Column(Float, nullable=True)
    timeseries_storage_path = Column(String(255), nullable=True)
    summary_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("AnsysJob", back_populates="result")


# ── 11. Validation ──────────────────────────────────────────────────────────
class ValidationRun(Base):
    __tablename__ = "validation_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    standard = Column(String(100), nullable=False)
    test_type = Column(String(100), nullable=False)  # conduction, convection, radiation, ventilation, rc_network, comfort
    inputs_json = Column(Text, nullable=False)
    analytical_values_json = Column(Text, nullable=False)
    computed_values_json = Column(Text, nullable=False)
    mae = Column(Float, nullable=False)
    rmse = Column(Float, nullable=False)
    mbe = Column(Float, nullable=False)
    r_squared = Column(Float, nullable=False)
    status = Column(String(50), default="passed")
    created_at = Column(DateTime, default=datetime.utcnow)

    metrics = relationship("ValidationMetric", back_populates="run", cascade="all, delete-orphan")


class ValidationMetric(Base):
    __tablename__ = "validation_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    validation_run_id = Column(String(36), ForeignKey("validation_runs.id"), nullable=False, index=True)
    metric_name = Column(String(100), nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(50), default="")
    tolerance_status = Column(String(50), default="passed")
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("ValidationRun", back_populates="metrics")


# ── 12. Reports & Auditing ──────────────────────────────────────────────────
class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    scenario_id = Column(String(36), ForeignKey("scenarios.id"), nullable=True, index=True)
    simulation_job_id = Column(String(36), nullable=True)
    ansys_job_id = Column(String(36), nullable=True)
    report_type = Column(String(50), default="ENGINEERING_DOSSIER")
    title = Column(String(255), nullable=False)
    dossier_json = Column(Text, nullable=False)
    storage_path = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="reports")
    scenario = relationship("Scenario", back_populates="reports")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(36), nullable=False, index=True)
    payload_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)


# ── Seed Data for Verified Materials ────────────────────────────────────────
VERIFIED_MATERIALS_SEED: List[dict] = [
    {
        "id": "stone-masonry",
        "name": "Stone Masonry (Granite/Gneiss)",
        "category": "Masonry",
        "description": "High-density natural stone quarried in high-altitude Himalayan zones. Provides extreme thermal mass inertia.",
        "thermal_conductivity_k": 1.50,
        "density_rho": 2500.0,
        "specific_heat_cp": 900.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.65,
        "solar_reflectivity": 0.35,
        "embodied_carbon": 0.05,
        "cost": 1800.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 3792:1978 / NBC 2016",
        "reference": "Indian Standard Guide for Heat Insulation of Non-Industrial Buildings",
        "valid_temperature_range": "-50°C to 80°C",
    },
    {
        "id": "sandstone",
        "name": "Sandstone (Jaisalmer Arid)",
        "category": "Masonry",
        "description": "Yellow Jaisalmer sedimentary sandstone for hot-arid thermal damping and solar delay.",
        "thermal_conductivity_k": 1.70,
        "density_rho": 2200.0,
        "specific_heat_cp": 920.0,
        "emissivity": 0.88,
        "solar_absorptivity": 0.60,
        "solar_reflectivity": 0.40,
        "embodied_carbon": 0.06,
        "cost": 1400.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 3792:1978",
        "reference": "Guide for Heat Insulation of Buildings, Section 4",
        "valid_temperature_range": "-10°C to 90°C",
    },
    {
        "id": "burnt-clay-brick",
        "name": "Burnt Clay Brick Masonry",
        "category": "Masonry",
        "description": "Standard kiln-burnt clay brickwork in 1:6 cement mortar.",
        "thermal_conductivity_k": 0.84,
        "density_rho": 1800.0,
        "specific_heat_cp": 840.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.70,
        "solar_reflectivity": 0.30,
        "embodied_carbon": 0.24,
        "cost": 950.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 1077 / IS 3792",
        "reference": "Common Burnt Clay Building Bricks — Specification",
        "valid_temperature_range": "-30°C to 80°C",
    },
    {
        "id": "rammed-earth",
        "name": "Stabilized Rammed Earth / Mud",
        "category": "Masonry",
        "description": "Cement-stabilized compacted soil with high natural hygroscopic buffering.",
        "thermal_conductivity_k": 0.75,
        "density_rho": 1750.0,
        "specific_heat_cp": 880.0,
        "emissivity": 0.92,
        "solar_absorptivity": 0.68,
        "solar_reflectivity": 0.32,
        "embodied_carbon": 0.02,
        "cost": 450.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 2110:1980 / Auroville Earth Institute",
        "reference": "Code of practice for in-situ construction of walls in earth",
        "valid_temperature_range": "-20°C to 70°C",
    },
    {
        "id": "aac-block",
        "name": "Autoclaved Aerated Concrete (AAC)",
        "category": "Masonry",
        "description": "Micro-porous lightweight concrete block delivering combined structure and insulation.",
        "thermal_conductivity_k": 0.16,
        "density_rho": 550.0,
        "specific_heat_cp": 1000.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.50,
        "solar_reflectivity": 0.50,
        "embodied_carbon": 0.32,
        "cost": 1200.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 2185 Part 3:1984 / ECBC 2017",
        "reference": "Autoclaved Cellular Concrete Blocks",
        "valid_temperature_range": "-40°C to 100°C",
    },
    {
        "id": "dense-concrete",
        "name": "Reinforced Cement Concrete (RCC M25)",
        "category": "Structure",
        "description": "Structural cast-in-place dense concrete for floor slabs and shear elements.",
        "thermal_conductivity_k": 1.40,
        "density_rho": 2300.0,
        "specific_heat_cp": 880.0,
        "emissivity": 0.91,
        "solar_absorptivity": 0.72,
        "solar_reflectivity": 0.28,
        "embodied_carbon": 0.18,
        "cost": 2200.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 456:2000 / IS 3792",
        "reference": "Plain and Reinforced Concrete — Code of Practice",
        "valid_temperature_range": "-50°C to 120°C",
    },
    {
        "id": "cement-plaster",
        "name": "Cement Sand Plaster (1:4)",
        "category": "Finish",
        "description": "Interior and exterior protective rendering coat.",
        "thermal_conductivity_k": 0.72,
        "density_rho": 1600.0,
        "specific_heat_cp": 840.0,
        "emissivity": 0.91,
        "solar_absorptivity": 0.55,
        "solar_reflectivity": 0.45,
        "embodied_carbon": 0.19,
        "cost": 250.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 1661:1972",
        "reference": "Code of practice for application of cement and cement-lime plaster",
        "valid_temperature_range": "-40°C to 90°C",
    },
    {
        "id": "lime-plaster",
        "name": "Lime Surkhi Plaster",
        "category": "Finish",
        "description": "Traditional pozzolanic breathable hydraulic lime plaster.",
        "thermal_conductivity_k": 0.70,
        "density_rho": 1600.0,
        "specific_heat_cp": 840.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.52,
        "solar_reflectivity": 0.48,
        "embodied_carbon": 0.08,
        "cost": 280.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 2250:1981",
        "reference": "Code of practice for preparation and use of masonry mortars",
        "valid_temperature_range": "-30°C to 80°C",
    },
    {
        "id": "eps-insulation",
        "name": "Expanded Polystyrene (EPS)",
        "category": "Insulation",
        "description": "Closed-cell rigid thermal insulation foam board.",
        "thermal_conductivity_k": 0.035,
        "density_rho": 25.0,
        "specific_heat_cp": 1400.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.30,
        "solar_reflectivity": 0.70,
        "embodied_carbon": 3.29,
        "cost": 650.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 4671:1984 / ECBC 2017",
        "reference": "Expanded Polystyrene for Thermal Insulation",
        "valid_temperature_range": "-50°C to 75°C",
    },
    {
        "id": "xps-insulation",
        "name": "Extruded Polystyrene (XPS)",
        "category": "Insulation",
        "description": "High-compressive-strength, moisture-resistant rigid foam for roofs and perimeters.",
        "thermal_conductivity_k": 0.034,
        "density_rho": 35.0,
        "specific_heat_cp": 1400.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.30,
        "solar_reflectivity": 0.70,
        "embodied_carbon": 3.48,
        "cost": 850.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "ASTM C578 / IS 12436",
        "reference": "Standard Specification for Rigid, Cellular Polystyrene Thermal Insulation",
        "valid_temperature_range": "-60°C to 75°C",
    },
    {
        "id": "rockwool",
        "name": "Mineral Rockwool Slab",
        "category": "Insulation",
        "description": "Non-combustible basalt stone wool insulation slab with high fire barrier rating.",
        "thermal_conductivity_k": 0.038,
        "density_rho": 80.0,
        "specific_heat_cp": 1030.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.40,
        "solar_reflectivity": 0.60,
        "embodied_carbon": 1.28,
        "cost": 750.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 8183:1993",
        "reference": "Bonded Mineral Wool for Thermal Insulation",
        "valid_temperature_range": "-50°C to 650°C",
    },
    {
        "id": "glass-wool",
        "name": "Glass Wool Batts",
        "category": "Insulation",
        "description": "Resin-bonded glass fiber batts for ceiling cavity and dry-wall acoustic/thermal fill.",
        "thermal_conductivity_k": 0.040,
        "density_rho": 24.0,
        "specific_heat_cp": 960.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.35,
        "solar_reflectivity": 0.65,
        "embodied_carbon": 1.35,
        "cost": 550.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 8183 / ASTM C553",
        "reference": "Mineral Fibre Thermal Insulation Material",
        "valid_temperature_range": "-40°C to 230°C",
    },
    {
        "id": "puf-board",
        "name": "Polyurethane / Polyisocyanurate Foam (PIR/PUR)",
        "category": "Insulation",
        "description": "Ultra-low thermal conductivity closed-cell insulation for extreme cold frontiers.",
        "thermal_conductivity_k": 0.024,
        "density_rho": 40.0,
        "specific_heat_cp": 1400.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.30,
        "solar_reflectivity": 0.70,
        "embodied_carbon": 4.10,
        "cost": 1100.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 12436:1988",
        "reference": "Preformed Rigid Polyurethane (PUR) and Polyisocyanurate (PIR) Foams",
        "valid_temperature_range": "-60°C to 110°C",
    },
    {
        "id": "mud-phuska",
        "name": "Mud Phuska (Traditional Roof Insulation)",
        "category": "Insulation",
        "description": "Clay puddle mixed with bhusa and cow dung; traditional composite insulation for Indian flat roofs.",
        "thermal_conductivity_k": 0.52,
        "density_rho": 1622.0,
        "specific_heat_cp": 880.0,
        "emissivity": 0.92,
        "solar_absorptivity": 0.65,
        "solar_reflectivity": 0.35,
        "embodied_carbon": 0.03,
        "cost": 350.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 2115:1980 / CPWD",
        "reference": "Code of practice for flat roof finish: Mud phuska",
        "valid_temperature_range": "-20°C to 80°C",
    },
    {
        "id": "cgi-sheet",
        "name": "Corrugated Galvanized Iron (CGI)",
        "category": "Roofing",
        "description": "Zinc-coated profiled mild steel cladding sheet.",
        "thermal_conductivity_k": 50.0,
        "density_rho": 7850.0,
        "specific_heat_cp": 500.0,
        "emissivity": 0.28,
        "solar_absorptivity": 0.65,
        "solar_reflectivity": 0.35,
        "embodied_carbon": 2.80,
        "cost": 680.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 277:2018",
        "reference": "Galvanized Steel Sheets (Plain and Corrugated) — Specification",
        "valid_temperature_range": "-50°C to 200°C",
    },
    {
        "id": "aluminum-sheet",
        "name": "Corrugated Aluminum Roofing Sheet",
        "category": "Roofing",
        "description": "High-reflectivity lightweight alloy sheet with low longwave emissivity.",
        "thermal_conductivity_k": 205.0,
        "density_rho": 2700.0,
        "specific_heat_cp": 900.0,
        "emissivity": 0.09,
        "solar_absorptivity": 0.40,
        "solar_reflectivity": 0.60,
        "embodied_carbon": 8.24,
        "cost": 1250.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 737:2008 / IS 1254",
        "reference": "Wrought Aluminium and Aluminium Alloy Sheet and Strip",
        "valid_temperature_range": "-60°C to 250°C",
    },
    {
        "id": "timber-plywood",
        "name": "Commercial Plywood / Timber",
        "category": "Wood",
        "description": "Boiling water resistant structural plywood / coniferous timber panelling.",
        "thermal_conductivity_k": 0.13,
        "density_rho": 550.0,
        "specific_heat_cp": 1700.0,
        "emissivity": 0.90,
        "solar_absorptivity": 0.60,
        "solar_reflectivity": 0.40,
        "embodied_carbon": 0.45,
        "cost": 850.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 303:1989 / IS 710",
        "reference": "Plywood for General Purposes — Specification",
        "valid_temperature_range": "-40°C to 80°C",
    },
    {
        "id": "glazing-double-low-e",
        "name": "Double Glazing Low-E (4-12-4 Air)",
        "category": "Glazing",
        "description": "Insulated double glazing unit with soft-coat Low-E on surface #3. Equivalent U=1.8 W/m²K, SHGC=0.45.",
        "thermal_conductivity_k": 0.040,  # Effective equivalent thermal conductivity across unit
        "density_rho": 2500.0,
        "specific_heat_cp": 840.0,
        "emissivity": 0.15,
        "solar_absorptivity": 0.25,
        "solar_reflectivity": 0.45,
        "embodied_carbon": 1.45,
        "cost": 3200.0,
        "units": "SI (W/mK, kg/m³, J/kgK)",
        "source": "IS 2553 / NFRC 100 / ECBC 2017",
        "reference": "Safety Glass / ECBC Prescriptive Fenestration Compliance",
        "valid_temperature_range": "-40°C to 80°C",
    },
]
