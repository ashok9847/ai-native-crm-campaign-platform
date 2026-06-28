import asyncio
import datetime
import random
import httpx

BASE_URL = "http://localhost:8000"


async def test_onboarding_flow():
    # 1. Register a new tenant workspace
    suffix = random.randint(1000, 9999)
    tenant_name = f"EspressoGo_{suffix}"
    email = f"admin_{suffix}@espressogo.com"
    password = "password123"

    print(f"--- 1. REGISTERING TENANT {tenant_name} ({email}) ---")
    async with httpx.AsyncClient(timeout=20.0) as client:
        reg_response = await client.post(
            f"{BASE_URL}/auth/register",
            json={
                "tenant_name": tenant_name,
                "email": email,
                "password": password
            }
        )
        print("Registration Status:", reg_response.status_code)
        if reg_response.status_code != 201:
            print("Failed to register:", reg_response.text)
            return

        reg_data = reg_response.json()
        token = reg_data["access_token"]
        print("Token received:", token[:30] + "...")

        headers = {"Authorization": f"Bearer {token}"}

        # 2. Seed Mock Coffee-Shop Workspace Data
        print(f"\n--- 2. SEEDING MOCK COFFEE SHOP DATA ---")
        seed_response = await client.post(
            f"{BASE_URL}/api/v1/tenants/seed-mock",
            headers=headers
        )
        print("Seed Status:", seed_response.status_code)
        print("Seed Response:", seed_response.json())

        # 3. Upload Custom Orders Data (CSV)
        # Includes orders for Aarav Mehta (aarav.mehta@coffeeshop.com) - who exists
        # and unknown@example.com - who does not exist (should be skipped)
        print(f"\n--- 3. UPLOADING ORDERS CSV ---")
        csv_content = (
            "email,amount,date,items,channel\n"
            "aarav.mehta@coffeeshop.com,120.00,2026-06-12,\"[{\\\"name\\\": \\\"Special Blend 500g\\\", \\\"qty\\\": 1, \\\"price\\\": 120.00}]\",web\n"
            "unknown@example.com,50.00,2026-06-11,\"Cookie\",mobile\n"
        )
        
        files = {
            "file": ("sample_orders.csv", csv_content, "text/csv")
        }
        
        upload_response = await client.post(
            f"{BASE_URL}/api/v1/orders/upload",
            headers=headers,
            files=files
        )
        print("Upload Status:", upload_response.status_code)
        print("Upload Response:", upload_response.json())

        # 4. Fetch Dashboard Statistics
        print(f"\n--- 4. FETCHING DASHBOARD STATS ---")
        stats_response = await client.get(
            f"{BASE_URL}/api/v1/tenants/dashboard-stats",
            headers=headers
        )
        print("Stats Status:", stats_response.status_code)
        print("Stats Response:", stats_response.json())



if __name__ == "__main__":
    asyncio.run(test_onboarding_flow())
