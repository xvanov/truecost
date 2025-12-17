"""ClarificationOutput v3.0.0 parsing and validation.

Validation is handled by Dev 3 (Clarification Agent).
This module deserializes JSON into typed Pydantic models and validates the schema.

LENIENT MODE: For development/testing, validation is permissive to allow
different frontend formats to pass through. Strict validation can be enabled
by setting STRICT_VALIDATION = True.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List

from pydantic import ValidationError as PydanticValidationError
import structlog

from models.clarification_output import ClarificationOutput

logger = structlog.get_logger(__name__)

# Set to True to enforce strict Pydantic validation
STRICT_VALIDATION = False


@dataclass
class ValidationResult:
    """Result of ClarificationOutput validation."""
    is_valid: bool = True
    errors: List[str] = field(default_factory=list)
    parsed: ClarificationOutput = None
    raw_data: Dict[str, Any] = None  # Keep raw data for lenient mode


def parse_clarification_output(data: Dict[str, Any]) -> ClarificationOutput:
    """Parse raw JSON into a typed ClarificationOutput object.

    Args:
        data: Raw dictionary from Clarification Agent

    Returns:
        Typed ClarificationOutput object
    """
    return ClarificationOutput.model_validate(data)


def validate_clarification_output(data: Dict[str, Any]) -> ValidationResult:
    """Validate ClarificationOutput schema and return result.

    In LENIENT mode (default for development):
    - Only requires minimal fields (estimateId or projectBrief)
    - Allows extra fields from different frontend formats
    - Logs warnings but doesn't fail

    In STRICT mode:
    - Full Pydantic validation against ClarificationOutput schema

    Args:
        data: Raw dictionary from Clarification Agent

    Returns:
        ValidationResult with is_valid, errors, and parsed object
    """
    if STRICT_VALIDATION:
        # Strict mode: full Pydantic validation
        try:
            parsed = ClarificationOutput.model_validate(data)
            return ValidationResult(is_valid=True, errors=[], parsed=parsed, raw_data=data)
        except PydanticValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            return ValidationResult(is_valid=False, errors=errors, parsed=None, raw_data=data)
        except Exception as e:
            return ValidationResult(is_valid=False, errors=[str(e)], parsed=None, raw_data=data)
    else:
        # Lenient mode: minimal validation for development
        errors = []

        # Check it's a dict
        if not isinstance(data, dict):
            return ValidationResult(
                is_valid=False,
                errors=["clarificationOutput must be a dictionary"],
                parsed=None,
                raw_data=data
            )

        # Check for minimal required fields
        has_estimate_id = bool(data.get("estimateId"))
        has_project_brief = bool(data.get("projectBrief"))
        has_csi_scope = bool(data.get("csiScope"))

        if not has_estimate_id and not has_project_brief:
            errors.append("Missing both estimateId and projectBrief - at least one required")

        if errors:
            logger.warning(
                "lenient_validation_failed",
                errors=errors,
                keys=list(data.keys())
            )
            return ValidationResult(is_valid=False, errors=errors, parsed=None, raw_data=data)

        # Try to parse, but don't fail if it doesn't match exactly
        try:
            parsed = ClarificationOutput.model_validate(data)
            logger.info("lenient_validation_passed_strict", has_csi_scope=has_csi_scope)
        except Exception as e:
            # Log warning but continue with raw data
            logger.warning(
                "lenient_validation_pydantic_skipped",
                error=str(e)[:200],
                keys=list(data.keys()),
                has_csi_scope=has_csi_scope
            )
            parsed = None

        return ValidationResult(is_valid=True, errors=[], parsed=parsed, raw_data=data)
