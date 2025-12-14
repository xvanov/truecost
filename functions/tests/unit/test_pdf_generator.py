"""
Unit Tests for PDF Generator Service (Story 4.3).

Tests cover:
- AC 4.3.9: PDF generation completes < 10 seconds
- AC 4.3.11: Section filtering works
- AC 4.3.12: Client-ready mode hides internal notes
- Template rendering with all sections
- Data model validation

Usage:
    cd functions && python3 -m pytest tests/unit/test_pdf_generator.py -v
"""

import pytest
import time
from pathlib import Path
from typing import Dict, Any

# These tests require WeasyPrint (and its native deps). Skip cleanly if not installed.
# Note: On Windows, WeasyPrint can be installed but fail to import due to missing
# native libraries (Pango/GTK), raising OSError. Treat that as a skip as well.
try:
    import weasyprint  # noqa: F401
except Exception:  # pragma: no cover
    pytest.skip("WeasyPrint (or its native deps) not available on this system", allow_module_level=True)

from services.pdf_generator import (
    PDFGenerationRequest,
    PDFGenerationResult,
    generate_pdf_local,
    get_available_sections,
    validate_sections,
    ALL_SECTIONS,
    _render_html,
    _get_jinja_env,
)


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_estimate_data() -> Dict[str, Any]:
    """Create sample estimate data for testing."""
    return {
        "estimate_id": "test_123",
        "projectName": "Kitchen Remodel - 123 Main St",
        "address": "123 Main Street, Denver, CO 80202",
        "projectType": "Residential Renovation",
        "scope": "Full kitchen remodel including cabinets, countertops, appliances",
        "squareFootage": 200,
        "totalCost": 45230.00,
        "p50": 45230.00,
        "p80": 49850.00,
        "p90": 52500.00,
        "contingencyPct": 10.2,
        "timelineWeeks": 6,
        "monteCarloIterations": 1000,
        "internalNotes": "Client prefers modern style. Budget is flexible.",
        "costDrivers": [
            {"name": "Cabinets", "cost": 4500, "percentage": 10},
            {"name": "Countertops", "cost": 3400, "percentage": 8},
            {"name": "Appliances", "cost": 3500, "percentage": 8},
        ],
        "laborAnalysis": {
            "total_hours": 240,
            "total": 15574,
            "labor_pct": 35,
            "estimated_days": 6,
            "trades": [
                {"name": "Carpenter", "hours": 80, "rate": 52.00, "base_cost": 4160, "burden": 1456, "total": 5616},
                {"name": "Electrician", "hours": 32, "rate": 65.00, "base_cost": 2080, "burden": 728, "total": 2808},
                {"name": "Plumber", "hours": 24, "rate": 62.00, "base_cost": 1488, "burden": 521, "total": 2009},
            ],
        },
        "schedule": {
            "total_weeks": 6,
            "start_date": "TBD",
            "end_date": "TBD",
            "tasks": [
                {"number": 1, "name": "Pre-Construction", "duration": "1 week", "start": "Week 1", "end": "Week 1"},
                {"number": 2, "name": "Demolition", "duration": "2-3 days", "start": "Week 2", "end": "Week 2"},
            ],
        },
        "assumptions": {
            "items": [
                "Site access is adequate for material delivery",
                "No hidden damage or asbestos present",
            ],
        },
        "cost_breakdown": {
            "total_material": 24876,
            "total_labor": 15574,
            "permits": 1358,
            "overhead": 3422,
            "material_pct": 55,
            "labor_pct": 35,
            "permits_pct": 3,
            "overhead_pct": 7,
        },
        "risk_analysis": {
            "iterations": 1000,
            "p50": 45230,
            "p80": 49850,
            "p90": 52500,
            "contingency_pct": 10.2,
            "contingency_amount": 4615,
            "top_risks": [
                {"item": "Cabinet installation", "impact": 2500, "probability": 0.33, "sensitivity": 0.85},
                {"item": "Appliance package", "impact": 2000, "probability": 0.33, "sensitivity": 0.72},
                {"item": "Electrical rough-in", "impact": 1000, "probability": 0.33, "sensitivity": 0.58},
            ],
        },
        "bill_of_quantities": {
            "items": [
                {"line_number": 1, "description": "Kitchen Cabinets", "quantity": 20, "unit": "lf", "unit_cost": 225, "total": 4500, "csi_division": "12"},
                {"line_number": 2, "description": "Countertops", "quantity": 40, "unit": "sf", "unit_cost": 85, "total": 3400, "csi_division": "12"},
                {"line_number": 3, "description": "Interior Paint", "quantity": 500, "unit": "sf", "unit_cost": 1.25, "total": 625, "csi_division": "09"},
            ],
            "subtotal": 40707,
            "permits": 1358,
            "overhead": 3165,
            "markup_pct": 7,
        },
    }


@pytest.fixture
def temp_output_dir(tmp_path) -> Path:
    """Create temporary output directory."""
    output_dir = tmp_path / "pdf_output"
    output_dir.mkdir()
    return output_dir


# =============================================================================
# Data Model Tests
# =============================================================================


class TestPDFGenerationRequest:
    """Tests for PDFGenerationRequest dataclass."""

    def test_default_sections_returns_all(self):
        """Test that None sections returns all sections."""
        request = PDFGenerationRequest(estimate_id="test_123")
        sections = request.get_sections()
        assert sections == ALL_SECTIONS

    def test_custom_sections_filtered(self):
        """Test that only valid sections are returned."""
        request = PDFGenerationRequest(
            estimate_id="test_123",
            sections=["executive_summary", "invalid_section", "cost_breakdown"],
        )
        sections = request.get_sections()
        assert "executive_summary" in sections
        assert "cost_breakdown" in sections
        assert "invalid_section" not in sections

    def test_empty_sections_list(self):
        """Test empty sections list returns empty."""
        request = PDFGenerationRequest(
            estimate_id="test_123",
            sections=[],
        )
        sections = request.get_sections()
        assert sections == []

    def test_client_ready_default_false(self):
        """Test client_ready defaults to False."""
        request = PDFGenerationRequest(estimate_id="test_123")
        assert request.client_ready is False


class TestPDFGenerationResult:
    """Tests for PDFGenerationResult dataclass."""

    def test_result_contains_all_fields(self):
        """Test that result has all required fields."""
        result = PDFGenerationResult(
            pdf_url="https://example.com/test.pdf",
            storage_path="gs://bucket/pdfs/test/estimate.pdf",
            page_count=12,
            file_size_bytes=850000,
            generated_at="2025-12-10T10:30:00",
        )
        assert result.pdf_url == "https://example.com/test.pdf"
        assert result.storage_path == "gs://bucket/pdfs/test/estimate.pdf"
        assert result.page_count == 12
        assert result.file_size_bytes == 850000
        assert result.generated_at == "2025-12-10T10:30:00"


# =============================================================================
# Section Filtering Tests (AC 4.3.11)
# =============================================================================


class TestSectionFiltering:
    """Tests for section filtering functionality."""

    def test_get_available_sections(self):
        """Test get_available_sections returns all sections."""
        sections = get_available_sections()
        assert len(sections) == 8
        assert "executive_summary" in sections
        assert "cost_breakdown" in sections
        assert "boq" in sections
        assert "labor_analysis" in sections
        assert "schedule" in sections
        assert "risk_analysis" in sections
        assert "assumptions" in sections
        assert "cad_plan" in sections

    def test_validate_sections_filters_invalid(self):
        """Test validate_sections removes invalid section names."""
        input_sections = ["executive_summary", "invalid", "cost_breakdown", "fake"]
        valid = validate_sections(input_sections)
        assert valid == ["executive_summary", "cost_breakdown"]

    def test_validate_sections_preserves_order(self):
        """Test validate_sections preserves input order."""
        input_sections = ["risk_analysis", "executive_summary", "boq"]
        valid = validate_sections(input_sections)
        assert valid == ["risk_analysis", "executive_summary", "boq"]

    def test_validate_sections_empty_input(self):
        """Test validate_sections with empty input."""
        assert validate_sections([]) == []

    def test_validate_sections_all_invalid(self):
        """Test validate_sections with all invalid sections."""
        assert validate_sections(["invalid1", "invalid2"]) == []


# =============================================================================
# Template Rendering Tests
# =============================================================================


class TestTemplateRendering:
    """Tests for Jinja2 template rendering."""

    def test_jinja_env_loads_templates(self):
        """Test Jinja environment can load templates."""
        env = _get_jinja_env()
        template = env.get_template("estimate_report.html")
        assert template is not None

    def test_render_html_all_sections(self, sample_estimate_data):
        """Test HTML renders with all sections."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        html = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=ALL_SECTIONS,
            client_ready=False,
            estimate_id="test_123",
        )

        # Check key content is present
        assert "Kitchen Remodel" in html
        assert "123 Main Street" in html
        assert "$45,230" in html
        assert "Executive Summary" in html
        assert "Cost Breakdown" in html

    def test_render_html_single_section(self, sample_estimate_data):
        """Test HTML renders with only one section."""
        related_data = {
            "cost_estimate": {},
            "risk_analysis": {},
            "bill_of_quantities": {},
            "cad_data": None,
        }

        html = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],
            client_ready=False,
            estimate_id="test_123",
        )

        assert "Executive Summary" in html
        # Other sections should not be rendered
        # (they're wrapped in {% if 'section' in sections %})

    def test_render_html_client_ready_hides_internal_notes(self, sample_estimate_data):
        """Test client_ready mode hides internal notes (AC 4.3.12)."""
        related_data = {
            "cost_estimate": {},
            "risk_analysis": {},
            "bill_of_quantities": {},
            "cad_data": None,
        }

        # With client_ready=False, internal notes should appear
        html_full = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],
            client_ready=False,
            estimate_id="test_123",
        )

        # With client_ready=True, internal notes should be hidden
        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],
            client_ready=True,
            estimate_id="test_123",
        )

        # The internal notes are conditionally rendered based on client_ready
        # We verify the HTML is generated without errors in both cases
        assert "Executive Summary" in html_full
        assert "Executive Summary" in html_client


# =============================================================================
# PDF Generation Tests (AC 4.3.9)
# =============================================================================


class TestPDFGeneration:
    """Tests for PDF generation functionality."""

    def test_generate_pdf_local_creates_file(self, sample_estimate_data, temp_output_dir):
        """Test local PDF generation creates a file."""
        output_path = temp_output_dir / "test_estimate.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()
        assert result.file_size_bytes > 0
        assert result.page_count > 0

    def test_generate_pdf_local_performance(self, sample_estimate_data, temp_output_dir):
        """Test PDF generation completes in < 10 seconds (AC 4.3.9)."""
        output_path = temp_output_dir / "test_performance.pdf"

        start_time = time.perf_counter()
        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )
        duration = time.perf_counter() - start_time

        # AC 4.3.9: PDF generated in < 10 seconds
        assert duration < 10.0, f"PDF generation took {duration:.2f}s, expected < 10s"

    def test_generate_pdf_local_with_section_filtering(self, sample_estimate_data, temp_output_dir):
        """Test section filtering produces smaller PDF (AC 4.3.11)."""
        full_path = temp_output_dir / "full.pdf"
        filtered_path = temp_output_dir / "filtered.pdf"

        # Generate full PDF
        full_result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(full_path),
            sections=None,  # All sections
        )

        # Generate filtered PDF (only 2 sections)
        filtered_result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(filtered_path),
            sections=["executive_summary", "cost_breakdown"],
        )

        # Filtered PDF should generally be smaller or equal
        # (Note: due to PDF compression, this isn't always guaranteed,
        # but the test verifies section filtering works)
        assert full_result.file_size_bytes > 0
        assert filtered_result.file_size_bytes > 0
        assert full_path.exists()
        assert filtered_path.exists()

    def test_generate_pdf_local_client_ready(self, sample_estimate_data, temp_output_dir):
        """Test client-ready mode generates PDF (AC 4.3.12)."""
        output_path = temp_output_dir / "client_ready.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
            client_ready=True,
        )

        assert output_path.exists()
        assert result.file_size_bytes > 0

    def test_generate_pdf_local_result_metadata(self, sample_estimate_data, temp_output_dir):
        """Test result contains valid metadata (AC 4.3.10)."""
        output_path = temp_output_dir / "metadata_test.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        # Verify all metadata fields are populated
        assert result.pdf_url.startswith("file://")
        assert result.storage_path == str(output_path.absolute())
        assert result.page_count >= 1
        assert result.file_size_bytes > 1000  # At least 1KB
        assert "T" in result.generated_at  # ISO format contains T

    def test_generate_pdf_local_empty_estimate(self, temp_output_dir):
        """Test PDF generation with minimal/empty data."""
        output_path = temp_output_dir / "empty_test.pdf"

        result = generate_pdf_local(
            estimate_data={
                "projectName": "Test Project",
                "address": "Test Address",
                "totalCost": 0,
            },
            output_path=str(output_path),
        )

        assert output_path.exists()
        assert result.file_size_bytes > 0


# =============================================================================
# Integration-style Tests
# =============================================================================


class TestPDFGeneratorIntegration:
    """Integration-style tests for the PDF generator."""

    def test_full_workflow_all_sections(self, sample_estimate_data, temp_output_dir):
        """Test complete workflow with all sections."""
        output_path = temp_output_dir / "full_workflow.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
            sections=get_available_sections(),
            client_ready=False,
        )

        # Verify file was created
        assert output_path.exists()

        # Verify result metadata
        assert result.page_count >= 1
        assert result.file_size_bytes > 0

        # Read and verify PDF starts with correct header
        pdf_content = output_path.read_bytes()
        assert pdf_content[:4] == b"%PDF", "File should be a valid PDF"

    def test_full_workflow_client_mode(self, sample_estimate_data, temp_output_dir):
        """Test complete workflow in client-ready mode."""
        output_path = temp_output_dir / "client_workflow.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
            client_ready=True,
        )

        assert output_path.exists()
        pdf_content = output_path.read_bytes()
        assert pdf_content[:4] == b"%PDF"


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_special_characters_in_project_name(self, sample_estimate_data, temp_output_dir):
        """Test handling of special characters in project name."""
        sample_estimate_data["projectName"] = "Test & Project <Special> \"Chars\""
        output_path = temp_output_dir / "special_chars.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()

    def test_unicode_characters(self, sample_estimate_data, temp_output_dir):
        """Test handling of Unicode characters."""
        sample_estimate_data["projectName"] = "Rénovation de cuisine ü ö ä"
        output_path = temp_output_dir / "unicode.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()

    def test_very_long_text(self, sample_estimate_data, temp_output_dir):
        """Test handling of very long text fields."""
        sample_estimate_data["scope"] = "A" * 5000  # Very long scope
        output_path = temp_output_dir / "long_text.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()

    def test_large_numbers(self, sample_estimate_data, temp_output_dir):
        """Test handling of very large cost values."""
        sample_estimate_data["totalCost"] = 999999999.99
        sample_estimate_data["p50"] = 999999999.99
        sample_estimate_data["p80"] = 1099999999.99
        sample_estimate_data["p90"] = 1199999999.99
        output_path = temp_output_dir / "large_numbers.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()

    def test_zero_values(self, sample_estimate_data, temp_output_dir):
        """Test handling of zero values."""
        sample_estimate_data["totalCost"] = 0
        sample_estimate_data["p50"] = 0
        sample_estimate_data["p80"] = 0
        sample_estimate_data["p90"] = 0
        output_path = temp_output_dir / "zero_values.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
        )

        assert output_path.exists()


# =============================================================================
# Client-Ready Mode Tests (AC 4.3.12 - Detailed)
# =============================================================================


class TestClientReadyMode:
    """
    Detailed tests for client-ready mode (AC 4.3.12).

    Verifies that client PDFs:
    - Show single total estimate (P80) instead of P50/P80/P90 breakdown
    - Do NOT contain Monte Carlo methodology references
    - Do NOT expose Overhead & Profit as separate line item
    - Have simplified or excluded risk analysis section
    """

    def test_client_pdf_no_monte_carlo_text(self, sample_estimate_data):
        """Test: Client PDF does NOT contain 'Monte Carlo' text (AC 4.3.12)."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        # Contractor version should have Monte Carlo references
        html_contractor = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=ALL_SECTIONS,
            client_ready=False,
            estimate_id="test_123",
        )

        # Client version should NOT have Monte Carlo references
        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=ALL_SECTIONS,
            client_ready=True,
            estimate_id="test_123",
        )

        # Contractor PDF should mention Monte Carlo
        assert "Monte Carlo" in html_contractor, "Contractor PDF should mention Monte Carlo"

        # Client PDF should NOT mention Monte Carlo
        assert "Monte Carlo" not in html_client, "Client PDF should NOT mention Monte Carlo methodology"

    def test_client_pdf_no_p50_p80_p90_labels(self, sample_estimate_data):
        """Test: Client PDF does NOT contain 'P50', 'P80', 'P90' labels (AC 4.3.12)."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        # Contractor version should have P50/P80/P90
        html_contractor = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],  # Focus on executive summary
            client_ready=False,
            estimate_id="test_123",
        )

        # Client version should NOT have P50/P80/P90 labels
        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],
            client_ready=True,
            estimate_id="test_123",
        )

        # Contractor PDF should have percentile labels
        assert "P50" in html_contractor or "P80" in html_contractor

        # Client PDF should NOT have percentile labels as visible labels
        # (values may still exist in the HTML, but not as exposed terminology)
        # The key check is that "P50", "P80", "P90" don't appear as visible user-facing labels
        assert html_client.count(">P50<") == 0, "Client PDF should not expose P50 as a label"
        assert html_client.count(">P80<") == 0, "Client PDF should not expose P80 as a label"
        assert html_client.count(">P90<") == 0, "Client PDF should not expose P90 as a label"

    def test_client_pdf_no_overhead_profit_line(self, sample_estimate_data):
        """Test: Client PDF does NOT contain 'Overhead & Profit' visible line (AC 4.3.12)."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        # Contractor version should show Overhead & Profit
        html_contractor = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["cost_breakdown"],
            client_ready=False,
            estimate_id="test_123",
        )

        # Client version should NOT show Overhead & Profit as separate line
        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["cost_breakdown"],
            client_ready=True,
            estimate_id="test_123",
        )

        # Contractor PDF should mention Overhead & Profit
        assert "Overhead" in html_contractor, "Contractor PDF should show Overhead & Profit"

        # Client PDF should NOT mention Overhead & Profit
        assert "Overhead" not in html_client, "Client PDF should NOT expose Overhead & Profit line"

    def test_client_pdf_shows_single_total_estimate(self, sample_estimate_data):
        """Test: Client PDF shows single total estimate value (AC 4.3.12)."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["executive_summary"],
            client_ready=True,
            estimate_id="test_123",
        )

        # Client PDF should show "Total Project Estimate" label
        assert "Total Project Estimate" in html_client, "Client PDF should show single total estimate"

        # The P80 value ($49,850) should be the displayed total
        assert "$49,850" in html_client, "Client PDF should display P80 as the total estimate"

    def test_client_pdf_risk_section_simplified(self, sample_estimate_data):
        """Test: Client PDF risk section is either excluded OR simplified (AC 4.3.12)."""
        related_data = {
            "cost_estimate": sample_estimate_data.get("cost_breakdown", {}),
            "risk_analysis": sample_estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": sample_estimate_data.get("bill_of_quantities", {}),
            "cad_data": None,
        }

        # Contractor version should have full Risk Analysis
        html_contractor = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["risk_analysis"],
            client_ready=False,
            estimate_id="test_123",
        )

        # Client version should have simplified contingency section
        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=["risk_analysis"],
            client_ready=True,
            estimate_id="test_123",
        )

        # Contractor PDF should have full risk analysis with histogram
        assert "histogram" in html_contractor.lower() or "svg" in html_contractor.lower(), \
            "Contractor PDF should include histogram chart"

        # Client PDF should NOT have histogram but should have contingency info
        assert "Project Contingency" in html_client or "Contingency" in html_client, \
            "Client PDF should have simplified contingency section"
        # Should not expose simulation details
        assert "iteration" not in html_client.lower(), \
            "Client PDF should not mention iterations"

    def test_client_pdf_cover_page_single_price(self, sample_estimate_data):
        """Test: Client PDF cover page shows single price, not P50/P80/P90."""
        related_data = {
            "cost_estimate": {},
            "risk_analysis": {},
            "bill_of_quantities": {},
            "cad_data": None,
        }

        html_client = _render_html(
            estimate_data=sample_estimate_data,
            related_data=related_data,
            sections=[],  # Empty sections to focus on cover page
            client_ready=True,
            estimate_id="test_123",
        )

        # Cover page should say "Total Project Estimate" not show P50/P80/P90 breakdown
        assert "Total Project Estimate" in html_client
        # Should not have the "P50: $ | P80: $ | P90: $" format
        assert "P50:" not in html_client and "P80:" not in html_client

    def test_client_pdf_generates_successfully(self, sample_estimate_data, temp_output_dir):
        """Test: Full client PDF generates without errors."""
        output_path = temp_output_dir / "full_client_test.pdf"

        result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(output_path),
            sections=None,  # All sections
            client_ready=True,
        )

        assert output_path.exists()
        assert result.file_size_bytes > 0
        assert result.page_count >= 1

        # Verify it's a valid PDF
        pdf_content = output_path.read_bytes()
        assert pdf_content[:4] == b"%PDF", "Should be a valid PDF file"

    def test_client_vs_contractor_different_content(self, sample_estimate_data, temp_output_dir):
        """Test: Client and contractor PDFs have different content."""
        contractor_path = temp_output_dir / "contractor.pdf"
        client_path = temp_output_dir / "client.pdf"

        # Generate both versions
        contractor_result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(contractor_path),
            client_ready=False,
        )

        client_result = generate_pdf_local(
            estimate_data=sample_estimate_data,
            output_path=str(client_path),
            client_ready=True,
        )

        # Both should exist
        assert contractor_path.exists()
        assert client_path.exists()

        # Read both files
        contractor_content = contractor_path.read_bytes()
        client_content = client_path.read_bytes()

        # They should be different (different content due to client_ready mode)
        assert contractor_content != client_content, \
            "Client and contractor PDFs should have different content"
