import asyncio
import sys
import json
sys.path.insert(0, ".")

from app.core.database import AsyncSessionLocal
from app.schemas.campaign import FilterCriterion
from app.services import segment_service, ai_service

async def main():
    print("Testing execute_segment_filters database error handling...")
    
    # 1. Construct a filter that is guaranteed to throw a date parsing error in Postgres
    filters = [
        FilterCriterion(field="last_order_date", operator="eq", value="abc")
    ]
    
    async with AsyncSessionLocal() as db:
        try:
            print("Executing query...")
            customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, 1)
            print(f"SUCCESS (unexpected): Matched {customer_count} customers")
        except Exception as exc:
            print("\nSuccessfully caught database exception:")
            print(f"Technical error: {type(exc).__name__}: {exc}")
            
            # Now test the AI explainer
            print("\nGenerating AI explanation...")
            try:
                explanation = await ai_service.explain_query_error(
                    intent="Find customers who ordered on abc date",
                    filters=filters,
                    error=exc
                )
                print("\n=== AI Explanation ===")
                # Encode to utf-8 and decode with ignore to avoid Windows CP1252 print errors
                print(explanation.encode('utf-8', errors='ignore').decode('utf-8'))
                print("=======================")
            except Exception as ai_exc:
                import traceback
                print("\nAI explainer failed. Traceback:")
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
