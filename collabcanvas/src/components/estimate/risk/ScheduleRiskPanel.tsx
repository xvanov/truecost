/**
 * ScheduleRiskPanel - Schedule simulation results panel.
 *
 * Displays schedule distribution, task sensitivities, and schedule risk index.
 */

import type { ScheduleMonteCarloResult } from '../../../types/risk';
import { formatDays, formatPercentage } from '../../../types/risk';
import { RiskChart } from '../RiskChart';
import { HistogramChart } from '../HistogramChart';

interface ScheduleRiskPanelProps {
  data: ScheduleMonteCarloResult | undefined;
}

export function ScheduleRiskPanel({ data }: ScheduleRiskPanelProps) {
  if (!data) {
    return (
      <div className="glass-panel p-8 text-center">
        <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
          Schedule Simulation
        </h3>
        <p className="text-body text-truecost-text-secondary mb-4">
          Schedule simulation data is not available for this estimate.
        </p>
        <p className="text-body-meta text-truecost-text-muted">
          Schedule simulations model duration uncertainty for critical path tasks.
        </p>
      </div>
    );
  }

  // Determine risk level color
  const getRiskIndexColor = (index: number): string => {
    if (index >= 0.7) return 'text-truecost-danger';
    if (index >= 0.4) return 'text-truecost-warning';
    return 'text-green-400';
  };

  const getRiskIndexLabel = (index: number): string => {
    if (index >= 0.7) return 'High Schedule Risk';
    if (index >= 0.4) return 'Moderate Schedule Risk';
    return 'Low Schedule Risk';
  };

  return (
    <div className="space-y-6">
      {/* Schedule Distribution */}
      <RiskChart
        data={{
          p50: data.p50Days,
          p80: data.p80Days,
          p90: data.p90Days,
        }}
        type="schedule"
        title="Schedule Confidence"
        subtitle={`Based on ${data.iterations.toLocaleString()} simulations`}
      />

      {/* Histogram */}
      {data.histogram && data.histogram.length > 0 && (
        <HistogramChart
          bins={data.histogram}
          p50={data.p50Days}
          p80={data.p80Days}
          p90={data.p90Days}
          type="schedule"
          title="Schedule Duration Distribution"
        />
      )}

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Mean Duration</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {data.meanDays.toFixed(1)} days
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Std Deviation</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {data.stdDevDays.toFixed(1)} days
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Min Duration</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatDays(data.minDays)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-body-meta text-truecost-text-muted mb-1">Max Duration</p>
          <p className="font-heading text-h4 text-truecost-text-primary">
            {formatDays(data.maxDays)}
          </p>
        </div>
      </div>

      {/* Schedule Risk Index */}
      <div className="glass-panel p-6">
        <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
          Schedule Risk Index
        </h3>
        <div className="flex items-center gap-6">
          {/* Risk meter */}
          <div className="flex-1">
            <div className="h-6 bg-truecost-glass-bg rounded-pill overflow-hidden relative">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/50 via-yellow-500/50 to-red-500/50" />
              {/* Indicator */}
              <div
                className="absolute top-0 h-full w-1 bg-white shadow-lg transition-all duration-500"
                style={{ left: `${data.scheduleRiskIndex * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-truecost-text-muted mt-1">
              <span>Low Risk</span>
              <span>High Risk</span>
            </div>
          </div>

          {/* Risk value */}
          <div className="text-right">
            <span className={`font-heading text-h2 ${getRiskIndexColor(data.scheduleRiskIndex)}`}>
              {formatPercentage(data.scheduleRiskIndex * 100)}
            </span>
            <p className={`text-body-meta ${getRiskIndexColor(data.scheduleRiskIndex)}`}>
              {getRiskIndexLabel(data.scheduleRiskIndex)}
            </p>
          </div>
        </div>

        {/* Critical path variance */}
        <div className="mt-4 pt-4 border-t border-truecost-glass-border">
          <div className="flex justify-between text-body-meta">
            <span className="text-truecost-text-muted">Critical Path Variance:</span>
            <span className="text-truecost-text-primary">
              {data.criticalPathVariance.toFixed(1)} days²
            </span>
          </div>
        </div>
      </div>

      {/* Task Sensitivities */}
      {data.taskSensitivities && data.taskSensitivities.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-4">
            Tasks Driving Schedule Variance
          </h3>
          <p className="text-body-meta text-truecost-text-secondary mb-4">
            These tasks contribute the most to schedule uncertainty
          </p>
          <div className="space-y-3">
            {data.taskSensitivities.map((task, _index) => {
              const maxContribution = Math.max(
                ...data.taskSensitivities.map((t) => t.varianceContribution)
              );
              const barWidth =
                maxContribution > 0 ? (task.varianceContribution / maxContribution) * 100 : 0;

              return (
                <div key={task.taskId} className="space-y-1">
                  <div className="flex justify-between text-body-meta">
                    <div className="flex items-center gap-2">
                      <span className="text-truecost-text-primary font-medium">
                        {task.taskName}
                      </span>
                      {task.isCritical && (
                        <span className="text-xs px-2 py-0.5 rounded-pill bg-truecost-danger/20 text-truecost-danger border border-truecost-danger/30">
                          Critical Path
                        </span>
                      )}
                    </div>
                    <span className="text-truecost-warning">
                      {formatPercentage(task.varianceContribution * 100)}
                    </span>
                  </div>
                  <div className="h-2 bg-truecost-glass-bg rounded-pill overflow-hidden">
                    <div
                      className="h-full bg-truecost-warning rounded-pill transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule Buffer Recommendation */}
      <div className="glass-panel p-6 bg-truecost-warning/10 border-truecost-warning/30">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-body text-truecost-text-primary font-medium">
              Recommended Schedule Buffer
            </h4>
            <p className="text-body-meta text-truecost-text-secondary mt-1">
              P90 - P50 duration spread
            </p>
          </div>
          <div className="text-right">
            <span className="font-heading text-h3 text-truecost-warning">
              +{formatDays(data.p90Days - data.p50Days)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
