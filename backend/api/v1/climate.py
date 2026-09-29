"""
Climate data API endpoint — proxies NASA POWER with validation and PostgreSQL caching.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_db
from services.climate_service import fetch_climate_data
from exceptions import ClimateSourceUnavailable

router = APIRouter()


@router.get("/power")
async def get_climate_data(
    lat: float = Query(..., ge=-90, le=90, description="Latitude °N"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude °E"),
    start: str = Query(..., min_length=8, max_length=8, description="Start date YYYYMMDD"),
    end: str = Query(..., min_length=8, max_length=8, description="End date YYYYMMDD"),
    params: str = Query(
        default="T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN,PS",
        description="Comma-separated NASA POWER parameters"
    ),
    community: str = Query(default="SB", description="NASA POWER community: SB, RE, AG"),
    refresh: bool = Query(default=False, description="Force fresh download bypassing cache"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Fetch hourly climate data from NASA POWER with physical validation and database persistence.
    Returns:
    - parameters: { T2M, RH2M, WS10M, ALLSKY_SFC_SW_DWN, PS }
    - _cache: { hit: bool, source_state: 'LIVE' | 'CACHED', retrieved_at: str }
    """
    try:
        data = await fetch_climate_data(
            db=db,
            latitude=lat,
            longitude=lon,
            start_date=start,
            end_date=end,
            parameters=params,
            community=community,
            force_refresh=refresh,
        )

        # Map backend canonical format to frontend expected arrays
        params_dict = data.get("parameters", {})
        
        # Sort timestamps
        if "T2M" in params_dict:
            timestamps = sorted(list(params_dict["T2M"].keys()))
        else:
            timestamps = []
            
        t2m = []
        rh2m = []
        ws10m = []
        ghi = []
        
        for ts in timestamps:
            t2m.append(params_dict.get("T2M", {}).get(ts, 0.0))
            rh2m.append(params_dict.get("RH2M", {}).get(ts, 50.0))
            ws10m.append(params_dict.get("WS10M", {}).get(ts, 1.0))
            ghi.append(params_dict.get("ALLSKY_SFC_SW_DWN", {}).get(ts, 0.0))
            
        # Format timestamps nicely for frontend e.g., '2024010100' -> 'D1 00:00'
        # But frontend expects json.temperature_c to be an array
        formatted_timestamps = []
        for i, ts in enumerate(timestamps):
            try:
                # ts is like '2024011500'
                hr = ts[-2:]
                d = (i // 24) + 1
                formatted_timestamps.append(f"D{d} {hr}:00")
            except:
                formatted_timestamps.append(ts)

        return {
            "status": "CACHED" if data.get("_cache", {}).get("hit") else "LIVE",
            "dataset_id": data.get("_cache", {}).get("dataset_id"),
            "timestamps": formatted_timestamps,
            "temperature_c": t2m,
            "relative_humidity": rh2m,
            "wind_speed_ms": ws10m,
            "solar_ghi": ghi,
            "retrieved_at": data.get("_cache", {}).get("retrieved_at"),
            "record_count": len(timestamps)
        }
    except ClimateSourceUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Climate processing error: {str(exc)}")
