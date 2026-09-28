"""
Database engine and session factory — SQLAlchemy 2.x async.
Supports PostgreSQL (Supabase with connection pooling) and local SQLite fallback.
Seeds verified material library and preset scenarios on startup.
"""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from config import settings

logger = logging.getLogger("thermashell.database")

# Handle async engine creation with connection pooling
connect_args = {}
engine_kwargs = {"echo": False}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_async_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
        **engine_kwargs
    )
else:
    # PostgreSQL with connection pooling
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        **engine_kwargs
    )

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    """Initializes tables and seeds initial verified materials and preset projects."""
    from models import Material, VERIFIED_MATERIALS_SEED, Project, Location, Scenario
    import json

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Check and seed materials if empty
    async with async_session() as session:
        stmt = select(Material).limit(1)
        res = await session.execute(stmt)
        first_material = res.scalar_one_or_none()

        if not first_material:
            logger.info("Seeding verified materials into database...")
            for mat_data in VERIFIED_MATERIALS_SEED:
                mat = Material(
                    id=mat_data["id"],
                    name=mat_data["name"],
                    category=mat_data["category"],
                    description=mat_data["description"],
                    thermal_conductivity_k=mat_data["thermal_conductivity_k"],
                    density_rho=mat_data["density_rho"],
                    specific_heat_cp=mat_data["specific_heat_cp"],
                    emissivity=mat_data["emissivity"],
                    solar_absorptivity=mat_data["solar_absorptivity"],
                    solar_reflectivity=mat_data["solar_reflectivity"],
                    embodied_carbon=mat_data["embodied_carbon"],
                    cost=mat_data["cost"],
                    units=mat_data["units"],
                    source=mat_data["source"],
                    reference=mat_data["reference"],
                    valid_temperature_range=mat_data["valid_temperature_range"],
                    is_custom=0,
                    version=1,
                )
                session.add(mat)
            await session.commit()
            logger.info("Successfully seeded %d verified materials.", len(VERIFIED_MATERIALS_SEED))

        # Check and seed preset projects
        stmt_proj = select(Project).limit(1)
        res_proj = await session.execute(stmt_proj)
        first_proj = res_proj.scalar_one_or_none()

        if not first_proj:
            presets = [
                {
                    "id": "leh-winter-demo",
                    "name": "Leh High-Altitude Winter Outpost",
                    "description": "Critical cold defense shelter at 3,500m elevation. Extreme diurnal swings with sub-zero design extremes (-15°C) and high solar clear-sky insolation.",
                    "loc_name": "Leh, Ladakh",
                    "lat": 34.15,
                    "lon": 77.58,
                    "elev": 3500.0,
                    "zone": "Cold and Sunny (High Altitude)",
                },
                {
                    "id": "jaisalmer-hot-arid",
                    "name": "Thar Desert Arid Deployment",
                    "description": "High thermal mass construction designed to delay diurnal solar flux penetration in hot-dry desert climates with 45°C ambient peaks.",
                    "loc_name": "Jaisalmer, Rajasthan",
                    "lat": 26.91,
                    "lon": 70.90,
                    "elev": 225.0,
                    "zone": "Hot and Dry",
                },
                {
                    "id": "tawang-subalpine",
                    "name": "Tawang Mountain High-Humidity Post",
                    "description": "Damp cold high-elevation outpost with freezing rain, mist, and persistent overcast skies. High airtightness and continuous moisture barrier required.",
                    "loc_name": "Tawang, Arunachal Pradesh",
                    "lat": 27.58,
                    "lon": 91.86,
                    "elev": 3048.0,
                    "zone": "Cold and Cloudy",
                }
            ]
            for p_data in presets:
                proj = Project(
                    id=p_data["id"],
                    name=p_data["name"],
                    description=p_data["description"]
                )
                session.add(proj)
                loc = Location(
                    id=f"loc-{p_data['id']}",
                    project_id=p_data["id"],
                    name=p_data["loc_name"],
                    latitude=p_data["lat"],
                    longitude=p_data["lon"],
                    elevation=p_data["elev"],
                    elevation_source="provider",
                    climate_zone=p_data["zone"]
                )
                session.add(loc)
                scenario = Scenario(
                    id=f"scenario-{p_data['id']}",
                    project_id=p_data["id"],
                    name=p_data["name"],
                    version=1,
                    location_id=loc.id,
                    canonical_json=json.dumps({
                        "id": p_data["id"],
                        "name": p_data["name"],
                        "location": {
                            "name": p_data["loc_name"],
                            "latitude": p_data["lat"],
                            "longitude": p_data["lon"],
                            "elevation": p_data["elev"],
                            "climate_zone": p_data["zone"],
                        }
                    })
                )
                session.add(scenario)
            await session.commit()
            logger.info("Successfully seeded preset projects into database.")
