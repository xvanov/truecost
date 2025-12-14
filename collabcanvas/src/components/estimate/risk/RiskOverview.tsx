/**
 * RiskOverview - Summary panel for risk analysis.
 *
 * Displays overall risk level, total cost confidence, contingency recommendation,
 * and top risk factors.
 */

import type { RiskOutput } from '../../../types/risk';
import { formatCurrency, formatPercentage, getRiskLevelColors } from '../../../types/risk';

interface RiskOverviewProps {
  data: RiskOutput;
}

export function RiskOverview({ data }: RiskOverviewProps) {
  const riskColors = getRiskLevelColors(data.riskLevel);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Cost Range Card */}
        <div className="glass-panel p-6">
          <h4 className="text-body-meta text-truecost-text-muted mb-2">Total Cost Range</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-body-meta text-truecost-text-secondary">P50 (Median)</span>
              <span className="font-heading text-h3 text-truecost-cyan">
                {formatCurrency(data.totalCostMonteCarlo.p50)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-body-meta text-truecost-text-secondary">P90 (Conservative)</span>
              <span className="font-heading text-h4 text-truecost-warning">
                {formatCurrency(data.totalCostMonteCarlo.p90)}
              </span>
            </div>
          </div>
        </div>

        {/* Schedule Range Card (if available) */}
        {data.scheduleMonteCarlo ? (
          <div className="glass-panel p-6">
            <h4 className="text-body-meta text-truecost-text-muted mb-2">Schedule Range</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-body-meta text-truecost-text-secondary">P50 (Median)</span>
                <span className="font-heading text-h3 text-truecost-cyan">
                  {data.scheduleMonteCarlo.p50Days} days
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-body-meta text-truecost-text-secondary">P90 (Conservative)</span>
                <span className="font-heading text-h4 text-truecost-warning">
                  {data.scheduleMonteCarlo.p90Days} days
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-6 flex items-center justify-center">
            <p className="text-body-meta text-truecost-text-muted">
              Schedule simulation not available
            </p>
          </div>
        )}

        {/* Contingency Card */}
        <div className="glass-panel p-6">
          <h4 className="text-body-meta text-truecost-text-muted mb-2">Recommended Contingency</h4>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-heading text-h2 text-truecost-warning">
              {formatPercentage(data.contingency.recommended)}
            </span>
          </div>
          <p className="text-body-meta text-truecost-text-secondary">
            {formatCurrency(data.contingency.dollarAmount)} reserve
          </p>
        </div>
      </div>

      {/* Risk Level Badge */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-h3 text-truecost-text-primary">
            Overall Risk Assessment
          </h3>
          <div
            className={`px-4 py-2 rounded-pill ${riskColors.bg} ${riskColors.border} border`}
          >
            <span className={`font-heading text-h4 ${riskColors.text}`}>
              {data.riskLevel} Risk
            </span>
          </div>
        </div>
        {data.contingency.rationale && (
          <p className="text-body text-truecost-text-secondary">
            {data.contingency.rationale}
          </p>
        )}
      </div>

      {/* Top Risk Factors Table */}
      {data.topRisks && data.topRisks.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
            Top Risk Factors
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-truecost-glass-border">
                  <th className="text-left text-body-meta text-truecost-text-muted py-2 pr-4">
                    Risk Factor
                  </th>
                  <th className="text-left text-body-meta text-truecost-text-muted py-2 px-4">
                    Category
                  </th>
                  <th className="text-right text-body-meta text-truecost-text-muted py-2 px-4">
                    Impact
                  </th>
                  <th className="text-right text-body-meta text-truecost-text-muted py-2 pl-4">
                    Probability
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topRisks.slice(0, 5).map((risk, index) => (
                  <tr
                    key={risk.id || index}
                    className="border-b border-truecost-glass-border/50 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <div className="text-body text-truecost-text-primary">
                        {risk.item}
                      </div>
                      {risk.description && (
                        <div className="text-body-meta text-truecost-text-muted mt-1">
                          {risk.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-body-meta text-truecost-text-secondary capitalize">
                        {risk.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-body text-truecost-warning">
                        {risk.impact}
                      </span>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <span className="text-body text-truecost-text-primary">
                        {formatPercentage(risk.probability * 100)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Simulation Info */}
      <div className="text-center text-body-meta text-truecost-text-muted">
        Based on {data.monteCarlo.iterations.toLocaleString()} Monte Carlo iterations
      </div>
    </div>
  );
}
