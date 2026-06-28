import asyncio
import sys
sys.path.insert(0, ".")

from app.schemas.campaign import FilterCriterion
from app.services.ai_service import explain_query_error

async def main():
    print("Testing explain_query_error...")
    
    intent = "Find customers who spent green dollars"
    filters = [
        FilterCriterion(field="spent_amount", operator="gt", value="green")
    ]
    technical_error = ValueError("invalid literal for float(): 'green'")
    
    try:
        explanation = await explain_query_error(intent, filters, technical_error)
        print("\n=== AI Explanation ===")
        print(explanation)
        print("=======================")
    except Exception as e:
        print(f"Error during execution: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
