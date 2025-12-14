"""Risk Agent for TrueCost.

Performs Monte Carlo simulation for cost risk analysis,
identifies top risk factors, and recommends contingency.
Includes labor cost simulation and schedule simulation.
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
# Import new Monte Carlo simulation functions for labor and schedule
from services.monte_carlo import (
    LaborLineItemInput,
    ScheduleTaskInput,
    run_labor_simulation,
    run_schedule_simulation,
    TRADE_VARIANCE_FACTORS,
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
    - Calculate P50/P80/P90 cost percentiles for materials
    - Simulate labor costs with trade-specific variance
    - Simulate schedule duration with critical path analysis
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
        # Persist estimate_id for helper methods that need it (Deep Agents backend scope).
        self._estimate_id_for_llm = estimate_id
        
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
        
        # Run Monte Carlo simulation (material costs)
        mc_result = await self.monte_carlo.run_simulation(
            base_cost=base_cost,
            risk_factors=risk_factors,
            iterations=settings.monte_carlo_iterations,
            cost_variance_low=0.92,
            cost_variance_high=1.08
        )

        # Run Labor Monte Carlo simulation
        timeline_output = input_data.get("timeline_output", {})
        is_union = location_output.get("isUnion", False)
        labor_mc_result = None
        labor_items = self._extract_labor_items(cost_output, location_output)

        if labor_items:
            try:
                labor_mc_result = run_labor_simulation(
                    labor_items=labor_items,
                    iterations=settings.monte_carlo_iterations,
                    location_factor=location_output.get("locationFactor", 1.0),
                    is_union=is_union
                )
                logger.info(
                    "labor_simulation_completed",
                    estimate_id=estimate_id,
                    p50=labor_mc_result.p50,
                    p80=labor_mc_result.p80,
                    p90=labor_mc_result.p90,
                    trade_count=len(labor_mc_result.by_trade)
                )
            except Exception as e:
                logger.warning(
                    "labor_simulation_failed",
                    estimate_id=estimate_id,
                    error=str(e)
                )

        # Run Schedule Monte Carlo simulation
        schedule_mc_result = None
        schedule_tasks = self._extract_schedule_tasks(timeline_output, location_output)

        if schedule_tasks:
            try:
                weather_factors = location_output.get("weatherFactors", {})
                weather_impact = weather_factors.get("seasonalAdjustment", 1.0)

                schedule_mc_result = run_schedule_simulation(
                    tasks=schedule_tasks,
                    iterations=settings.monte_carlo_iterations,
                    weather_impact_factor=weather_impact
                )
                logger.info(
                    "schedule_simulation_completed",
                    estimate_id=estimate_id,
                    p50_days=schedule_mc_result.p50_days,
                    p80_days=schedule_mc_result.p80_days,
                    p90_days=schedule_mc_result.p90_days,
                    risk_index=schedule_mc_result.schedule_risk_index
                )
            except Exception as e:
                logger.warning(
                    "schedule_simulation_failed",
                    estimate_id=estimate_id,
                    error=str(e)
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

        # Add labor Monte Carlo results if available
        if labor_mc_result:
            output["laborMonteCarlo"] = {
                "iterations": labor_mc_result.iterations,
                "p50": labor_mc_result.p50,
                "p80": labor_mc_result.p80,
                "p90": labor_mc_result.p90,
                "mean": labor_mc_result.mean,
                "stdDev": labor_mc_result.std_dev,
                "minValue": labor_mc_result.min_value,
                "maxValue": labor_mc_result.max_value,
                "recommendedContingency": labor_mc_result.recommended_contingency,
                "byTrade": {
                    trade: {"p50": vals["p50"], "p80": vals["p80"], "p90": vals["p90"]}
                    for trade, vals in labor_mc_result.by_trade.items()
                },
                "topLaborRisks": [
                    {
                        "trade": r.trade,
                        "impact": r.impact,
                        "varianceContribution": r.variance_contribution,
                    }
                    for r in labor_mc_result.top_labor_risks
                ],
                "histogram": [
                    {"binStart": b.range_low, "binEnd": b.range_high, "count": b.count}
                    for b in labor_mc_result.histogram
                ],
            }

        # Add schedule Monte Carlo results if available
        if schedule_mc_result:
            output["scheduleMonteCarlo"] = {
                "iterations": schedule_mc_result.iterations,
                "p50Days": schedule_mc_result.p50_days,
                "p80Days": schedule_mc_result.p80_days,
                "p90Days": schedule_mc_result.p90_days,
                "meanDays": schedule_mc_result.mean_days,
                "stdDevDays": schedule_mc_result.std_dev_days,
                "minDays": schedule_mc_result.min_days,
                "maxDays": schedule_mc_result.max_days,
                "criticalPathVariance": schedule_mc_result.critical_path_variance,
                "scheduleRiskIndex": schedule_mc_result.schedule_risk_index,
                "taskSensitivities": [
                    {
                        "taskId": t.task_id,
                        "taskName": t.task_name,
                        "varianceContribution": t.variance_contribution,
                        "isCritical": t.is_critical,
                    }
                    for t in schedule_mc_result.task_sensitivities
                ],
                "histogram": [
                    {"binStart": b.range_low, "binEnd": b.range_high, "count": b.count}
                    for b in schedule_mc_result.histogram
                ],
            }

        # Add combined totals if we have all simulations
        material_p50 = mc_result.percentiles.p50
        material_p80 = mc_result.percentiles.p80
        material_p90 = mc_result.percentiles.p90
        labor_p50 = labor_mc_result.p50 if labor_mc_result else 0
        labor_p80 = labor_mc_result.p80 if labor_mc_result else 0
        labor_p90 = labor_mc_result.p90 if labor_mc_result else 0

        output["totalCostMonteCarlo"] = {
            "p50": material_p50 + labor_p50,
            "p80": material_p80 + labor_p80,
            "p90": material_p90 + labor_p90,
        }

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
            material_p50=mc_result.percentiles.p50,
            material_p80=mc_result.percentiles.p80,
            material_p90=mc_result.percentiles.p90,
            labor_p50=labor_mc_result.p50 if labor_mc_result else None,
            labor_p80=labor_mc_result.p80 if labor_mc_result else None,
            schedule_p50_days=schedule_mc_result.p50_days if schedule_mc_result else None,
            schedule_risk_index=schedule_mc_result.schedule_risk_index if schedule_mc_result else None,
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
            
            from services.deep_agent_factory import deep_agent_generate_json

            response = await deep_agent_generate_json(
                estimate_id=getattr(self, "_estimate_id_for_llm", None) or "unknown",
                agent_name=self.name,
                system_prompt=RISK_AGENT_SYSTEM_PROMPT,
                user_message=user_message,
                firestore_service=self.firestore,
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

    def _extract_labor_items(
        self, cost_output: Dict[str, Any], location_output: Dict[str, Any]
    ) -> List[LaborLineItemInput]:
        """Extract labor data from cost agent output.

        Args:
            cost_output: Cost agent output with divisions and line items.
            location_output: Location agent output with labor rates.

        Returns:
            List of LaborLineItemInput for simulation.
        """
        labor_items = []

        # Get location factor for rate adjustments
        location_factor = location_output.get("locationFactor", 1.0)
        base_rates = location_output.get("laborRates", {})

        divisions = cost_output.get("divisions", [])
        for division in divisions:
            line_items = division.get("lineItems", [])
            for item in line_items:
                labor_hours = item.get("laborHours", 0)
                if labor_hours <= 0:
                    continue

                # Get trade from item or default to general
                trade = item.get("primaryTrade", "general_labor")
                trade_key = trade.lower().replace(" ", "_").replace("-", "_")

                # Get variance factors for trade
                variance = TRADE_VARIANCE_FACTORS.get(
                    trade_key,
                    TRADE_VARIANCE_FACTORS.get("general_labor", {"rate_cv": 0.12, "productivity_cv": 0.15})
                )
                rate_cv = variance.get("rate_cv", 0.12)
                productivity_cv = variance.get("productivity_cv", 0.15)

                # Get labor rate from location output or estimate from item
                labor_cost_range = item.get("laborCost", {})
                if isinstance(labor_cost_range, dict):
                    labor_cost_medium = labor_cost_range.get("medium", 0)
                else:
                    labor_cost_medium = float(labor_cost_range) if labor_cost_range else 0

                # Calculate hourly rate
                if labor_hours > 0 and labor_cost_medium > 0:
                    base_rate = labor_cost_medium / labor_hours
                else:
                    # Use location rates or default
                    base_rate = base_rates.get(trade_key, base_rates.get("general", 45.0))

                # Apply location factor
                adjusted_rate = base_rate * location_factor

                # Create rate ranges based on variance
                rate_low = adjusted_rate * (1 - rate_cv)
                rate_high = adjusted_rate * (1 + rate_cv * 1.5)

                labor_items.append(LaborLineItemInput(
                    id=item.get("lineItemId", f"labor-{len(labor_items)}"),
                    description=item.get("description", "Labor item"),
                    trade=trade,
                    labor_hours=labor_hours,
                    labor_rate_low=rate_low,
                    labor_rate_likely=adjusted_rate,
                    labor_rate_high=rate_high,
                    productivity_factor_low=1 - productivity_cv,
                    productivity_factor_likely=1.0,
                    productivity_factor_high=1 + productivity_cv * 1.5,
                ))

        logger.info(
            "extracted_labor_items",
            count=len(labor_items),
            total_hours=sum(item.labor_hours for item in labor_items)
        )

        return labor_items

    def _extract_schedule_tasks(
        self, timeline_output: Dict[str, Any], location_output: Dict[str, Any]
    ) -> List[ScheduleTaskInput]:
        """Extract schedule data from timeline agent output.

        Args:
            timeline_output: Timeline agent output with tasks.
            location_output: Location agent output with weather factors.

        Returns:
            List of ScheduleTaskInput for simulation.
        """
        schedule_tasks = []

        # Get weather sensitivity from location
        weather_factors = location_output.get("weatherFactors", {})
        has_weather_risk = weather_factors.get("seasonalAdjustment", 1.0) > 1.05

        tasks = timeline_output.get("tasks", [])
        for task in tasks:
            duration = task.get("duration", 0)
            if duration <= 0:
                continue

            # Get duration range if available
            duration_range_low = task.get("durationRangeLow", task.get("duration_range_low"))
            duration_range_high = task.get("durationRangeHigh", task.get("duration_range_high"))

            # If no range provided, estimate based on task type
            if not duration_range_low:
                # Minimum is 80% of expected duration
                duration_range_low = max(1, int(duration * 0.8))
            if not duration_range_high:
                # Maximum is 150% of expected duration
                duration_range_high = int(duration * 1.5)

            # Determine if weather sensitive based on task name/type
            task_name = task.get("name", "").lower()
            weather_sensitive = any(
                keyword in task_name
                for keyword in ["exterior", "roof", "foundation", "concrete", "site", "demo", "excavat"]
            ) or task.get("weatherSensitive", False)

            # Determine if on critical path
            is_critical = task.get("isCritical", task.get("is_critical", False))

            schedule_tasks.append(ScheduleTaskInput(
                id=task.get("id", f"task-{len(schedule_tasks)}"),
                name=task.get("name", f"Task {len(schedule_tasks) + 1}"),
                duration_days=duration,
                duration_range_low=duration_range_low,
                duration_range_high=duration_range_high,
                is_critical=is_critical,
                weather_sensitive=weather_sensitive,
            ))

        logger.info(
            "extracted_schedule_tasks",
            count=len(schedule_tasks),
            total_days=sum(task.duration_days for task in schedule_tasks),
            critical_count=sum(1 for task in schedule_tasks if task.is_critical)
        )

        return schedule_tasks
