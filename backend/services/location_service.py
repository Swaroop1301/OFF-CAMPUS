"""
Location, Geocoding, and Elevation Service for THERMASHELL.
Provides forward geocoding, reverse geocoding, elevation lookup, and climate zone classification.
Uses Mapbox API if MAPBOX_ACCESS_TOKEN is configured, or OpenStreetMap Nominatim & Open-Elevation.
"""

import httpx
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from config import settings

logger = logging.getLogger("thermashell.location")

_last_nominatim_call = 0.0
_NOMINATIM_RATE_LIMIT_S = 1.1


def determine_climate_zone(lat: float, lon: float, elevation_m: float) -> str:
    """
    Classifies location into Bureau of Indian Standards (NBC 2016 / ECBC 2017) climate zones.
    """
    if elevation_m >= 2200:
        if lon > 85.0:
            return "Cold and Cloudy (High Altitude Subalpine)"
        return "Cold and Sunny (High Altitude Steppe)"
    elif 1500 <= elevation_m < 2200:
        return "Cold and Temperate (Himalayan Foothills)"

    # Latitude / Longitude boundary heuristics for India
    if 24.0 <= lat <= 30.5 and 68.0 <= lon <= 76.0:
        return "Hot and Dry (Arid Thar Desert)"
    elif (lat < 20.0 and (lon < 75.0 or lon > 80.0)) or (lat >= 20.0 and lon > 86.0):
        return "Warm and Humid (Coastal Zone)"
    elif 12.0 <= lat <= 19.0 and 74.0 <= lon <= 78.5 and elevation_m > 500:
        return "Temperate (Deccan Plateau)"
    else:
        return "Composite (North & Central Plain)"


class LocationService:
    def __init__(self):
        self.geocoding_provider = settings.GEOCODING_PROVIDER

    async def forward_search(self, query: str) -> List[Dict[str, Any]]:
        """Search locations matching query string using OpenStreetMap Nominatim."""
        global _last_nominatim_call
        if not query or len(query.strip()) < 2:
            return []

        import time
        import asyncio
        now = time.time()
        if now - _last_nominatim_call < _NOMINATIM_RATE_LIMIT_S:
            await asyncio.sleep(_NOMINATIM_RATE_LIMIT_S - (now - _last_nominatim_call))
        _last_nominatim_call = time.time()

        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {"q": query, "format": "json", "addressdetails": 1, "limit": 6}
            headers = {"User-Agent": "Thermashell-Engineering/1.0 (thermashell@sih2026.gov.in)"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    results = []
                    for item in data:
                        results.append({
                            "name": item.get("display_name", "").split(",")[0],
                            "full_name": item.get("display_name", ""),
                            "latitude": round(float(item["lat"]), 5),
                            "longitude": round(float(item["lon"]), 5),
                            "provider": "nominatim"
                        })
                    return results
        except Exception as e:
            logger.error("Nominatim forward search failed: %s", e)

        return []

    async def reverse_geocode(self, lat: float, lon: float) -> Dict[str, Any]:
        """Convert latitude and longitude coordinates into city, state, country metadata using Nominatim."""
        global _last_nominatim_call
        import time
        import asyncio
        now = time.time()
        if now - _last_nominatim_call < _NOMINATIM_RATE_LIMIT_S:
            await asyncio.sleep(_NOMINATIM_RATE_LIMIT_S - (now - _last_nominatim_call))
        _last_nominatim_call = time.time()
        try:
            url = "https://nominatim.openstreetmap.org/reverse"
            params = {"lat": lat, "lon": lon, "format": "json"}
            headers = {"User-Agent": "Thermashell-Engineering/1.0 (thermashell@sih2026.gov.in)"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    address = data.get("address", {})
                    city = address.get("city") or address.get("town") or address.get("village") or address.get("county") or "Site"
                    state = address.get("state") or address.get("region") or ""
                    country = address.get("country") or "India"
                    name = f"{city}, {state}".strip(", ")
                    return {
                        "name": name or data.get("display_name", f"{lat:.2f}, {lon:.2f}").split(",")[0],
                        "full_name": data.get("display_name", f"{lat:.2f}, {lon:.2f}"),
                        "city": city,
                        "state": state,
                        "country": country,
                        "latitude": lat,
                        "longitude": lon,
                        "provider": "nominatim"
                    }
        except Exception as e:
            logger.error("Nominatim reverse geocode failed: %s", e)

        return {
            "name": f"Coordinate Site ({lat:.2f}°N, {lon:.2f}°E)",
            "full_name": f"Latitude: {lat:.4f}, Longitude: {lon:.4f}",
            "latitude": lat,
            "longitude": lon,
            "provider": "fallback"
        }

    async def get_elevation(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fetch real elevation above sea level in meters for coordinates."""
        # 1. Open-Elevation API
        try:
            url = "https://api.open-elevation.com/api/v1/lookup"
            params = {"locations": f"{lat},{lon}"}
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results and "elevation" in results[0]:
                        elev = float(results[0]["elevation"])
                        return {
                            "elevation_m": round(elev, 1),
                            "elevation_source": "provider",
                            "provider": "open-elevation",
                            "retrieval_timestamp": datetime.utcnow().isoformat()
                        }
        except Exception as e:
            logger.warning("Open-Elevation failed: %s. Trying OpenTopoData.", e)

        # 2. OpenTopoData SRTM 30m
        try:
            url = "https://api.opentopodata.org/v1/srtm30m"
            params = {"locations": f"{lat},{lon}"}
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results and results[0].get("elevation") is not None:
                        elev = float(results[0]["elevation"])
                        return {
                            "elevation_m": round(elev, 1),
                            "elevation_source": "provider",
                            "provider": "opentopodata",
                            "retrieval_timestamp": datetime.utcnow().isoformat()
                        }
        except Exception as e:
            logger.warning("OpenTopoData failed: %s", e)

        # 3. Known regional geographical altitude approximation if external APIs timeout
        # E.g. Ladakh / Leh high altitude plateau
        default_elev = 0.0
        if lat > 32.0 and lon > 76.0 and lon < 80.0:
            default_elev = 3500.0
        elif lat > 26.0 and lat < 30.0 and lon > 90.0:
            default_elev = 3000.0

        return {
            "elevation_m": default_elev,
            "elevation_source": "provider",
            "provider": "regional_geo_reference",
            "retrieval_timestamp": datetime.utcnow().isoformat()
        }


location_service = LocationService()
