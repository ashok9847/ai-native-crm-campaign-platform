import asyncio
import sys
import io
import json
from unittest.mock import AsyncMock, patch

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, ".")

from fastapi import HTTPException
from app.core.database import AsyncSessionLocal
from app.services import campaign_service
from app.schemas.campaign import FilterCriterion

async def test_sync_campaign_creation_error():
    print("Running test_sync_campaign_creation_error...")
    
    mock_exc = Exception("operator does not exist: date = character varying")
    mock_clarification = {
        "question": "We couldn't parse your date format. How would you like to filter by date?",
        "options": ["O1", "O2", "O3"]
    }
    
    async with AsyncSessionLocal() as db:
        # Patch segment_service.execute_segment_filters to raise DB error
        with patch("app.services.segment_service.execute_segment_filters", AsyncMock(side_effect=mock_exc)) as mock_exec, \
             patch("app.services.ai_service.generate_query_clarification", AsyncMock(return_value=mock_clarification)) as mock_clarify:
             
             try:
                 await campaign_service.create_campaign(
                     intent="Find customers with invalid date",
                     name="Sync Error Test",
                     db=db,
                     tenant_id=1,
                 )
                 assert False, "Should have raised HTTPException"
             except HTTPException as e:
                 assert e.status_code == 400
                 assert e.detail["code"] == "CLARIFICATION_NEEDED"
                 assert e.detail["detail"] == mock_clarification["question"]
                 assert e.detail["options"] == mock_clarification["options"]
                 assert isinstance(e.detail["campaign_id"], int)
                 print("  [PASS] Sync campaign creation caught DB error and raised friendly CLARIFICATION_NEEDED HTTPException.")

async def test_sync_campaign_creation_ai_fallback():
    print("Running test_sync_campaign_creation_ai_fallback...")
    
    mock_exc = Exception("operator does not exist: date = character varying")
    
    async with AsyncSessionLocal() as db:
        with patch("app.services.segment_service.execute_segment_filters", AsyncMock(side_effect=mock_exc)) as mock_exec, \
             patch("app.services.ai_service.generate_query_clarification", AsyncMock(side_effect=Exception("AI offline"))) as mock_clarify:
             
             try:
                 await campaign_service.create_campaign(
                     intent="Find customers with invalid date",
                     name="Sync Error Test",
                     db=db,
                     tenant_id=1,
                 )
                 assert False, "Should have raised HTTPException"
             except HTTPException as e:
                 assert e.status_code == 400
                 assert e.detail["code"] == "CLARIFICATION_NEEDED"
                 assert "mismatched criteria" in e.detail["detail"]
                 assert len(e.detail["options"]) == 3
                 assert isinstance(e.detail["campaign_id"], int)
                 print("  [PASS] Sync campaign creation fell back to default clarification when AI clarification failed.")

async def test_stream_campaign_creation_error():
    print("Running test_stream_campaign_creation_error...")
    
    mock_exc = Exception("operator does not exist: date = character varying")
    mock_clarification = {
        "question": "We couldn't parse your date format. How would you like to filter by date?",
        "options": ["O1", "O2", "O3"]
    }
    
    async with AsyncSessionLocal() as db:
        with patch("app.services.segment_service.execute_segment_filters", AsyncMock(side_effect=mock_exc)) as mock_exec, \
             patch("app.services.ai_service.generate_query_clarification", AsyncMock(return_value=mock_clarification)) as mock_clarify:
             
             generator = campaign_service.create_campaign_stream_generator(
                 intent="Find customers with invalid date",
                 name="Stream Error Test",
                 db=db,
                 tenant_id=1,
             )
             
             events = []
             async for line in generator:
                 if line.strip():
                     events.append(json.loads(line))
             
             # The last event should be "event": "clarification_needed"
             clarification_events = [e for e in events if e.get("event") == "clarification_needed"]
             assert len(clarification_events) == 1
             assert clarification_events[0]["question"] == mock_clarification["question"]
             assert clarification_events[0]["options"] == mock_clarification["options"]
             assert isinstance(clarification_events[0]["campaign_id"], int)
             
             # The stream should have terminated after yielding clarification, meaning no message generation events should exist
             generating_started = [e for e in events if e.get("event") == "generating_started"]
             assert len(generating_started) == 0
             print("  [PASS] Stream campaign creation yielded clarification_needed event and terminated cleanly.")

async def test_stream_campaign_creation_ai_fallback():
    print("Running test_stream_campaign_creation_ai_fallback...")
    
    mock_exc = Exception("operator does not exist: date = character varying")
    
    async with AsyncSessionLocal() as db:
        with patch("app.services.segment_service.execute_segment_filters", AsyncMock(side_effect=mock_exc)) as mock_exec, \
             patch("app.services.ai_service.generate_query_clarification", AsyncMock(side_effect=Exception("AI offline"))) as mock_clarify:
             
             generator = campaign_service.create_campaign_stream_generator(
                 intent="Find customers with invalid date",
                 name="Stream Error Test",
                 db=db,
                 tenant_id=1,
             )
             
             events = []
             async for line in generator:
                 if line.strip():
                     events.append(json.loads(line))
             
             clarification_events = [e for e in events if e.get("event") == "clarification_needed"]
             assert len(clarification_events) == 1
             assert "mismatched criteria" in clarification_events[0]["question"]
             assert len(clarification_events[0]["options"]) == 3
             assert isinstance(clarification_events[0]["campaign_id"], int)
             print("  [PASS] Stream campaign creation fell back to default clarification when AI clarification failed.")

async def main():
    await test_sync_campaign_creation_error()
    await test_sync_campaign_creation_ai_fallback()
    await test_stream_campaign_creation_error()
    await test_stream_campaign_creation_ai_fallback()
    print("\nAll unit tests passed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
