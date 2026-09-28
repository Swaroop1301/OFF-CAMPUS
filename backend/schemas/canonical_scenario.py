"""
Canonical Scenario Schema for THERMASHELL.
Shared single source of truth across Frontend, Physics Engine, Optimizer, and ANSYS Adapter.
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from thermashell_engine.types import (
    ShelterGeometry, MaterialLayer, WallAssembly, Envelope, Opening,
    ClimateTimeseries, SimulationConfig, RoofType, HVACMode, ComfortModel
)


class LocationSchema(BaseModel):
    name: str = "Leh, Ladakh"
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation_m: float = Field(default=3500.0, ge=0.0)
    elevation_source: str = "provider"
    timezone: str = "UTC+05:30"
    climate_zone: str = "Cold and Sunny (High Altitude)"


class ClimateRefSchema(BaseModel):
    source: str = "NASA POWER"
    dataset_id: Optional[str] = None
    start_date: Optional[str] = "20240115"
    end_date: Optional[str] = "20240117"
    raw_timeseries: Optional[Dict[str, List[float]]] = None


class GeometrySchema(BaseModel):
    length_m: float = Field(default=6.0, gt=0)
    width_m: float = Field(default=4.0, gt=0)
    height_m: float = Field(default=3.0, gt=0)
    roof_type: str = "gable"  # flat, gable, shed, hip
    roof_pitch_deg: float = Field(default=15.0, ge=0, le=60)
    orientation_deg: float = Field(default=180.0, ge=0, lt=360)


class LayerSchema(BaseModel):
    material_id: Optional[str] = None
    name: str
    thickness_mm: float = Field(..., gt=0)
    conductivity: float = Field(..., gt=0)
    density: float = Field(default=1200.0, gt=0)
    specific_heat: float = Field(default=900.0, gt=0)


class WindowSchema(BaseModel):
    name: str = "South Double Glazed"
    face: str = "south"
    width_m: float = 1.2
    height_m: float = 1.0
    count: int = 1
    u_value: float = 2.8
    shgc: float = 0.65
    emissivity: float = 0.84


class EnvelopeSchema(BaseModel):
    walls: List[LayerSchema]
    roof: List[LayerSchema]
    floor: Optional[List[LayerSchema]] = None
    windows: Optional[List[WindowSchema]] = None


class OperationSchema(BaseModel):
    occupants: int = Field(default=4, ge=0)
    metabolic_rate_w: float = Field(default=100.0, gt=0)
    internal_gains_w: float = Field(default=200.0, ge=0)
    hvac_mode: str = "heated"  # free_running, heated, cooled, mixed
    target_temp_c: float = 18.0
    comfort_band_c: float = 2.0
    ach_natural: float = Field(default=0.3, ge=0)
    ach_infiltration: float = Field(default=0.2, ge=0)


class PhysicsSettingsSchema(BaseModel):
    solver_type: str = "4R2C_EULER"
    timestep_s: int = 3600
    comfort_model: str = "fanger"


class AnsysSettingsSchema(BaseModel):
    mode: str = "detect"  # local, remote, unavailable, detect
    fluent_version: str = "24.1"
    processors: int = 4
    precision: str = "double"
    mesh_resolution: str = "medium"


class OptimizationSettingsSchema(BaseModel):
    w_energy: float = 0.4
    w_comfort: float = 0.4
    w_cost: float = 0.2
    max_candidates: int = 24


class CanonicalScenario(BaseModel):
    id: str = "scenario-canonical-001"
    project_id: Optional[str] = "proj-001"
    name: str = "Canonical Extreme Cold Defense Shelter"
    version: int = 1

    location: LocationSchema
    climate: ClimateRefSchema
    geometry: GeometrySchema
    envelope: EnvelopeSchema
    operation: OperationSchema

    physics_settings: PhysicsSettingsSchema = Field(default_factory=PhysicsSettingsSchema)
    ansys_settings: AnsysSettingsSchema = Field(default_factory=AnsysSettingsSchema)
    optimization_settings: OptimizationSettingsSchema = Field(default_factory=OptimizationSettingsSchema)

    def to_simulation_config(self, climate_ts: ClimateTimeseries) -> SimulationConfig:
        """Converts canonical scenario to engine SimulationConfig."""
        roof_map = {
            "flat": RoofType.FLAT,
            "gable": RoofType.GABLE,
            "shed": RoofType.SHED,
            "hip": RoofType.HIP,
        }
        geom = ShelterGeometry(
            length=self.geometry.length_m,
            width=self.geometry.width_m,
            height=self.geometry.height_m,
            roof_type=roof_map.get(self.geometry.roof_type.lower(), RoofType.GABLE),
            roof_pitch_deg=self.geometry.roof_pitch_deg,
            orientation_deg=self.geometry.orientation_deg,
            elevation_m=self.location.elevation_m,
        )

        wall_layers = [
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in self.envelope.walls
        ]
        roof_layers = [
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in self.envelope.roof
        ]
        floor_layers_raw = self.envelope.floor or [
            LayerSchema(name="Dense Concrete", thickness_mm=150, conductivity=1.4, density=2300, specific_heat=880),
            LayerSchema(name="XPS Insulation", thickness_mm=80, conductivity=0.034, density=35, specific_heat=1400),
        ]
        floor_layers = [
            MaterialLayer(
                name=l.name,
                thickness_m=l.thickness_mm / 1000.0,
                conductivity=l.conductivity,
                density=l.density,
                specific_heat=l.specific_heat,
            )
            for l in floor_layers_raw
        ]

        openings_raw = self.envelope.windows or [
            WindowSchema(name="Window South", face="south", width_m=1.2, height_m=1.0, count=1, u_value=2.8, shgc=0.65)
        ]
        openings = [
            Opening(
                name=w.name,
                width_m=w.width_m,
                height_m=w.height_m,
                wall_face=w.face,
                u_value=w.u_value,
                shgc=w.shgc,
                count=w.count,
            )
            for w in openings_raw
        ]

        hvac_map = {
            "free_running": HVACMode.FREE_RUNNING,
            "heated": HVACMode.HEATED,
            "cooled": HVACMode.COOLED,
            "mixed": HVACMode.MIXED,
        }

        return SimulationConfig(
            geometry=geom,
            envelope=Envelope(
                walls=WallAssembly(name="Wall Assembly", layers=wall_layers),
                roof=WallAssembly(name="Roof Assembly", layers=roof_layers),
                floor=WallAssembly(name="Floor Assembly", layers=floor_layers),
                openings=openings,
            ),
            climate=climate_ts,
            occupants=self.operation.occupants,
            metabolic_rate_w=self.operation.metabolic_rate_w,
            internal_gains_w=self.operation.internal_gains_w,
            hvac_mode=hvac_map.get(self.operation.hvac_mode.lower(), HVACMode.HEATED),
            target_temp_c=self.operation.target_temp_c,
            comfort_band_c=self.operation.comfort_band_c,
            ach_natural=self.operation.ach_natural,
            ach_infiltration=self.operation.ach_infiltration,
            timestep_s=self.physics_settings.timestep_s,
            comfort_model=ComfortModel.FANGER if self.physics_settings.comfort_model.lower() == "fanger" else ComfortModel.ADAPTIVE,
        )
