"""
Unit Tests for Labor Monte Carlo Simulation.

Tests run_labor_simulation() functionality:
- Simulation runs correct number of iterations
- P50 < P80 < P90 percentiles always hold
- By-trade breakdown is calculated correctly
- Top labor risk factors are sorted by variance contribution
- Performance is acceptable
"""

import pytest
import time
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services.monte_carlo import (
    LaborLineItemInput,
    LaborRiskFactor,
    LaborMonteCarloResult,
    run_labor_simulation,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def simple_labor_items():
    """Simple 3-item labor estimate for basic tests."""
    return [
        LaborLineItemInput(
            id="1",
            description="Electrical rough-in",
            trade="electrician",
            labor_hours=40.0,
            labor_rate_low=45.0,
            labor_rate_likely=55.0,
            labor_rate_high=70.0,
        ),
        LaborLineItemInput(
            id="2",
            description="Plumbing rough-in",
            trade="plumber",
            labor_hours=32.0,
            labor_rate_low=50.0,
            labor_rate_likely=60.0,
            labor_rate_high=75.0,
        ),
        LaborLineItemInput(
            id="3",
            description="Painting",
            trade="painter",
            labor_hours=24.0,
            labor_rate_low=35.0,
            labor_rate_likely=45.0,
            labor_rate_high=55.0,
        ),
    ]


@pytest.fixture
def multi_trade_labor_items():
    """10-item labor estimate with multiple trades for comprehensive tests."""
    return [
        LaborLineItemInput("1", "Electrical rough-in", "electrician", 40.0, 45.0, 55.0, 70.0),
        LaborLineItemInput("2", "Electrical finish", "electrician", 16.0, 45.0, 55.0, 70.0),
        LaborLineItemInput("3", "Plumbing rough-in", "plumber", 32.0, 50.0, 60.0, 75.0),
        LaborLineItemInput("4", "Plumbing fixtures", "plumber", 12.0, 50.0, 60.0, 75.0),
        LaborLineItemInput("5", "Framing", "carpenter", 48.0, 40.0, 50.0, 65.0),
        LaborLineItemInput("6", "Trim work", "carpenter", 24.0, 40.0, 50.0, 65.0),
        LaborLineItemInput("7", "Interior paint", "painter", 24.0, 35.0, 45.0, 55.0),
        LaborLineItemInput("8", "HVAC install", "hvac", 20.0, 55.0, 65.0, 80.0),
        LaborLineItemInput("9", "Tile setting", "tile_setter", 16.0, 45.0, 55.0, 70.0),
        LaborLineItemInput("10", "General labor", "general_labor", 32.0, 25.0, 30.0, 40.0),
    ]


@pytest.fixture
def large_labor_items():
    """50-item labor estimate for performance testing."""
    trades = ["electrician", "plumber", "carpenter", "painter", "hvac", "general_labor"]
    items = []
    for i in range(50):
        trade = trades[i % len(trades)]
        items.append(
            LaborLineItemInput(
                id=str(i + 1),
                description=f"Labor task {i + 1}",
                trade=trade,
                labor_hours=float((i % 10) + 1) * 8,
                labor_rate_low=35.0 + (i % 10) * 2,
                labor_rate_likely=45.0 + (i % 10) * 2,
                labor_rate_high=60.0 + (i % 10) * 2,
            )
        )
    return items


# =============================================================================
# Test: Simulation runs correct iterations
# =============================================================================


def test_labor_simulation_runs_1000_iterations(simple_labor_items):
    """Labor simulation runs 1000 iterations by default."""
    result = run_labor_simulation(simple_labor_items, iterations=1000)

    assert result.iterations == 1000


def test_labor_simulation_custom_iterations(simple_labor_items):
    """Labor simulation respects custom iteration count."""
    result = run_labor_simulation(simple_labor_items, iterations=5000)

    assert result.iterations == 5000


# =============================================================================
# Test: P50 < P80 < P90 percentiles
# =============================================================================


def test_labor_percentiles_ordered_correctly(simple_labor_items):
    """P50 < P80 < P90 always holds for labor simulation."""
    result = run_labor_simulation(simple_labor_items, iterations=1000)

    assert result.p50 < result.p80, f"P50 ({result.p50}) should be < P80 ({result.p80})"
    assert result.p80 < result.p90, f"P80 ({result.p80}) should be < P90 ({result.p90})"


def test_labor_percentiles_ordered_multiple_runs(simple_labor_items):
    """P50 < P80 < P90 holds across multiple runs."""
    for _ in range(5):
        result = run_labor_simulation(simple_labor_items, iterations=1000)
        assert result.p50 < result.p80 < result.p90


def test_labor_percentiles_positive(simple_labor_items):
    """All percentiles should be positive."""
    result = run_labor_simulation(simple_labor_items, iterations=1000)

    assert result.p50 > 0
    assert result.p80 > 0
    assert result.p90 > 0


# =============================================================================
# Test: By-trade breakdown
# =============================================================================


def test_labor_by_trade_breakdown(multi_trade_labor_items):
    """By-trade breakdown contains all trades."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    expected_trades = {"electrician", "plumber", "carpenter", "painter", "hvac", "tile_setter", "general_labor"}
    assert set(result.by_trade.keys()) == expected_trades


def test_labor_by_trade_has_percentiles(multi_trade_labor_items):
    """Each trade in by_trade has p50, p80, p90."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    for trade, values in result.by_trade.items():
        assert "p50" in values, f"Trade {trade} missing p50"
        assert "p80" in values, f"Trade {trade} missing p80"
        assert "p90" in values, f"Trade {trade} missing p90"
        assert values["p50"] < values["p80"] < values["p90"]


def test_labor_by_trade_sums_to_total(multi_trade_labor_items):
    """Sum of trade p50s should approximate total p50."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    trade_p50_sum = sum(values["p50"] for values in result.by_trade.values())
    # Allow 5% tolerance due to rounding
    assert abs(trade_p50_sum - result.p50) / result.p50 < 0.05


# =============================================================================
# Test: Top labor risk factors
# =============================================================================


def test_labor_top_risks_sorted_by_variance(multi_trade_labor_items):
    """Top labor risks are sorted by variance contribution descending."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    contributions = [risk.variance_contribution for risk in result.top_labor_risks]
    assert contributions == sorted(contributions, reverse=True)


def test_labor_top_risks_max_five(multi_trade_labor_items):
    """Top labor risks returns at most 5 items."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    assert len(result.top_labor_risks) <= 5


def test_labor_top_risks_are_labor_risk_factors(multi_trade_labor_items):
    """Top risks are LaborRiskFactor instances."""
    result = run_labor_simulation(multi_trade_labor_items, iterations=1000)

    for risk in result.top_labor_risks:
        assert isinstance(risk, LaborRiskFactor)
        assert hasattr(risk, "trade")
        assert hasattr(risk, "impact")
        assert hasattr(risk, "variance_contribution")
        assert hasattr(risk, "sensitivity")


# =============================================================================
# Test: Location factor and union premium
# =============================================================================


def test_labor_location_factor_applied(simple_labor_items):
    """Location factor multiplies labor costs."""
    result_base = run_labor_simulation(simple_labor_items, iterations=1000, location_factor=1.0)
    result_high = run_labor_simulation(simple_labor_items, iterations=1000, location_factor=1.2)

    # With 20% higher location factor, costs should be ~20% higher
    ratio = result_high.p50 / result_base.p50
    assert 1.15 < ratio < 1.25


def test_labor_union_premium_applied(simple_labor_items):
    """Union premium adds 15% to labor costs."""
    result_non_union = run_labor_simulation(simple_labor_items, iterations=1000, is_union=False)
    result_union = run_labor_simulation(simple_labor_items, iterations=1000, is_union=True)

    # Union should be ~15% higher
    ratio = result_union.p50 / result_non_union.p50
    assert 1.10 < ratio < 1.20


# =============================================================================
# Test: Performance
# =============================================================================


def test_labor_performance_50_items(large_labor_items):
    """Labor simulation completes in < 2 seconds for 50 items."""
    start_time = time.perf_counter()
    result = run_labor_simulation(large_labor_items, iterations=1000)
    elapsed = time.perf_counter() - start_time

    assert elapsed < 2.0, f"Simulation took {elapsed:.2f}s, should be < 2s"
    assert result.iterations == 1000


# =============================================================================
# Test: Histogram data
# =============================================================================


def test_labor_histogram_bins_sum_to_iterations(simple_labor_items):
    """Histogram bins sum to iteration count."""
    iterations = 1000
    result = run_labor_simulation(simple_labor_items, iterations=iterations)

    total_count = sum(bin.count for bin in result.histogram)
    assert total_count == iterations


def test_labor_histogram_has_reasonable_bins(simple_labor_items):
    """Histogram has reasonable bin count."""
    result = run_labor_simulation(simple_labor_items, iterations=1000)

    assert 10 <= len(result.histogram) <= 50


# =============================================================================
# Test: Edge Cases
# =============================================================================


def test_labor_empty_items():
    """Empty labor items returns zero values."""
    result = run_labor_simulation([], iterations=1000)

    assert result.iterations == 0
    assert result.p50 == 0.0
    assert result.p80 == 0.0
    assert result.p90 == 0.0
    assert result.by_trade == {}
    assert result.top_labor_risks == []


def test_labor_single_item():
    """Single labor item works correctly."""
    items = [
        LaborLineItemInput("1", "Electrical", "electrician", 40.0, 45.0, 55.0, 70.0)
    ]
    result = run_labor_simulation(items, iterations=1000)

    assert result.iterations == 1000
    assert result.p50 > 0
    assert "electrician" in result.by_trade


def test_labor_zero_hours():
    """Zero labor hours produces zero cost."""
    items = [
        LaborLineItemInput("1", "Zero hours", "electrician", 0.0, 45.0, 55.0, 70.0)
    ]
    result = run_labor_simulation(items, iterations=1000)

    assert result.p50 == 0.0
    assert result.p80 == 0.0
    assert result.p90 == 0.0


# =============================================================================
# Test: Productivity factors
# =============================================================================


def test_labor_productivity_affects_cost(simple_labor_items):
    """Higher productivity factors increase labor costs."""
    # Create items with different productivity ranges
    low_prod_items = [
        LaborLineItemInput(
            id="1", description="Low productivity", trade="electrician",
            labor_hours=40.0, labor_rate_low=50.0, labor_rate_likely=55.0, labor_rate_high=60.0,
            productivity_factor_low=0.9, productivity_factor_likely=1.0, productivity_factor_high=1.1,
        )
    ]
    high_prod_items = [
        LaborLineItemInput(
            id="1", description="High productivity variance", trade="electrician",
            labor_hours=40.0, labor_rate_low=50.0, labor_rate_likely=55.0, labor_rate_high=60.0,
            productivity_factor_low=0.7, productivity_factor_likely=1.0, productivity_factor_high=1.5,
        )
    ]

    result_low = run_labor_simulation(low_prod_items, iterations=1000)
    result_high = run_labor_simulation(high_prod_items, iterations=1000)

    # Higher productivity variance should lead to wider distribution
    low_spread = result_low.p90 - result_low.p50
    high_spread = result_high.p90 - result_high.p50

    assert high_spread > low_spread


# =============================================================================
# Test: Data Model Correctness
# =============================================================================


def test_labor_line_item_input_dataclass():
    """LaborLineItemInput dataclass works correctly."""
    item = LaborLineItemInput(
        id="TEST",
        description="Test labor",
        trade="electrician",
        labor_hours=40.0,
        labor_rate_low=45.0,
        labor_rate_likely=55.0,
        labor_rate_high=70.0,
    )

    assert item.id == "TEST"
    assert item.trade == "electrician"
    assert item.labor_hours == 40.0
    assert item.labor_rate_low < item.labor_rate_likely < item.labor_rate_high
    # Default productivity factors
    assert item.productivity_factor_low == 0.85
    assert item.productivity_factor_likely == 1.0
    assert item.productivity_factor_high == 1.25


def test_labor_monte_carlo_result_dataclass():
    """LaborMonteCarloResult dataclass works correctly."""
    result = LaborMonteCarloResult(
        iterations=1000,
        p50=5000.0,
        p80=5500.0,
        p90=6000.0,
        mean=5200.0,
        std_dev=400.0,
        min_value=4200.0,
        max_value=7000.0,
        recommended_contingency=10.0,
        top_labor_risks=[],
        histogram=[],
        by_trade={"electrician": {"p50": 2500.0, "p80": 2750.0, "p90": 3000.0}},
    )

    assert result.iterations == 1000
    assert result.p50 == 5000.0
    assert "electrician" in result.by_trade
