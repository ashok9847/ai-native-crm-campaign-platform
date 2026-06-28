import asyncio
import sys
sys.path.insert(0, ".")

from app.core.database import AsyncSessionLocal
from app.core.dependencies import get_current_user
from app.routers.customers import list_customers
from app.models.tenant import User
from sqlalchemy import select

async def debug_endpoint():
    async with AsyncSessionLocal() as db:
        # 1. Let's find Alice in the DB
        res = await db.execute(select(User).where(User.email == "alice@brewmate.com"))
        alice = res.scalar_one_or_none()
        if not alice:
            print("Alice not found in database!")
            return
        
        print(f"Found Alice: ID={alice.id}, Email={alice.email}, Tenant ID={alice.tenant_id}")
        
        # 2. Test get_db logic directly
        print("Testing database SELECT set_config...")
        try:
            from sqlalchemy import text
            await db.execute(
                text("SELECT set_config('app.current_tenant', :tenant_id, true)"),
                {"tenant_id": str(alice.tenant_id)}
            )
            print("set_config succeeded.")
        except Exception as e:
            print("SET current_tenant failed:")
            import traceback
            traceback.print_exc()
            return
            
        # 3. Test get_current_user check directly with RLS active
        print("Testing get_current_user logic directly...")
        try:
            stmt = select(User).where(User.id == alice.id, User.tenant_id == alice.tenant_id)
            res_user = await db.execute(stmt)
            user = res_user.scalar_one_or_none()
            print("User queried with RLS:", user)
            if not user:
                print("Failed to find user with RLS active!")
        except Exception as e:
            print("Query user with RLS failed:")
            import traceback
            traceback.print_exc()
            return
            
        # 4. Test customers query directly with RLS active
        print("Testing list_customers service directly...")
        try:
            from app.services.customer_service import list_customers as serv_list_customers
            res_cust = await serv_list_customers(db, page=1, page_size=10)
            print(f"List customers succeeded! Total = {res_cust.total}, Count = {len(res_cust.items)}")
        except Exception as e:
            print("list_customers service failed:")
            import traceback
            traceback.print_exc()
            return

if __name__ == "__main__":
    asyncio.run(debug_endpoint())
