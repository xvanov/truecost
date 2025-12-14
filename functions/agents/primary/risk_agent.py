"""Risk Agent for TrueCost.

Performs Monte Carlo simulation for cost risk analysis,
identifies top risk factors, and recommends contingency.
"""

from typing import Any, Dict, List, Optional
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.monte_carlo_service import MonteCarloService
from config.settings import settings
from models.risk_analysis import (
    ConfidenceLevel,
    RiskAnalysis,
    RiskAnalysisSummary,
    RiskFactor,
)

logger = structlog.get_logger()


# =============================================================================
# RISK AGENT SYSTEM PROMPT
# =============================================================================


RISK_AGENT_SYSTEM_PROMPT = """You are a construction risk analysis expert for TrueCost.

Your role is to analyze Monte Carlo simulation results and provide risk insights:

## Analysis Focus
1. Interpret percentile values (P50/P80/P90) for cost confidence
2. Identify which risks contribute most to cost variance
3. Explain why certain risks are significant for this project
4. Recommend appropriate contingency level
5. Suggest risk mitigation strategies

## Output Requirements
Provide analysis in this JSON format:
{
    "risk_level_assessment": "Low/Medium/High and why",
    "key_insights": ["insight 1", "insight 2", ...],
    "contingency_recommendation": "Recommended % and rationale",
    "mitigation_priorities": [
        {"risk": "Risk Name", "action": "Specific action", "impact": "Expected benefit"}
    ],
    "additional_considerations": ["consideration 1", ...]
}

## Best Practices
- Be specific about dollar amounts and percentages
- Relate risks to the specific project type
- Provide actionable mitigation strategies
- Consider both probability and impact
- Explain the confidence range in plain terms
"""


class RiskAgent(BaseA2AAgent):
    """Risk Agent - performs Monte Carlo simulation for risk analysis.
    
    Uses Monte Carlo simulation to:
    - Calculate P50/P80/P90 cost percentiles
    - Identify top risk factors by variance contribution
    - Calculate recommended contingency percentage
    - Generate risk mitigation recommendations
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        monte_carlo_service: Optional[MonteCarloService] = None
    ):
        """Initialize RiskAgent.
        
        Args:
            firestore_service: Firestore service for persistence.
            llm_service: LLM service for analysis.
            monte_carlo_service: Monte Carlo simulation service.
        """
        super().__init__(
            name="risk",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
        self.monte_carlo = monte_carlo_service or MonteCarloService()
    
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run risk analysis with Monte Carlo simulation.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing cost_output, location_output.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Risk analysis with Monte Carlo results and contingency.
        """
        self._start_time = time.time()
        
        logger.info(
            "risk_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Extract inputs
        cost_output = input_data.get("cost_output", {})
        location_output = input_data.get("location_output", {})
        clarification = input_data.get("clarification_output", {})
        
        # Get base cost (P50 from cost agent)
        total_range = cost_output.get("total", {})
        if isinstance(total_range, dict):
            base_cost = total_range.get("low", 0)  # P50 is "low" in our model
        else:
            base_cost = float(total_range) if total_range else 0
        
        if base_cost <= 0:
            # Fallback to subtotals (still real data, not invented numbers)
            subtotals = cost_output.get("subtotals", {})
            subtotal = subtotals.get("subtotal", {})
            if isinstance(subtotal, dict):
                base_cost = subtotal.get("low", 0)
            else:
                base_cost = 0

        if base_cost <= 0:
            # Do NOT invent a base cost. Without cost output, we cannot run Monte Carlo.
            msg = "Insufficient cost data to run Monte Carlo (missing/zero cost totals/subtotals)."
            logger.warning("risk_agent_insufficient_cost_data", estimate_id=estimate_id)
            output = {
                "estimateId": estimate_id,
                "riskLevel": "n/a",
                "error": {"code": "INSUFFICIENT_DATA", "message": msg},
                "monteCarlo": None,
                "contingency": None,
                "topRisks": [],
                "recommendations": [],
            }
            await self.firestore.save_agent_output(
                estimate_id=estimate_id,
                agent_name=self.name,
                output=output,
                summary="Risk analysis unavailable (insufficient cost data)",
                confidence=0.0,
                tokens_used=self._tokens_used,
                duration_ms=self.duration_ms,
            )
            return output
        
        logger.info(
            "risk_agent_inputs",
            estimate_id=estimate_id,
            base_cost=base_cost,
            has_location=bool(location_output),
            has_clarification=bool(clarification)
        )
        
        # Determine location risk level
        location_risk = self._assess_location_risk(location_output)
        
        # Get project type for risk factor adjustment
        project_brief = clarification.get("projectBrief", {})
        project_type = project_brief.get("projectType", "renovation")
        
        # Generate risk factors
        risk_factors = self.monte_carlo.generate_risk_factors(
            base_cost=base_cost,
            project_type=project_type,
            location_risk=location_risk
        )
        
        # Apply feedback adjustments if retry
        if feedback:
            risk_factors = self._apply_feedback(risk_factors, feedback)
        
        # Run Monte Carlo simulation
        mc_result = await self.monte_carlo.run_simulation(
            base_cost=base_cost,
            risk_factors=risk_factors,
            iterations=settings.monte_carlo_iterations,
            cost_variance_low=0.92,
            cost_variance_high=1.08
        )
        
        # Calculate contingency recommendation
        contingency = self.monte_carlo.calculate_contingency(
            base_cost=base_cost,
            monte_carlo_result=mc_result,
            confidence_level="P80"
        )
        
        # Determine risk level
        risk_level, key_findings = self.monte_carlo.determine_risk_level(
            monte_carlo_result=mc_result,
            risk_factors=risk_factors
        )
        
        # Get top 5 risks by variance contribution
        top_risks = sorted(
            risk_factors,
            key=lambda r: r.variance_contribution,
            reverse=True
        )[:5]
        
        # Use LLM for deeper analysis
        llm_analysis = await self._get_llm_analysis(
            base_cost=base_cost,
            mc_result=mc_result,
            risk_factors=risk_factors,
            top_risks=top_risks,
            project_type=project_type,
            risk_level=risk_level
        )
        
        # Build summary - extract string recommendations from LLM analysis
        mitigation_priorities = llm_analysis.get("mitigation_priorities", [])
        recommendations = []
        for mp in mitigation_priorities[:5]:
            if isinstance(mp, dict):
                # Extract action from dict format
                action = mp.get("action", mp.get("risk", "Monitor closely"))
                recommendations.append(str(action))
            else:
                recommendations.append(str(mp))
        
        summary = RiskAnalysisSummary(
            headline=f"Risk analysis: P50=${mc_result.percentiles.p50:,.0f}, "
                     f"P80=${mc_result.percentiles.p80:,.0f}, "
                     f"Contingency={contingency.recommended_percentage:.0f}%",
            risk_level=risk_level,
            key_findings=key_findings,
            recommendations=recommendations
        )
        
        # Build complete risk analysis
        risk_analysis = RiskAnalysis(
            estimate_id=estimate_id,
            base_cost=base_cost,
            monte_carlo=mc_result,
            risk_factors=risk_factors,
            top_risks=top_risks,
            contingency=contingency,
            confidence_range={
                "p50": mc_result.percentiles.p50,
                "p80": mc_result.percentiles.p80,
                "p90": mc_result.percentiles.p90,
            },
            summary=summary,
            analysis_confidence=ConfidenceLevel.MEDIUM
        )
        
        # Convert to output format
        output = risk_analysis.to_agent_output()
        
        # Add LLM insights
        output["llmAnalysis"] = llm_analysis
        
        # Calculate confidence based on data quality
        confidence = self._calculate_confidence(
            risk_factors=risk_factors,
            mc_result=mc_result
        )
        
        # Save output to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=summary.headline,
            confidence=confidence,
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "risk_agent_completed",
            estimate_id=estimate_id,
            p50=mc_result.percentiles.p50,
            p80=mc_result.percentiles.p80,
            p90=mc_result.percentiles.p90,
            contingency_pct=contingency.recommended_percentage,
            risk_level=risk_level,
            duration_ms=self.duration_ms
        )
        
        return output
    
    def _assess_location_risk(self, location_output: Dict[str, Any]) -> str:
        """Assess location-based risk level.
        
        Args:
            location_output: Location agent output.
            
        Returns:
            Risk level string: "low", "medium", or "high".
        """
        if not location_output:
            return "medium"
        
        # Check union status (typically higher cost variance)
        is_union = location_output.get("isUnion", False)
        union_status = location_output.get("unionStatus", "open")
        
        # Check weather factors
        weather = location_output.get("weatherFactors", {})
        seasonal_adjustment = weather.get("seasonalAdjustment", 1.0)
        
        # Check location factor
        location_factor = location_output.get("locationFactor", 1.0)
        
        # Assess risk
        risk_score = 0
        
        if is_union or union_status == "union":
            risk_score += 1
        if seasonal_adjustment > 1.1:
            risk_score += 1
        if location_factor > 1.15:
            risk_score += 1
        if location_factor < 0.9:
            risk_score += 0.5  # Very low cost areas may have availability issues
        
        if risk_score >= 2:
            return "high"
        elif risk_score >= 1:
            return "medium"
        return "low"
    
    def _apply_feedback(
        self,
        risk_factors: List[RiskFactor],
        feedback: Dict[str, Any]
    ) -> List[RiskFactor]:
        """Apply critic feedback to adjust risk factors.
        
        Args:
            risk_factors: Original risk factors.
            feedback: Critic feedback.
            
        Returns:
            Adjusted risk factors.
        """
        issues = feedback.get("issues", [])
        
        for issue in issues:
            issue_lower = issue.lower()
            
            # Adjust probabilities based on feedback
            if "probability" in issue_lower and "high" in issue_lower:
                for rf in risk_factors:
                    rf.probability = min(1.0, rf.probability * 0.9)
            elif "probability" in issue_lower and "low" in issue_lower:
                for rf in risk_factors:
                    rf.probability = min(1.0, rf.probability * 1.1)
            
            # Adjust contingency basis
            if "contingency" in issue_lower and ("low" in issue_lower or "conservative" in issue_lower):
                # Will be handled in contingency calculation
                pass
        
        return risk_factors
    
    async def _get_llm_analysis(
        self,
        base_cost: float,
        mc_result: Any,
        risk_factors: List[RiskFactor],
        top_risks: List[RiskFactor],
        project_type: str,
        risk_level: str
    ) -> Dict[str, Any]:
        """Get LLM analysis of Monte Carlo results.
        
        Args:
            base_cost: Base cost estimate.
            mc_result: Monte Carlo simulation results.
            risk_factors: All risk factors.
            top_risks: Top 5 risks by variance.
            project_type: Type of project.
            risk_level: Overall risk level.
            
        Returns:
            LLM analysis dict.
        """
        try:
            user_message = self._build_llm_prompt(
                base_cost=base_cost,
                mc_result=mc_result,
                top_risks=top_risks,
                project_type=project_type,
                risk_level=risk_level
            )
            
            response = await self.llm.generate_json(
                prompt=user_message,
                system_prompt=RISK_AGENT_SYSTEM_PROMPT
            )
            
            self._tokens_used += response.get("tokens_used", 0)
            return response.get("content", {})
            
        except Exception as e:
            logger.warning(
                "llm_analysis_failed",
                error=str(e),
                falling_back_to_default=True
            )
            return self._generate_default_analysis(
                risk_level=risk_level,
                top_risks=top_risks
            )
    
    def _build_llm_prompt(
        self,
        base_cost: float,
        mc_result: Any,
        top_risks: List[RiskFactor],
        project_type: str,
        risk_level: str
    ) -> str:
        """Build prompt for LLM analysis.
        
        Args:
            base_cost: Base cost estimate.
            mc_result: Monte Carlo results.
            top_risks: Top risk factors.
            project_type: Project type.
            risk_level: Risk level.
            
        Returns:
            Formatted prompt string.
        """
        top_risks_text = "\n".join([
            f"  - {r.name}: {r.probability:.0%} probability, "
            f"${r.cost_impact_low:,.0f}-${r.cost_impact_high:,.0f} impact, "
            f"{r.variance_contribution:.0%} of variance"
            for r in top_risks
        ])
        
        return f"""Analyze this Monte Carlo risk simulation for a {project_type} project:

## Base Cost
${base_cost:,.0f}

## Monte Carlo Results (1000 iterations)
- P50 (Median): ${mc_result.percentiles.p50:,.0f}
- P80 (Conservative): ${mc_result.percentiles.p80:,.0f}
- P90 (Pessimistic): ${mc_result.percentiles.p90:,.0f}
- Standard Deviation: ${mc_result.statistics.std_dev:,.0f}
- Coefficient of Variation: {mc_result.get_coefficient_of_variation():.1%}

## Overall Risk Level: {risk_level}

## Top 5 Risk Factors (by variance contribution)
{top_risks_text}

Please provide your analysis in the required JSON format."""
    
    def _generate_default_analysis(
        self,
        risk_level: str,
        top_risks: List[RiskFactor]
    ) -> Dict[str, Any]:
        """Generate default analysis if LLM fails.
        
        Args:
            risk_level: Overall risk level.
            top_risks: Top risk factors.
            
        Returns:
            Default analysis dict.
        """
        return {
            "risk_level_assessment": f"{risk_level} risk based on Monte Carlo analysis",
            "key_insights": [
                "Monte Carlo simulation completed with 1000 iterations",
                f"Top risk factor: {top_risks[0].name if top_risks else 'Unknown'}",
                "Contingency recommendation based on P80 confidence level"
            ],
            "contingency_recommendation": "10-15% contingency recommended for P80 confidence",
            "mitigation_priorities": [
                {"risk": r.name, "action": r.mitigation or "Monitor closely", "impact": "Reduce variance"}
                for r in top_risks[:3]
            ],
            "additional_considerations": [
                "Review insurance coverage",
                "Establish change order process",
                "Schedule buffer for weather delays"
            ]
        }
    
    def _calculate_confidence(
        self,
        risk_factors: List[RiskFactor],
        mc_result: Any
    ) -> float:
        """Calculate confidence in risk analysis.
        
        Args:
            risk_factors: Analyzed risk factors.
            mc_result: Monte Carlo results.
            
        Returns:
            Confidence score (0-1).
        """
        confidence = 0.75  # Base confidence
        
        # More iterations = higher confidence
        if mc_result.iterations >= 1000:
            confidence += 0.05
        
        # Good distribution of risk factors = higher confidence
        if len(risk_factors) >= 5:
            confidence += 0.05
        
        # Reasonable CV = higher confidence
        cv = mc_result.get_coefficient_of_variation()
        if 0.05 <= cv <= 0.20:
            confidence += 0.05
        
        return min(0.95, confidence)
