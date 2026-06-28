import asyncio
import httpx
import sys
import json

async def main():
    base_url = "http://localhost:8000"
    print("=== Testing API Query Error Handling ===")
    
    # 1. Login as Alice to get auth token
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base_url}/auth/token",
            data={"username": "alice@brewmate.com", "password": "password123"}
        )
        if resp.status_code != 200:
            print(f"FAILED to login as Alice: {resp.status_code} - {resp.text}")
            sys.exit(1)
        
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("Logged in successfully.")

        # Test 2: Synchronous campaign creation with invalid query
        # Using intent: "Find customers whose last order date is abc"
        # This will fail because 'abc' is not a valid date format.
        print("\nTesting synchronous campaign creation with invalid query intent...")
        resp = await client.post(
            f"{base_url}/api/v1/campaigns",
            headers=headers,
            json={
                "intent": "Find customers whose last order date is abc",
                "name": "Sync Error Test Campaign"
            }
        )
        print(f"Status Code: {resp.status_code}")
        try:
            body = resp.json()
            print("Response Body:")
            print(json.dumps(body, indent=2))
            assert resp.status_code == 400
            assert body["code"] == "QUERY_ERROR"
            assert "detail" in body
            print("SUCCESS: Synchronous error response is valid!")
        except Exception as e:
            print(f"FAILED sync validation: {e}")

        # Test 3: Streaming campaign creation with invalid query
        print("\nTesting streaming campaign creation with invalid query intent...")
        async with client.stream(
            "POST",
            f"{base_url}/api/v1/campaigns/stream",
            headers=headers,
            json={
                "intent": "Find customers whose last order date is abc",
                "name": "Stream Error Test Campaign"
            }
        ) as response:
            print(f"Status Code: {response.status_code}")
            
            # Read the stream lines
            lines = []
            async for line in response.aiter_lines():
                if line.strip():
                    lines.append(json.loads(line))
            
            print("Stream Events:")
            for event in lines:
                print(json.dumps(event, indent=2))
                
            # The last event or one of the events should be "event": "error"
            error_events = [e for e in lines if e.get("event") == "error"]
            assert len(error_events) > 0, "No error event found in stream"
            assert error_events[0]["code"] == "QUERY_ERROR"
            print("SUCCESS: Streaming error event is valid!")

if __name__ == "__main__":
    asyncio.run(main())
