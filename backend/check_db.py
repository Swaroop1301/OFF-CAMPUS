import asyncio, json, database
from config import settings

async def main():
    await database.init_db()
    db = database.client[settings.MONGODB_DATABASE]
    ds = await db.climate_datasets.find_one()
    if ds:
        print(f"Dataset ID: {ds['id']}")
    else:
        print("No datasets")

asyncio.run(main())
