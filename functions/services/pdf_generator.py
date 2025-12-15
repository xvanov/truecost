"""
PDF Report Generation Service for TrueCost.

Generates professional PDF estimate reports using WeasyPrint and Jinja2 templates.
Reports include Executive Summary, Cost Breakdown, Bill of Quantities, Labor Analysis,
Schedule, Risk Analysis, Assumptions, and CAD Plan sections.

Architecture:
- Uses Jinja2 for HTML template rendering
- Uses WeasyPrint for HTML to PDF conversion
- Uploads to Firebase Storage for persistence
- Supports section filtering and client-ready mode

References:
- docs/sprint-artifacts/tech-spec-epic-4.md (Story 4.3)
- docs/architecture.md (ADR-006: WeasyPrint + Jinja2)
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import asyncio
import time
import io
import os
import base64

import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape

# Configure structlog logger
logger = structlog.get_logger(__name__)

# Template directory
TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

# Assets directory
ASSETS_DIR = Path(__file__).parent.parent / "assets"


def _load_logo_base64() -> str:
    """
    Load logo image as base64 string for embedding in PDF.
    
    Returns:
        Base64-encoded PNG string, or empty string if not found
    """
    logo_path = ASSETS_DIR / "logo.png"
    if logo_path.exists():
        with open(logo_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    logger.warning("logo_not_found", path=str(logo_path))
    return ""


def _parse_square_footage(value) -> float:
    """
    Parse square footage from various formats to a float.
    
    Handles:
    - Numbers (int/float): returns as-is
    - Strings like "0 sq ft", "1500", "1,500 sq ft": extracts numeric value
    - Empty/None: returns 0
    
    Returns:
        Square footage as a float, defaulting to 0 if unparseable
    """
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove common suffixes and extract number
        import re
        # Remove "sq ft", "sqft", "sf" etc and commas
        cleaned = re.sub(r'[,\s]*(sq\.?\s*ft\.?|sqft|sf)\s*$', '', value, flags=re.IGNORECASE)
        cleaned = cleaned.replace(',', '').strip()
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0


# Available sections for PDF generation
ALL_SECTIONS = [
    "executive_summary",
    "cost_breakdown",
    "boq",
    "labor_analysis",
    "schedule",
    "risk_analysis",
    "assumptions",
    "cad_plan",
]

# Client-ready mode only includes these sections
# Excludes: boq (exposes unit costs/markup), labor_analysis (exposes rates/burden),
# schedule (internal planning), risk_analysis (contingency is internal), cad_plan
CLIENT_SECTIONS = [
    "executive_summary",
    "cost_breakdown",
    "assumptions",
]


# =============================================================================
# Data Models (Story 4.3 - Task 3)
# =============================================================================


@dataclass
class PDFGenerationRequest:
    """
    Request parameters for PDF generation.

    Attributes:
        estimate_id: Firestore estimate document ID
        sections: Optional list of sections to include (None = all sections)
        client_ready: If True, generate simplified client version (no internal notes)
    """

    estimate_id: str
    sections: Optional[List[str]] = None
    client_ready: bool = False

    def get_sections(self) -> List[str]:
        """Return sections to include, defaulting to all sections or client sections."""
        if self.client_ready:
            # Client-ready mode uses restricted section list
            if self.sections is None:
                return CLIENT_SECTIONS.copy()
            # Only allow sections that are in CLIENT_SECTIONS
            return [s for s in self.sections if s in CLIENT_SECTIONS]
        else:
            # Contractor mode allows all sections
            if self.sections is None:
                return ALL_SECTIONS.copy()
            return [s for s in self.sections if s in ALL_SECTIONS]


@dataclass
class PDFGenerationResult:
    """
    Result of PDF generation.

    Attributes:
        pdf_url: Firebase Storage download URL
        storage_path: gs://bucket/pdfs/{estimateId}/estimate.pdf
        page_count: Number of pages in the generated PDF
        file_size_bytes: Size of the PDF file in bytes
        generated_at: ISO timestamp when the PDF was generated
    """

    pdf_url: str
    storage_path: str
    page_count: int
    file_size_bytes: int
    generated_at: str


# =============================================================================
# Template Engine Setup
# =============================================================================


def _get_jinja_env() -> Environment:
    """
    Create and configure Jinja2 environment.

    Returns:
        Configured Jinja2 Environment
    """
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    return env


# =============================================================================
# Data Loading (Firestore)
# =============================================================================


async def _load_estimate_data(estimate_id: str) -> Dict[str, Any]:
    """
    Load estimate data from Firestore.

    Args:
        estimate_id: Firestore document ID

    Returns:
        Dictionary containing all estimate data

    Note:
        In production, loads from Firestore at /estimates/{estimate_id}.
        For development/testing, returns mock data if Firebase is unavailable.
    """
    try:
        from firebase_admin import firestore

        db = firestore.client()
        doc_ref = db.collection("estimates").document(estimate_id)
        doc = doc_ref.get()

        if not doc.exists:
            logger.warning("estimate_not_found", estimate_id=estimate_id)
            return {}

        return doc.to_dict()
    except ImportError:
        logger.warning(
            "firestore_unavailable",
            message="firebase_admin not installed, using mock data",
        )
        return {}
    except Exception as e:
        logger.error(
            "estimate_load_failed",
            estimate_id=estimate_id,
            error=str(e),
        )
        return {}


async def _load_related_data(estimate_id: str) -> Dict[str, Any]:
    """
    Load related data from Firestore subcollections.

    Args:
        estimate_id: Firestore document ID

    Returns:
        Dictionary with costEstimate, riskAnalysis, billOfQuantities, cadData
    """
    related = {
        "cost_estimate": {},
        "risk_analysis": {},
        "bill_of_quantities": {},
        "cad_data": None,
    }

    try:
        from firebase_admin import firestore

        db = firestore.client()
        base_ref = db.collection("estimates").document(estimate_id)

        # Load subcollections
        for subcoll in ["agentOutputs"]:
            subcoll_ref = base_ref.collection(subcoll)
            docs = subcoll_ref.stream()
            for doc in docs:
                data = doc.to_dict()
                if doc.id == "costEstimate":
                    related["cost_estimate"] = data
                elif doc.id == "riskAnalysis":
                    related["risk_analysis"] = data
                elif doc.id == "billOfQuantities":
                    related["bill_of_quantities"] = data
                elif doc.id == "cadData":
                    related["cad_data"] = data

    except ImportError:
        logger.warning(
            "firestore_unavailable",
            message="firebase_admin not installed, using empty related data",
        )
    except Exception as e:
        logger.error(
            "related_data_load_failed",
            estimate_id=estimate_id,
            error=str(e),
        )

    return related


# =============================================================================
# PDF Generation
# =============================================================================


def _render_html(
    estimate_data: Dict[str, Any],
    related_data: Dict[str, Any],
    sections: List[str],
    client_ready: bool,
    estimate_id: str,
) -> str:
    """
    Render HTML from Jinja2 template with estimate data.

    Args:
        estimate_data: Main estimate document data
        related_data: Related data from subcollections
        sections: List of sections to include
        client_ready: Whether to hide internal notes
        estimate_id: Estimate ID for reference

    Returns:
        Rendered HTML string
    """
    env = _get_jinja_env()
    template = env.get_template("estimate_report.html")

    # Load logo for embedding
    logo_base64 = _load_logo_base64()

    # Build template context
    context = {
        "estimate_id": estimate_id,
        "report_date": datetime.now().strftime("%B %d, %Y"),
        "sections": sections,
        "client_ready": client_ready,
        "logo_base64": logo_base64,
        # Project information
        "project": {
            "name": estimate_data.get("projectName", "Construction Project"),
            "address": estimate_data.get("address", "Address not specified"),
            "type": estimate_data.get("projectType", "Residential"),
            "scope": estimate_data.get("scope", ""),
            "square_footage": _parse_square_footage(estimate_data.get("squareFootage", 0)),
        },
        # Estimate summary
        "estimate": {
            "total_cost": estimate_data.get("totalCost", 0),
            "p50": estimate_data.get("p50", estimate_data.get("totalCost", 0)),
            "p80": estimate_data.get("p80", estimate_data.get("totalCost", 0) * 1.1),
            "p90": estimate_data.get("p90", estimate_data.get("totalCost", 0) * 1.15),
            "contingency_pct": estimate_data.get("contingencyPct", 10),
            "timeline_weeks": estimate_data.get("timelineWeeks", 6),
            "monte_carlo_iterations": estimate_data.get("monteCarloIterations", 1000),
            "cost_drivers": estimate_data.get("costDrivers", []),
            "timeline_summary": estimate_data.get("timelineSummary", []),
            "internal_notes": estimate_data.get("internalNotes", ""),
        },
        # Section-specific data
        "cost_breakdown": related_data.get("cost_estimate", {}),
        "bill_of_quantities": related_data.get("bill_of_quantities", {}),
        "labor_analysis": estimate_data.get("laborAnalysis", {}),
        "schedule": estimate_data.get("schedule", {}),
        "risk_analysis": related_data.get("risk_analysis", {}),
        "assumptions": estimate_data.get("assumptions", {}),
        "cad_data": related_data.get("cad_data"),
    }

    return template.render(**context)


def _html_to_pdf(html_content: str) -> bytes:
    """
    Convert HTML to PDF using WeasyPrint.

    Args:
        html_content: Rendered HTML string

    Returns:
        PDF content as bytes
    """
    from weasyprint import HTML, CSS
    from weasyprint.text.fonts import FontConfiguration

    font_config = FontConfiguration()

    # Create HTML document
    html_doc = HTML(string=html_content, base_url=str(TEMPLATE_DIR))

    # Generate PDF
    pdf_bytes = html_doc.write_pdf(font_config=font_config)

    return pdf_bytes


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    """
    Count the number of pages in a PDF.

    Args:
        pdf_bytes: PDF content as bytes

    Returns:
        Number of pages
    """
    # Simple page count by looking for /Type /Page patterns
    # This is a rough estimate; for production, use PyPDF2 or similar
    content = pdf_bytes.decode("latin-1", errors="ignore")
    return content.count("/Type /Page") - content.count("/Type /Pages")


async def _upload_to_storage(
    pdf_bytes: bytes,
    estimate_id: str,
    client_ready: bool,
) -> tuple[str, str]:
    """
    Upload PDF to Firebase Storage.

    Args:
        pdf_bytes: PDF content as bytes
        estimate_id: Estimate ID for path
        client_ready: Whether this is client-ready version

    Returns:
        Tuple of (download_url, storage_path)
    """
    suffix = "_client" if client_ready else ""
    storage_path = f"pdfs/{estimate_id}/estimate{suffix}.pdf"

    try:
        from firebase_admin import storage

        bucket = storage.bucket()
        blob = bucket.blob(storage_path)

        # Upload PDF
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")

        # Generate signed URL (1 hour expiration)
        download_url = blob.generate_signed_url(
            version="v4",
            expiration=3600,
            method="GET",
        )

        logger.info(
            "storage_upload",
            path=storage_path,
            size=len(pdf_bytes),
        )

        return download_url, f"gs://{bucket.name}/{storage_path}"

    except ImportError:
        logger.warning(
            "storage_unavailable",
            message="firebase_admin not installed, returning mock URL",
        )
        return f"file://./sample_estimate{suffix}.pdf", f"local://{storage_path}"
    except Exception as e:
        logger.error(
            "storage_upload_failed",
            path=storage_path,
            error=str(e),
        )
        raise


# =============================================================================
# Main Service Function (Story 4.3 - Task 2)
# =============================================================================


async def generate_pdf(
    estimate_id: str,
    sections: Optional[List[str]] = None,
    client_ready: bool = False,
) -> PDFGenerationResult:
    """
    Generate professional PDF estimate report.

    Implements AC 4.3.1 through AC 4.3.12:
    - AC 4.3.1-4.3.8: Section rendering (via templates)
    - AC 4.3.9: Performance < 10 seconds
    - AC 4.3.10: Firebase Storage upload with URL
    - AC 4.3.11: Section filtering
    - AC 4.3.12: Client-ready mode

    Args:
        estimate_id: Firestore estimate document ID
        sections: Optional list of sections to include (None = all)
        client_ready: If True, generate simplified client version

    Returns:
        PDFGenerationResult with Storage URL and metadata

    Example:
        >>> result = await generate_pdf("est_123", client_ready=True)
        >>> result.pdf_url
        'https://storage.googleapis.com/...'
    """
    start_time = time.perf_counter()

    # Validate and resolve sections
    request = PDFGenerationRequest(
        estimate_id=estimate_id,
        sections=sections,
        client_ready=client_ready,
    )
    resolved_sections = request.get_sections()

    logger.info(
        "pdf_generation_started",
        estimate_id=estimate_id,
        sections=resolved_sections,
        client_ready=client_ready,
    )

    try:
        # Load estimate data from Firestore
        estimate_data = await _load_estimate_data(estimate_id)
        related_data = await _load_related_data(estimate_id)

        # Render HTML
        html_content = _render_html(
            estimate_data=estimate_data,
            related_data=related_data,
            sections=resolved_sections,
            client_ready=client_ready,
            estimate_id=estimate_id,
        )

        # Convert to PDF
        pdf_bytes = _html_to_pdf(html_content)

        # Count pages
        page_count = _count_pdf_pages(pdf_bytes)
        if page_count < 1:
            page_count = 12  # Default estimate

        # Upload to Storage
        pdf_url, storage_path = await _upload_to_storage(
            pdf_bytes=pdf_bytes,
            estimate_id=estimate_id,
            client_ready=client_ready,
        )

        # Calculate metrics
        duration_ms = (time.perf_counter() - start_time) * 1000
        file_size_bytes = len(pdf_bytes)
        generated_at = datetime.now().isoformat()

        # Log success (Task 4)
        logger.info(
            "pdf_generated",
            estimate_id=estimate_id,
            page_count=page_count,
            file_size_kb=round(file_size_bytes / 1024, 2),
            duration_ms=round(duration_ms, 2),
            sections_count=len(resolved_sections),
            client_ready=client_ready,
        )

        return PDFGenerationResult(
            pdf_url=pdf_url,
            storage_path=storage_path,
            page_count=page_count,
            file_size_bytes=file_size_bytes,
            generated_at=generated_at,
        )

    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Log error (Task 4)
        logger.error(
            "pdf_generation_error",
            estimate_id=estimate_id,
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=round(duration_ms, 2),
        )
        raise


# =============================================================================
# Local PDF Generation (for testing/demo without Firebase)
# =============================================================================


def generate_pdf_local(
    estimate_data: Dict[str, Any],
    output_path: str,
    sections: Optional[List[str]] = None,
    client_ready: bool = False,
) -> PDFGenerationResult:
    """
    Generate PDF locally without Firebase, saving to local file.

    This is useful for testing and demo purposes.

    Args:
        estimate_data: Dictionary containing all estimate data
        output_path: Local file path to save PDF
        sections: Optional list of sections to include
        client_ready: If True, generate simplified client version

    Returns:
        PDFGenerationResult with local file path
    """
    start_time = time.perf_counter()

    # Resolve sections - use CLIENT_SECTIONS for client-ready mode
    if client_ready:
        if sections is None:
            resolved_sections = CLIENT_SECTIONS.copy()
        else:
            resolved_sections = [s for s in sections if s in CLIENT_SECTIONS]
    else:
        if sections is None:
            resolved_sections = ALL_SECTIONS.copy()
        else:
            resolved_sections = [s for s in sections if s in ALL_SECTIONS]

    estimate_id = estimate_data.get("estimate_id", "demo")

    logger.info(
        "pdf_generation_started_local",
        output_path=output_path,
        sections=resolved_sections,
        client_ready=client_ready,
    )

    try:
        # Extract related data from estimate_data if present
        related_data = {
            "cost_estimate": estimate_data.get("cost_breakdown", {}),
            "risk_analysis": estimate_data.get("risk_analysis", {}),
            "bill_of_quantities": estimate_data.get("bill_of_quantities", {}),
            "cad_data": estimate_data.get("cad_data"),
        }

        # Render HTML
        html_content = _render_html(
            estimate_data=estimate_data,
            related_data=related_data,
            sections=resolved_sections,
            client_ready=client_ready,
            estimate_id=estimate_id,
        )

        # Convert to PDF
        pdf_bytes = _html_to_pdf(html_content)

        # Save to local file
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_bytes(pdf_bytes)

        # Count pages
        page_count = _count_pdf_pages(pdf_bytes)
        if page_count < 1:
            page_count = 12

        # Calculate metrics
        duration_ms = (time.perf_counter() - start_time) * 1000
        file_size_bytes = len(pdf_bytes)
        generated_at = datetime.now().isoformat()

        logger.info(
            "pdf_generated_local",
            output_path=output_path,
            page_count=page_count,
            file_size_kb=round(file_size_bytes / 1024, 2),
            duration_ms=round(duration_ms, 2),
        )

        return PDFGenerationResult(
            pdf_url=f"file://{output_file.absolute()}",
            storage_path=str(output_file.absolute()),
            page_count=page_count,
            file_size_bytes=file_size_bytes,
            generated_at=generated_at,
        )

    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000

        logger.error(
            "pdf_generation_error_local",
            output_path=output_path,
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=round(duration_ms, 2),
        )
        raise


# =============================================================================
# Utility Functions
# =============================================================================


def get_available_sections() -> List[str]:
    """Return list of all available PDF sections."""
    return ALL_SECTIONS.copy()


def validate_sections(sections: List[str]) -> List[str]:
    """
    Validate and filter sections list.

    Args:
        sections: List of section names to validate

    Returns:
        List of valid section names
    """
    return [s for s in sections if s in ALL_SECTIONS]
