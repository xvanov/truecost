#!/usr/bin/env python3
"""Test script to verify LLM logging is working."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Set up environment
import os
os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"


async def test_location_agent():
    """Test the location agent with logging."""
    from agents.primary.location_agent import LocationAgent
    from services.firestore_service import FirestoreService

    print("\n" + "#" * 80)
    print("# TESTING LOCATION AGENT WITH LLM LOGGING")
    print("#" * 80 + "\n")

    # Create mock input
    input_data = {
        "clarification_output": {
            "projectBrief": {
                "projectType": "bathroom_remodel",
                "location": {
                    "zipCode": "78745",
                    "city": "Austin",
                    "state": "TX",
                    "fullAddress": "2251 Congress Ave., Austin, TX 78745"
                },
                "scopeSummary": {
                    "totalSqft": 45.7,
                    "finishLevel": "mid_range"
                }
            }
        }
    }

    try:
        # Initialize agent
        firestore = FirestoreService()
        agent = LocationAgent(firestore_service=firestore)

        # Run agent
        result = await agent.run(
            estimate_id="test-logging-001",
            input_data=input_data
        )

        print("\n" + "#" * 80)
        print("# LOCATION AGENT RESULT")
        print("#" * 80)
        print(f"Location Factor: {result.get('locationFactor')}")
        print(f"Union Status: {result.get('unionStatus')}")
        print(f"Confidence: {result.get('confidence')}")
        print(f"Summary: {result.get('summary', '')[:200]}...")

        return True

    except Exception as e:
        print(f"\nError running location agent: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_scope_agent():
    """Test the scope agent with logging."""
    from agents.primary.scope_agent import ScopeAgent
    from services.firestore_service import FirestoreService

    print("\n" + "#" * 80)
    print("# TESTING SCOPE AGENT WITH LLM LOGGING")
    print("#" * 80 + "\n")

    # Create mock input with csiScope
    input_data = {
        "clarification_output": {
            "projectBrief": {
                "projectType": "bathroom_remodel",
                "location": {
                    "zipCode": "78745",
                    "city": "Austin",
                    "state": "TX"
                },
                "scopeSummary": {
                    "totalSqft": 45.7,
                    "finishLevel": "mid_range"
                }
            },
            "csiScope": {
                "div09_finishes": {
                    "code": "09",
                    "name": "Finishes",
                    "status": "included",
                    "items": [
                        {"item": "Floor Tile", "quantity": 45.7, "unit": "SF", "subdivisionCode": "09 30 00"},
                        {"item": "Wall Paint", "quantity": 200, "unit": "SF", "subdivisionCode": "09 91 00"}
                    ]
                },
                "div22_plumbing": {
                    "code": "22",
                    "name": "Plumbing",
                    "status": "included",
                    "items": [
                        {"item": "Toilet", "quantity": 1, "unit": "EA", "subdivisionCode": "22 41 00"}
                    ]
                }
            }
        },
        "location_output": {
            "locationFactor": 1.0,
            "zipCode": "78745"
        }
    }

    try:
        firestore = FirestoreService()
        agent = ScopeAgent(firestore_service=firestore)

        result = await agent.run(
            estimate_id="test-logging-002",
            input_data=input_data
        )

        print("\n" + "#" * 80)
        print("# SCOPE AGENT RESULT")
        print("#" * 80)
        print(f"Total Line Items: {result.get('totalLineItems')}")
        print(f"Total Divisions: {result.get('totalIncludedDivisions')}")
        print(f"Summary: {result.get('summary', '')[:200]}...")

        return True

    except Exception as e:
        print(f"\nError running scope agent: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("TESTING LLM LOGGING FOR DEEP AGENTS")
    print("=" * 80)

    # Test location agent
    loc_ok = await test_location_agent()

    # Test scope agent
    scope_ok = await test_scope_agent()

    print("\n" + "=" * 80)
    print("TEST RESULTS")
    print("=" * 80)
    print(f"Location Agent: {'PASS' if loc_ok else 'FAIL'}")
    print(f"Scope Agent: {'PASS' if scope_ok else 'FAIL'}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
