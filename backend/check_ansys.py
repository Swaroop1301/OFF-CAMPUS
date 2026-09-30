import asyncio
import database
from config import settings

async def main():
    await database.init_db()
    db = database.client[settings.MONGODB_DATABASE]
    
    # Check for ansys jobs
    ansys_jobs = await db.ansys_jobs.find().to_list(length=100)
    print(f"Total ANSYS jobs: {len(ansys_jobs)}")
    for j in ansys_jobs:
        print(f"Job: {j['id']} | Status: {j['status']} | Scenario: {j['scenario_id']}")
    
    # Check for ansys results
    ansys_results = await db.ansys_results.find().to_list(length=100)
    print(f"Total ANSYS results: {len(ansys_results)}")
    for r in ansys_results:
        print(f"Result for Job: {r['ansys_job_id']}")

asyncio.run(main())
