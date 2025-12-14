/**
 * RiskChart - Visualization for cost/schedule confidence distribution.
 *
 * Displays P50, P80, P90 percentiles from Monte Carlo simulation results.
 */

import { formatCurrency, formatDays } from '../../types/risk';

interface PercentileData {
  p50: number;
  p80: number;
  p90: number;
}

interface RiskChartProps {
  /** Monte Carlo percentile data */
  data: PercentileData;
  /** Type of data being displayed */
  type?: 'cost' | 'labor' | 'schedule';
  /** Optional title override */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Show the mock data disclaimer */
  showDisclaimer?: boolean;
}

/**
 * RiskChart - Displays confidence distribution as horizontal bars.
 */
export function RiskChart({
  data,
  type = 'cost',
  title,
  subtitle,
  showDisclaimer = false,
}: RiskChartProps) {
  const isSchedule = type === 'schedule';

  // Format value based on type
  const formatValue = (value: number) => {
    if (isSchedule) {
      return formatDays(value);
    }
    return formatCurrency(value);
  };

  // Calculate bar widths relative to P90
  const maxValue = data.p90;

  // Define percentile bars
  const bars = [
    {
      label: 'P50',
      sublabel: 'Median',
      value: data.p50,
      color: 'bg-truecost-cyan',
      textColor: 'text-truecost-bg-primary',
    },
    {
      label: 'P80',
      sublabel: 'Likely',
      value: data.p80,
      color: 'bg-truecost-warning',
      textColor: 'text-truecost-bg-primary',
    },
    {
      label: 'P90',
      sublabel: 'Conservative',
      value: data.p90,
      color: 'bg-truecost-danger',
      textColor: 'text-white',
    },
  ];

  // Default titles based on type
  const defaultTitles: Record<string, string> = {
    cost: 'Material Cost Distribution',
    labor: 'Labor Cost Distribution',
    schedule: 'Schedule Distribution',
  };

  const defaultSubtitles: Record<string, string> = {
    cost: 'Probability distribution of material costs',
    labor: 'Probability distribution of labor costs',
    schedule: 'Probability distribution of project duration',
  };

  return (
    <div className="glass-panel p-6">
      <h3 className="font-heading text-h3 text-truecost-text-primary mb-2">
        {title || defaultTitles[type]}
      </h3>
      <p className="text-body-meta text-truecost-text-secondary mb-6">
        {subtitle || defaultSubtitles[type]}
      </p>

      <div className="space-y-4">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-4">
            <div className="w-20 flex flex-col">
              <span className="text-body-meta text-truecost-text-primary font-medium">
                {bar.label}
              </span>
              <span className="text-xs text-truecost-text-muted">{bar.sublabel}</span>
            </div>
            <div className="flex-1 bg-truecost-glass-bg rounded-pill h-10 overflow-hidden">
              <div
                className={`${bar.color} h-full rounded-pill transition-all duration-500 flex items-center justify-end pr-3`}
                style={{ width: `${(bar.value / maxValue) * 100}%` }}
              >
                <span className={`text-body-meta ${bar.textColor} font-medium whitespace-nowrap`}>
                  {formatValue(bar.value)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Spread indicator */}
      <div className="mt-6 pt-4 border-t border-truecost-glass-border">
        <div className="flex justify-between text-body-meta">
          <span className="text-truecost-text-muted">P50 to P90 Spread:</span>
          <span className="text-truecost-warning font-medium">
            +{isSchedule
              ? formatDays(data.p90 - data.p50)
              : formatCurrency(data.p90 - data.p50)}
            {!isSchedule && ` (${(((data.p90 - data.p50) / data.p50) * 100).toFixed(1)}%)`}
          </span>
        </div>
      </div>

      {showDisclaimer && (
        <p className="text-body-meta text-truecost-text-muted mt-4 italic">
          * Risk analysis based on Monte Carlo simulation
        </p>
      )}
    </div>
  );
}

// Export a mock version for backwards compatibility
export function RiskChartMock() {
  return (
    <RiskChart
      data={{ p50: 95000, p80: 105000, p90: 115000 }}
      type="cost"
      showDisclaimer={true}
    />
  );
}
