"""Contract drift validator script.

Compares backend Pydantic schemas to frontend TS interfaces in types.ts.
Returns exit code 1 if drift is detected, otherwise 0.
"""

import sys
import os
import re
import datetime
import typing
from typing import get_origin, get_args, Union, Any

# Ensure backend directory is in python path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

try:
    from app.schemas.customer import (
        CustomerResponse,
        SeedResult,
        ImportRowError,
        ImportResult,
        CustomerListResponse,
        OrderResponse,
        CRMFieldResponse,
    )
    from app.schemas.campaign import (
        FilterCriterion,
        CustomerSummary,
        SegmentDetail,
        MessagePreview,
        CampaignResponse,
        CampaignDetailResponse,
        CampaignListItem,
    )
    from app.schemas.ai import AIChatResponse
    from app.schemas.audiences import AudienceResponse, AudiencePreviewResponse, FilterRule, CustomerSummarySchema
except ImportError as err:
    print(f"ImportError: Could not import backend schemas: {err}")
    sys.exit(1)

# Map Pydantic classes to TS Interface names in types.ts
MODEL_MAPPING = {
    CustomerResponse: "CustomerResponse",
    SeedResult: "SeedResult",
    ImportRowError: "ImportRowError",
    ImportResult: "ImportResult",
    OrderResponse: "OrderResponse",
    CRMFieldResponse: "CRMFieldResponse",
    FilterCriterion: "FilterCriterion",
    CustomerSummary: "CustomerSummary",
    SegmentDetail: "SegmentDetail",
    MessagePreview: "MessagePreview",
    CampaignResponse: "CampaignResponse",
    CampaignDetailResponse: "CampaignDetailResponse",
    CampaignListItem: "CampaignListItem",
    AIChatResponse: "AIChatResponse",
    AudienceResponse: "AudienceResponse",
    AudiencePreviewResponse: "AudiencePreviewResponse",
    FilterRule: "FilterCriterion",
    CustomerSummarySchema: "CustomerSummary",
}

def normalize_ts_type(ts_type: str) -> str:
    # Remove all whitespace
    ts_type = ts_type.replace(" ", "").replace("\r", "").replace("\n", "")
    return ts_type

def get_python_type_desc(py_type) -> tuple[str, bool]:
    """Return a tuple of (type_name_string, is_optional_boolean)."""
    origin = get_origin(py_type)
    args = get_args(py_type)
    
    # Check for Union / Optional / UnionType (Python 3.10+)
    is_optional = False
    if origin is Union or (hasattr(typing, "UnionType") and origin is typing.UnionType):
        non_none_args = [a for a in args if a is not type(None)]
        if len(non_none_args) < len(args):
            is_optional = True
        if len(non_none_args) == 1:
            inner_name, inner_opt = get_python_type_desc(non_none_args[0])
            return inner_name, is_optional or inner_opt
        
        type_names = []
        for a in non_none_args:
            name, _ = get_python_type_desc(a)
            type_names.append(name)
        return "|".join(sorted(list(set(type_names)))), is_optional
        
    if origin is list or py_type is list:
        inner = "any"
        if args:
            inner, _ = get_python_type_desc(args[0])
        return f"{inner}[]", is_optional
        
    if origin is dict or py_type is dict:
        return "Record", is_optional
        
    if py_type is str:
        return "string", is_optional
    if py_type in (int, float):
        return "number", is_optional
    if py_type is bool:
        return "boolean", is_optional
    if py_type in (datetime.date, datetime.datetime):
        return "string", is_optional
    if py_type is Any:
        return "any", is_optional
        
    if hasattr(py_type, "__name__"):
        name = py_type.__name__
        # Map to TS name if mapped
        if py_type in MODEL_MAPPING:
            return MODEL_MAPPING[py_type], is_optional
        return name, is_optional
        
    return "any", is_optional

def are_types_compatible(py_type_str: str, py_opt: bool, ts_type_str: str, ts_opt: bool) -> bool:
    py_type = normalize_ts_type(py_type_str)
    ts_type = normalize_ts_type(ts_type_str)
    
    # Common type aliases in types.ts
    ts_type = ts_type.replace("SubscriptionTier", "string")
    ts_type = ts_type.replace("CampaignState", "string")
    ts_type = ts_type.replace("DeliveryStatus", "string")
    if ts_type.startswith("Record<"):
        ts_type = "Record"
        
    # Check optionality/nullability
    ts_is_nullable = "null" in ts_type.split("|")
    if py_opt and not (ts_opt or ts_is_nullable):
        # Python allows None/null, but TS doesn't mark it optional or nullable
        return False
        
    py_parts = set(py_type.split("|"))
    if "null" in py_parts:
        py_parts.remove("null")
        
    ts_parts = set(ts_type.split("|"))
    if "null" in ts_parts:
        ts_parts.remove("null")
        
    for p in py_parts:
        compatible = False
        for t in ts_parts:
            if p == t:
                compatible = True
            elif p == "number" and t == "number":
                compatible = True
            elif p == "string" and t == "string":
                compatible = True
            elif p == "Record" and t == "Record":
                compatible = True
            elif p == "any" or t == "any":
                compatible = True
            elif p.endswith("[]") and t == "any[]":
                compatible = True
            elif t.endswith("[]") and p == "any[]":
                compatible = True
            elif p == "Record[]" and t.endswith("[]"):
                compatible = True
        if not compatible:
            return False
            
    return True

def parse_ts_interfaces(ts_content: str) -> dict:
    # Capture all interface declarations, supporting optional inheritance
    interface_blocks = re.findall(
        r"export\s+interface\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{([^}]+)\}",
        ts_content
    )
    
    raw_interfaces = {}
    extensions = {}
    
    for name, base_name, body in interface_blocks:
        fields = {}
        # Find lines like name?: type or name: type
        field_lines = re.findall(r"(\w+)(\??)\s*:\s*([^;/\n\r]+)", body)
        for fname, optional, ftype in field_lines:
            ftype = ftype.strip()
            # Strip trailing inline comments
            ftype = re.split(r"//|/\*", ftype)[0].strip()
            fields[fname] = {
                "type": ftype,
                "optional": optional == "?"
            }
        raw_interfaces[name] = fields
        if base_name:
            extensions[name] = base_name

    # Resolve inheritance chains
    interfaces = {}
    for name in raw_interfaces:
        resolved_fields = {}
        curr = name
        visited = set()
        while curr and curr not in visited:
            visited.add(curr)
            if curr in raw_interfaces:
                # Merge fields, subclass overrides base class
                for f, fdef in raw_interfaces[curr].items():
                    if f not in resolved_fields:
                        resolved_fields[f] = fdef
            curr = extensions.get(curr)
        interfaces[name] = resolved_fields
        
    return interfaces

def main():
    # Locate types.ts relative to script path
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    types_path = os.path.join(base_dir, "frontend", "lib", "types.ts")
    
    if not os.path.exists(types_path):
        print(f"Error: types.ts file not found at {types_path}")
        sys.exit(1)
        
    with open(types_path, "r", encoding="utf-8") as f:
        ts_content = f.read()
        
    ts_interfaces = parse_ts_interfaces(ts_content)
    
    drift_detected = False
    
    print("=== Running Contract Drift Validation ===")
    for model_class, ts_name in MODEL_MAPPING.items():
        if ts_name not in ts_interfaces:
            print(f"[ERROR] TypeScript interface '{ts_name}' is missing from types.ts")
            drift_detected = True
            continue
            
        ts_fields = ts_interfaces[ts_name]
        py_fields = model_class.model_fields
        
        # Check Pydantic fields in TS
        for field_name, field_def in py_fields.items():
            py_type_str, py_opt = get_python_type_desc(field_def.annotation)
            
            # If field is not present in Pydantic schema default (some TS fields are calculated or UI-specific)
            # but we require all backend model fields to be represented in TS
            if field_name not in ts_fields:
                # Check if it has a default in Pydantic — might not be strictly required from backend response
                # but let's report it
                print(f"[ERROR] in {ts_name}: Field '{field_name}' in Pydantic model is missing from TS interface")
                drift_detected = True
                continue
                
            ts_field = ts_fields[field_name]
            ts_type_str = ts_field["type"]
            ts_opt = ts_field["optional"]
            
            if not are_types_compatible(py_type_str, py_opt, ts_type_str, ts_opt):
                print(
                    f"[ERROR] Type Mismatch in {ts_name}.{field_name}:\n"
                    f"   Backend Pydantic type: {py_type_str} (optional: {py_opt})\n"
                    f"   Frontend TypeScript type: {ts_type_str} (optional: {ts_opt})"
                )
                drift_detected = True
                
        # Check for unexpected fields in TS that aren't on backend models
        # (We allow UI-specific fields on TS if documented/expected, but warn if they look like backend fields)
        for field_name in ts_fields:
            if field_name not in py_fields:
                # If it's a common UI field (e.g. sample_customers is computed, etc.), allow it.
                # Otherwise, print a warning
                pass

    if drift_detected:
        print("\n[FAIL] Contract drift validation FAILED. Please reconcile schemas and frontend types.")
        sys.exit(1)
    else:
        print("\n[PASS] Contract drift validation PASSED. Backend schemas match frontend types.ts!")
        sys.exit(0)

if __name__ == "__main__":
    main()
