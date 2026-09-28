"""
Materials catalog and envelope thermal calculator API endpoints.
Authoritative source is PostgreSQL/database, supporting custom materials and versioning.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Material, MaterialVersion, CustomMaterial
from thermashell_engine.types import MaterialLayer, WallAssembly
from thermashell_engine.conduction import compute_r_value, compute_u_value, thermal_capacity_per_area

router = APIRouter()


class MaterialItem(BaseModel):
    id: str
    name: str
    category: str
    description: Optional[str] = None
    thermal_conductivity_k: float = Field(..., gt=0, description="Thermal conductivity k (W/m·K)")
    density_rho: float = Field(..., gt=0, description="Density (kg/m³)")
    specific_heat_cp: float = Field(..., gt=0, description="Specific heat capacity c_p (J/kg·K)")
    emissivity: float = Field(default=0.90, ge=0.01, le=1.0)
    solar_absorptivity: float = Field(default=0.60, ge=0.0, le=1.0)
    solar_reflectivity: Optional[float] = Field(default=0.40, ge=0.0, le=1.0)
    embodied_carbon: float = Field(default=0.0, description="kg CO2e / kg")
    cost: float = Field(default=0.0, ge=0.0, description="INR / m²")
    units: str = "SI (W/mK, kg/m³, J/kgK)"
    source: str = "IS 3792 / NBC 2016"
    reference: str = "Indian Standard / ASHRAE"
    valid_temperature_range: str = "-40°C to 100°C"
    is_custom: bool = False
    version: int = 1


class CreateMaterialRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=2)
    category: str = Field(..., min_length=2)
    description: Optional[str] = ""
    thermal_conductivity_k: float = Field(..., gt=0)
    density_rho: float = Field(..., gt=0)
    specific_heat_cp: float = Field(..., gt=0)
    emissivity: float = Field(default=0.90, ge=0.01, le=1.0)
    solar_absorptivity: float = Field(default=0.60, ge=0.0, le=1.0)
    solar_reflectivity: Optional[float] = Field(default=0.40, ge=0.0, le=1.0)
    embodied_carbon: float = Field(default=0.2)
    cost: float = Field(default=500.0, ge=0.0)
    source: str = Field(default="User Custom Material", min_length=2)
    reference: str = Field(default="Field / Lab Measurement", min_length=2)


class LayerInput(BaseModel):
    material_id: Optional[str] = None
    name: str
    thickness_mm: float = Field(..., gt=0)
    conductivity: float = Field(..., gt=0)
    density: float = Field(default=1000.0, gt=0)
    specific_heat: float = Field(default=1000.0, gt=0)
    cost_per_m2: Optional[float] = 0.0
    embodied_carbon: Optional[float] = 0.0


class AssemblyEvaluationRequest(BaseModel):
    surface_type: str = Field(default="wall", description="'wall', 'roof', or 'floor'")
    layers: List[LayerInput]


class AssemblyEvaluationResponse(BaseModel):
    r_value: float = Field(..., description="Total thermal resistance R (m²·K/W)")
    u_value: float = Field(..., description="Overall heat transfer coefficient U (W/m²·K)")
    thermal_capacity: float = Field(..., description="Areal thermal capacity (kJ/m²·K)")
    total_thickness_mm: float
    total_mass_kg_per_m2: float
    est_cost_inr_per_m2: float
    embodied_carbon_kgco2_per_m2: float
    layer_count: int


@router.get("", response_model=List[MaterialItem])
async def list_materials(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by name"),
    db: AsyncSession = Depends(get_db)
):
    """Returns database-backed catalog of thermal construction materials."""
    stmt = select(Material)
    if category:
        stmt = stmt.where(Material.category.ilike(category))
    if search:
        stmt = stmt.where(Material.name.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    mats = result.scalars().all()

    return [
        MaterialItem(
            id=m.id,
            name=m.name,
            category=m.category,
            description=m.description,
            thermal_conductivity_k=m.thermal_conductivity_k,
            density_rho=m.density_rho,
            specific_heat_cp=m.specific_heat_cp,
            emissivity=m.emissivity,
            solar_absorptivity=m.solar_absorptivity,
            solar_reflectivity=m.solar_reflectivity,
            embodied_carbon=m.embodied_carbon,
            cost=m.cost,
            units=m.units,
            source=m.source,
            reference=m.reference,
            valid_temperature_range=m.valid_temperature_range,
            is_custom=bool(m.is_custom),
            version=m.version
        )
        for m in mats
    ]


@router.get("/{material_id}", response_model=MaterialItem)
async def get_material(material_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch single material specifications from database."""
    stmt = select(Material).where(Material.id == material_id)
    result = await db.execute(stmt)
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail=f"Material '{material_id}' not found in database.")

    return MaterialItem(
        id=m.id,
        name=m.name,
        category=m.category,
        description=m.description,
        thermal_conductivity_k=m.thermal_conductivity_k,
        density_rho=m.density_rho,
        specific_heat_cp=m.specific_heat_cp,
        emissivity=m.emissivity,
        solar_absorptivity=m.solar_absorptivity,
        solar_reflectivity=m.solar_reflectivity,
        embodied_carbon=m.embodied_carbon,
        cost=m.cost,
        units=m.units,
        source=m.source,
        reference=m.reference,
        valid_temperature_range=m.valid_temperature_range,
        is_custom=bool(m.is_custom),
        version=m.version
    )


@router.post("", response_model=MaterialItem)
async def create_custom_material(req: CreateMaterialRequest, db: AsyncSession = Depends(get_db)):
    """Add a new custom construction material to PostgreSQL."""
    import re
    mat_id = req.id or re.sub(r'[^a-zA-Z0-9_-]', '-', req.name.lower().strip())
    mat_id = f"custom-{mat_id}" if not mat_id.startswith("custom-") else mat_id

    # Check existence
    existing = await db.execute(select(Material).where(Material.id == mat_id))
    if existing.scalar_one_or_none():
        mat_id = f"{mat_id}-{int(datetime.utcnow().timestamp())}"

    new_mat = Material(
        id=mat_id,
        name=req.name,
        category=req.category,
        description=req.description,
        thermal_conductivity_k=req.thermal_conductivity_k,
        density_rho=req.density_rho,
        specific_heat_cp=req.specific_heat_cp,
        emissivity=req.emissivity,
        solar_absorptivity=req.solar_absorptivity,
        solar_reflectivity=req.solar_reflectivity,
        embodied_carbon=req.embodied_carbon,
        cost=req.cost,
        units="SI (W/mK, kg/m³, J/kgK)",
        source=req.source,
        reference=req.reference,
        valid_temperature_range="-40°C to 100°C",
        is_custom=1,
        version=1
    )
    db.add(new_mat)
    await db.commit()
    await db.refresh(new_mat)

    return MaterialItem(
        id=new_mat.id,
        name=new_mat.name,
        category=new_mat.category,
        description=new_mat.description,
        thermal_conductivity_k=new_mat.thermal_conductivity_k,
        density_rho=new_mat.density_rho,
        specific_heat_cp=new_mat.specific_heat_cp,
        emissivity=new_mat.emissivity,
        solar_absorptivity=new_mat.solar_absorptivity,
        solar_reflectivity=new_mat.solar_reflectivity,
        embodied_carbon=new_mat.embodied_carbon,
        cost=new_mat.cost,
        units=new_mat.units,
        source=new_mat.source,
        reference=new_mat.reference,
        valid_temperature_range=new_mat.valid_temperature_range,
        is_custom=True,
        version=1
    )


@router.post("/evaluate", response_model=AssemblyEvaluationResponse)
async def evaluate_assembly(req: AssemblyEvaluationRequest):
    """Computes R-value, U-value, areal thermal capacitance, mass, embodied carbon, and cost."""
    engine_layers = [
        MaterialLayer(
            name=l.name,
            thickness_m=l.thickness_mm / 1000.0,
            conductivity=l.conductivity,
            density=l.density,
            specific_heat=l.specific_heat,
        )
        for l in req.layers
    ]
    assembly = WallAssembly(name="Composite Assembly", layers=engine_layers)
    r_val = compute_r_value(assembly, req.surface_type)
    u_val = compute_u_value(assembly, req.surface_type)
    c_val = thermal_capacity_per_area(assembly) / 1000.0  # kJ/m²K

    total_thick = sum(l.thickness_mm for l in req.layers)
    total_mass = sum((l.thickness_mm / 1000.0) * l.density for l in req.layers)
    total_cost = sum(l.cost_per_m2 or 0.0 for l in req.layers)
    total_carbon = sum(
        ((l.thickness_mm / 1000.0) * l.density) * (l.embodied_carbon or 0.0)
        for l in req.layers
    )

    return AssemblyEvaluationResponse(
        r_value=round(r_val, 4),
        u_value=round(u_val, 4),
        thermal_capacity=round(c_val, 2),
        total_thickness_mm=round(total_thick, 1),
        total_mass_kg_per_m2=round(total_mass, 2),
        est_cost_inr_per_m2=round(total_cost, 2),
        embodied_carbon_kgco2_per_m2=round(total_carbon, 2),
        layer_count=len(engine_layers)
    )
