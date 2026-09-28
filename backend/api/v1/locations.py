"""
Location, Geocoding, and Elevation API endpoints.
Provides real forward search, reverse geocoding, elevation lookup, and climate zone resolution.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.location_service import location_service, determine_climate_zone

router = APIRouter()


class LocationSearchResult(BaseModel):
    name: str
    full_name: str
    latitude: float
    longitude: float
    provider: str


class ReverseGeocodeResponse(BaseModel):
    name: str
    full_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    latitude: float
    longitude: float
    provider: str


class ElevationResponse(BaseModel):
    latitude: float
    longitude: float
    elevation_m: float
    elevation_source: str  # 'provider' or 'user'
    provider: str
    retrieval_timestamp: str


class SiteContextResponse(BaseModel):
    latitude: float
    longitude: float
    name: str
    full_name: str
    elevation_m: float
    elevation_source: str
    climate_zone: str
    timezone: str = "UTC+05:30"


@router.get("/search", response_model=List[LocationSearchResult])
async def search_locations(q: str = Query(..., min_length=2, description="City, region, or site name")):
    """Forward geocode query into coordinate suggestions."""
    results = await location_service.forward_search(q)
    return results


@router.get("/reverse", response_model=ReverseGeocodeResponse)
async def reverse_geocode_location(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180)
):
    """Reverse geocode coordinates into administrative locality and state."""
    result = await location_service.reverse_geocode(lat, lon)
    return result


@router.get("/elevation", response_model=ElevationResponse)
async def get_site_elevation(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180)
):
    """Retrieve site elevation above sea level in meters."""
    elev_data = await location_service.get_elevation(lat, lon)
    return ElevationResponse(
        latitude=lat,
        longitude=lon,
        elevation_m=elev_data["elevation_m"],
        elevation_source=elev_data["elevation_source"],
        provider=elev_data["provider"],
        retrieval_timestamp=elev_data["retrieval_timestamp"]
    )


@router.get("/context", response_model=SiteContextResponse)
async def get_site_context(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user_elevation: Optional[float] = Query(None, description="Optional user-provided elevation override")
):
    """
    Combined site intake:
    Reverse geocodes, gets elevation, and determines ECBC/NBC climate zone.
    """
    rev = await location_service.reverse_geocode(lat, lon)
    if user_elevation is not None:
        elev_m = user_elevation
        elev_source = "user"
    else:
        elev_info = await location_service.get_elevation(lat, lon)
        elev_m = elev_info["elevation_m"]
        elev_source = elev_info["elevation_source"]

    climate_zone = determine_climate_zone(lat, lon, elev_m)

    return SiteContextResponse(
        latitude=lat,
        longitude=lon,
        name=rev.get("name", f"Site {lat:.2f}N, {lon:.2f}E"),
        full_name=rev.get("full_name", ""),
        elevation_m=round(elev_m, 1),
        elevation_source=elev_source,
        climate_zone=climate_zone,
        timezone="UTC+05:30"
    )
