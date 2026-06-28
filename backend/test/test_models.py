"""Test all available models on Nebius."""
import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, ".")

from app.core.config import get_settings
from openai import AsyncOpenAI

AVAILABLE_MODELS = [
    "deepseek-ai/DeepSeek-V3.2-fast",
    "openai/gpt-oss-120b-fast",
    "MiniMaxAI/MiniMax-M2.5-fast",
    "Qwen/Qwen3.5-397B-A17B-fast",
    "Qwen/Qwen3-Next-80B-A3B-Thinking-fast",
    "moonshotai/Kimi-K2.5-fast",
    "moonshotai/Kimi-K2.6",
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen3.5-397B-A17B",
]

async def test_model(client, model_id):
    try:
        resp = await client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": "Reply with only the JSON asked for, no explanation."},
                {"role": "user", "content": 'Return JSON: {"ok": true}'}
            ],
            max_tokens=50,
            temperature=0.0,
        )
        content = resp.choices[0].message.content
        finish = resp.choices[0].finish_reason
        tokens = resp.usage.completion_tokens if resp.usage else "?"
        ok = bool(content and content.strip() and content.strip() not in ("None", "null"))
        status = "PASS" if ok else "FAIL-empty"
        print(f"  [{status}] {model_id}")
        print(f"       finish={finish}, tokens={tokens}, content={repr(content[:60]) if content else repr(content)}")
        return ok, model_id
    except Exception as e:
        print(f"  [ERR]  {model_id}: {type(e).__name__}: {str(e)[:80]}")
        return False, model_id

async def main():
    settings = get_settings()
    client = AsyncOpenAI(base_url=settings.nebius_base_url, api_key=settings.nebius_api_key)
    
    print("=== Testing models for non-empty content ===\n")
    
    working = []
    for model_id in AVAILABLE_MODELS:
        ok, mid = await test_model(client, model_id)
        if ok:
            working.append(mid)
        await asyncio.sleep(1.0)
    
    print(f"\n=== WORKING: {working} ===")

asyncio.run(main())
