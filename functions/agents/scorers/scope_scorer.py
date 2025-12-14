"""Scope Scorer for TrueCost.

Objective scoring of Scope Agent output to determine quality.
Score >= 80 means PASS, score < 80 triggers critic.
"""

from typing import Dict, Any, List, Optional
import structlog

from agents.scorers.base_scorer import BaseScorer
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


# =============================================================================
# SCORING CONSTANTS
# =============================================================================

# Minimum expected line items by project type
MIN_LINE_ITEMS_BY_PROJECT: Dict[str, int] = {
    "kitchen_remodel": 15,
    "bathroom_remodel": 10,
    "bedroom_remodel": 8,
    "living_room_remodel": 8,
    "basement_finish": 15,
    "attic_conversion": 15,
    "whole_house_remodel": 30,
    "addition": 25,
    "deck_patio": 8,
    "garage": 10,
}

# Minimum included divisions by project type
MIN_DIVISIONS_BY_PROJECT: Dict[str, int] = {
    "kitchen_remodel": 5,
    "bathroom_remodel": 4,
    "bedroom_remodel": 3,
    "living_room_remodel": 3,
    "basement_finish": 5,
    "attic_conversion": 5,
    "whole_house_remodel": 8,
    "addition": 7,
    "deck_patio": 3,
    "garage": 4,
}

# Valid confidence range
MIN_CONFIDENCE = 0.5
MAX_CONFIDENCE = 1.0

# Valid cost code coverage threshold
MIN_COST_CODE_COVERAGE = 0.90


# =============================================================================
# SCOPE SCORER CLASS
# =============================================================================


class ScopeScorer(BaseScorer):
    """Scorer for Scope Agent output.
    
    Evaluates Bill of Quantities for:
    - Cost code coverage (all items have codes)
    - Quantity completeness
    - Division coverage for project type
    - Unit consistency
    - Estimate reasonableness
    - Analysis quality
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize ScopeScorer."""
        super().__init__(
            name="scope_scorer",
            primary_agent_name="scope",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
    
    def get_scoring_criteria(self) -> List[Dict[str, Any]]:
        """Get scoring criteria for scope output.
        
        Returns:
            List of scoring criteria with weights.
        """
        return [
            {
                "name": "cost_code_coverage",
                "description": "All line items have cost codes assigned",
                "weight": 3
            },
            {
                "name": "quantity_completeness",
                "description": "All items have valid quantities",
                "weight": 2
            },
            {
                "name": "division_coverage",
                "description": "Required divisions for project type are present",
                "weight": 2
            },
            {
                "name": "line_item_count",
                "description": "Sufficient line items for project scope",
                "weight": 2
            },
            {
                "name": "estimate_reasonableness",
                "description": "Preliminary estimates are reasonable",
                "weight": 2
            },
            {
                "name": "analysis_quality",
                "description": "Analysis is substantive and complete",
                "weight": 1
            },
            {
                "name": "data_confidence",
                "description": "Overall confidence is reasonable",
                "weight": 1
            }
        ]
    
    async def evaluate_criterion(
        self,
        criterion: Dict[str, Any],
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate a single criterion.
        
        Args:
            criterion: The criterion to evaluate.
            output: Scope agent output.
            input_data: Original input data.
            
        Returns:
            Dict with score (0-100) and feedback.
        """
        name = criterion.get("name")
        
        if name == "cost_code_coverage":
            return self._check_cost_code_coverage(output)
        elif name == "quantity_completeness":
            return self._check_quantity_completeness(output)
        elif name == "division_coverage":
            return self._check_division_coverage(output, input_data)
        elif name == "line_item_count":
            return self._check_line_item_count(output, input_data)
        elif name == "estimate_reasonableness":
            return self._check_estimate_reasonableness(output, input_data)
        elif name == "analysis_quality":
            return self._check_analysis_quality(output)
        elif name == "data_confidence":
            return self._check_confidence(output)
        
        return {"score": 50, "feedback": "Unknown criterion"}
    
    def _check_cost_code_coverage(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check cost code coverage.
        
        Args:
            output: Scope agent output.
            
        Returns:
            Score and feedback.
        """
        completeness = output.get("completeness", {})
        coverage = completeness.get("costCodeCoverage", 0)
        all_have_codes = completeness.get("allItemsHaveCostCodes", False)
        
        if all_have_codes or coverage >= 0.99:
            return {
                "score": 100,
                "feedback": f"Excellent: All items have cost codes assigned ({coverage:.0%} coverage)"
            }
        elif coverage >= MIN_COST_CODE_COVERAGE:
            return {
                "score": 85,
                "feedback": f"Good: {coverage:.0%} of items have cost codes"
            }
        elif coverage >= 0.75:
            return {
                "score": 65,
                "feedback": f"Fair: {coverage:.0%} cost code coverage - some items missing codes"
            }
        elif coverage >= 0.5:
            return {
                "score": 45,
                "feedback": f"Poor: Only {coverage:.0%} cost code coverage"
            }
        else:
            return {
                "score": 20,
                "feedback": f"Critical: Very low cost code coverage ({coverage:.0%})"
            }
    
    def _check_quantity_completeness(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check quantity completeness.
        
        Args:
            output: Scope agent output.
            
        Returns:
            Score and feedback.
        """
        completeness = output.get("completeness", {})
        all_have_quantities = completeness.get("allItemsHaveQuantities", False)
        validation_coverage = completeness.get("quantityValidationCoverage", 0)
        
        # Check divisions for zero quantities
        divisions = output.get("divisions", [])
        zero_qty_items = 0
        total_items = 0
        
        for div in divisions:
            if div.get("status") == "included":
                items = div.get("lineItems", [])
                total_items += len(items)
                for item in items:
                    if item.get("quantity", 0) <= 0:
                        zero_qty_items += 1
        
        if all_have_quantities and zero_qty_items == 0:
            return {
                "score": 100,
                "feedback": "All items have valid quantities"
            }
        elif zero_qty_items == 0:
            return {
                "score": 90,
                "feedback": "All items have quantities, validation incomplete"
            }
        elif zero_qty_items <= 2:
            return {
                "score": 70,
                "feedback": f"{zero_qty_items} items have zero or missing quantities"
            }
        elif zero_qty_items <= 5:
            return {
                "score": 50,
                "feedback": f"{zero_qty_items} items missing quantities"
            }
        else:
            return {
                "score": 30,
                "feedback": f"Critical: {zero_qty_items} of {total_items} items missing quantities"
            }
    
    def _check_division_coverage(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check division coverage for project type.
        
        Args:
            output: Scope agent output.
            input_data: Original input data.
            
        Returns:
            Score and feedback.
        """
        # Get project type
        clarification = input_data.get("clarification_output", {})
        project_brief = clarification.get("projectBrief", {})
        project_type = project_brief.get("projectType", "other")
        
        # Get expected divisions
        min_divisions = MIN_DIVISIONS_BY_PROJECT.get(project_type, 4)
        
        # Count included divisions
        total_included = output.get("totalIncludedDivisions", 0)
        completeness = output.get("completeness", {})
        all_present = completeness.get("allRequiredDivisionsPresent", False)
        
        if all_present and total_included >= min_divisions:
            return {
                "score": 100,
                "feedback": f"Excellent: All {total_included} expected divisions present for {project_type}"
            }
        elif total_included >= min_divisions:
            return {
                "score": 85,
                "feedback": f"Good: {total_included} divisions included (min {min_divisions} expected)"
            }
        elif total_included >= min_divisions * 0.75:
            return {
                "score": 65,
                "feedback": f"Fair: {total_included} divisions (expected {min_divisions} for {project_type})"
            }
        elif total_included >= min_divisions * 0.5:
            return {
                "score": 45,
                "feedback": f"Low: Only {total_included} divisions (need {min_divisions})"
            }
        else:
            return {
                "score": 25,
                "feedback": f"Critical: Only {total_included} divisions included"
            }
    
    def _check_line_item_count(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check line item count is reasonable for project.
        
        Args:
            output: Scope agent output.
            input_data: Original input data.
            
        Returns:
            Score and feedback.
        """
        # Get project type
        clarification = input_data.get("clarification_output", {})
        project_brief = clarification.get("projectBrief", {})
        project_type = project_brief.get("projectType", "other")
        
        # Get expected minimum
        min_items = MIN_LINE_ITEMS_BY_PROJECT.get(project_type, 10)
        
        # Count actual items
        total_items = output.get("totalLineItems", 0)
        
        if total_items >= min_items * 1.2:
            return {
                "score": 100,
                "feedback": f"Comprehensive: {total_items} line items (exceeds {min_items} minimum)"
            }
        elif total_items >= min_items:
            return {
                "score": 90,
                "feedback": f"Good: {total_items} line items (minimum {min_items})"
            }
        elif total_items >= min_items * 0.75:
            return {
                "score": 70,
                "feedback": f"Adequate: {total_items} items, slightly below {min_items} expected"
            }
        elif total_items >= min_items * 0.5:
            return {
                "score": 50,
                "feedback": f"Low: Only {total_items} items (need {min_items})"
            }
        elif total_items > 0:
            return {
                "score": 30,
                "feedback": f"Very low: Only {total_items} items for {project_type}"
            }
        else:
            return {
                "score": 0,
                "feedback": "Critical: No line items in Bill of Quantities"
            }
    
    def _check_estimate_reasonableness(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check that preliminary estimates are reasonable.
        
        Args:
            output: Scope agent output.
            input_data: Original input data.
            
        Returns:
            Score and feedback.
        """
        # Get total sqft and estimates
        clarification = input_data.get("clarification_output", {})
        project_brief = clarification.get("projectBrief", {})
        scope_summary = project_brief.get("scopeSummary", {})
        total_sqft = scope_summary.get("totalSqft", 100)
        finish_level = scope_summary.get("finishLevel", "mid_range")
        
        material_cost = output.get("preliminaryMaterialCost", 0)
        labor_hours = output.get("preliminaryLaborHours", 0)
        
        if total_sqft <= 0:
            total_sqft = 100  # Default
        
        # Calculate cost per sqft (rough check)
        cost_per_sqft = material_cost / total_sqft if total_sqft > 0 else 0
        hours_per_sqft = labor_hours / total_sqft if total_sqft > 0 else 0
        
        # Expected ranges by finish level
        expected_ranges = {
            "budget": (30, 100),
            "mid_range": (60, 200),
            "high_end": (100, 350),
            "luxury": (200, 500)
        }
        
        min_cost, max_cost = expected_ranges.get(finish_level, (50, 200))
        
        issues = []
        
        # Check material cost reasonableness
        if material_cost <= 0:
            issues.append("No material costs calculated")
        elif cost_per_sqft < min_cost * 0.5:
            issues.append(f"Material costs very low (${cost_per_sqft:.0f}/sqft)")
        elif cost_per_sqft > max_cost * 1.5:
            issues.append(f"Material costs very high (${cost_per_sqft:.0f}/sqft)")
        
        # Check labor hours reasonableness
        if labor_hours <= 0:
            issues.append("No labor hours calculated")
        elif hours_per_sqft < 0.1:
            issues.append(f"Labor hours very low ({hours_per_sqft:.2f} hrs/sqft)")
        elif hours_per_sqft > 2.0:
            issues.append(f"Labor hours very high ({hours_per_sqft:.2f} hrs/sqft)")
        
        if not issues:
            return {
                "score": 100,
                "feedback": f"Estimates reasonable: ${cost_per_sqft:.0f}/sqft material, {hours_per_sqft:.2f} hrs/sqft labor"
            }
        elif len(issues) == 1:
            return {
                "score": 70,
                "feedback": f"Minor issue: {issues[0]}"
            }
        else:
            return {
                "score": 40,
                "feedback": f"Issues: {'; '.join(issues)}"
            }
    
    def _check_analysis_quality(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check quality of scope analysis.
        
        Args:
            output: Scope agent output.
            
        Returns:
            Score and feedback.
        """
        analysis = output.get("analysis", {})
        summary = analysis.get("summary", "") or output.get("summary", "")
        key_observations = analysis.get("keyObservations", [])
        recommendations = analysis.get("recommendations", [])
        material_highlights = analysis.get("materialHighlights", [])
        
        score = 0
        
        # Summary present and substantive (30 points)
        if summary:
            word_count = len(summary.split())
            if word_count >= 30:
                score += 30
            elif word_count >= 15:
                score += 20
            else:
                score += 10
        
        # Key observations (25 points)
        if key_observations and len(key_observations) >= 3:
            score += 25
        elif key_observations and len(key_observations) >= 2:
            score += 15
        elif key_observations:
            score += 8
        
        # Recommendations (25 points)
        if recommendations and len(recommendations) >= 2:
            score += 25
        elif recommendations:
            score += 12
        
        # Material highlights (20 points)
        if material_highlights and len(material_highlights) >= 2:
            score += 20
        elif material_highlights:
            score += 10
        
        if score >= 80:
            feedback = f"Analysis comprehensive: {len(key_observations)} observations, {len(recommendations)} recommendations"
        elif score >= 50:
            feedback = "Analysis present but could be more detailed"
        else:
            feedback = "Analysis incomplete or minimal"
        
        return {"score": score, "feedback": feedback}
    
    def _check_confidence(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check overall confidence score.
        
        Args:
            output: Scope agent output.
            
        Returns:
            Score and feedback.
        """
        confidence = output.get("confidence")
        
        if confidence is None:
            return {"score": 50, "feedback": "Confidence score missing"}
        
        if not isinstance(confidence, (int, float)):
            return {"score": 30, "feedback": f"Invalid confidence type: {type(confidence)}"}
        
        if not (0 <= confidence <= 1):
            return {"score": 40, "feedback": f"Confidence out of range: {confidence}"}
        
        if confidence >= 0.85:
            return {"score": 100, "feedback": f"High confidence: {confidence:.0%}"}
        elif confidence >= 0.7:
            return {"score": 85, "feedback": f"Good confidence: {confidence:.0%}"}
        elif confidence >= 0.5:
            return {"score": 70, "feedback": f"Moderate confidence: {confidence:.0%}"}
        else:
            return {"score": 50, "feedback": f"Low confidence: {confidence:.0%} - verification recommended"}
