"""
Unit Tests for Schedule Monte Carlo Simulation.

Tests run_schedule_simulation() and run_correlated_simulation() functionality:
- Schedule simulation runs correct number of iterations
- P50 <= P80 <= P90 days always hold (integer-day percentiles can tie)
- Critical path tasks are identified
- Task sensitivities are calculated correctly
- Correlated simulations produce correlated results
"""

import pytest
import time
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services.monte_carlo import (
    LineItemInput,
    LaborLineItemInput,
    ScheduleTaskInput,
    TaskSensitivity,
    ScheduleMonteCarloResult,
    CombinedMonteCarloResult,
    run_schedule_simulation,
    run_correlated_simulation,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def simple_schedule_tasks():
    """Simple 5-task schedule for basic tests."""
    return [
        ScheduleTaskInput("1", "Demolition", 5, 4, 7, is_critical=True, weather_sensitive=True, phase="demo"),
        ScheduleTaskInput("2", "Framing", 10, 8, 14, is_critical=True, phase="framing"),
        ScheduleTaskInput("3", "Electrical", 6, 5, 8, is_critical=True, phase="rough"),
        ScheduleTaskInput("4", "Plumbing", 5, 4, 7, is_critical=False, phase="rough"),
        ScheduleTaskInput("5", "Finishing", 8, 6, 12, is_critical=True, phase="finish"),
    ]


@pytest.fixture
def large_schedule_tasks():
    """20-task schedule for comprehensive tests."""
    phases = ["demo", "site_prep", "foundation", "framing", "rough", "finish"]
    tasks = []
    for i in range(20):
        phase = phases[i % len(phases)]
        is_critical = i % 3 == 0  # Every 3rd task is critical
        weather_sensitive = phase in ["demo", "site_prep", "foundation"]
        duration = 5 + (i % 10)
        tasks.append(
            ScheduleTaskInput(
                id=str(i + 1),
                name=f"Task {i + 1}",
                duration_days=duration,
                duration_range_low=max(1, duration - 2),
                duration_range_high=duration + 4,
                is_critical=is_critical,
                weather_sensitive=weather_sensitive,
                phase=phase,
            )
        )
    return tasks


@pytest.fixture
def simple_materials():
    """Simple material items for correlated simulation tests."""
    return [
        LineItemInput("1", "Cabinets", 20.0, 175.0, 225.0, 350.0),
        LineItemInput("2", "Countertops", 40.0, 65.0, 85.0, 125.0),
        LineItemInput("3", "Flooring", 200.0, 9.0, 12.0, 18.0),
    ]


@pytest.fixture
def simple_labor():
    """Simple labor items for correlated simulation tests."""
    return [
        LaborLineItemInput("1", "Electrical", "electrician", 40.0, 45.0, 55.0, 70.0),
        LaborLineItemInput("2", "Plumbing", "plumber", 32.0, 50.0, 60.0, 75.0),
        LaborLineItemInput("3", "Carpentry", "carpenter", 48.0, 40.0, 50.0, 65.0),
    ]


# =============================================================================
# Test: Schedule simulation iterations
# =============================================================================


def test_schedule_simulation_runs_1000_iterations(simple_schedule_tasks):
    """Schedule simulation runs 1000 iterations by default."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert result.iterations == 1000


def test_schedule_simulation_custom_iterations(simple_schedule_tasks):
    """Schedule simulation respects custom iteration count."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=5000)

    assert result.iterations == 5000


# =============================================================================
# Test: P50 <= P80 <= P90 days
# =============================================================================


def test_schedule_percentiles_ordered_correctly(simple_schedule_tasks):
    """P50 <= P80 <= P90 days always holds for schedule simulation.

    Note: Percentiles are returned as integer days; ties are possible with
    discrete/rounded totals and finite iterations.
    """
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert result.p50_days <= result.p80_days, f"P50 ({result.p50_days}) should be <= P80 ({result.p80_days})"
    assert result.p80_days <= result.p90_days, f"P80 ({result.p80_days}) should be <= P90 ({result.p90_days})"
    assert result.p50_days <= result.p90_days, f"P50 ({result.p50_days}) should be <= P90 ({result.p90_days})"


def test_schedule_percentiles_ordered_multiple_runs(simple_schedule_tasks):
    """P50 <= P80 <= P90 holds across multiple runs (ties are allowed)."""
    for _ in range(5):
        result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)
        assert result.p50_days <= result.p80_days <= result.p90_days


def test_schedule_percentiles_positive(simple_schedule_tasks):
    """All percentiles should be positive."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert result.p50_days > 0
    assert result.p80_days > 0
    assert result.p90_days > 0


# =============================================================================
# Test: Duration ranges respected
# =============================================================================


def test_schedule_respects_duration_ranges(simple_schedule_tasks):
    """Schedule results fall within sum of duration ranges."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    # Calculate expected bounds for critical path tasks
    critical_tasks = [t for t in simple_schedule_tasks if t.is_critical]
    min_duration = sum(t.duration_range_low for t in critical_tasks)
    max_duration = sum(t.duration_range_high for t in critical_tasks)

    assert result.min_days >= min_duration - 1  # Allow small variance
    assert result.max_days <= max_duration + 1


# =============================================================================
# Test: Critical path handling
# =============================================================================


def test_schedule_uses_critical_path(simple_schedule_tasks):
    """Schedule simulation uses only critical path tasks for total."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    # Critical path tasks: 1, 2, 3, 5 (task 4 is not critical)
    critical_expected = sum(t.duration_days for t in simple_schedule_tasks if t.is_critical)

    # Mean should be close to expected critical path duration
    assert abs(result.mean_days - critical_expected) < critical_expected * 0.2


def test_schedule_all_tasks_critical_if_none_specified():
    """If no tasks are marked critical, all are treated as critical."""
    tasks = [
        ScheduleTaskInput("1", "Task A", 5, 4, 7, is_critical=False),
        ScheduleTaskInput("2", "Task B", 3, 2, 5, is_critical=False),
    ]
    result = run_schedule_simulation(tasks, iterations=1000)

    # Should sum both tasks
    assert result.p50_days >= 6  # 4+2 minimum
    assert result.p90_days <= 12  # 7+5 maximum


# =============================================================================
# Test: Weather impact
# =============================================================================


def test_schedule_weather_impact_increases_duration():
    """Weather impact factor increases duration for sensitive tasks."""
    tasks = [
        ScheduleTaskInput("1", "Outdoor work", 10, 8, 12, is_critical=True, weather_sensitive=True),
    ]

    result_no_weather = run_schedule_simulation(tasks, iterations=1000, weather_impact_factor=1.0)
    result_with_weather = run_schedule_simulation(tasks, iterations=1000, weather_impact_factor=1.3)

    # Weather impact should increase P90
    assert result_with_weather.p90_days > result_no_weather.p90_days


def test_schedule_weather_impact_only_affects_sensitive_tasks():
    """Weather impact only affects weather-sensitive tasks."""
    tasks = [
        ScheduleTaskInput("1", "Indoor work", 10, 8, 12, is_critical=True, weather_sensitive=False),
    ]

    result_no_weather = run_schedule_simulation(tasks, iterations=1000, weather_impact_factor=1.0)
    result_with_weather = run_schedule_simulation(tasks, iterations=1000, weather_impact_factor=1.3)

    # Non-sensitive tasks should not be affected significantly
    assert abs(result_with_weather.p50_days - result_no_weather.p50_days) <= 1


# =============================================================================
# Test: Task sensitivities
# =============================================================================


def test_schedule_task_sensitivities_calculated(simple_schedule_tasks):
    """Task sensitivities are calculated for critical tasks."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert len(result.task_sensitivities) > 0
    assert len(result.task_sensitivities) <= 5  # Top 5


def test_schedule_task_sensitivities_sorted(large_schedule_tasks):
    """Task sensitivities are sorted by variance contribution."""
    result = run_schedule_simulation(large_schedule_tasks, iterations=1000)

    contributions = [s.variance_contribution for s in result.task_sensitivities]
    assert contributions == sorted(contributions, reverse=True)


def test_schedule_task_sensitivities_are_task_sensitivity(simple_schedule_tasks):
    """Task sensitivities are TaskSensitivity instances."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    for sensitivity in result.task_sensitivities:
        assert isinstance(sensitivity, TaskSensitivity)
        assert hasattr(sensitivity, "task_id")
        assert hasattr(sensitivity, "task_name")
        assert hasattr(sensitivity, "variance_contribution")
        assert hasattr(sensitivity, "is_critical")


# =============================================================================
# Test: Schedule risk index
# =============================================================================


def test_schedule_risk_index_valid_range(simple_schedule_tasks):
    """Schedule risk index is between 0 and 1."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert 0 <= result.schedule_risk_index <= 1


def test_schedule_high_variance_increases_risk_index():
    """Higher variance leads to higher risk index."""
    # Low variance tasks
    low_var_tasks = [
        ScheduleTaskInput("1", "Precise task", 10, 9, 11, is_critical=True),
    ]
    # High variance tasks
    high_var_tasks = [
        ScheduleTaskInput("1", "Uncertain task", 10, 5, 20, is_critical=True),
    ]

    result_low = run_schedule_simulation(low_var_tasks, iterations=1000)
    result_high = run_schedule_simulation(high_var_tasks, iterations=1000)

    assert result_high.schedule_risk_index > result_low.schedule_risk_index


# =============================================================================
# Test: Histogram data
# =============================================================================


def test_schedule_histogram_bins_sum_to_iterations(simple_schedule_tasks):
    """Histogram bins sum to iteration count."""
    iterations = 1000
    result = run_schedule_simulation(simple_schedule_tasks, iterations=iterations)

    total_count = sum(bin.count for bin in result.histogram)
    assert total_count == iterations


def test_schedule_histogram_has_reasonable_bins(simple_schedule_tasks):
    """Histogram has reasonable bin count."""
    result = run_schedule_simulation(simple_schedule_tasks, iterations=1000)

    assert 10 <= len(result.histogram) <= 50


# =============================================================================
# Test: Edge Cases
# =============================================================================


def test_schedule_empty_tasks():
    """Empty tasks returns zero values."""
    result = run_schedule_simulation([], iterations=1000)

    assert result.iterations == 0
    assert result.p50_days == 0
    assert result.p80_days == 0
    assert result.p90_days == 0
    assert result.task_sensitivities == []


def test_schedule_single_task():
    """Single task works correctly."""
    tasks = [ScheduleTaskInput("1", "Only task", 10, 8, 14, is_critical=True)]
    result = run_schedule_simulation(tasks, iterations=1000)

    assert result.iterations == 1000
    assert 8 <= result.p50_days <= 14
    assert len(result.task_sensitivities) == 1


def test_schedule_zero_duration():
    """Zero duration task is handled."""
    tasks = [ScheduleTaskInput("1", "Zero task", 0, 0, 0, is_critical=True)]
    result = run_schedule_simulation(tasks, iterations=1000)

    assert result.p50_days == 0


# =============================================================================
# Test: Performance
# =============================================================================


def test_schedule_performance_20_tasks(large_schedule_tasks):
    """Schedule simulation completes in < 2 seconds for 20 tasks."""
    start_time = time.perf_counter()
    result = run_schedule_simulation(large_schedule_tasks, iterations=1000)
    elapsed = time.perf_counter() - start_time

    assert elapsed < 2.0, f"Simulation took {elapsed:.2f}s, should be < 2s"
    assert result.iterations == 1000


# =============================================================================
# Test: Correlated Simulation
# =============================================================================


def test_correlated_simulation_runs(simple_materials, simple_labor, simple_schedule_tasks):
    """Correlated simulation runs with all three domains."""
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
    )

    assert isinstance(result, CombinedMonteCarloResult)
    assert result.correlation_applied is True


def test_correlated_simulation_has_all_results(simple_materials, simple_labor, simple_schedule_tasks):
    """Correlated simulation produces results for all three domains."""
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
    )

    # Material cost result
    assert result.material_cost.iterations == 1000
    assert result.material_cost.p50 > 0

    # Labor cost result
    assert result.labor_cost.iterations == 1000
    assert result.labor_cost.p50 > 0

    # Schedule result
    assert result.schedule.iterations == 1000
    assert result.schedule.p50_days > 0


def test_correlated_simulation_total_cost(simple_materials, simple_labor, simple_schedule_tasks):
    """Total cost is sum of material and labor costs."""
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
    )

    # Total P50 should be material P50 + labor P50
    expected_total_p50 = result.material_cost.p50 + result.labor_cost.p50
    assert abs(result.total_cost_p50 - expected_total_p50) < 1.0  # Allow rounding


def test_correlated_simulation_percentiles_ordered(simple_materials, simple_labor, simple_schedule_tasks):
    """Total cost percentiles are ordered correctly."""
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
    )

    assert result.total_cost_p50 < result.total_cost_p80 < result.total_cost_p90


def test_correlated_simulation_with_location_factor(simple_materials, simple_labor, simple_schedule_tasks):
    """Location factor affects labor costs in correlated simulation."""
    result_base = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        location_factor=1.0,
    )
    result_high = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        location_factor=1.2,
    )

    # Labor costs should be higher with location factor
    assert result_high.labor_cost.p50 > result_base.labor_cost.p50


def test_correlated_simulation_with_union(simple_materials, simple_labor, simple_schedule_tasks):
    """Union flag affects labor costs in correlated simulation."""
    result_non_union = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        is_union=False,
    )
    result_union = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        is_union=True,
    )

    # Union labor should be ~15% higher
    ratio = result_union.labor_cost.p50 / result_non_union.labor_cost.p50
    assert 1.10 < ratio < 1.20


def test_correlated_simulation_with_weather(simple_materials, simple_labor, simple_schedule_tasks):
    """Weather impact affects schedule in correlated simulation."""
    result_no_weather = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        weather_impact_factor=1.0,
    )
    result_with_weather = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
        weather_impact_factor=1.3,
    )

    # Schedule P90 should be higher with weather impact
    assert result_with_weather.schedule.p90_days >= result_no_weather.schedule.p90_days


def test_correlated_simulation_empty_inputs():
    """Correlated simulation handles empty inputs gracefully."""
    result = run_correlated_simulation(
        material_items=[],
        labor_items=[],
        schedule_tasks=[],
        iterations=1000,
    )

    assert result.material_cost.iterations == 0
    assert result.labor_cost.iterations == 0
    assert result.schedule.iterations == 0
    assert result.total_cost_p50 == 0.0


def test_correlated_simulation_performance(simple_materials, simple_labor, large_schedule_tasks):
    """Correlated simulation completes in reasonable time."""
    start_time = time.perf_counter()
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=large_schedule_tasks,
        iterations=1000,
    )
    elapsed = time.perf_counter() - start_time

    assert elapsed < 5.0, f"Simulation took {elapsed:.2f}s, should be < 5s"


# =============================================================================
# Test: Data Model Correctness
# =============================================================================


def test_schedule_task_input_dataclass():
    """ScheduleTaskInput dataclass works correctly."""
    task = ScheduleTaskInput(
        id="TEST",
        name="Test task",
        duration_days=10,
        duration_range_low=8,
        duration_range_high=14,
        is_critical=True,
        weather_sensitive=True,
        phase="framing",
    )

    assert task.id == "TEST"
    assert task.name == "Test task"
    assert task.duration_days == 10
    assert task.duration_range_low < task.duration_days < task.duration_range_high
    assert task.is_critical is True
    assert task.weather_sensitive is True
    assert task.phase == "framing"


def test_schedule_monte_carlo_result_dataclass():
    """ScheduleMonteCarloResult dataclass works correctly."""
    result = ScheduleMonteCarloResult(
        iterations=1000,
        p50_days=25,
        p80_days=30,
        p90_days=35,
        mean_days=26.5,
        std_dev_days=4.2,
        min_days=20,
        max_days=45,
        critical_path_variance=17.64,
        schedule_risk_index=0.53,
        histogram=[],
        task_sensitivities=[],
    )

    assert result.iterations == 1000
    assert result.p50_days == 25
    assert result.schedule_risk_index == 0.53


def test_combined_monte_carlo_result_dataclass(simple_materials, simple_labor, simple_schedule_tasks):
    """CombinedMonteCarloResult is created correctly."""
    result = run_correlated_simulation(
        material_items=simple_materials,
        labor_items=simple_labor,
        schedule_tasks=simple_schedule_tasks,
        iterations=1000,
    )

    assert hasattr(result, "material_cost")
    assert hasattr(result, "labor_cost")
    assert hasattr(result, "schedule")
    assert hasattr(result, "total_cost_p50")
    assert hasattr(result, "total_cost_p80")
    assert hasattr(result, "total_cost_p90")
    assert hasattr(result, "total_cost_mean")
    assert hasattr(result, "total_cost_std_dev")
    assert hasattr(result, "correlation_applied")
