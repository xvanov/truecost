/**
 * LaborRiskPanel - Labor cost simulation results panel.
 *
 * Displays labor cost distribution, by-trade breakdown, and top labor risks.
 */

import type { LaborMonteCarloResult } from '../../../types/risk';
import { formatCurrency, formatPercentage } from '../../../types/risk';
import { RiskChart } from '../RiskChart';
import { HistogramChart } from '../HistogramChart';

interface LaborRiskPanelProps {
  data: LaborMonteCarloResult | undefined;
}

export function LaborRiskPanel({ data }: LaborRiskPanelProps) {
  if (!data) {
    return (
      <div className="glass-panel p-8 text-center">
        <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
          Labor Cost Simulation
        </h3>
        <p className="text-body text-truecost-text-secondary mb-4">
          Labor simulation data is not available for this estimate.
        </p>
        <p className="text-body-meta text-truecost-text-muted">
          Labor simulations include productivity variance and trade-specific uncertainty factors.
        </p>
      </div>
    );
  }

  // Sort trades by P50 cost descending
  const sortedTrades = Object.entries(data.byTrade)
    .map(([trade, costs]) => ({ trade, ...costs }))
    .sort((a, b) => b.p50 - a.p50);

  return (
    <div className="space-y-6">
      {/* Labor Cost Distribution */}
      <RiskChart
        data={{ p50: data.p50, p80: data.p80, p90: data.p90 }}
        type="labor"
        title="Labor Cost Confidence"
        subtitle={`Based on ${data.iterations.toLocaleString()} simulations`}
      />

      {/* Histogram */}
      {data.histogram && data.histogram.length > 0 && (
        <HistogramChart
          bins={data.histogram}
          p50={data.p50}
          p80={data.p80}
          p90={data.p90}
          type="cost"
          title="Labor Cost Distribution"
        />
      )}

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Mean</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.mean)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Std Dev</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.stdDev)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Min</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.minValue)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Max</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.maxValue)}
          </p>
        </div>
      </div>

      {/* By Trade Breakdown */}
      {sortedTrades.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
            Labor Costs by Trade
          </h3>
          <div className="space-y-4">
            {sortedTrades.map(({ trade, p50, p80, p90 }) => {
              const maxP90 = Math.max(...sortedTrades.map((t) => t.p90));
              const barWidth = (p90 / maxP90) * 100;

              return (
                <div key={trade} className="space-y-1">
                  <div className="flex justify-between text-body-meta">
                    <span className="text-truecost-text-primary capitalize font-medium">
                      {trade.replace(/_/g, ' ')}
                    </span>
                    <span className="text-truecost-text-secondary">
                      {formatCurrency(p50)} - {formatCurrency(p90)}
                    </span>
                  </div>
                  <div className="h-4 bg-truecost-glass-bg rounded-pill overflow-hidden">
                    <div
                      className="h-full rounded-pill relative"
                      style={{ width: `${barWidth}%` }}
                    >
                      {/* P50 portion */}
                      <div
                        className="absolute left-0 top-0 h-full bg-truecost-cyan rounded-l-pill"
                        style={{ width: `${(p50 / p90) * 100}%` }}
                      />
                      {/* P50-P80 portion */}
                      <div
                        className="absolute top-0 h-full bg-truecost-warning"
                        style={{
                          left: `${(p50 / p90) * 100}%`,
                          width: `${((p80 - p50) / p90) * 100}%`,
                        }}
                      />
                      {/* P80-P90 portion */}
                      <div
                        className="absolute top-0 h-full bg-truecost-danger rounded-r-pill"
                        style={{
                          left: `${(p80 / p90) * 100}%`,
                          width: `${((p90 - p80) / p90) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Labor Risks */}
      {data.topLaborRisks && data.topLaborRisks.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
            Top Labor Risk Factors
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-truecost-glass-border">
                  <th className="text-left text-body-meta text-truecost-text-muted py-2 pr-4">
                    Trade
                  </th>
                  <th className="text-right text-body-meta text-truecost-text-muted py-2 px-4">
                    Impact
                  </th>
                  <th className="text-right text-body-meta text-truecost-text-muted py-2 px-4">
                    Variance Contribution
                  </th>
                  <th className="text-right text-body-meta text-truecost-text-muted py-2 pl-4">
                    Sensitivity
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topLaborRisks.map((risk, _index) => (
                  <tr
                    key={risk.trade}
                    className="border-b border-truecost-glass-border/50 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <span className="text-body text-truecost-text-primary capitalize">
                        {risk.trade.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-body text-truecost-warning">
                        {formatCurrency(risk.impact)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-body text-truecost-text-primary">
                        {risk.varianceContribution != null ? formatPercentage(risk.varianceContribution * 100) : 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <span className="text-body text-truecost-text-secondary">
                        {risk.sensitivity?.toFixed(3) ?? 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contingency */}
      <div className="glass-panel p-6 bg-truecost-warning/10 border-truecost-warning/30">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-body text-truecost-text-primary font-medium">
              Recommended Labor Contingency
            </h4>
            <p className="text-body-meta text-truecost-text-secondary mt-1">
              Based on P80-P50 spread
            </p>
          </div>
          <div className="text-right">
            <span className="font-heading text-h3 text-truecost-warning">
              {formatPercentage(data.recommendedContingency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
