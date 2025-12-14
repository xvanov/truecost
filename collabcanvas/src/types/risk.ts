/**
 * Risk Analysis Types
 *
 * TypeScript interfaces for Monte Carlo simulation results
 * and risk analysis data from the backend.
 */

/**
 * Single histogram bin for distribution visualization.
 */
export interface HistogramBin {
  range_low: number;
  range_high: number;
  count: number;
  percentage: number;
}

/**
 * Risk factor identified by sensitivity analysis.
 */
export interface RiskFactor {
  item: string;
  impact: number;
  probability: number;
  sensitivity: number;
}

/**
 * Base Monte Carlo simulation result.
 */
export interface MonteCarloResult {
  iterations: number;
  p50: number;
  p80: number;
  p90: number;
  mean: number;
  stdDev: number;
  minValue: number;
  maxValue: number;
  recommendedContingency: number;
  topRisks: RiskFactor[];
  histogram: HistogramBin[];
}

/**
 * Labor-specific risk factor.
 */
export interface LaborRiskFactor {
  trade: string;
  impact: number;
  varianceContribution: number;
  sensitivity: number;
}

/**
 * Per-trade cost breakdown.
 */
export interface TradeCostBreakdown {
  p50: number;
  p80: number;
  p90: number;
}

/**
 * Labor cost Monte Carlo result.
 */
export interface LaborMonteCarloResult {
  iterations: number;
  p50: number;
  p80: number;
  p90: number;
  mean: number;
  stdDev: number;
  minValue: number;
  maxValue: number;
  recommendedContingency: number;
  topLaborRisks: LaborRiskFactor[];
  histogram: HistogramBin[];
  byTrade: Record<string, TradeCostBreakdown>;
}

/**
 * Task sensitivity to schedule variance.
 */
export interface TaskSensitivity {
  taskId: string;
  taskName: string;
  varianceContribution: number;
  isCritical: boolean;
}

/**
 * Schedule Monte Carlo result.
 */
export interface ScheduleMonteCarloResult {
  iterations: number;
  p50Days: number;
  p80Days: number;
  p90Days: number;
  meanDays: number;
  stdDevDays: number;
  minDays: number;
  maxDays: number;
  criticalPathVariance: number;
  scheduleRiskIndex: number;
  histogram: HistogramBin[];
  taskSensitivities: TaskSensitivity[];
}

/**
 * Contingency recommendation from risk analysis.
 */
export interface ContingencyRecommendation {
  recommended: number;
  dollarAmount: number;
  rationale: string;
  confidenceLevel: string;
}

/**
 * Complete risk output from the Risk Agent.
 */
export interface RiskOutput {
  estimateId: string;
  riskLevel: 'Low' | 'Medium' | 'High';

  // Material cost simulation
  monteCarlo: MonteCarloResult;

  // Labor cost simulation (optional - may not exist for older estimates)
  laborMonteCarlo?: LaborMonteCarloResult;

  // Schedule simulation (optional)
  scheduleMonteCarlo?: ScheduleMonteCarloResult;

  // Combined total cost
  totalCostMonteCarlo: {
    p50: number;
    p80: number;
    p90: number;
  };

  // Contingency recommendation
  contingency: ContingencyRecommendation;

  // Top risk factors across all domains
  topRisks: Array<{
    id: string;
    item: string;
    description: string;
    category: string;
    impact: string;
    probability: number;
    costImpactLow: number;
    costImpactHigh: number;
    varianceContribution: number;
    mitigation: string;
  }>;
}

/**
 * Risk level with associated styling.
 */
export type RiskLevel = 'Low' | 'Medium' | 'High';

/**
 * Get color classes for risk level.
 */
export function getRiskLevelColors(level: RiskLevel): {
  text: string;
  bg: string;
  border: string;
} {
  switch (level) {
    case 'Low':
      return {
        text: 'text-green-400',
        bg: 'bg-green-500/20',
        border: 'border-green-500/30',
      };
    case 'Medium':
      return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-500/20',
        border: 'border-yellow-500/30',
      };
    case 'High':
      return {
        text: 'text-red-400',
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
      };
  }
}

/**
 * Format currency for display.
 */
export function formatCurrency(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display.
 */
export function formatPercentage(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

/**
 * Format days for display.
 */
export function formatDays(days: number | undefined | null): string {
  if (days == null || isNaN(days)) return 'N/A';
  if (days === 1) return '1 day';
  return `${days} days`;
}
