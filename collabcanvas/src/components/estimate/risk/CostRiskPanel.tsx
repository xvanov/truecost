/**
 * CostRiskPanel - Material cost simulation results panel.
 *
 * Displays material cost distribution, top risks, and histogram.
 */

import type { MonteCarloResult } from '../../../types/risk';
import { formatCurrency, formatPercentage } from '../../../types/risk';
import { RiskChart } from '../RiskChart';
import { HistogramChart } from '../HistogramChart';

interface CostRiskPanelProps {
  data: MonteCarloResult;
}

export function CostRiskPanel({ data }: CostRiskPanelProps) {
  return (
    <div className="space-y-6">
      {/* Material Cost Distribution */}
      <RiskChart
        data={{ p50: data.p50, p80: data.p80, p90: data.p90 }}
        type="cost"
        title="Material Cost Confidence"
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
          title="Material Cost Distribution"
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
          <p className="text-body-meta text-truecost-text-muted mb-1">Std Deviation</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.stdDev)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Minimum</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.minValue)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Maximum</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatCurrency(data.maxValue)}
          </p>
        </div>
      </div>

      {/* Top Risk Factors */}
      {data.topRisks && data.topRisks.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
            Top Material Cost Risks
          </h3>
          <p className="text-body-meta text-truecost-text-secondary mb-4">
            Line items contributing most to cost uncertainty
          </p>
          <div className="space-y-4">
            {data.topRisks.map((risk, _index) => {
              const maxImpact = Math.max(...data.topRisks.map((r) => r.impact));
              const barWidth = maxImpact > 0 ? (risk.impact / maxImpact) * 100 : 0;

              return (
                <div key={risk.item} className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <span className="text-body text-truecost-text-primary font-medium">
                        {risk.item}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-body text-truecost-warning font-medium">
                        {formatCurrency(risk.impact)}
                      </span>
                      <span className="text-body-meta text-truecost-text-muted ml-2">
                        impact
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-truecost-glass-bg rounded-pill overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-truecost-cyan to-truecost-warning rounded-pill transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-truecost-text-muted">
                    <span>Sensitivity: {risk.sensitivity?.toFixed(3) ?? 'N/A'}</span>
                    <span>Probability: {risk.probability != null ? formatPercentage(risk.probability * 100) : 'N/A'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contingency */}
      <div className="glass-panel p-6 bg-truecost-warning/10 border-truecost-warning/30">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-body text-truecost-text-primary font-medium">
              Recommended Material Contingency
            </h4>
            <p className="text-body-meta text-truecost-text-secondary mt-1">
              Based on P80-P50 spread: (P80 - P50) / P50 × 100
            </p>
          </div>
          <div className="text-right">
            <span className="font-heading text-h3 text-truecost-warning">
              {formatPercentage(data.recommendedContingency)}
            </span>
            <p className="text-body-meta text-truecost-text-muted mt-1">
              {formatCurrency(data.p80 - data.p50)} reserve
            </p>
          </div>
        </div>
      </div>

      {/* Coefficient of Variation */}
      <div className="glass-panel p-6">
        <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
          Distribution Characteristics
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-body-meta text-truecost-text-muted mb-1">
              Coefficient of Variation
            </p>
            <p className="font-heading text-h4 text-truecost-text-primary">
              {data.mean > 0 ? formatPercentage((data.stdDev / data.mean) * 100) : 'N/A'}
            </p>
            <p className="text-xs text-truecost-text-muted mt-1">
              Relative variability of cost distribution
            </p>
          </div>
          <div>
            <p className="text-body-meta text-truecost-text-muted mb-1">Cost Range</p>
            <p className="font-heading text-h4 text-truecost-text-primary">
              {formatCurrency(data.maxValue - data.minValue)}
            </p>
            <p className="text-xs text-truecost-text-muted mt-1">
              Spread between min and max outcomes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
