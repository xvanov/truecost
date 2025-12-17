"""Monte Carlo Simulation Service for TrueCost.

This module provides Monte Carlo cost simulation for risk analysis.
This is a mock implementation - the real service will be provided by Dev 4.

The simulation uses triangular distributions for cost items and
aggregates results to calculate percentile values.
"""

import random
from typing import Any, Dict, List, Optional, Tuple

import structlog

from models.risk_analysis import (
    ConfidenceLevel,
    ContingencyRecommendation,
    DistributionStatistics,
    MonteCarloResult,
    PercentileValues,
    RiskCategory,
    RiskFactor,
    RiskImpact,
)

logger = structlog.get_logger()


# =============================================================================
# DEFAULT RISK FACTORS BY CATEGORY
# =============================================================================


DEFAULT_RISK_FACTORS: List[Dict[str, Any]] = [
    {
        "id": "RF001",
        "name": "Material Price Volatility",
        "description": "Supply chain disruptions and market fluctuations may affect material costs",
        "category": RiskCategory.MATERIAL_COST,
        "impact": RiskImpact.HIGH,
        "probability": 0.35,
        "cost_impact_pct_low": 0.02,
        "cost_impact_pct_high": 0.15,
        "mitigation": "Lock in prices early, consider alternative materials, maintain supplier relationships",
    },
    {
        "id": "RF002",
        "name": "Labor Availability",
        "description": "Skilled labor shortages may cause delays or increased labor costs",
        "category": RiskCategory.LABOR_AVAILABILITY,
        "impact": RiskImpact.MEDIUM,
        "probability": 0.40,
        "cost_impact_pct_low": 0.03,
        "cost_impact_pct_high": 0.12,
        "mitigation": "Book contractors early, maintain backup contractor list, consider phased scheduling",
    },
    {
        "id": "RF003",
        "name": "Weather Delays",
        "description": "Adverse weather conditions may delay exterior or foundation work",
        "category": RiskCategory.WEATHER,
        "impact": RiskImpact.MEDIUM,
        "probability": 0.25,
        "cost_impact_pct_low": 0.01,
        "cost_impact_pct_high": 0.08,
        "mitigation": "Schedule weather-sensitive work in optimal seasons, build buffer into timeline",
    },
    {
        "id": "RF004",
        "name": "Permit Delays",
        "description": "Municipal permitting may take longer than anticipated",
        "category": RiskCategory.PERMIT,
        "impact": RiskImpact.LOW,
        "probability": 0.30,
        "cost_impact_pct_low": 0.01,
        "cost_impact_pct_high": 0.05,
        "mitigation": "Submit permits early, maintain good relationships with building department",
    },
    {
        "id": "RF005",
        "name": "Scope Changes",
        "description": "Client-requested changes during construction may increase costs",
        "category": RiskCategory.SCOPE_CHANGE,
        "impact": RiskImpact.HIGH,
        "probability": 0.45,
        "cost_impact_pct_low": 0.05,
        "cost_impact_pct_high": 0.20,
        "mitigation": "Detailed scope documentation, change order process, regular client communication",
    },
    {
        "id": "RF006",
        "name": "Site Conditions",
        "description": "Unknown site conditions (structural issues, utilities) may be discovered",
        "category": RiskCategory.SITE_CONDITIONS,
        "impact": RiskImpact.MEDIUM,
        "probability": 0.20,
        "cost_impact_pct_low": 0.02,
        "cost_impact_pct_high": 0.10,
        "mitigation": "Thorough pre-construction inspection, allow contingency for hidden conditions",
    },
    {
        "id": "RF007",
        "name": "Subcontractor Performance",
        "description": "Subcontractor quality or schedule issues may require rework",
        "category": RiskCategory.SUBCONTRACTOR,
        "impact": RiskImpact.MEDIUM,
        "probability": 0.25,
        "cost_impact_pct_low": 0.02,
        "cost_impact_pct_high": 0.08,
        "mitigation": "Vet subcontractors carefully, include performance clauses, regular inspections",
    },
    {
        "id": "RF008",
        "name": "Design Changes",
        "description": "Design modifications may require additional work",
        "category": RiskCategory.DESIGN_CHANGE,
        "impact": RiskImpact.MEDIUM,
        "probability": 0.30,
        "cost_impact_pct_low": 0.03,
        "cost_impact_pct_high": 0.10,
        "mitigation": "Complete design documentation before construction, design freeze policy",
    },
]


class MonteCarloService:
    """Monte Carlo simulation service for construction cost risk analysis.
    
    This is a mock implementation that uses triangular distributions
    to simulate cost variance. The real implementation (Dev 4) will
    use more sophisticated modeling.
    """
    
    def __init__(self, seed: Optional[int] = None):
        """Initialize Monte Carlo service.
        
        Args:
            seed: Random seed for reproducibility (optional).
        """
        self._seed = seed
        if seed is not None:
            random.seed(seed)
        
        logger.info("monte_carlo_service_initialized", mock=True, seed=seed)
    
    def _triangular(self, low: float, mode: float, high: float) -> float:
        """Generate a random value from triangular distribution.
        
        Args:
            low: Minimum value.
            mode: Most likely value (peak of distribution).
            high: Maximum value.
            
        Returns:
            Random value from triangular distribution.
        """
        return random.triangular(low, high, mode)
    
    def _calculate_percentile(self, values: List[float], percentile: float) -> float:
        """Calculate percentile value from sorted list.
        
        Args:
            values: Sorted list of values.
            percentile: Percentile to calculate (0-100).
            
        Returns:
            Value at the specified percentile.
        """
        n = len(values)
        if n == 0:
            return 0.0
        
        k = (n - 1) * (percentile / 100)
        f = int(k)
        c = f + 1 if f + 1 < n else f
        
        if f == c:
            return values[f]
        
        return values[f] + (values[c] - values[f]) * (k - f)
    
    def generate_risk_factors(
        self,
        base_cost: float,
        project_type: str = "renovation",
        location_risk: str = "medium"
    ) -> List[RiskFactor]:
        """Generate risk factors for the project.
        
        Args:
            base_cost: Base project cost.
            project_type: Type of project (renovation, new_construction).
            location_risk: Location risk level (low, medium, high).
            
        Returns:
            List of RiskFactor objects.
        """
        logger.debug(
            "generating_risk_factors",
            base_cost=base_cost,
            project_type=project_type,
            location_risk=location_risk
        )
        
        # Adjust probabilities based on project characteristics
        location_multiplier = {"low": 0.8, "medium": 1.0, "high": 1.2}.get(location_risk, 1.0)
        
        risk_factors = []
        for rf_data in DEFAULT_RISK_FACTORS:
            # Calculate actual cost impacts
            cost_low = base_cost * rf_data["cost_impact_pct_low"]
            cost_high = base_cost * rf_data["cost_impact_pct_high"]
            
            # Adjust probability by location
            adjusted_prob = min(1.0, rf_data["probability"] * location_multiplier)
            
            risk_factor = RiskFactor(
                id=rf_data["id"],
                name=rf_data["name"],
                description=rf_data["description"],
                category=rf_data["category"],
                impact=rf_data["impact"],
                probability=adjusted_prob,
                cost_impact_low=round(cost_low, 2),
                cost_impact_high=round(cost_high, 2),
                mitigation=rf_data["mitigation"],
            )
            risk_factors.append(risk_factor)
        
        return risk_factors
    
    async def run_simulation(
        self,
        base_cost: float,
        risk_factors: List[RiskFactor],
        iterations: int = 1000,
        cost_variance_low: float = 0.90,
        cost_variance_high: float = 1.10
    ) -> MonteCarloResult:
        """Run Monte Carlo simulation for cost risk analysis.
        
        Args:
            base_cost: Base project cost (P50 estimate).
            risk_factors: List of identified risk factors.
            iterations: Number of simulation iterations.
            cost_variance_low: Base cost variance low multiplier.
            cost_variance_high: Base cost variance high multiplier.
            
        Returns:
            MonteCarloResult with percentiles and statistics.
        """
        logger.info(
            "monte_carlo_simulation_start",
            base_cost=base_cost,
            iterations=iterations,
            risk_factor_count=len(risk_factors)
        )
        
        results: List[float] = []
        variance_contributions: Dict[str, List[float]] = {rf.id: [] for rf in risk_factors}
        
        for _ in range(iterations):
            # Start with base cost variance
            iteration_cost = self._triangular(
                base_cost * cost_variance_low,
                base_cost,
                base_cost * cost_variance_high
            )
            
            # Apply each risk factor
            for rf in risk_factors:
                # Determine if risk occurs this iteration
                if random.random() < rf.probability:
                    # Calculate impact using triangular distribution
                    mode = (rf.cost_impact_low + rf.cost_impact_high) / 2
                    impact = self._triangular(
                        rf.cost_impact_low,
                        mode,
                        rf.cost_impact_high
                    )
                    iteration_cost += impact
                    variance_contributions[rf.id].append(impact)
                else:
                    variance_contributions[rf.id].append(0.0)
            
            results.append(iteration_cost)
        
        # Sort for percentile calculation
        results.sort()
        
        # Calculate percentiles
        percentiles = PercentileValues(
            p10=round(self._calculate_percentile(results, 10), 2),
            p25=round(self._calculate_percentile(results, 25), 2),
            p50=round(self._calculate_percentile(results, 50), 2),
            p75=round(self._calculate_percentile(results, 75), 2),
            p80=round(self._calculate_percentile(results, 80), 2),
            p90=round(self._calculate_percentile(results, 90), 2),
            p95=round(self._calculate_percentile(results, 95), 2),
        )
        
        # Calculate statistics
        mean = sum(results) / len(results)
        variance = sum((x - mean) ** 2 for x in results) / len(results)
        std_dev = variance ** 0.5
        
        # Calculate skewness
        if std_dev > 0:
            skewness = sum((x - mean) ** 3 for x in results) / (len(results) * std_dev ** 3)
        else:
            skewness = 0.0
        
        statistics = DistributionStatistics(
            min=round(min(results), 2),
            max=round(max(results), 2),
            mean=round(mean, 2),
            std_dev=round(std_dev, 2),
            median=round(self._calculate_percentile(results, 50), 2),
            skewness=round(skewness, 4),
        )
        
        # Calculate variance contribution for each risk factor
        total_variance = sum(
            sum(v ** 2 for v in contributions)
            for contributions in variance_contributions.values()
        )
        
        if total_variance > 0:
            for rf in risk_factors:
                rf_variance = sum(v ** 2 for v in variance_contributions[rf.id])
                rf.variance_contribution = round(rf_variance / total_variance, 4)
        
        # Sort risks by variance contribution
        top_risk_contributors = sorted(
            [rf.id for rf in risk_factors],
            key=lambda rid: next(rf.variance_contribution for rf in risk_factors if rf.id == rid),
            reverse=True
        )[:5]
        
        # Create histogram (20 bins)
        num_bins = 20
        bin_width = (max(results) - min(results)) / num_bins
        histogram_bins = [min(results) + i * bin_width for i in range(num_bins + 1)]
        histogram_counts = [0] * num_bins
        
        for value in results:
            bin_idx = min(int((value - min(results)) / bin_width), num_bins - 1)
            histogram_counts[bin_idx] += 1

        # Build top risks list (by variance contribution, fallback to expected impact)
        top_risks = sorted(
            risk_factors,
            key=lambda r: (r.variance_contribution, r.expected_impact()),
            reverse=True
        )[:5]
        
        logger.info(
            "monte_carlo_simulation_complete",
            iterations=iterations,
            p50=percentiles.p50,
            p80=percentiles.p80,
            p90=percentiles.p90,
            std_dev=statistics.std_dev
        )
        
        return MonteCarloResult(
            iterations=iterations,
            seed=self._seed,
            percentiles=percentiles,
            statistics=statistics,
            histogram_bins=[round(b, 2) for b in histogram_bins],
            histogram_counts=histogram_counts,
            top_risk_contributors=top_risk_contributors,
            top_risks=[
                {
                    "id": r.id,
                    "name": r.name,
                    "expected_impact": round(r.expected_impact(), 2),
                    "variance_contribution": r.variance_contribution
                }
                for r in top_risks
            ],
        )
    
    def calculate_contingency(
        self,
        base_cost: float,
        monte_carlo_result: MonteCarloResult,
        confidence_level: str = "P80"
    ) -> ContingencyRecommendation:
        """Calculate recommended contingency based on Monte Carlo results.
        
        Args:
            base_cost: Original base cost estimate.
            monte_carlo_result: Results from Monte Carlo simulation.
            confidence_level: Confidence level for recommendation (P50/P80/P90).
            
        Returns:
            ContingencyRecommendation with amounts and rationale.
        """
        p50 = monte_carlo_result.percentiles.p50
        p80 = monte_carlo_result.percentiles.p80
        p90 = monte_carlo_result.percentiles.p90
        
        # Calculate contingency amounts
        p50_contingency = max(0, p50 - base_cost)
        p80_contingency = max(0, p80 - base_cost)
        p90_contingency = max(0, p90 - base_cost)
        
        # Calculate percentages (capped at 50% per model constraints)
        MAX_CONTINGENCY_PCT = 50.0
        p50_pct = min((p50_contingency / base_cost * 100) if base_cost > 0 else 0, MAX_CONTINGENCY_PCT)
        p80_pct = min((p80_contingency / base_cost * 100) if base_cost > 0 else 0, MAX_CONTINGENCY_PCT)
        p90_pct = min((p90_contingency / base_cost * 100) if base_cost > 0 else 0, MAX_CONTINGENCY_PCT)
        
        # Select recommended based on confidence level
        if confidence_level == "P90":
            recommended_pct = p90_pct
            recommended_amt = p90_contingency
            basis = f"Based on P90 ({confidence_level}) confidence level - covers 90% of scenarios"
        elif confidence_level == "P50":
            recommended_pct = p50_pct
            recommended_amt = p50_contingency
            basis = f"Based on P50 ({confidence_level}) confidence level - median expectation"
        else:  # Default to P80
            recommended_pct = p80_pct
            recommended_amt = p80_contingency
            basis = f"Based on P80 ({confidence_level}) confidence level - industry standard conservative estimate"
        
        return ContingencyRecommendation(
            recommended_percentage=round(recommended_pct, 1),
            recommended_amount=round(recommended_amt, 2),
            basis=basis,
            confidence_level=confidence_level,
            conservative_percentage=round(p90_pct, 1),
            conservative_amount=round(p90_contingency, 2),
            optimistic_percentage=round(p50_pct, 1),
            optimistic_amount=round(p50_contingency, 2),
        )
    
    def determine_risk_level(
        self,
        monte_carlo_result: MonteCarloResult,
        risk_factors: List[RiskFactor]
    ) -> Tuple[str, List[str]]:
        """Determine overall risk level and key findings.
        
        Args:
            monte_carlo_result: Monte Carlo simulation results.
            risk_factors: Identified risk factors.
            
        Returns:
            Tuple of (risk_level, key_findings).
        """
        # Calculate coefficient of variation
        cv = monte_carlo_result.get_coefficient_of_variation()
        range_spread = monte_carlo_result.get_range_spread()
        
        # Count high-impact risks
        high_impact_count = sum(
            1 for rf in risk_factors
            if rf.impact in [RiskImpact.HIGH, RiskImpact.CRITICAL]
            and rf.probability > 0.3
        )
        
        # Determine risk level
        if cv > 0.15 or range_spread > 1.25 or high_impact_count >= 3:
            risk_level = "High"
        elif cv > 0.08 or range_spread > 1.15 or high_impact_count >= 2:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Generate key findings
        key_findings = []
        
        key_findings.append(
            f"Cost range from ${monte_carlo_result.percentiles.p10:,.0f} to "
            f"${monte_carlo_result.percentiles.p90:,.0f} ({range_spread:.0%} spread)"
        )
        
        if high_impact_count > 0:
            key_findings.append(
                f"{high_impact_count} high-impact risk(s) identified with significant probability"
            )
        
        # Top risk factor
        top_risks = sorted(risk_factors, key=lambda r: r.variance_contribution, reverse=True)
        if top_risks and top_risks[0].variance_contribution > 0.2:
            key_findings.append(
                f"'{top_risks[0].name}' contributes {top_risks[0].variance_contribution:.0%} of cost variance"
            )
        
        key_findings.append(
            f"Recommended {monte_carlo_result.percentiles.p80 - monte_carlo_result.percentiles.p50:,.0f} "
            f"contingency for P80 confidence"
        )
        
        return risk_level, key_findings

