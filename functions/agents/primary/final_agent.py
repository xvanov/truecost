"""Final Agent for TrueCost.

Synthesizes all previous agent outputs into a comprehensive
final estimate with executive summary.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from models.final_estimate import (
    ConfidenceRange,
    CostBreakdownSummary,
    EstimateConfidence,
    ExecutiveSummary,
    FinalEstimate,
    ProjectComplexity,
    Recommendation,
    RiskSummaryForEstimate,
    TimelineSummaryForEstimate,
)

logger = structlog.get_logger()


# =============================================================================
# FINAL AGENT SYSTEM PROMPT
# =============================================================================


FINAL_AGENT_SYSTEM_PROMPT = """You are a senior construction estimator preparing a final estimate report.

Your role is to synthesize all analysis into actionable recommendations:

## Analysis Focus
1. Review cost, risk, and timeline data for consistency
2. Identify opportunities for cost savings
3. Recommend value engineering options
4. Highlight key decision points for the client
5. Provide clear next steps

## Output Requirements
Provide analysis in this JSON format:
{
    "executive_insights": ["key insight 1", "key insight 2"],
    "recommendations": [
        {
            "category": "cost|schedule|risk",
            "title": "Brief title",
            "description": "Detailed recommendation",
            "priority": "high|medium|low",
            "potential_savings": 0
        }
    ],
    "value_engineering_options": ["option 1", "option 2"],
    "key_assumptions": ["assumption 1", "assumption 2"],
    "exclusions": ["exclusion 1", "exclusion 2"],
    "next_steps": ["step 1", "step 2"]
}

## Best Practices
- Present total cost prominently with confidence range
- Explain what contingency covers
- Recommend payment milestones aligned with schedule
- Highlight any unusual risks or costs
- Provide clear disclaimers about estimate accuracy
"""


# Standard disclaimers
STANDARD_DISCLAIMERS = [
    "This estimate is based on information provided and current market conditions. "
    "Actual costs may vary based on final specifications and unforeseen conditions.",
    "Pricing is valid for 30 days from estimate date.",
    "This estimate assumes normal site access and working conditions.",
    "All work to be performed in compliance with local building codes and permits.",
    "Client-requested changes during construction may affect cost and schedule."
]


class FinalAgent(BaseA2AAgent):
    """Final Agent - synthesizes final estimate with executive summary.
    
    Aggregates outputs from all previous agents:
    - Location factors
    - Scope (Bill of Quantities)
    - Cost estimate with P50/P80/P90
    - Risk analysis and contingency
    - Timeline with milestones
    
    Produces comprehensive estimate report.
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize FinalAgent."""
        super().__init__(
            name="final",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
    
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run final synthesis.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing all previous agent outputs.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Final estimate with executive summary.
        """
        self._start_time = time.time()
        
        logger.info(
            "final_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Extract all previous outputs
        clarification = input_data.get("clarification_output", {})
        location_output = input_data.get("location_output", {})
        scope_output = input_data.get("scope_output", {})
        code_compliance_output = input_data.get("code_compliance_output", {})
        cost_output = input_data.get("cost_output", {})
        risk_output = input_data.get("risk_output", {})
        timeline_output = input_data.get("timeline_output", {})
        
        logger.info(
            "final_agent_inputs",
            estimate_id=estimate_id,
            has_location=bool(location_output),
            has_scope=bool(scope_output),
            has_cost=bool(cost_output),
            has_risk=bool(risk_output),
            has_timeline=bool(timeline_output)
        )
        
        # Extract project info
        project_brief = clarification.get("projectBrief", {})
        location = project_brief.get("location", {})
        scope_summary = project_brief.get("scopeSummary", {})
        
        # Build cost breakdown
        cost_breakdown = self._build_cost_breakdown(cost_output, risk_output, clarification)
        
        # Build confidence range from risk analysis
        confidence_range = self._build_confidence_range(risk_output, cost_output)
        
        # Build executive summary
        executive_summary = self._build_executive_summary(
            project_brief=project_brief,
            location=location,
            scope_summary=scope_summary,
            cost_breakdown=cost_breakdown,
            confidence_range=confidence_range,
            timeline_output=timeline_output
        )
        
        # Build timeline summary
        timeline_summary = self._build_timeline_summary(timeline_output)
        
        # Build risk summary
        risk_summary = self._build_risk_summary(risk_output)
        
        # Get LLM recommendations
        llm_analysis = await self._get_llm_analysis(
            project_brief=project_brief,
            cost_breakdown=cost_breakdown,
            risk_output=risk_output,
            timeline_output=timeline_output
        )
        
        # Build recommendations
        recommendations = self._build_recommendations(llm_analysis)
        
        # Calculate data quality
        data_completeness = self._calculate_data_completeness(
            location_output, scope_output, cost_output, risk_output, timeline_output
        )
        
        # Determine overall confidence
        estimate_confidence = self._determine_confidence_level(
            data_completeness=data_completeness,
            risk_level=risk_output.get("riskLevel", "medium"),
            cost_confidence=cost_output.get("confidence", 0.75)
        )
        
        # Build final estimate
        final_estimate = FinalEstimate(
            estimate_id=estimate_id,
            executive_summary=executive_summary,
            cost_breakdown=cost_breakdown,
            timeline_summary=timeline_summary,
            risk_summary=risk_summary,
            recommendations=recommendations,
            key_assumptions=llm_analysis.get("key_assumptions", [
                "Standard working hours (no overtime)",
                "Materials at current market prices",
                "Normal site access and conditions",
                "Permits approved within standard timeframe"
            ]),
            exclusions=llm_analysis.get("exclusions", [
                "Furniture and decor",
                "Landscaping",
                "Financing costs",
                "Owner's contingency"
            ]),
            disclaimers=STANDARD_DISCLAIMERS[:3],
            data_completeness=data_completeness,
            cost_data_quality="high" if data_completeness > 0.8 else "medium",
            summary_headline=self._generate_headline(
                executive_summary, timeline_summary
            )
        )
        
        # Convert to output format
        output = final_estimate.to_agent_output()

        # Attach ICC code compliance warnings (informational; depends on AHJ/local amendments).
        if code_compliance_output:
            output["codeCompliance"] = {
                "codeSystem": code_compliance_output.get("codeSystem", "ICC"),
                "jurisdiction": code_compliance_output.get("jurisdiction", {}),
                "warnings": code_compliance_output.get("warnings", []),
                "disclaimer": code_compliance_output.get("disclaimer", ""),
            }
        else:
            output["codeCompliance"] = {
                "codeSystem": "ICC",
                "jurisdiction": {},
                "warnings": [],
                "disclaimer": (
                    "Code compliance warnings were not available for this estimate. "
                    "Final requirements depend on local amendments and the authority having jurisdiction (AHJ)."
                ),
            }
        
        # Add status update flag
        output["estimateComplete"] = True

        # Load granular cost ledger (written by CostAgent) and attach lightweight metadata.
        # We keep the full list in a subcollection to avoid Firestore document size limits.
        cost_items = await self.firestore.list_cost_items(estimate_id)
        output["granularCostItems"] = {
            "count": len(cost_items),
            "collectionPath": f"/estimates/{estimate_id}/costItems",
            "sample": cost_items[:25],
            "sampleTruncated": len(cost_items) > 25
        }
        
        # Build Dev4 integration payload and persist to root estimate
        integration_payload = self._build_integration_payload(
            estimate_id,
            clarification,
            scope_output,
            cost_output,
            risk_output,
            timeline_output,
            cost_items=cost_items
        )
        try:
            await self.firestore.update_estimate(estimate_id, integration_payload)
        except Exception as e:
            logger.warning("integration_payload_update_failed", estimate_id=estimate_id, error=str(e))
        
        # Calculate overall confidence
        confidence = min(0.95, data_completeness + 0.1)
        
        # Save output to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=final_estimate.summary_headline,
            confidence=confidence,
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "final_agent_completed",
            estimate_id=estimate_id,
            total_cost=executive_summary.total_cost,
            duration_days=executive_summary.duration_days,
            confidence=estimate_confidence.value,
            duration_ms=self.duration_ms
        )
        
        return output
    
    def _build_cost_breakdown(
        self,
        cost_output: Dict[str, Any],
        risk_output: Dict[str, Any],
        clarification: Dict[str, Any],
    ) -> CostBreakdownSummary:
        """Build cost breakdown summary.
        
        Args:
            cost_output: Cost Agent output.
            risk_output: Risk Agent output.
            
        Returns:
            CostBreakdownSummary object.
        """
        subtotals = cost_output.get("subtotals", {})
        adjustments = cost_output.get("adjustments", {})
        
        # Extract material costs (P50 values)
        materials = subtotals.get("materials", {})
        if isinstance(materials, dict):
            material_cost = materials.get("low", 0)
        else:
            material_cost = float(materials) if materials else 0
        
        labor = subtotals.get("labor", {})
        if isinstance(labor, dict):
            labor_cost = labor.get("low", 0)
        else:
            labor_cost = float(labor) if labor else 0
        
        equipment = subtotals.get("equipment", {})
        if isinstance(equipment, dict):
            equipment_cost = equipment.get("low", 0)
        else:
            equipment_cost = float(equipment) if equipment else 0
        
        # Calculate direct costs subtotal
        direct_costs = material_cost + labor_cost + equipment_cost
        
        # Get overhead and profit
        overhead = adjustments.get("overhead", {})
        if isinstance(overhead, dict):
            overhead_amount = overhead.get("low", 0)
        else:
            overhead_amount = float(overhead) if overhead else 0
        
        profit = adjustments.get("profit", {})
        if isinstance(profit, dict):
            profit_amount = profit.get("low", 0)
        else:
            profit_amount = float(profit) if profit else 0
        
        # Contingency:
        # Prefer user-selected contingency (from scope definition) if present in the input JSON.
        # Otherwise, fall back to risk agent recommendation.
        user_contingency_pct = None
        try:
            prefs = None
            pb = clarification.get("projectBrief") if isinstance(clarification, dict) else None
            if isinstance(pb, dict):
                prefs = pb.get("costPreferences")
            if not prefs and isinstance(clarification, dict):
                prefs = clarification.get("costPreferences")
            if isinstance(prefs, dict):
                raw = prefs.get("contingencyPct", prefs.get("contingency_pct"))
                if raw is not None:
                    user_contingency_pct = float(raw)
                    if user_contingency_pct > 1.0 and user_contingency_pct <= 100.0:
                        user_contingency_pct = user_contingency_pct / 100.0
                    if user_contingency_pct < 0:
                        user_contingency_pct = None
                    if user_contingency_pct is not None and user_contingency_pct > 1.0:
                        user_contingency_pct = 1.0
        except Exception:
            user_contingency_pct = None

        contingency_info = risk_output.get("contingency", {})
        if user_contingency_pct is not None:
            contingency_pct = user_contingency_pct * 100.0
            contingency_amount = 0.0  # computed after total_before_contingency is known
        else:
            # Do not invent contingency if RiskAgent could not compute it.
            if isinstance(contingency_info, dict) and "recommended" in contingency_info:
                contingency_pct = contingency_info.get("recommended")
            else:
                contingency_pct = 0
            if isinstance(contingency_info, dict) and "dollarAmount" in contingency_info:
                contingency_amount = contingency_info.get("dollarAmount", 0)
            else:
                contingency_amount = 0
        
        # Get permits
        permits = adjustments.get("permitCosts", {})
        if isinstance(permits, dict):
            permit_cost = permits.get("low", 0)
        else:
            permit_cost = float(permits) if permits else 0
        
        # Get taxes
        tax = adjustments.get("tax", {})
        if isinstance(tax, dict):
            tax_amount = tax.get("low", 0)
        else:
            tax_amount = float(tax) if tax else 0
        
        # Calculate totals
        total_before_contingency = (
            direct_costs + overhead_amount + profit_amount + permit_cost + tax_amount
        )
        if user_contingency_pct is not None:
            contingency_amount = total_before_contingency * user_contingency_pct
        total_with_contingency = total_before_contingency + contingency_amount
        
        return CostBreakdownSummary(
            materials=round(material_cost, 2),
            labor=round(labor_cost, 2),
            equipment=round(equipment_cost, 2),
            direct_costs_subtotal=round(direct_costs, 2),
            overhead=round(overhead_amount, 2),
            profit=round(profit_amount, 2),
            contingency=round(contingency_amount, 2),
            contingency_percentage=contingency_pct,
            permits=round(permit_cost, 2),
            taxes=round(tax_amount, 2),
            total_before_contingency=round(total_before_contingency, 2),
            total_with_contingency=round(total_with_contingency, 2)
        )
    
    def _build_confidence_range(
        self,
        risk_output: Dict[str, Any],
        cost_output: Dict[str, Any]
    ) -> ConfidenceRange:
        """Build confidence range from Monte Carlo results.
        
        Args:
            risk_output: Risk Agent output.
            cost_output: Cost Agent output.
            
        Returns:
            ConfidenceRange object.
        """
        mc = risk_output.get("monteCarlo", {})
        
        p50 = mc.get("p50", 0)
        p80 = mc.get("p80", 0)
        p90 = mc.get("p90", 0)
        
        # Fallback to cost output if risk not available
        if not p50:
            total = cost_output.get("total", {})
            if isinstance(total, dict):
                p50 = total.get("low", 0)
                p80 = total.get("medium", p50 * 1.15)
                p90 = total.get("high", p50 * 1.25)
            else:
                p50 = float(total) if total else 0
                p80 = p50 * 1.15
                p90 = p50 * 1.25
        
        # Calculate spread percentage
        spread_pct = ((p90 - p50) / p50 * 100) if p50 > 0 else 0
        
        return ConfidenceRange(
            p50=round(p50, 2),
            p80=round(p80, 2),
            p90=round(p90, 2),
            likely_range_low=round(p50, 2),
            likely_range_high=round(p90, 2),
            range_spread_percentage=round(spread_pct, 1)
        )
    
    def _build_executive_summary(
        self,
        project_brief: Dict[str, Any],
        location: Dict[str, Any],
        scope_summary: Dict[str, Any],
        cost_breakdown: CostBreakdownSummary,
        confidence_range: ConfidenceRange,
        timeline_output: Dict[str, Any]
    ) -> ExecutiveSummary:
        """Build executive summary.
        
        Args:
            project_brief: Project brief from clarification.
            location: Location info.
            scope_summary: Scope summary.
            cost_breakdown: Cost breakdown.
            confidence_range: Confidence range.
            timeline_output: Timeline output.
            
        Returns:
            ExecutiveSummary object.
        """
        project_type = project_brief.get("projectType", "renovation")
        city = location.get("city", "Unknown")
        state = location.get("state", "XX")
        sqft = scope_summary.get("totalSqft", 0)
        finish_level = scope_summary.get("finishLevel", "mid-range")
        
        # Get timeline info
        duration_days = timeline_output.get("totalDuration", 30)
        start_date = timeline_output.get("startDate", "")
        end_date = timeline_output.get("endDate", "")
        
        # Calculate cost per sqft
        cost_per_sqft = (
            cost_breakdown.total_with_contingency / sqft
            if sqft > 0 else 0
        )
        
        return ExecutiveSummary(
            project_type=project_type,
            project_location=f"{city}, {state}",
            project_size_sqft=sqft,
            finish_level=finish_level,
            total_cost=cost_breakdown.total_with_contingency,
            base_cost=cost_breakdown.total_before_contingency,
            contingency_amount=cost_breakdown.contingency,
            contingency_percentage=cost_breakdown.contingency_percentage,
            cost_per_sqft=round(cost_per_sqft, 2),
            confidence_range=confidence_range,
            duration_days=duration_days,
            duration_weeks=round(duration_days / 5, 1),  # Working days to weeks
            start_date=start_date,
            end_date=end_date,
            estimate_confidence=EstimateConfidence.MEDIUM,
            project_complexity=ProjectComplexity.MODERATE
        )
    
    def _build_timeline_summary(
        self,
        timeline_output: Dict[str, Any]
    ) -> TimelineSummaryForEstimate:
        """Build timeline summary for estimate.
        
        Args:
            timeline_output: Timeline Agent output.
            
        Returns:
            TimelineSummaryForEstimate object.
        """
        milestones = timeline_output.get("milestones", [])
        key_milestones = [
            {"name": m.get("name", ""), "date": m.get("date", "")}
            for m in milestones[:4]
        ]
        
        duration_range = timeline_output.get("durationRange", {})
        
        return TimelineSummaryForEstimate(
            total_duration_days=timeline_output.get("totalDuration", 30),
            total_weeks=round(timeline_output.get("totalDuration", 30) / 5, 1),
            start_date=timeline_output.get("startDate", ""),
            end_date=timeline_output.get("endDate", ""),
            key_milestones=key_milestones,
            duration_optimistic=duration_range.get("optimistic", 0),
            duration_pessimistic=duration_range.get("pessimistic", 0)
        )
    
    def _build_risk_summary(
        self,
        risk_output: Dict[str, Any]
    ) -> RiskSummaryForEstimate:
        """Build risk summary for estimate.
        
        Args:
            risk_output: Risk Agent output.
            
        Returns:
            RiskSummaryForEstimate object.
        """
        top_risks = risk_output.get("topRisks", [])
        risk_names = [r.get("item", r.get("name", "")) for r in top_risks[:5]]
        
        contingency = risk_output.get("contingency", {})
        
        recommendations = risk_output.get("recommendations", [])
        mitigation = [
            r.get("action", str(r)) if isinstance(r, dict) else str(r)
            for r in recommendations[:3]
        ]
        
        return RiskSummaryForEstimate(
            risk_level=risk_output.get("riskLevel", "Medium"),
            top_risks=risk_names,
            contingency_rationale=contingency.get("rationale", "Based on P80 confidence level"),
            mitigation_strategies=mitigation
        )
    
    async def _get_llm_analysis(
        self,
        project_brief: Dict[str, Any],
        cost_breakdown: CostBreakdownSummary,
        risk_output: Dict[str, Any],
        timeline_output: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get LLM analysis for recommendations.
        
        Args:
            project_brief: Project brief.
            cost_breakdown: Cost breakdown.
            risk_output: Risk output.
            timeline_output: Timeline output.
            
        Returns:
            LLM analysis dict.
        """
        try:
            prompt = self._build_llm_prompt(
                project_brief, cost_breakdown, risk_output, timeline_output
            )
            
            response = await self.llm.generate_json(
                system_prompt=FINAL_AGENT_SYSTEM_PROMPT,
                user_message=prompt
            )
            
            self._tokens_used += response.get("tokens_used", 0)
            return response.get("content", {})
            
        except Exception as e:
            logger.warning("llm_analysis_failed", error=str(e))
            return self._generate_default_analysis()
    
    def _build_llm_prompt(
        self,
        project_brief: Dict[str, Any],
        cost_breakdown: CostBreakdownSummary,
        risk_output: Dict[str, Any],
        timeline_output: Dict[str, Any]
    ) -> str:
        """Build prompt for LLM analysis.
        
        Args:
            project_brief: Project brief.
            cost_breakdown: Cost breakdown.
            risk_output: Risk output.
            timeline_output: Timeline output.
            
        Returns:
            Formatted prompt string.
        """
        return f"""Generate recommendations for this construction estimate:

## Project
- Type: {project_brief.get('projectType', 'renovation')}
- Size: {project_brief.get('scopeSummary', {}).get('totalSqft', 0)} sqft
- Finish Level: {project_brief.get('scopeSummary', {}).get('finishLevel', 'mid-range')}

## Cost Summary
- Materials: ${cost_breakdown.materials:,.0f}
- Labor: ${cost_breakdown.labor:,.0f}
- Total with Contingency: ${cost_breakdown.total_with_contingency:,.0f}
- Contingency: {cost_breakdown.contingency_percentage:.0f}%

## Risk Level: {risk_output.get('riskLevel', 'Medium')}

## Timeline: {timeline_output.get('totalDuration', 30)} days

Please provide recommendations in the required JSON format."""
    
    def _generate_default_analysis(self) -> Dict[str, Any]:
        """Generate default analysis if LLM fails.
        
        Returns:
            Default analysis dict.
        """
        return {
            "executive_insights": [
                "Estimate based on current market conditions",
                "Contingency covers identified project risks"
            ],
            "recommendations": [
                {
                    "category": "cost",
                    "title": "Lock in material prices early",
                    "description": "Consider early procurement to lock in prices",
                    "priority": "medium",
                    "potential_savings": 0
                },
                {
                    "category": "schedule",
                    "title": "Book contractors early",
                    "description": "Secure contractor commitments to ensure availability",
                    "priority": "high"
                },
                {
                    "category": "risk",
                    "title": "Maintain contingency buffer",
                    "description": "Do not allocate contingency to known costs",
                    "priority": "high"
                }
            ],
            "value_engineering_options": [
                "Consider alternative material grades",
                "Bundle trade work for efficiency"
            ],
            "key_assumptions": [
                "Standard working hours",
                "Current material prices",
                "Normal site conditions"
            ],
            "exclusions": [
                "Furniture and decor",
                "Landscaping",
                "Financing costs"
            ],
            "next_steps": [
                "Review estimate with client",
                "Obtain contractor bids",
                "Finalize scope details"
            ]
        }
    
    def _build_recommendations(
        self,
        llm_analysis: Dict[str, Any]
    ) -> List[Recommendation]:
        """Build recommendation objects from LLM analysis.
        
        Args:
            llm_analysis: LLM analysis output.
            
        Returns:
            List of Recommendation objects.
        """
        recs = llm_analysis.get("recommendations", [])
        recommendations = []
        
        for rec in recs[:6]:
            if isinstance(rec, dict):
                recommendations.append(Recommendation(
                    category=rec.get("category", "general"),
                    title=rec.get("title", "Recommendation"),
                    description=rec.get("description", ""),
                    priority=rec.get("priority", "medium"),
                    potential_savings=rec.get("potential_savings")
                ))
        
        return recommendations
    
    def _calculate_data_completeness(
        self,
        location_output: Dict[str, Any],
        scope_output: Dict[str, Any],
        cost_output: Dict[str, Any],
        risk_output: Dict[str, Any],
        timeline_output: Dict[str, Any]
    ) -> float:
        """Calculate how complete the input data is.
        
        Args:
            All previous agent outputs.
            
        Returns:
            Completeness score (0-1).
        """
        completeness = 0.0
        
        # Each major section contributes to completeness
        if location_output and location_output.get("locationFactor"):
            completeness += 0.20
        
        if scope_output and scope_output.get("divisions"):
            completeness += 0.20
        
        if cost_output and cost_output.get("total"):
            completeness += 0.25
        
        if risk_output and risk_output.get("monteCarlo"):
            completeness += 0.20
        
        if timeline_output and timeline_output.get("tasks"):
            completeness += 0.15
        
        return min(1.0, completeness)
    
    def _determine_confidence_level(
        self,
        data_completeness: float,
        risk_level: str,
        cost_confidence: float
    ) -> EstimateConfidence:
        """Determine overall estimate confidence level.
        
        Args:
            data_completeness: Data completeness score.
            risk_level: Risk level string.
            cost_confidence: Cost estimate confidence.
            
        Returns:
            EstimateConfidence enum value.
        """
        # Start with data completeness
        score = data_completeness * 50
        
        # Add cost confidence
        score += cost_confidence * 30
        
        # Adjust for risk level
        risk_adjustments = {"low": 15, "medium": 10, "high": 0}
        score += risk_adjustments.get(risk_level.lower(), 10)
        
        if score >= 85:
            return EstimateConfidence.HIGH
        elif score >= 75:
            return EstimateConfidence.MEDIUM_HIGH
        elif score >= 60:
            return EstimateConfidence.MEDIUM
        elif score >= 45:
            return EstimateConfidence.MEDIUM_LOW
        else:
            return EstimateConfidence.LOW
    
    def _generate_headline(
        self,
        executive_summary: ExecutiveSummary,
        timeline_summary: TimelineSummaryForEstimate
    ) -> str:
        """Generate summary headline.
        
        Args:
            executive_summary: Executive summary.
            timeline_summary: Timeline summary.
            
        Returns:
            Headline string.
        """
        return (
            f"Final estimate: ${executive_summary.total_cost:,.0f} "
            f"({executive_summary.project_type.replace('_', ' ').title()}) "
            f"over {timeline_summary.total_weeks} weeks"
        )

    # -------------------------------------------------------------------------
    # Dev4 Integration Payload Builder
    # -------------------------------------------------------------------------

    def _build_integration_payload(
        self,
        estimate_id: str,
        clarification: Dict[str, Any],
        scope_output: Dict[str, Any],
        cost_output: Dict[str, Any],
        risk_output: Dict[str, Any],
        timeline_output: Dict[str, Any],
        cost_items: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Build spec-compliant payload for Dev 4 (see dev2-integration-spec.md)."""
        project_brief = clarification.get("projectBrief", {})
        location = project_brief.get("location", {})
        scope_summary = project_brief.get("scopeSummary", {})

        project_type = project_brief.get("projectType", "Residential Renovation")
        address = location.get("fullAddress") or self._join_address(location)
        scope_desc = scope_summary.get("description", "")
        sqft = scope_summary.get("totalSqft", 0)
        project_name = project_brief.get("projectName") or project_brief.get("projectTitle")
        if not project_name:
            city = location.get("city")
            proj_type_label = project_type.replace("_", " ").title()
            project_name = f"{proj_type_label} - {city}" if city else proj_type_label

        total = cost_output.get("total", {}) or {}
        p50 = total.get("low", 0)
        p80 = total.get("medium", p50 * 1.15 if p50 else 0)
        p90 = total.get("high", p80 * 1.1 if p80 else 0)

        contingency_pct = risk_output.get("contingency", {}).get("recommended")
        if contingency_pct is None:
            contingency_pct = 0.0
        monte_carlo = risk_output.get("monteCarlo", {}) or {}
        iterations = monte_carlo.get("iterations")

        timeline_days = timeline_output.get("totalDuration", 30)
        timeline_weeks = round(timeline_days / 5, 1)

        cost_drivers = self._build_cost_drivers(cost_output, total_cost=p50)
        risk_analysis = self._build_risk_analysis(monte_carlo, contingency_pct, risk_output)
        schedule = self._build_schedule(timeline_output, timeline_weeks)
        labor_analysis = self._build_labor_analysis(cost_output, total_cost=p50)
        cost_breakdown = self._build_cost_breakdown_for_spec(cost_output, total_cost=p50)
        boq = self._build_boq(scope_output)
        assumptions = self._build_assumptions(clarification, risk_output)

        return {
            "projectName": project_brief.get("projectName") or f"{project_type.title()}",
            "address": address,
            "projectType": project_type,
            "scope": scope_desc,
            "squareFootage": sqft,
            "totalCost": p50,
            "p50": p50,
            "p80": p80,
            "p90": p90,
            "contingencyPct": contingency_pct,
            "timelineWeeks": timeline_weeks,
            "monteCarloIterations": iterations,
            "costDrivers": cost_drivers,
            "laborAnalysis": labor_analysis,
            "schedule": schedule,
            "cost_breakdown": cost_breakdown,
            "risk_analysis": risk_analysis,
            "bill_of_quantities": boq,
            "assumptions": assumptions,
            "cad_data": clarification.get("cadData"),
            # Granular cost ledger metadata (actual rows are stored in subcollection)
            "costItemsCount": len(cost_items or []),
            "costItemsCollectionPath": f"/estimates/{estimate_id}/costItems"
        }

    def _join_address(self, location: Dict[str, Any]) -> str:
        parts = [
            location.get("streetAddress"),
            location.get("unit"),
            location.get("city"),
            location.get("state"),
            location.get("zipCode"),
        ]
        return ", ".join([p for p in parts if p])

    def _build_cost_drivers(self, cost_output: Dict[str, Any], total_cost: float) -> List[Dict[str, Any]]:
        divisions = cost_output.get("divisions", []) or []
        drivers = []
        for d in divisions:
            total = 0
            if isinstance(d.get("total"), dict):
                total = d["total"].get("low", 0)
            elif isinstance(d.get("total"), (int, float)):
                total = d["total"]
            drivers.append({
                "name": d.get("name") or d.get("code") or "Unknown",
                "cost": round(total, 2),
                "percentage": round((total / total_cost * 100), 1) if total_cost else None
            })
        drivers = sorted(drivers, key=lambda x: x["cost"], reverse=True)
        return drivers[:6]

    def _build_risk_analysis(
        self,
        monte_carlo: Dict[str, Any],
        contingency_pct: float,
        risk_output: Dict[str, Any]
    ) -> Dict[str, Any]:
        bins = monte_carlo.get("histogram_bins") or []
        counts = monte_carlo.get("histogram_counts") or []
        histogram = []
        total_iter = monte_carlo.get("iterations") or 0
        for i in range(min(len(counts), len(bins) - 1)):
            histogram.append({
                "range_low": round(bins[i], 2),
                "range_high": round(bins[i + 1], 2),
                "count": counts[i],
                "percentage": round(counts[i] / total_iter * 100, 2) if total_iter else 0
            })

        return {
            "iterations": monte_carlo.get("iterations", 0),
            "p50": monte_carlo.get("p50", 0),
            "p80": monte_carlo.get("p80", 0),
            "p90": monte_carlo.get("p90", 0),
            "mean": monte_carlo.get("mean", monte_carlo.get("statistics", {}).get("mean") if isinstance(monte_carlo.get("statistics"), dict) else None),
            "min": monte_carlo.get("min", monte_carlo.get("statistics", {}).get("min") if isinstance(monte_carlo.get("statistics"), dict) else None),
            "max": monte_carlo.get("max", monte_carlo.get("statistics", {}).get("max") if isinstance(monte_carlo.get("statistics"), dict) else None),
            "contingency_pct": contingency_pct,
            "contingency_amount": monte_carlo.get("contingencyAmount"),
            "histogram": histogram,
            "top_risks": monte_carlo.get("topRisks") or risk_output.get("topRisks", [])
        }

    def _build_schedule(self, timeline_output: Dict[str, Any], timeline_weeks: float) -> Dict[str, Any]:
        tasks = []
        milestone_ids = {m.get("id") for m in (timeline_output.get("milestones") or []) if m.get("id")}
        for idx, t in enumerate(timeline_output.get("tasks", []), start=1):
            tasks.append({
                "number": t.get("id") or idx,
                "name": t.get("name", ""),
                "duration": t.get("durationDays", t.get("duration", "")),
                "start": t.get("startDate", ""),
                "end": t.get("endDate", ""),
                "is_milestone": t.get("isCritical", False) or (t.get("id") in milestone_ids),
                "dependencies": t.get("dependencies", [])
            })
        notes = timeline_output.get("notes", [])
        milestones = timeline_output.get("milestones", [])
        return {
            "total_weeks": timeline_weeks,
            "start_date": timeline_output.get("startDate"),
            "end_date": timeline_output.get("endDate"),
            "tasks": tasks,
            "milestones": milestones,
            "notes": notes
        }

    def _build_labor_analysis(self, cost_output: Dict[str, Any], total_cost: float) -> Dict[str, Any]:
        subtotals = cost_output.get("subtotals", {}) or {}
        divisions = cost_output.get("divisions", []) or []

        trades_map: Dict[str, Dict[str, Any]] = {}
        for div in divisions:
            for li in div.get("lineItems", div.get("line_items", [])):
                qty = li.get("quantity") or 0
                unit_hrs = (
                    li.get("unitLaborHours")
                    or li.get("unit_labor_hours")
                    or li.get("laborHoursPerUnit")
                    or 0
                )
                if unit_hrs is None:
                    unit_hrs = 0
                hours = qty * unit_hrs
                if hours <= 0:
                    continue
                labor_rate = li.get("laborRate") or li.get("labor_rate") or {}
                if isinstance(labor_rate, dict):
                    rate = labor_rate.get("low") or labor_rate.get("median") or labor_rate.get("medium") or 0
                else:
                    rate = labor_rate or 0
                trade_name = (
                    li.get("primaryTrade")
                    or li.get("primary_trade")
                    or li.get("trade")
                    or "General Labor"
                )
                base_cost = hours * rate
                entry = trades_map.setdefault(trade_name, {"hours": 0, "base_cost": 0, "rate": rate})
                entry["hours"] += hours
                entry["base_cost"] += base_cost
                # keep the latest non-zero rate
                if rate:
                    entry["rate"] = rate

        trades_list = []
        for trade, data in trades_map.items():
            hours = data["hours"]
            base_cost = data["base_cost"]
            rate = data.get("rate") or (base_cost / hours if hours else 0)
            burden = base_cost * 0.35
            total = base_cost + burden
            trades_list.append({
                "name": trade,
                "hours": round(hours, 2),
                "rate": round(rate, 2),
                "base_cost": round(base_cost, 2),
                "burden": round(burden, 2),
                "total": round(total, 2)
            })

        # Fallback to subtotal labor if no line items
        labor_sub = subtotals.get("labor", {})
        labor_total = labor_sub.get("low", labor_sub if isinstance(labor_sub, (int, float)) else 0)

        total_hours = subtotals.get("totalLaborHours")
        if not trades_list and labor_total:
            burden = labor_total * 0.35
            total_with_burden = labor_total + burden
            labor_pct = round((total_with_burden / total_cost * 100), 1) if total_cost else None
            est_days = round(total_hours / 8, 1) if total_hours else None
            rate = round(labor_total / total_hours, 2) if total_hours and total_hours > 0 else None
            trades_list.append({
                "name": "General Labor",
                "hours": total_hours,
                "rate": rate,
                "base_cost": labor_total,
                "burden": burden,
                "total": total_with_burden
            })
        else:
            labor_total = sum(t["base_cost"] for t in trades_list)
            burden = sum(t["burden"] for t in trades_list)
            total_hours = sum(t["hours"] for t in trades_list) or total_hours
            est_days = round(total_hours / 8, 1) if total_hours else None
            total_with_burden = labor_total + burden
            labor_pct = round((total_with_burden / total_cost * 100), 1) if total_cost else None

        return {
            "total_hours": total_hours,
            "base_total": round(labor_total, 2) if labor_total else 0,
            "burden_total": round(burden, 2) if labor_total else 0,
            "total": round(total_with_burden, 2) if labor_total else 0,
            "labor_pct": labor_pct,
            "estimated_days": est_days,
            "trades": trades_list,
            "location_factors": {
                "is_union": None,
                "union_premium": None
            }
        }

    def _build_cost_breakdown_for_spec(self, cost_output: Dict[str, Any], total_cost: float) -> Dict[str, Any]:
        subtotals = cost_output.get("subtotals", {}) or {}
        materials = subtotals.get("materials", {})
        labor = subtotals.get("labor", {})
        permits = subtotals.get("permits", subtotals.get("permitCosts", {}))

        def _val(x):
            if isinstance(x, dict):
                return x.get("low", 0)
            if isinstance(x, (int, float)):
                return x
            return 0

        total_material = _val(materials)
        total_labor = _val(labor)
        permits_val = _val(permits)
        overhead_val = _val(cost_output.get("adjustments", {}).get("overhead"))

        divisions_out = []
        for d in cost_output.get("divisions", []) or []:
            total = _val(d.get("total"))
            material_sub = _val(d.get("materials"))
            labor_sub = _val(d.get("labor"))
            items = []
            for li in d.get("lineItems", d.get("line_items", [])):
                items.append({
                    "description": li.get("description", li.get("item", "")),
                    "quantity": li.get("quantity"),
                    "unit": li.get("unit"),
                    "unit_cost": _val(li.get("unitCost")),
                    "material_cost": _val(li.get("materialCost")),
                    "labor_cost": _val(li.get("laborCost"))
                })
            divisions_out.append({
                "code": d.get("code", ""),
                "name": d.get("name", ""),
                "total": total,
                "material_subtotal": material_sub,
                "labor_subtotal": labor_sub,
                "percentage": round(total / total_cost * 100, 1) if total_cost else None,
                "items": items
            })

        def _pct(part):
            return round(part / total_cost * 100, 1) if total_cost else None

        return {
            "total_material": total_material,
            "total_labor": total_labor,
            "permits": permits_val,
            "overhead": overhead_val,
            "material_pct": _pct(total_material),
            "labor_pct": _pct(total_labor),
            "permits_pct": _pct(permits_val),
            "overhead_pct": _pct(overhead_val),
            "divisions": divisions_out
        }

    def _build_boq(self, scope_output: Dict[str, Any]) -> Dict[str, Any]:
        items_out = []
        for div in scope_output.get("divisions", []) or []:
            division_code = div.get("code") or div.get("divisionCode") or div.get("csiDivision")
            for idx, li in enumerate(div.get("lineItems", []), start=1):
                items_out.append({
                    "line_number": li.get("id") or idx,
                    "description": li.get("item") or li.get("description", ""),
                    "quantity": li.get("quantity"),
                    "unit": li.get("unit"),
                    "unit_cost": li.get("unitCost") or 0,
                    "material_cost": li.get("materialCost") or 0,
                    "labor_cost": li.get("laborCost") or 0,
                    "total": li.get("totalCost") or 0,
                    "csi_division": division_code
                })
        subtotal = sum([i.get("total", 0) or 0 for i in items_out])
        permits = scope_output.get("permitsTotal") or 0
        overhead = scope_output.get("overheadTotal") or 0
        profit = scope_output.get("profitTotal") or 0
        return {
            "items": items_out,
            "subtotal": subtotal,
            "permits": permits,
            "overhead": overhead,
            "profit": profit
        }

    def _build_assumptions(
        self,
        clarification: Dict[str, Any],
        risk_output: Dict[str, Any]
    ) -> Dict[str, Any]:
        project_brief = clarification.get("projectBrief", {})
        scope_summary = project_brief.get("scopeSummary", {})
        special_reqs = project_brief.get("specialRequirements", []) or []
        exclusions = project_brief.get("exclusions", []) or []
        risk_assumptions = risk_output.get("assumptions", []) or []
        return {
            "items": special_reqs or ["Standard working conditions assumed"],
            "inclusions": [],
            "exclusions": [
                {"category": "Scope", "items": exclusions}
            ],
            "notes": risk_assumptions
        }
