"""Quick diagnostic — test Nebius API and print full response."""
import asyncio
import sys
sys.path.insert(0, ".")

from app.core.config import get_settings
from app.services.ai_service import extract_segment_filters, AIUnavailableError

async def main():
    settings = get_settings()
    print(f"Base URL: {settings.nebius_base_url}")
    print(f"Model: {settings.kimi_model}")
    print(f"API key prefix: {settings.nebius_api_key[:15]}...")
    
    # Test 1: direct openai call
    from openai import AsyncOpenAI
    client = AsyncOpenAI(base_url=settings.nebius_base_url, api_key=settings.nebius_api_key)
    
    print("\n--- Direct call ---")
    try:
        resp = await client.chat.completions.create(
            model=settings.kimi_model,
            messages=[{"role": "user", "content": "Say exactly: Hello World"}],
            max_tokens=20,
            temperature=0.0,
        )
        print(f"Finish reason: {resp.choices[0].finish_reason}")
        print(f"Content: {repr(resp.choices[0].message.content)}")
        print(f"Usage: {resp.usage}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

    # Test 2: segment extraction
    print("\n--- Segment filter extraction ---")
    from app.core.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            filters = await extract_segment_filters("top 10 premium customers", db, 1)
        print(f"Filters: {filters}")
    except AIUnavailableError as e:
        print(f"AIUnavailableError: {e}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

asyncio.run(main())
