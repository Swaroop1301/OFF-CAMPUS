"""
API v1 router — aggregates all domain sub-routers.
"""

from fastapi import APIRouter
from api.v1.climate import router as climate_router
from api.v1.materials import router as materials_router
from api.v1.simulations import router as simulations_router
from api.v1.projects import router as projects_router
from api.v1.optimization import router as optimization_router
from api.v1.locations import router as locations_router
from api.v1.ansys import router as ansys_router
from api.v1.validation import router as validation_router
from api.v1.reports import router as reports_router
from api.v1.storage import router as storage_router

api_router = APIRouter()
api_router.include_router(climate_router, prefix="/climate", tags=["Climate"])
api_router.include_router(materials_router, prefix="/materials", tags=["Materials"])
api_router.include_router(simulations_router, prefix="/simulations", tags=["Simulations"])
api_router.include_router(projects_router, prefix="/projects", tags=["Projects"])
api_router.include_router(optimization_router, prefix="/optimization", tags=["Optimization"])
api_router.include_router(locations_router, prefix="/locations", tags=["Locations & Geocoding"])
api_router.include_router(locations_router, prefix="/geocoding", tags=["Geocoding"])
api_router.include_router(locations_router, prefix="/elevation", tags=["Elevation"])
api_router.include_router(ansys_router, prefix="/ansys", tags=["ANSYS Fluent"])
api_router.include_router(validation_router, prefix="/validation", tags=["Validation"])
api_router.include_router(reports_router, prefix="/reports", tags=["Reports"])
api_router.include_router(storage_router, prefix="/storage", tags=["Object Storage"])
