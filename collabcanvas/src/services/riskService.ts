/**
 * Risk Service
 *
 * Fetches risk analysis data from Firestore estimates collection.
 * Provides both one-time fetch and real-time subscription capabilities.
 */

import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { firestore } from './firebase';
import type { RiskOutput } from '../types/risk';

/**
 * Transform snake_case keys from Firestore to camelCase for TypeScript.
 */
function transformRiskOutput(data: Record<string, unknown>): RiskOutput | null {
  if (!data) return null;

  // Transform the main monteCarlo object
  const transformMonteCarlo = (mc: Record<string, unknown> | undefined) => {
    if (!mc) return undefined;
    return {
      iterations: mc.iterations as number,
      p50: mc.p50 as number,
      p80: mc.p80 as number,
      p90: mc.p90 as number,
      mean: mc.mean as number,
      stdDev: (mc.std_dev ?? mc.stdDev) as number,
      minValue: (mc.min_value ?? mc.minValue) as number,
      maxValue: (mc.max_value ?? mc.maxValue) as number,
      recommendedContingency: (mc.recommended_contingency ?? mc.recommendedContingency) as number,
      topRisks: (mc.top_risks ?? mc.topRisks ?? []) as RiskOutput['monteCarlo']['topRisks'],
      histogram: (mc.histogram ?? []).map((bin: Record<string, unknown>) => ({
        range_low: bin.range_low as number,
        range_high: bin.range_high as number,
        count: bin.count as number,
        percentage: bin.percentage as number,
      })),
    };
  };

  // Transform labor monteCarlo
  const transformLaborMonteCarlo = (lmc: Record<string, unknown> | undefined) => {
    if (!lmc) return undefined;
    return {
      iterations: lmc.iterations as number,
      p50: lmc.p50 as number,
      p80: lmc.p80 as number,
      p90: lmc.p90 as number,
      mean: lmc.mean as number,
      stdDev: (lmc.std_dev ?? lmc.stdDev) as number,
      minValue: (lmc.min_value ?? lmc.minValue) as number,
      maxValue: (lmc.max_value ?? lmc.maxValue) as number,
      recommendedContingency: (lmc.recommended_contingency ?? lmc.recommendedContingency) as number,
      topLaborRisks: (lmc.top_labor_risks ?? lmc.topLaborRisks ?? []).map(
        (risk: Record<string, unknown>) => ({
          trade: risk.trade as string,
          impact: risk.impact as number,
          varianceContribution: (risk.variance_contribution ?? risk.varianceContribution) as number,
          sensitivity: risk.sensitivity as number,
        })
      ),
      histogram: (lmc.histogram ?? []).map((bin: Record<string, unknown>) => ({
        range_low: bin.range_low as number,
        range_high: bin.range_high as number,
        count: bin.count as number,
        percentage: bin.percentage as number,
      })),
      byTrade: (lmc.by_trade ?? lmc.byTrade ?? {}) as RiskOutput['laborMonteCarlo'] extends
        | undefined
        ? never
        : NonNullable<RiskOutput['laborMonteCarlo']>['byTrade'],
    };
  };

  // Transform schedule monteCarlo
  const transformScheduleMonteCarlo = (smc: Record<string, unknown> | undefined) => {
    if (!smc) return undefined;
    return {
      iterations: smc.iterations as number,
      p50Days: (smc.p50_days ?? smc.p50Days) as number,
      p80Days: (smc.p80_days ?? smc.p80Days) as number,
      p90Days: (smc.p90_days ?? smc.p90Days) as number,
      meanDays: (smc.mean_days ?? smc.meanDays) as number,
      stdDevDays: (smc.std_dev_days ?? smc.stdDevDays) as number,
      minDays: (smc.min_days ?? smc.minDays) as number,
      maxDays: (smc.max_days ?? smc.maxDays) as number,
      criticalPathVariance: (smc.critical_path_variance ?? smc.criticalPathVariance) as number,
      scheduleRiskIndex: (smc.schedule_risk_index ?? smc.scheduleRiskIndex) as number,
      histogram: (smc.histogram ?? []).map((bin: Record<string, unknown>) => ({
        range_low: bin.range_low as number,
        range_high: bin.range_high as number,
        count: bin.count as number,
        percentage: bin.percentage as number,
      })),
      taskSensitivities: (smc.task_sensitivities ?? smc.taskSensitivities ?? []).map(
        (task: Record<string, unknown>) => ({
          taskId: (task.task_id ?? task.taskId) as string,
          taskName: (task.task_name ?? task.taskName) as string,
          varianceContribution: (task.variance_contribution ?? task.varianceContribution) as number,
          isCritical: (task.is_critical ?? task.isCritical) as boolean,
        })
      ),
    };
  };

  // Build the transformed output
  const riskOutput = data.riskOutput as Record<string, unknown> | undefined;
  if (!riskOutput) return null;

  const monteCarlo = transformMonteCarlo(riskOutput.monteCarlo as Record<string, unknown>);
  if (!monteCarlo) return null;

  return {
    estimateId: (riskOutput.estimateId ?? data.id ?? '') as string,
    riskLevel: (riskOutput.riskLevel ?? 'Medium') as RiskOutput['riskLevel'],
    monteCarlo,
    laborMonteCarlo: transformLaborMonteCarlo(
      riskOutput.laborMonteCarlo as Record<string, unknown> | undefined
    ),
    scheduleMonteCarlo: transformScheduleMonteCarlo(
      riskOutput.scheduleMonteCarlo as Record<string, unknown> | undefined
    ),
    totalCostMonteCarlo: {
      p50: (riskOutput.totalCostMonteCarlo as Record<string, number>)?.p50 ?? monteCarlo.p50,
      p80: (riskOutput.totalCostMonteCarlo as Record<string, number>)?.p80 ?? monteCarlo.p80,
      p90: (riskOutput.totalCostMonteCarlo as Record<string, number>)?.p90 ?? monteCarlo.p90,
    },
    contingency: {
      recommended: (riskOutput.contingency as Record<string, unknown>)?.recommended as number ?? 0,
      dollarAmount: (riskOutput.contingency as Record<string, unknown>)?.dollarAmount as number ?? 0,
      rationale: (riskOutput.contingency as Record<string, unknown>)?.rationale as string ?? '',
      confidenceLevel: (riskOutput.contingency as Record<string, unknown>)?.confidenceLevel as string ?? 'P80',
    },
    topRisks: (riskOutput.topRisks ?? []) as RiskOutput['topRisks'],
  };
}

/**
 * Fetch risk output for an estimate.
 *
 * @param estimateId - The estimate ID to fetch risk data for
 * @returns RiskOutput or null if not found
 */
export async function getRiskOutput(estimateId: string): Promise<RiskOutput | null> {
  try {
    const estimateRef = doc(firestore, 'estimates', estimateId);
    const estimateSnap = await getDoc(estimateRef);

    if (!estimateSnap.exists()) {
      console.warn(`[RiskService] Estimate ${estimateId} not found`);
      return null;
    }

    const data = estimateSnap.data();
    return transformRiskOutput({ ...data, id: estimateId });
  } catch (error) {
    console.error('[RiskService] Error fetching risk output:', error);
    return null;
  }
}

/**
 * Subscribe to risk output updates for an estimate.
 *
 * @param estimateId - The estimate ID to subscribe to
 * @param onData - Callback when data is received
 * @param onError - Callback when an error occurs
 * @returns Unsubscribe function
 */
export function subscribeToRiskOutput(
  estimateId: string,
  onData: (data: RiskOutput | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const estimateRef = doc(firestore, 'estimates', estimateId);

  return onSnapshot(
    estimateRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onData(transformRiskOutput({ ...data, id: estimateId }));
      } else {
        onData(null);
      }
    },
    (error) => {
      console.error('[RiskService] Subscription error:', error);
      onError?.(error);
    }
  );
}

/**
 * Check if risk output is available for an estimate.
 *
 * @param estimateId - The estimate ID to check
 * @returns true if risk output exists
 */
export async function hasRiskOutput(estimateId: string): Promise<boolean> {
  try {
    const estimateRef = doc(firestore, 'estimates', estimateId);
    const estimateSnap = await getDoc(estimateRef);

    if (!estimateSnap.exists()) return false;

    const data = estimateSnap.data();
    return !!(data?.riskOutput?.monteCarlo);
  } catch (error) {
    console.error('[RiskService] Error checking risk output:', error);
    return false;
  }
}
