/**
 * HistogramChart - CSS-based histogram visualization for Monte Carlo results.
 *
 * Displays distribution of simulation results with color coding for percentiles.
 */

import type { HistogramBin } from '../../types/risk';
import { formatCurrency, formatDays } from '../../types/risk';

interface HistogramChartProps {
  /** Histogram bins from Monte Carlo simulation */
  bins: HistogramBin[];
  /** P50 value for color coding */
  p50?: number;
  /** P80 value for color coding */
  p80?: number;
  /** P90 value for color coding */
  p90?: number;
  /** Type of data for formatting */
  type?: 'cost' | 'schedule';
  /** Chart height in pixels */
  height?: number;
  /** Optional title */
  title?: string;
}

/**
 * HistogramChart - Displays distribution as vertical bars.
 */
export function HistogramChart({
  bins,
  p50,
  p80,
  p90,
  type = 'cost',
  height = 150,
  title,
}: HistogramChartProps) {
  if (!bins || bins.length === 0) {
    return (
      <div className="glass-panel p-6">
        <p className="text-body-meta text-truecost-text-muted text-center">
          No histogram data available
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...bins.map((bin) => bin.count));
  const isSchedule = type === 'schedule';

  // Format value based on type
  const formatValue = (value: number) => {
    if (isSchedule) {
      return formatDays(Math.round(value));
    }
    // For cost, show abbreviated values
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`;
    }
    return formatCurrency(value);
  };

  // Determine bar color based on percentile position
  const getBarColor = (binMidpoint: number): string => {
    if (p90 && binMidpoint > p90) {
      return 'bg-truecost-danger/70 hover:bg-truecost-danger';
    }
    if (p80 && binMidpoint > p80) {
      return 'bg-truecost-warning/70 hover:bg-truecost-warning';
    }
    if (p50 && binMidpoint > p50) {
      return 'bg-truecost-cyan/70 hover:bg-truecost-cyan';
    }
    return 'bg-truecost-teal/70 hover:bg-truecost-teal';
  };

  // Calculate x-axis labels (show ~5 evenly spaced)
  const labelIndices = [0, Math.floor(bins.length / 4), Math.floor(bins.length / 2), Math.floor((3 * bins.length) / 4), bins.length - 1];

  return (
    <div className="glass-panel p-6">
      {title && (
        <h4 className="font-heading text-h4 text-truecost-text-primary mb-4">{title}</h4>
      )}

      <div className="relative">
        {/* Y-axis label */}
        <div className="absolute -left-2 top-0 h-full flex items-center">
          <span
            className="text-xs text-truecost-text-muted transform -rotate-90 origin-center whitespace-nowrap"
            style={{ marginLeft: '-20px' }}
          >
            Iterations
          </span>
        </div>

        {/* Chart area */}
        <div className="ml-6">
          {/* Bars container */}
          <div
            className="flex items-end gap-px"
            style={{ height: `${height}px` }}
          >
            {bins.map((bin, index) => {
              const barHeight = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
              const binMidpoint = (bin.range_low + bin.range_high) / 2;

              return (
                <div
                  key={index}
                  className={`flex-1 ${getBarColor(binMidpoint)} rounded-t transition-all duration-200 cursor-pointer relative group`}
                  style={{ height: `${barHeight}%`, minWidth: '4px' }}
                  title={`${formatValue(bin.range_low)} - ${formatValue(bin.range_high)}: ${bin.count} iterations (${bin.percentage.toFixed(1)}%)`}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-truecost-bg-primary border border-truecost-glass-border rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                      <div className="text-truecost-text-primary font-medium">
                        {formatValue(bin.range_low)} - {formatValue(bin.range_high)}
                      </div>
                      <div className="text-truecost-text-muted">
                        {bin.count} iterations ({bin.percentage.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between text-xs text-truecost-text-muted mt-2 px-1">
            {labelIndices.map((idx, i) => (
              <span key={i} className={i === 0 ? '' : i === labelIndices.length - 1 ? 'text-right' : 'text-center'}>
                {formatValue(bins[idx]?.range_low ?? 0)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-truecost-glass-border">
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-truecost-teal/70" />
            <span className="text-truecost-text-muted">&lt; P50</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-truecost-cyan/70" />
            <span className="text-truecost-text-muted">P50 - P80</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-truecost-warning/70" />
            <span className="text-truecost-text-muted">P80 - P90</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-truecost-danger/70" />
            <span className="text-truecost-text-muted">&gt; P90</span>
          </div>
        </div>
      </div>
    </div>
  );
}
