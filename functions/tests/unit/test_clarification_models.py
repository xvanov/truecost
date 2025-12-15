"""Tests for ClarificationOutput models.

These tests verify that valid JSON can be parsed into typed models.
"""

import json
from pathlib import Path

import pytest

from models.clarification_output import ClarificationOutput
from validators.clarification_validator import parse_clarification_output


# Path to fixtures
FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def load_fixture(filename: str) -> dict:
    """Load a JSON fixture file."""
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


class TestClarificationOutputParsing:
    """Test parsing ClarificationOutput from JSON."""

    def test_parse_kitchen_remodel(self):
        """Test parsing kitchen remodel example."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        assert isinstance(result, ClarificationOutput)
        assert result.estimateId == "est_abc123"
        assert result.schemaVersion == "3.0.0"
        assert result.projectBrief.projectType.value == "kitchen_remodel"
        assert result.projectBrief.location.zipCode == "80202"
        assert result.projectBrief.location.city == "Denver"

    def test_parse_bathroom_remodel(self):
        """Test parsing bathroom remodel example."""
        data = load_fixture("clarification_output_bathroom.json")
        result = parse_clarification_output(data)

        assert isinstance(result, ClarificationOutput)
        assert result.estimateId == "est_bath456"
        assert result.projectBrief.projectType.value == "bathroom_remodel"
        assert result.projectBrief.location.zipCode == "80205"
        assert result.cadData.bathroomSpecific is not None

    def test_access_csi_divisions(self):
        """Test accessing CSI divisions from parsed data."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        # Access specific division
        div06 = result.csiScope.div06_wood_plastics_composites
        assert div06.code == "06"
        assert div06.status.value == "included"
        assert len(div06.items) > 0

        # Access excluded division
        div03 = result.csiScope.div03_concrete
        assert div03.status.value == "excluded"
        assert div03.exclusionReason is not None

    def test_access_cad_data(self):
        """Test accessing CAD data from parsed data."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        assert result.cadData.fileUrl is not None
        assert result.cadData.spaceModel.totalSqft == 196
        assert len(result.cadData.spaceModel.rooms) > 0
        assert result.cadData.kitchenSpecific is not None
        assert result.cadData.kitchenSpecific.workTriangle.triangleValid is True

    def test_access_location(self):
        """Test accessing location data."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        location = result.projectBrief.location
        assert location.fullAddress == "1847 Blake Street, Unit 302, Denver, CO 80202"
        assert location.city == "Denver"
        assert location.state == "CO"
        assert location.zipCode == "80202"

    def test_get_all_divisions(self):
        """Test getting all CSI divisions as a list."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        divisions = result.csiScope.get_all_divisions()
        assert len(divisions) == 24  # All 24 CSI divisions

    def test_get_division_by_code(self):
        """Test getting a specific division by code."""
        data = load_fixture("clarification_output_kitchen.json")
        result = parse_clarification_output(data)

        div22 = result.csiScope.get_division_by_code("22")
        assert div22 is not None
        assert div22.name == "Plumbing"




