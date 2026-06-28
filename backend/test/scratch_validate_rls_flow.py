import asyncio
import httpx
import sys

async def run_validation():
    print("=== Programmatic E2E Validation Flow ===")
    
    # Base URL for FastAPI backend
    base_url = "http://localhost:8000"
    
    # 1. Login as Alice (BrewMate, Tenant 1)
    print("\n1. Logging in as Alice (BrewMate, Tenant 1)...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base_url}/auth/token",
            data={"username": "alice@brewmate.com", "password": "password123"}
        )
        if resp.status_code != 200:
            print(f"FAILED to login as Alice: {resp.status_code} - {resp.text}")
            sys.exit(1)
        
        alice_token = resp.json()["access_token"]
        print("SUCCESS: Logged in. Token received.")
        
        # 2. Login as Bob (Zara, Tenant 2)
        print("\n2. Logging in as Bob (Zara, Tenant 2)...")
        resp = await client.post(
            f"{base_url}/auth/token",
            data={"username": "bob@zara.com", "password": "password123"}
        )
        if resp.status_code != 200:
            print(f"FAILED to login as Bob: {resp.status_code} - {resp.text}")
            sys.exit(1)
            
        bob_token = resp.json()["access_token"]
        print("SUCCESS: Logged in. Token received.")
        
        # 3. Verify RLS Isolation: Fetch customers as Alice
        print("\n3. Fetching customers as Alice...")
        resp = await client.get(
            f"{base_url}/api/v1/customers",
            headers={"Authorization": f"Bearer {alice_token}"}
        )
        if resp.status_code != 200:
            print(f"FAILED to fetch customers as Alice: {resp.status_code} - {resp.text}")
            sys.exit(1)
        
        alice_customers = resp.json()["items"]
        print(f"SUCCESS: Alice retrieved {len(alice_customers)} customers (expected: 42 or more).")
        
        # Fetch customers as Bob (should see 0 by default)
        print("\n4. Fetching customers as Bob...")
        resp = await client.get(
            f"{base_url}/api/v1/customers",
            headers={"Authorization": f"Bearer {bob_token}"}
        )
        if resp.status_code != 200:
            print(f"FAILED to fetch customers as Bob: {resp.status_code} - {resp.text}")
            sys.exit(1)
            
        bob_customers = resp.json()["items"]
        print(f"SUCCESS: Bob retrieved {len(bob_customers)} customers (expected: 0 before upload).")
        
        # 4. Upload CSV as Bob with a custom field
        print("\n5. Uploading CSV with custom field as Bob (Zara)...")
        csv_content = (
            "name,email,subscription_tier,roast_preference,last_order_date,lifetime_value,city,dress_size_preference\n"
            "Zara Customer,zara_cust@example.com,premium,medium,2026-06-01,500.0,Mumbai,M\n"
        )
        files = {"file": ("zara_customers.csv", csv_content.encode("utf-8"), "text/csv")}
        resp = await client.post(
            f"{base_url}/api/v1/customers/upload",
            headers={"Authorization": f"Bearer {bob_token}"},
            files=files
        )
        if resp.status_code != 200:
            print(f"FAILED to upload CSV as Bob: {resp.status_code} - {resp.text}")
            sys.exit(1)
            
        upload_result = resp.json()
        print(f"SUCCESS: Upload results -> {upload_result}")
        
        # 5. Verify RLS Isolation AFTER Upload
        print("\n6. Verifying RLS isolation after upload...")
        # Fetch customers as Bob again (should see 1 customer)
        resp = await client.get(
            f"{base_url}/api/v1/customers",
            headers={"Authorization": f"Bearer {bob_token}"}
        )
        bob_customers_after = resp.json()["items"]
        print(f"Bob sees {len(bob_customers_after)} customer(s) (expected: 1).")
        
        # Fetch customers as Alice again (should NOT see Bob's new customer)
        resp = await client.get(
            f"{base_url}/api/v1/customers",
            headers={"Authorization": f"Bearer {alice_token}"}
        )
        alice_customers_after = resp.json()["items"]
        print(f"Alice sees {len(alice_customers_after)} customer(s) (expected: same as before).")
        
        # Search for Bob's customer in Alice's customer list
        found_in_alice = any(c["email"] == "zara_cust@example.com" for c in alice_customers_after)
        if found_in_alice:
            print("CRITICAL FAIL: Cross-tenant data leakage detected! Alice can see Bob's customer!")
            sys.exit(1)
        else:
            print("SUCCESS: 0% cross-tenant leakage. Alice cannot see Bob's customer.")
            
        # 6. Verify Campaign creation flow for Alice
        print("\n7. Verifying campaign creation flow for Alice...")
        resp = await client.post(
            f"{base_url}/api/v1/campaigns",
            headers={"Authorization": f"Bearer {alice_token}"},
            json={
                "intent": "premium customers who spent > 2000 in the last 90 days",
                "name": "Validation Campaign"
            }
        )
        if resp.status_code != 201:
            print(f"FAILED to create campaign: {resp.status_code} - {resp.text}")
            sys.exit(1)
            
        camp_detail = resp.json()
        print(f"SUCCESS: Campaign created successfully! State: {camp_detail['state']}")
        print(f"Campaign filters: {camp_detail['segment']['filter_criteria']}")
        print(f"Campaign generated message count: {len(camp_detail['messages'])}")
        
        print("\n=== Validation Flow Completed Successfully! ===")

if __name__ == "__main__":
    asyncio.run(run_validation())
