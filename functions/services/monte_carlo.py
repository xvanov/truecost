"""
Monte Carlo Simulation Service for TrueCost.

Provides probabilistic cost estimation using Monte Carlo simulation
with triangular distributions for risk analysis.

Architecture:
- Uses NumPy for efficient vectorized operations
- Calculates P50, P80, P90 confidence intervals
- Performs sensitivity analysis to identify top risk factors
- Generates histogram data for visualization

References:
- docs/sprint-artifacts/tech-spec-epic-4.md
- docs/architecture.md (ADR-007: NumPy for Monte Carlo)
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
import time

import numpy as np
import structlog
from math import erf, sqrt

# Configure structlog logger
logger = structlog.get_logger(__name__)

def _standard_normal_cdf(x: np.ndarray) -> np.ndarray:
    """Vectorized standard normal CDF using erf.

    Avoids SciPy dependency.
    """
    # Φ(x) = 0.5 * (1 + erf(x / sqrt(2)))
    v_erf = np.vectorize(erf)
    return 0.5 * (1.0 + v_erf(x / sqrt(2.0)))


# =============================================================================
# Data Models (Story 4.2 - Task 1)
# =============================================================================


@dataclass
class LineItemInput:
    """
    Input structure for a single line item in Monte Carlo simulation.

    Attributes:
        id: Unique identifier for the line item
        description: Human-readable description
        quantity: Number of units
        unit_cost_low: Optimistic unit cost estimate
        unit_cost_likely: Most likely unit cost estimate
        unit_cost_high: Pessimistic unit cost estimate
    """

    id: str
    description: str
    quantity: float
    unit_cost_low: float
    unit_cost_likely: float
    unit_cost_high: float


@dataclass
class RiskFactor:
    """
    Individual risk factor identified by sensitivity analysis.

    Attributes:
        item: Description or ID of the line item
        impact: Dollar impact on total cost
        probability: Probability of occurrence (0-1)
        sensitivity: Correlation coefficient (higher = more impact on variance)
    """

    item: str
    impact: float
    probability: float
    sensitivity: float


@dataclass
class HistogramBin:
    """
    Single histogram bin for distribution visualization.

    Attributes:
        range_low: Lower bound of the bin
        range_high: Upper bound of the bin
        count: Number of iterations falling in this bin
        percentage: Percentage of total iterations
    """

    range_low: float
    range_high: float
    count: int
    percentage: float


@dataclass
class MonteCarloResult:
    """
    Complete Monte Carlo simulation result.

    Attributes:
        iterations: Number of simulation iterations run
        p50: 50th percentile (median) cost estimate
        p80: 80th percentile cost estimate
        p90: 90th percentile cost estimate
        mean: Mean cost across all iterations
        std_dev: Standard deviation of cost distribution
        min_value: Minimum cost from all iterations
        max_value: Maximum cost from all iterations
        recommended_contingency: Recommended contingency percentage
        top_risks: List of top 5 risk factors by impact
        histogram: Histogram bins for visualization
    """

    iterations: int
    p50: float
    p80: float
    p90: float
    mean: float
    std_dev: float
    min_value: float
    max_value: float
    recommended_contingency: float
    top_risks: List[RiskFactor]
    histogram: List[HistogramBin]


# =============================================================================
# Labor Simulation Data Models
# =============================================================================


@dataclass
class LaborLineItemInput:
    """
    Input structure for labor cost simulation.

    Attributes:
        id: Unique identifier for the labor item
        description: Human-readable description
        trade: Trade category (electrician, plumber, carpenter, etc.)
        labor_hours: Total labor hours for this item
        labor_rate_low: Optimistic hourly rate
        labor_rate_likely: Most likely hourly rate
        labor_rate_high: Pessimistic hourly rate
        productivity_factor_low: Best case productivity (default 0.85 = 15% faster)
        productivity_factor_likely: Normal productivity (default 1.0)
        productivity_factor_high: Worst case productivity (default 1.25 = 25% slower)
    """

    id: str
    description: str
    trade: str
    labor_hours: float
    labor_rate_low: float
    labor_rate_likely: float
    labor_rate_high: float
    productivity_factor_low: float = 0.85
    productivity_factor_likely: float = 1.0
    productivity_factor_high: float = 1.25


@dataclass
class LaborRiskFactor:
    """
    Labor-specific risk factor identified by sensitivity analysis.

    Attributes:
        trade: Trade category
        impact: Dollar impact on total labor cost
        variance_contribution: Percentage contribution to total variance (0-1)
        sensitivity: Correlation coefficient with total cost
    """

    trade: str
    impact: float
    variance_contribution: float
    sensitivity: float


@dataclass
class LaborMonteCarloResult:
    """
    Results from labor cost Monte Carlo simulation.

    Attributes:
        iterations: Number of simulation iterations
        p50: 50th percentile labor cost
        p80: 80th percentile labor cost
        p90: 90th percentile labor cost
        mean: Mean labor cost
        std_dev: Standard deviation
        min_value: Minimum labor cost from iterations
        max_value: Maximum labor cost from iterations
        recommended_contingency: Recommended contingency percentage
        top_labor_risks: Top risk factors by trade
        histogram: Histogram bins for visualization
        by_trade: Per-trade percentile breakdown
    """

    iterations: int
    p50: float
    p80: float
    p90: float
    mean: float
    std_dev: float
    min_value: float
    max_value: float
    recommended_contingency: float
    top_labor_risks: List[LaborRiskFactor]
    histogram: List[HistogramBin]
    by_trade: Dict[str, Dict[str, float]]


# =============================================================================
# Schedule Simulation Data Models
# =============================================================================


@dataclass
class ScheduleTaskInput:
    """
    Input structure for schedule/timeline simulation.

    Attributes:
        id: Unique task identifier
        name: Task name
        duration_days: Expected duration in working days
        duration_range_low: Optimistic duration (best case)
        duration_range_high: Pessimistic duration (worst case)
        is_critical: Whether task is on critical path
        weather_sensitive: Whether task is affected by weather
        phase: Construction phase (demo, framing, etc.)
    """

    id: str
    name: str
    duration_days: int
    duration_range_low: int
    duration_range_high: int
    is_critical: bool = False
    weather_sensitive: bool = False
    phase: str = ""


@dataclass
class TaskSensitivity:
    """
    Task sensitivity to schedule variance.

    Attributes:
        task_id: Task identifier
        task_name: Task name
        variance_contribution: Percentage contribution to schedule variance
        is_critical: Whether on critical path
    """

    task_id: str
    task_name: str
    variance_contribution: float
    is_critical: bool


@dataclass
class ScheduleMonteCarloResult:
    """
    Results from schedule Monte Carlo simulation.

    Attributes:
        iterations: Number of simulation iterations
        p50_days: 50th percentile duration in days
        p80_days: 80th percentile duration in days
        p90_days: 90th percentile duration in days
        mean_days: Mean duration in days
        std_dev_days: Standard deviation in days
        min_days: Minimum duration from iterations
        max_days: Maximum duration from iterations
        critical_path_variance: Variance of critical path duration
        schedule_risk_index: Overall schedule risk (0-1 scale)
        histogram: Histogram bins for visualization
        task_sensitivities: Tasks ranked by variance contribution
    """

    iterations: int
    p50_days: int
    p80_days: int
    p90_days: int
    mean_days: float
    std_dev_days: float
    min_days: int
    max_days: int
    critical_path_variance: float
    schedule_risk_index: float
    histogram: List[HistogramBin]
    task_sensitivities: List[TaskSensitivity]


# =============================================================================
# Combined Simulation Data Models
# =============================================================================


@dataclass
class CombinedMonteCarloResult:
    """
    Combined results from correlated material, labor, and schedule simulations.

    Attributes:
        material_cost: Material cost simulation results
        labor_cost: Labor cost simulation results
        schedule: Schedule simulation results
        total_cost_p50: Combined total cost P50
        total_cost_p80: Combined total cost P80
        total_cost_p90: Combined total cost P90
        total_cost_mean: Combined total cost mean
        total_cost_std_dev: Combined total cost standard deviation
        correlation_applied: Whether correlations were applied
    """

    material_cost: MonteCarloResult
    labor_cost: LaborMonteCarloResult
    schedule: ScheduleMonteCarloResult
    total_cost_p50: float
    total_cost_p80: float
    total_cost_p90: float
    total_cost_mean: float
    total_cost_std_dev: float
    correlation_applied: bool = True


# =============================================================================
# Trade Variance Configuration
# =============================================================================

# Trade-specific variance factors based on industry data
# rate_cv: Coefficient of variation for hourly rates
# productivity_cv: Coefficient of variation for productivity
TRADE_VARIANCE_FACTORS: Dict[str, Dict[str, float]] = {
    "electrician": {"rate_cv": 0.15, "productivity_cv": 0.12},
    "plumber": {"rate_cv": 0.15, "productivity_cv": 0.12},
    "carpenter": {"rate_cv": 0.12, "productivity_cv": 0.15},
    "hvac_tech": {"rate_cv": 0.18, "productivity_cv": 0.10},
    "hvac": {"rate_cv": 0.18, "productivity_cv": 0.10},
    "roofer": {"rate_cv": 0.20, "productivity_cv": 0.18},
    "painter": {"rate_cv": 0.10, "productivity_cv": 0.12},
    "tile_setter": {"rate_cv": 0.12, "productivity_cv": 0.15},
    "general_labor": {"rate_cv": 0.08, "productivity_cv": 0.20},
    "general": {"rate_cv": 0.10, "productivity_cv": 0.15},
    "drywall": {"rate_cv": 0.12, "productivity_cv": 0.15},
    "flooring": {"rate_cv": 0.12, "productivity_cv": 0.12},
    "concrete": {"rate_cv": 0.15, "productivity_cv": 0.18},
    "masonry": {"rate_cv": 0.15, "productivity_cv": 0.15},
    "demolition": {"rate_cv": 0.10, "productivity_cv": 0.20},
}

# Correlation matrix for cross-domain effects
# Positive correlations: when one domain has overruns, others tend to as well
CORRELATION_MATRIX: Dict[tuple, float] = {
    ("material", "labor"): 0.3,      # Moderate: material issues can affect labor
    ("material", "schedule"): 0.2,   # Weak: material delays affect schedule
    ("labor", "schedule"): 0.5,      # Strong: labor issues strongly affect schedule
}


# =============================================================================
# Monte Carlo Simulation (Story 4.2 - Task 3)
# =============================================================================


def run_simulation(
    line_items: List[LineItemInput],
    iterations: int = 1000,
    confidence_levels: Optional[List[int]] = None,
    num_histogram_bins: int = 20,
) -> MonteCarloResult:
    """
    Run Monte Carlo simulation on cost estimate.

    Implements AC 4.2.2 through AC 4.2.7:
    - AC 4.2.2: Runs 1000+ iterations using triangular distributions
    - AC 4.2.3: Calculates P50, P80, P90 percentiles correctly
    - AC 4.2.4: Derives contingency from P80-P50 spread
    - AC 4.2.5: Identifies top 5 risk factors by variance contribution
    - AC 4.2.6: Performance target < 2 seconds for 100 line items
    - AC 4.2.7: Returns histogram data for chart visualization

    Args:
        line_items: List of LineItemInput with cost ranges
        iterations: Number of simulation iterations (default 1000)
        confidence_levels: Percentile levels to calculate (default [50, 80, 90])
        num_histogram_bins: Number of bins for histogram (default 20)

    Returns:
        MonteCarloResult with percentiles, risks, and histogram

    Example:
        >>> items = [
        ...     LineItemInput("1", "Cabinets", 20, 175, 225, 350),
        ...     LineItemInput("2", "Countertops", 40, 65, 85, 125),
        ... ]
        >>> result = run_simulation(items, iterations=1000)
        >>> result.p50 < result.p80 < result.p90
        True
    """
    start_time = time.perf_counter()

    if confidence_levels is None:
        confidence_levels = [50, 80, 90]

    if not line_items:
        logger.warning("monte_carlo_empty_input", message="No line items provided")
        return MonteCarloResult(
            iterations=0,
            p50=0.0,
            p80=0.0,
            p90=0.0,
            mean=0.0,
            std_dev=0.0,
            min_value=0.0,
            max_value=0.0,
            recommended_contingency=0.0,
            top_risks=[],
            histogram=[],
        )

    # Set random seed for reproducibility in tests (but allow variance in production)
    # np.random.seed(None) is the default, which uses system entropy

    num_items = len(line_items)

    # Vectorized simulation using NumPy
    # Create arrays for triangular distribution parameters
    lows = np.array([item.unit_cost_low * item.quantity for item in line_items])
    modes = np.array([item.unit_cost_likely * item.quantity for item in line_items])
    highs = np.array([item.unit_cost_high * item.quantity for item in line_items])

    # Generate samples for all items across all iterations
    # Shape: (iterations, num_items)
    samples = np.zeros((iterations, num_items))
    for i, (low, mode, high) in enumerate(zip(lows, modes, highs)):
        if low == high:
            # No variance - use constant value
            samples[:, i] = np.full(iterations, mode)
        else:
            samples[:, i] = np.random.triangular(low, mode, high, size=iterations)

    # Calculate totals for each iteration
    totals = np.sum(samples, axis=1)

    # Calculate percentiles (AC 4.2.3)
    p50 = float(np.percentile(totals, 50))
    p80 = float(np.percentile(totals, 80))
    p90 = float(np.percentile(totals, 90))

    # Calculate statistics
    mean = float(np.mean(totals))
    std_dev = float(np.std(totals))
    min_value = float(np.min(totals))
    max_value = float(np.max(totals))

    # Calculate recommended contingency (AC 4.2.4)
    # Formula: (P80 - P50) / P50 * 100
    if p50 > 0:
        recommended_contingency = round((p80 - p50) / p50 * 100, 2)
    else:
        recommended_contingency = 0.0

    # Sensitivity analysis to identify top risk factors (AC 4.2.5)
    # Calculate correlation between each item's samples and total
    top_risks = _calculate_risk_factors(samples, totals, line_items)

    # Generate histogram (AC 4.2.7)
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    duration_ms = (time.perf_counter() - start_time) * 1000

    # Structured logging (Task 4)
    logger.info(
        "monte_carlo_complete",
        iterations=iterations,
        num_items=num_items,
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        contingency=recommended_contingency,
        duration_ms=round(duration_ms, 2),
    )

    return MonteCarloResult(
        iterations=iterations,
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        mean=round(mean, 2),
        std_dev=round(std_dev, 2),
        min_value=round(min_value, 2),
        max_value=round(max_value, 2),
        recommended_contingency=recommended_contingency,
        top_risks=top_risks,
        histogram=histogram,
    )


def _calculate_risk_factors(
    samples: np.ndarray,
    totals: np.ndarray,
    line_items: List[LineItemInput],
) -> List[RiskFactor]:
    """
    Calculate top 5 risk factors by variance contribution.

    Uses correlation coefficients to determine sensitivity of each
    line item to the total cost variance.

    Args:
        samples: Array of shape (iterations, num_items)
        totals: Array of total costs per iteration
        line_items: Original line item inputs

    Returns:
        List of top 5 RiskFactor sorted by impact descending
    """
    risk_factors = []

    for i, item in enumerate(line_items):
        item_samples = samples[:, i]

        # Calculate correlation coefficient (sensitivity)
        if np.std(item_samples) > 0 and np.std(totals) > 0:
            correlation = np.corrcoef(item_samples, totals)[0, 1]
        else:
            correlation = 0.0

        # Calculate impact as the variance contribution
        # Impact is the difference between high and likely estimate * sensitivity
        expected = item.unit_cost_likely * item.quantity
        high_end = item.unit_cost_high * item.quantity
        impact = (high_end - expected) * abs(correlation)

        # Probability estimate based on distribution shape
        # For triangular distribution, probability of exceeding likely is ~33%
        probability = 0.33

        risk_factors.append(
            RiskFactor(
                item=item.description,
                impact=round(impact, 2),
                probability=probability,
                sensitivity=round(abs(correlation), 4),
            )
        )

    # Sort by impact descending and take top 5
    risk_factors.sort(key=lambda x: x.impact, reverse=True)
    return risk_factors[:5]


def _generate_histogram(
    totals: np.ndarray,
    num_bins: int,
    iterations: int,
) -> List[HistogramBin]:
    """
    Generate histogram bins for distribution visualization.

    Args:
        totals: Array of total costs per iteration
        num_bins: Number of histogram bins
        iterations: Total number of iterations

    Returns:
        List of HistogramBin for chart rendering
    """
    # Use NumPy's histogram function
    counts, bin_edges = np.histogram(totals, bins=num_bins)

    histogram = []
    for i in range(len(counts)):
        histogram.append(
            HistogramBin(
                range_low=round(bin_edges[i], 2),
                range_high=round(bin_edges[i + 1], 2),
                count=int(counts[i]),
                percentage=round(counts[i] / iterations * 100, 2),
            )
        )

    return histogram


# =============================================================================
# Utility Functions
# =============================================================================


def create_line_item(
    id: str,
    description: str,
    quantity: float,
    unit_cost: float,
    variance_pct: float = 0.20,
) -> LineItemInput:
    """
    Convenience function to create a LineItemInput with symmetric variance.

    Args:
        id: Unique identifier
        description: Item description
        quantity: Number of units
        unit_cost: Base unit cost (used as "likely" estimate)
        variance_pct: Percentage variance for low/high (default 20%)

    Returns:
        LineItemInput with calculated low/likely/high costs

    Example:
        >>> item = create_line_item("1", "Cabinets", 20, 225)
        >>> item.unit_cost_low
        180.0
        >>> item.unit_cost_likely
        225.0
        >>> item.unit_cost_high
        270.0
    """
    low = unit_cost * (1 - variance_pct)
    high = unit_cost * (1 + variance_pct)

    return LineItemInput(
        id=id,
        description=description,
        quantity=quantity,
        unit_cost_low=low,
        unit_cost_likely=unit_cost,
        unit_cost_high=high,
    )


# =============================================================================
# Labor Cost Simulation
# =============================================================================


def run_labor_simulation(
    labor_items: List[LaborLineItemInput],
    iterations: int = 1000,
    location_factor: float = 1.0,
    is_union: bool = False,
    num_histogram_bins: int = 20,
) -> LaborMonteCarloResult:
    """
    Run Monte Carlo simulation for labor costs.

    Simulates labor cost uncertainty using:
    - Triangular distribution for labor rates (hourly rates)
    - Triangular distribution for productivity factors
    - Trade-specific variance from TRADE_VARIANCE_FACTORS
    - Location and union adjustments

    Labor cost = hours * rate * productivity_factor * location_factor

    Args:
        labor_items: List of LaborLineItemInput with rate ranges
        iterations: Number of simulation iterations (default 1000)
        location_factor: Location cost multiplier (default 1.0)
        is_union: Whether union labor rates apply (adds 15% if True)
        num_histogram_bins: Number of bins for histogram (default 20)

    Returns:
        LaborMonteCarloResult with percentiles, trade breakdown, and histogram

    Example:
        >>> items = [
        ...     LaborLineItemInput("1", "Electrical rough-in", "electrician",
        ...                        40, 45, 55, 70),
        ...     LaborLineItemInput("2", "Plumbing rough-in", "plumber",
        ...                        32, 50, 60, 75),
        ... ]
        >>> result = run_labor_simulation(items, iterations=1000)
        >>> result.p50 < result.p80 < result.p90
        True
    """
    start_time = time.perf_counter()

    if not labor_items:
        logger.warning("labor_monte_carlo_empty_input", message="No labor items provided")
        return LaborMonteCarloResult(
            iterations=0,
            p50=0.0,
            p80=0.0,
            p90=0.0,
            mean=0.0,
            std_dev=0.0,
            min_value=0.0,
            max_value=0.0,
            recommended_contingency=0.0,
            top_labor_risks=[],
            histogram=[],
            by_trade={},
        )

    # Union labor premium
    union_multiplier = 1.15 if is_union else 1.0

    num_items = len(labor_items)

    # Group items by trade for by_trade breakdown
    trade_indices: Dict[str, List[int]] = {}
    for i, item in enumerate(labor_items):
        trade = item.trade.lower()
        if trade not in trade_indices:
            trade_indices[trade] = []
        trade_indices[trade].append(i)

    # Generate samples for all items across all iterations
    # Shape: (iterations, num_items)
    samples = np.zeros((iterations, num_items))

    for i, item in enumerate(labor_items):
        trade = item.trade.lower()
        variance_config = TRADE_VARIANCE_FACTORS.get(
            trade, {"rate_cv": 0.12, "productivity_cv": 0.15}
        )

        # Sample labor rates using triangular distribution
        rate_low = item.labor_rate_low
        rate_likely = item.labor_rate_likely
        rate_high = item.labor_rate_high

        if rate_low == rate_high:
            rate_samples = np.full(iterations, rate_likely)
        else:
            rate_samples = np.random.triangular(rate_low, rate_likely, rate_high, size=iterations)

        # Sample productivity factors using triangular distribution
        prod_low = item.productivity_factor_low
        prod_likely = item.productivity_factor_likely
        prod_high = item.productivity_factor_high

        if prod_low == prod_high:
            productivity_samples = np.full(iterations, prod_likely)
        else:
            productivity_samples = np.random.triangular(prod_low, prod_likely, prod_high, size=iterations)

        # Calculate labor cost for each iteration
        # Cost = hours * rate * productivity * location * union
        samples[:, i] = (
            item.labor_hours
            * rate_samples
            * productivity_samples
            * location_factor
            * union_multiplier
        )

    # Calculate totals for each iteration
    totals = np.sum(samples, axis=1)

    # Calculate percentiles
    p50 = float(np.percentile(totals, 50))
    p80 = float(np.percentile(totals, 80))
    p90 = float(np.percentile(totals, 90))

    # Calculate statistics
    mean = float(np.mean(totals))
    std_dev = float(np.std(totals))
    min_value = float(np.min(totals))
    max_value = float(np.max(totals))

    # Calculate recommended contingency
    if p50 > 0:
        recommended_contingency = round((p80 - p50) / p50 * 100, 2)
    else:
        recommended_contingency = 0.0

    # Calculate by-trade breakdown
    by_trade: Dict[str, Dict[str, float]] = {}
    for trade, indices in trade_indices.items():
        trade_samples = np.sum(samples[:, indices], axis=1)
        by_trade[trade] = {
            "p50": round(float(np.percentile(trade_samples, 50)), 2),
            "p80": round(float(np.percentile(trade_samples, 80)), 2),
            "p90": round(float(np.percentile(trade_samples, 90)), 2),
        }

    # Calculate labor risk factors by trade
    top_labor_risks = _calculate_labor_risk_factors(samples, totals, labor_items, trade_indices)

    # Generate histogram
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    duration_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "labor_monte_carlo_complete",
        iterations=iterations,
        num_items=num_items,
        num_trades=len(trade_indices),
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        contingency=recommended_contingency,
        duration_ms=round(duration_ms, 2),
    )

    return LaborMonteCarloResult(
        iterations=iterations,
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        mean=round(mean, 2),
        std_dev=round(std_dev, 2),
        min_value=round(min_value, 2),
        max_value=round(max_value, 2),
        recommended_contingency=recommended_contingency,
        top_labor_risks=top_labor_risks,
        histogram=histogram,
        by_trade=by_trade,
    )


def _calculate_labor_risk_factors(
    samples: np.ndarray,
    totals: np.ndarray,
    labor_items: List[LaborLineItemInput],
    trade_indices: Dict[str, List[int]],
) -> List[LaborRiskFactor]:
    """
    Calculate top labor risk factors by trade.

    Uses variance contribution to identify which trades drive the most uncertainty.

    Args:
        samples: Array of shape (iterations, num_items)
        totals: Array of total costs per iteration
        labor_items: Original labor item inputs
        trade_indices: Mapping of trade names to item indices

    Returns:
        List of top 5 LaborRiskFactor sorted by variance contribution
    """
    total_variance = float(np.var(totals))
    if total_variance == 0:
        return []

    risk_factors = []

    for trade, indices in trade_indices.items():
        # Sum samples for this trade
        trade_samples = np.sum(samples[:, indices], axis=1)
        trade_variance = float(np.var(trade_samples))

        # Calculate correlation with total
        if np.std(trade_samples) > 0 and np.std(totals) > 0:
            correlation = np.corrcoef(trade_samples, totals)[0, 1]
        else:
            correlation = 0.0

        # Variance contribution (approximate)
        variance_contribution = trade_variance / total_variance if total_variance > 0 else 0

        # Calculate impact as the spread between P80 and P50 for this trade
        trade_p50 = float(np.percentile(trade_samples, 50))
        trade_p80 = float(np.percentile(trade_samples, 80))
        impact = trade_p80 - trade_p50

        risk_factors.append(
            LaborRiskFactor(
                trade=trade,
                impact=round(impact, 2),
                variance_contribution=round(variance_contribution, 4),
                sensitivity=round(abs(correlation), 4),
            )
        )

    # Sort by variance contribution and take top 5
    risk_factors.sort(key=lambda x: x.variance_contribution, reverse=True)
    return risk_factors[:5]


# =============================================================================
# Schedule Simulation
# =============================================================================


def run_schedule_simulation(
    tasks: List[ScheduleTaskInput],
    iterations: int = 1000,
    weather_impact_factor: float = 1.0,
    num_histogram_bins: int = 20,
) -> ScheduleMonteCarloResult:
    """
    Run Monte Carlo simulation for project schedule.

    Simulates schedule uncertainty using:
    - Triangular distribution for task durations (low, likely, high)
    - Weather impact on sensitive tasks
    - Critical path analysis for variance attribution

    Args:
        tasks: List of ScheduleTaskInput with duration ranges
        iterations: Number of simulation iterations (default 1000)
        weather_impact_factor: Multiplier for weather-sensitive tasks (default 1.0)
        num_histogram_bins: Number of bins for histogram (default 20)

    Returns:
        ScheduleMonteCarloResult with percentiles, task sensitivities, and histogram

    Example:
        >>> tasks = [
        ...     ScheduleTaskInput("1", "Demo", 5, 4, 7, is_critical=True),
        ...     ScheduleTaskInput("2", "Framing", 10, 8, 15, is_critical=True),
        ... ]
        >>> result = run_schedule_simulation(tasks, iterations=1000)
        >>> result.p50_days <= result.p80_days <= result.p90_days
        True
    """
    start_time = time.perf_counter()

    if not tasks:
        logger.warning("schedule_monte_carlo_empty_input", message="No tasks provided")
        return ScheduleMonteCarloResult(
            iterations=0,
            p50_days=0,
            p80_days=0,
            p90_days=0,
            mean_days=0.0,
            std_dev_days=0.0,
            min_days=0,
            max_days=0,
            critical_path_variance=0.0,
            schedule_risk_index=0.0,
            histogram=[],
            task_sensitivities=[],
        )

    num_tasks = len(tasks)

    # Identify critical path tasks
    critical_indices = [i for i, task in enumerate(tasks) if task.is_critical]
    if not critical_indices:
        # If no critical path specified, assume all tasks are sequential
        critical_indices = list(range(num_tasks))

    # Generate samples for all tasks across all iterations
    # Shape: (iterations, num_tasks)
    samples = np.zeros((iterations, num_tasks))

    for i, task in enumerate(tasks):
        low = task.duration_range_low
        mode = task.duration_days
        high = task.duration_range_high

        # Apply weather impact to sensitive tasks
        if task.weather_sensitive and weather_impact_factor > 1.0:
            # Increase the high-end estimate for weather-sensitive tasks
            high = int(high * weather_impact_factor)
            mode = int(mode * (1 + (weather_impact_factor - 1) * 0.3))  # Slight mode shift

        # Ensure low <= mode <= high
        low = min(low, mode)
        high = max(high, mode)

        if low == high:
            samples[:, i] = np.full(iterations, mode)
        else:
            # Use triangular distribution but round to integers
            samples[:, i] = np.round(
                np.random.triangular(float(low), float(mode), float(high), size=iterations)
            )

    # Calculate total duration for each iteration (sum of critical path tasks)
    # For simplicity, we sum all critical tasks (assuming sequential)
    critical_samples = samples[:, critical_indices]
    totals = np.sum(critical_samples, axis=1)

    # Calculate percentiles
    p50_days = int(np.percentile(totals, 50))
    p80_days = int(np.percentile(totals, 80))
    p90_days = int(np.percentile(totals, 90))

    # Calculate statistics
    mean_days = float(np.mean(totals))
    std_dev_days = float(np.std(totals))
    min_days = int(np.min(totals))
    max_days = int(np.max(totals))

    # Critical path variance
    critical_path_variance = float(np.var(totals))

    # Schedule risk index (coefficient of variation, normalized to 0-1)
    # Higher CV = higher risk
    if mean_days > 0:
        cv = std_dev_days / mean_days
        # Normalize: CV of 0.3 or higher = risk index of 1.0
        schedule_risk_index = min(1.0, cv / 0.3)
    else:
        schedule_risk_index = 0.0

    # Calculate task sensitivities
    task_sensitivities = _calculate_task_sensitivities(samples, totals, tasks, critical_indices)

    # Generate histogram
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    duration_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "schedule_monte_carlo_complete",
        iterations=iterations,
        num_tasks=num_tasks,
        num_critical=len(critical_indices),
        p50_days=p50_days,
        p80_days=p80_days,
        p90_days=p90_days,
        risk_index=round(schedule_risk_index, 3),
        duration_ms=round(duration_ms, 2),
    )

    return ScheduleMonteCarloResult(
        iterations=iterations,
        p50_days=p50_days,
        p80_days=p80_days,
        p90_days=p90_days,
        mean_days=round(mean_days, 2),
        std_dev_days=round(std_dev_days, 2),
        min_days=min_days,
        max_days=max_days,
        critical_path_variance=round(critical_path_variance, 2),
        schedule_risk_index=round(schedule_risk_index, 4),
        histogram=histogram,
        task_sensitivities=task_sensitivities,
    )


def _calculate_task_sensitivities(
    samples: np.ndarray,
    totals: np.ndarray,
    tasks: List[ScheduleTaskInput],
    critical_indices: List[int],
) -> List[TaskSensitivity]:
    """
    Calculate task sensitivities to schedule variance.

    Identifies which tasks contribute most to schedule uncertainty.

    Args:
        samples: Array of shape (iterations, num_tasks)
        totals: Array of total durations per iteration
        tasks: Original task inputs
        critical_indices: Indices of critical path tasks

    Returns:
        List of top 5 TaskSensitivity sorted by variance contribution
    """
    total_variance = float(np.var(totals))
    if total_variance == 0:
        return []

    sensitivities = []
    critical_set = set(critical_indices)

    for i, task in enumerate(tasks):
        task_samples = samples[:, i]
        task_variance = float(np.var(task_samples))

        # Calculate correlation with total (only for critical tasks)
        if i in critical_set:
            if np.std(task_samples) > 0 and np.std(totals) > 0:
                correlation = np.corrcoef(task_samples, totals)[0, 1]
            else:
                correlation = 0.0

            # Variance contribution
            variance_contribution = (task_variance / total_variance) * abs(correlation) ** 2
        else:
            variance_contribution = 0.0

        sensitivities.append(
            TaskSensitivity(
                task_id=task.id,
                task_name=task.name,
                variance_contribution=round(variance_contribution, 4),
                is_critical=i in critical_set,
            )
        )

    # Sort by variance contribution and take top 5
    sensitivities.sort(key=lambda x: x.variance_contribution, reverse=True)
    return sensitivities[:5]


# =============================================================================
# Correlated Simulation
# =============================================================================


def run_correlated_simulation(
    material_items: List[LineItemInput],
    labor_items: List[LaborLineItemInput],
    schedule_tasks: List[ScheduleTaskInput],
    iterations: int = 1000,
    location_factor: float = 1.0,
    is_union: bool = False,
    weather_impact_factor: float = 1.0,
    num_histogram_bins: int = 20,
) -> CombinedMonteCarloResult:
    """
    Run correlated Monte Carlo simulation across material, labor, and schedule.

    Uses Cholesky decomposition to generate correlated random samples,
    reflecting real-world dependencies:
    - Material price spikes often coincide with labor shortages
    - Labor issues strongly affect schedule
    - Material delays can extend project duration

    Args:
        material_items: List of LineItemInput for material cost simulation
        labor_items: List of LaborLineItemInput for labor cost simulation
        schedule_tasks: List of ScheduleTaskInput for schedule simulation
        iterations: Number of simulation iterations (default 1000)
        location_factor: Location cost multiplier (default 1.0)
        is_union: Whether union labor rates apply
        weather_impact_factor: Multiplier for weather-sensitive tasks
        num_histogram_bins: Number of bins for histogram (default 20)

    Returns:
        CombinedMonteCarloResult with all three simulations and combined totals

    Example:
        >>> result = run_correlated_simulation(materials, labor, tasks)
        >>> result.total_cost_p50 < result.total_cost_p80 < result.total_cost_p90
        True
    """
    start_time = time.perf_counter()

    # Build 3x3 correlation matrix
    # Order: [material, labor, schedule]
    corr_mat = np.array([
        [1.0, CORRELATION_MATRIX.get(("material", "labor"), 0.3),
         CORRELATION_MATRIX.get(("material", "schedule"), 0.2)],
        [CORRELATION_MATRIX.get(("material", "labor"), 0.3), 1.0,
         CORRELATION_MATRIX.get(("labor", "schedule"), 0.5)],
        [CORRELATION_MATRIX.get(("material", "schedule"), 0.2),
         CORRELATION_MATRIX.get(("labor", "schedule"), 0.5), 1.0],
    ])

    # Cholesky decomposition for generating correlated random variables
    try:
        chol = np.linalg.cholesky(corr_mat)
    except np.linalg.LinAlgError:
        # If matrix is not positive definite, fall back to uncorrelated
        logger.warning(
            "correlation_matrix_not_positive_definite",
            message="Falling back to uncorrelated simulation"
        )
        chol = np.eye(3)

    # Generate correlated uniform random numbers
    # Start with independent standard normal samples
    independent_samples = np.random.standard_normal((iterations, 3))

    # Apply Cholesky to create correlated samples
    correlated_samples = independent_samples @ chol.T

    # Convert to uniform [0, 1] using CDF of standard normal
    uniform_samples = _standard_normal_cdf(correlated_samples)

    # Use correlated uniform samples to drive triangular distributions
    # This creates correlation between the domains while preserving
    # the triangular distribution shape

    # Material simulation with correlated samples
    material_result = _run_material_with_correlation(
        material_items, uniform_samples[:, 0], iterations, num_histogram_bins
    )

    # Labor simulation with correlated samples
    labor_result = _run_labor_with_correlation(
        labor_items, uniform_samples[:, 1], iterations, location_factor,
        is_union, num_histogram_bins
    )

    # Schedule simulation with correlated samples
    schedule_result = _run_schedule_with_correlation(
        schedule_tasks, uniform_samples[:, 2], iterations,
        weather_impact_factor, num_histogram_bins
    )

    # Calculate combined totals
    total_costs = np.array([
        material_result.p50 + labor_result.p50,
        material_result.p80 + labor_result.p80,
        material_result.p90 + labor_result.p90,
    ])

    # For mean and std_dev, we need to account for correlation
    # Using the formula: Var(X+Y) = Var(X) + Var(Y) + 2*Cov(X,Y)
    material_var = material_result.std_dev ** 2
    labor_var = labor_result.std_dev ** 2
    cov_mat_labor = CORRELATION_MATRIX.get(("material", "labor"), 0.3)
    combined_var = material_var + labor_var + 2 * cov_mat_labor * material_result.std_dev * labor_result.std_dev
    combined_std_dev = np.sqrt(combined_var)

    total_cost_mean = material_result.mean + labor_result.mean

    duration_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "correlated_monte_carlo_complete",
        iterations=iterations,
        num_materials=len(material_items),
        num_labor=len(labor_items),
        num_tasks=len(schedule_tasks),
        total_p50=round(material_result.p50 + labor_result.p50, 2),
        total_p90=round(material_result.p90 + labor_result.p90, 2),
        duration_ms=round(duration_ms, 2),
    )

    return CombinedMonteCarloResult(
        material_cost=material_result,
        labor_cost=labor_result,
        schedule=schedule_result,
        total_cost_p50=round(material_result.p50 + labor_result.p50, 2),
        total_cost_p80=round(material_result.p80 + labor_result.p80, 2),
        total_cost_p90=round(material_result.p90 + labor_result.p90, 2),
        total_cost_mean=round(total_cost_mean, 2),
        total_cost_std_dev=round(combined_std_dev, 2),
        correlation_applied=True,
    )


def _inverse_triangular_cdf(u: np.ndarray, low: float, mode: float, high: float) -> np.ndarray:
    """
    Inverse CDF for triangular distribution.

    Converts uniform [0,1] samples to triangular distribution samples.

    Args:
        u: Uniform samples in [0, 1]
        low: Minimum value
        mode: Mode (most likely value)
        high: Maximum value

    Returns:
        Samples from triangular distribution
    """
    if low == high:
        return np.full_like(u, mode)

    # Threshold where CDF transitions
    fc = (mode - low) / (high - low)

    result = np.zeros_like(u)

    # Lower part of distribution
    mask_lower = u < fc
    result[mask_lower] = low + np.sqrt(u[mask_lower] * (high - low) * (mode - low))

    # Upper part of distribution
    mask_upper = ~mask_lower
    result[mask_upper] = high - np.sqrt((1 - u[mask_upper]) * (high - low) * (high - mode))

    return result


def _run_material_with_correlation(
    items: List[LineItemInput],
    uniform_samples: np.ndarray,
    iterations: int,
    num_histogram_bins: int,
) -> MonteCarloResult:
    """
    Run material simulation using correlated uniform samples.

    Uses inverse CDF method to convert correlated uniform samples
    to triangular distribution samples.
    """
    if not items:
        return MonteCarloResult(
            iterations=0, p50=0.0, p80=0.0, p90=0.0, mean=0.0, std_dev=0.0,
            min_value=0.0, max_value=0.0, recommended_contingency=0.0,
            top_risks=[], histogram=[],
        )

    num_items = len(items)
    samples = np.zeros((iterations, num_items))

    for i, item in enumerate(items):
        low = item.unit_cost_low * item.quantity
        mode = item.unit_cost_likely * item.quantity
        high = item.unit_cost_high * item.quantity

        # Use the correlated uniform sample, but add item-specific noise
        # to maintain some independence between items
        item_uniform = 0.7 * uniform_samples + 0.3 * np.random.uniform(0, 1, iterations)
        item_uniform = np.clip(item_uniform, 0.001, 0.999)

        samples[:, i] = _inverse_triangular_cdf(item_uniform, low, mode, high)

    totals = np.sum(samples, axis=1)

    p50 = float(np.percentile(totals, 50))
    p80 = float(np.percentile(totals, 80))
    p90 = float(np.percentile(totals, 90))
    mean = float(np.mean(totals))
    std_dev = float(np.std(totals))

    if p50 > 0:
        recommended_contingency = round((p80 - p50) / p50 * 100, 2)
    else:
        recommended_contingency = 0.0

    top_risks = _calculate_risk_factors(samples, totals, items)
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    return MonteCarloResult(
        iterations=iterations,
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        mean=round(mean, 2),
        std_dev=round(std_dev, 2),
        min_value=round(float(np.min(totals)), 2),
        max_value=round(float(np.max(totals)), 2),
        recommended_contingency=recommended_contingency,
        top_risks=top_risks,
        histogram=histogram,
    )


def _run_labor_with_correlation(
    items: List[LaborLineItemInput],
    uniform_samples: np.ndarray,
    iterations: int,
    location_factor: float,
    is_union: bool,
    num_histogram_bins: int,
) -> LaborMonteCarloResult:
    """
    Run labor simulation using correlated uniform samples.
    """
    if not items:
        return LaborMonteCarloResult(
            iterations=0, p50=0.0, p80=0.0, p90=0.0, mean=0.0, std_dev=0.0,
            min_value=0.0, max_value=0.0, recommended_contingency=0.0,
            top_labor_risks=[], histogram=[], by_trade={},
        )

    union_multiplier = 1.15 if is_union else 1.0
    num_items = len(items)

    trade_indices: Dict[str, List[int]] = {}
    for i, item in enumerate(items):
        trade = item.trade.lower()
        if trade not in trade_indices:
            trade_indices[trade] = []
        trade_indices[trade].append(i)

    samples = np.zeros((iterations, num_items))

    for i, item in enumerate(items):
        # Rate samples
        rate_uniform = 0.7 * uniform_samples + 0.3 * np.random.uniform(0, 1, iterations)
        rate_uniform = np.clip(rate_uniform, 0.001, 0.999)
        rate_samples = _inverse_triangular_cdf(
            rate_uniform,
            item.labor_rate_low,
            item.labor_rate_likely,
            item.labor_rate_high,
        )

        # Productivity samples (less correlated - more item-specific)
        prod_uniform = 0.4 * uniform_samples + 0.6 * np.random.uniform(0, 1, iterations)
        prod_uniform = np.clip(prod_uniform, 0.001, 0.999)
        productivity_samples = _inverse_triangular_cdf(
            prod_uniform,
            item.productivity_factor_low,
            item.productivity_factor_likely,
            item.productivity_factor_high,
        )

        samples[:, i] = (
            item.labor_hours
            * rate_samples
            * productivity_samples
            * location_factor
            * union_multiplier
        )

    totals = np.sum(samples, axis=1)

    p50 = float(np.percentile(totals, 50))
    p80 = float(np.percentile(totals, 80))
    p90 = float(np.percentile(totals, 90))
    mean = float(np.mean(totals))
    std_dev = float(np.std(totals))

    if p50 > 0:
        recommended_contingency = round((p80 - p50) / p50 * 100, 2)
    else:
        recommended_contingency = 0.0

    by_trade: Dict[str, Dict[str, float]] = {}
    for trade, indices in trade_indices.items():
        trade_samples = np.sum(samples[:, indices], axis=1)
        by_trade[trade] = {
            "p50": round(float(np.percentile(trade_samples, 50)), 2),
            "p80": round(float(np.percentile(trade_samples, 80)), 2),
            "p90": round(float(np.percentile(trade_samples, 90)), 2),
        }

    top_labor_risks = _calculate_labor_risk_factors(samples, totals, items, trade_indices)
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    return LaborMonteCarloResult(
        iterations=iterations,
        p50=round(p50, 2),
        p80=round(p80, 2),
        p90=round(p90, 2),
        mean=round(mean, 2),
        std_dev=round(std_dev, 2),
        min_value=round(float(np.min(totals)), 2),
        max_value=round(float(np.max(totals)), 2),
        recommended_contingency=recommended_contingency,
        top_labor_risks=top_labor_risks,
        histogram=histogram,
        by_trade=by_trade,
    )


def _run_schedule_with_correlation(
    tasks: List[ScheduleTaskInput],
    uniform_samples: np.ndarray,
    iterations: int,
    weather_impact_factor: float,
    num_histogram_bins: int,
) -> ScheduleMonteCarloResult:
    """
    Run schedule simulation using correlated uniform samples.
    """
    if not tasks:
        return ScheduleMonteCarloResult(
            iterations=0, p50_days=0, p80_days=0, p90_days=0,
            mean_days=0.0, std_dev_days=0.0, min_days=0, max_days=0,
            critical_path_variance=0.0, schedule_risk_index=0.0,
            histogram=[], task_sensitivities=[],
        )

    num_tasks = len(tasks)
    critical_indices = [i for i, task in enumerate(tasks) if task.is_critical]
    if not critical_indices:
        critical_indices = list(range(num_tasks))

    samples = np.zeros((iterations, num_tasks))

    for i, task in enumerate(tasks):
        low = float(task.duration_range_low)
        mode = float(task.duration_days)
        high = float(task.duration_range_high)

        if task.weather_sensitive and weather_impact_factor > 1.0:
            high = high * weather_impact_factor
            mode = mode * (1 + (weather_impact_factor - 1) * 0.3)

        low = min(low, mode)
        high = max(high, mode)

        # Schedule is strongly correlated (same bad conditions affect all tasks)
        task_uniform = 0.8 * uniform_samples + 0.2 * np.random.uniform(0, 1, iterations)
        task_uniform = np.clip(task_uniform, 0.001, 0.999)

        samples[:, i] = np.round(_inverse_triangular_cdf(task_uniform, low, mode, high))

    critical_samples = samples[:, critical_indices]
    totals = np.sum(critical_samples, axis=1)

    p50_days = int(np.percentile(totals, 50))
    p80_days = int(np.percentile(totals, 80))
    p90_days = int(np.percentile(totals, 90))
    mean_days = float(np.mean(totals))
    std_dev_days = float(np.std(totals))
    critical_path_variance = float(np.var(totals))

    if mean_days > 0:
        cv = std_dev_days / mean_days
        schedule_risk_index = min(1.0, cv / 0.3)
    else:
        schedule_risk_index = 0.0

    task_sensitivities = _calculate_task_sensitivities(samples, totals, tasks, critical_indices)
    histogram = _generate_histogram(totals, num_histogram_bins, iterations)

    return ScheduleMonteCarloResult(
        iterations=iterations,
        p50_days=p50_days,
        p80_days=p80_days,
        p90_days=p90_days,
        mean_days=round(mean_days, 2),
        std_dev_days=round(std_dev_days, 2),
        min_days=int(np.min(totals)),
        max_days=int(np.max(totals)),
        critical_path_variance=round(critical_path_variance, 2),
        schedule_risk_index=round(schedule_risk_index, 4),
        histogram=histogram,
        task_sensitivities=task_sensitivities,
    )
