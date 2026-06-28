import asyncio
import sys
sys.path.insert(0, ".")

from app.services.ai_service import infer_schema

# Define evaluation dataset
EVAL_DATASET = [
    {
        "field_name": "caffeine_level",
        "samples": ["high", "medium", "none", "high", "none", "medium"],
        "expected_type": "enum",
        "expected_enums": {"high", "medium", "none"}
    },
    {
        "field_name": "customer_sentiment",
        "samples": ["extremely satisfied with service", "complained about cold coffee", "neutral response", "highly recommended"],
        "expected_type": "string",
        "expected_enums": None
    },
    {
        "field_name": "loyalty_score",
        "samples": ["45", "12", "98", "5", "80", "100"],
        "expected_type": "number",
        "expected_enums": None
    },
    {
        "field_name": "preferred_delivery_slot",
        "samples": ["morning", "evening", "morning", "afternoon", "evening", "afternoon"],
        "expected_type": "enum",
        "expected_enums": {"morning", "evening", "afternoon"}
    },
    {
        "field_name": "referral_discount_percentage",
        "samples": ["15.5", "10.0", "20.0", "15.5", "25.0"],
        "expected_type": "number",
        "expected_enums": None
    }
]

async def run_evaluation():
    print("=== AI Schema Extraction Accuracy Evaluation ===")
    total_checks = 0
    correct_checks = 0
    
    for case in EVAL_DATASET:
        field_name = case["field_name"]
        samples = case["samples"]
        expected_type = case["expected_type"]
        expected_enums = case["expected_enums"]
        
        print(f"\nEvaluating column: {field_name}...")
        try:
            result = await infer_schema(field_name, samples)
            print(f"  AI Output: {result}")
            
            # Check 1: field_type matches
            total_checks += 1
            ai_type = result.get("field_type")
            if ai_type == expected_type:
                correct_checks += 1
                print("  [PASS] Field type matches expected.")
            else:
                print(f"  [FAIL] Field type mismatch: expected {expected_type}, got {ai_type}")
                
            # Check 2: description exists
            total_checks += 1
            ai_desc = result.get("description")
            if ai_desc and isinstance(ai_desc, str) and len(ai_desc) > 5:
                correct_checks += 1
                print("  [PASS] Valid description generated.")
            else:
                print("  [FAIL] Missing or invalid description.")
                
            # Check 3: allowed_enums matches if expected_type is enum
            if expected_type == "enum":
                total_checks += 1
                ai_enums = result.get("allowed_enums")
                if isinstance(ai_enums, list):
                    ai_enums_set = {str(x).lower().strip() for x in ai_enums}
                    expected_enums_set = {str(x).lower().strip() for x in expected_enums}
                    if ai_enums_set == expected_enums_set:
                        correct_checks += 1
                        print("  [PASS] Allowed enums match expected.")
                    else:
                        print(f"  [FAIL] Allowed enums mismatch: expected {expected_enums_set}, got {ai_enums_set}")
                else:
                    print("  [FAIL] allowed_enums is not a list for enum type.")
                    
        except Exception as e:
            print(f"  [ERR] Failed evaluating {field_name}: {e}")
            total_checks += 3  # Assume 3 failed checks
            
    accuracy = (correct_checks / total_checks) * 100 if total_checks > 0 else 0
    print("\n=== Evaluation Results ===")
    print(f"Total Checks: {total_checks}")
    print(f"Correct Checks: {correct_checks}")
    print(f"Accuracy: {accuracy:.2f}%")
    
    if accuracy >= 95.0:
        print("SUCCESS: AI Schema Extraction accuracy is >= 95% (conforms to SC-003)")
    else:
        print("NOTICE: Accuracy is below 95% target. LLM outputs may require fine-tuning or better prompts.")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
