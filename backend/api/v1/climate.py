"""
Climate data API endpoint — proxies NASA POWER with validation and PostgreSQL caching.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

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
    db: AsyncSession = Depends(get_db),
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
        return data
    except ClimateSourceUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Climate processing error: {str(exc)}")
