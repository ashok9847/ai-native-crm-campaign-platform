import asyncio
import sys
sys.path.insert(0, ".")

from app.core.database import AsyncSessionLocal
from app.services.tenant_service import register_tenant_and_user

async def main():
    async with AsyncSessionLocal() as db:
        try:
            res = await register_tenant_and_user(
                db=db,
                tenant_name="EspressoGo_Direct",
                email="admin_direct@espressogo.com",
                password="password123"
            )
            print("SUCCESS:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
