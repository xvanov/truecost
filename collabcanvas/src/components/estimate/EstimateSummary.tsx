import { getRiskLevelColors } from '../../types/risk';

interface EstimateSummaryProps {
  totalCost: number;
  confidenceRanges: {
    p50: number;
    p80: number;
    p90: number;
  };
  timeline: string;
  riskLevel?: 'Low' | 'Medium' | 'High';
  contingency?: {
    recommended: number;
    dollarAmount: number;
    rationale?: string;
  };
}

/**
 * EstimateSummary - summary panel for final estimate with risk indicators.
 */
export function EstimateSummary({
  totalCost,
  confidenceRanges,
  timeline,
  riskLevel,
  contingency,
}: EstimateSummaryProps) {
  const riskColors = riskLevel ? getRiskLevelColors(riskLevel) : null;

  return (
    <div className="glass-panel p-8 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main cost display */}
        <div className="md:col-span-2">
          <p className="font-body text-body-meta text-truecost-text-secondary mb-2">
            Total Estimated Cost
          </p>
          <p className="font-heading text-5xl md:text-6xl text-truecost-cyan mb-4">
            ${totalCost.toLocaleString()}
          </p>

          {/* Confidence ranges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="glass-panel p-4 bg-truecost-glass-bg/30">
              <p className="font-body text-body-meta text-truecost-text-muted mb-1">P50 (Median)</p>
              <p className="font-body text-body text-truecost-text-primary font-medium">
                ${confidenceRanges.p50.toLocaleString()}
              </p>
            </div>
            <div className="glass-panel p-4 bg-truecost-glass-bg/30">
              <p className="font-body text-body-meta text-truecost-text-muted mb-1">P80 (Likely)</p>
              <p className="font-body text-body text-truecost-text-primary font-medium">
                ${confidenceRanges.p80.toLocaleString()}
              </p>
            </div>
            <div className="glass-panel p-4 bg-truecost-glass-bg/30">
              <p className="font-body text-body-meta text-truecost-text-muted mb-1">
                P90 (Conservative)
              </p>
              <p className="font-body text-body text-truecost-text-primary font-medium">
                ${confidenceRanges.p90.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Right column - Timeline, Risk Level, Contingency */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="glass-panel p-6 bg-truecost-glass-bg/30 flex flex-col justify-center">
            <p className="font-body text-body-meta text-truecost-text-secondary mb-2">
              Estimated Timeline
            </p>
            <div className="flex items-center gap-3">
              <svg
                className="w-8 h-8 text-truecost-teal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="font-heading text-h2 text-truecost-text-primary">{timeline}</p>
            </div>
          </div>

          {/* Risk Level */}
          {riskLevel && riskColors && (
            <div
              className={`glass-panel p-4 border ${riskColors.border}`}
              style={{ backgroundColor: `${riskColors.bg}10` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-body text-body-meta text-truecost-text-muted mb-1">
                    Risk Level
                  </p>
                  <p className={`font-heading text-h3 ${riskColors.text}`}>{riskLevel}</p>
                </div>
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${riskColors.bg}`}
                >
                  <svg
                    className={`w-6 h-6 ${riskColors.text}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {riskLevel === 'Low' ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    ) : riskLevel === 'Medium' ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Contingency */}
          {contingency && contingency.recommended > 0 && (
            <div className="glass-panel p-4 bg-truecost-warning/10 border-truecost-warning/30">
              <p className="font-body text-body-meta text-truecost-text-muted mb-1">
                Recommended Contingency
              </p>
              <div className="flex items-baseline gap-2">
                <p className="font-heading text-h3 text-truecost-warning">
                  {contingency.recommended.toFixed(1)}%
                </p>
                <p className="font-body text-body-meta text-truecost-text-secondary">
                  (${contingency.dollarAmount.toLocaleString()})
                </p>
              </div>
              {contingency.rationale && (
                <p className="font-body text-xs text-truecost-text-muted mt-1">
                  {contingency.rationale}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
