/**
 * RiskAnalysisView - Main container for Risk Analysis tab.
 *
 * Fetches risk data from Firestore and displays sub-panels for
 * Overview, Material Costs, Labor Costs, and Schedule.
 */

import { useState, useEffect } from 'react';
import { subscribeToRiskOutput } from '../../services/riskService';
import type { RiskOutput } from '../../types/risk';
import {
  RiskOverview,
  CostRiskPanel,
  LaborRiskPanel,
  ScheduleRiskPanel,
} from './risk';

type RiskSection = 'overview' | 'cost' | 'labor' | 'schedule';

interface RiskAnalysisViewProps {
  projectId: string;
  estimateId: string | null;
}

const SECTIONS: { id: RiskSection; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Summary and top risks' },
  { id: 'cost', label: 'Material Costs', description: 'Material cost simulation' },
  { id: 'labor', label: 'Labor Costs', description: 'Labor cost by trade' },
  { id: 'schedule', label: 'Schedule', description: 'Duration simulation' },
];

export function RiskAnalysisView({ projectId: _projectId, estimateId }: RiskAnalysisViewProps) {
  const [riskData, setRiskData] = useState<RiskOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<RiskSection>('overview');

  useEffect(() => {
    if (!estimateId) {
      setLoading(false);
      setError('No estimate ID provided');
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToRiskOutput(
      estimateId,
      (data) => {
        setRiskData(data);
        setLoading(false);
      },
      (err) => {
        console.error('[RiskAnalysisView] Error:', err);
        setError('Failed to load risk analysis data');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [estimateId]);

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="glass-panel p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-truecost-cyan border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-body text-truecost-text-secondary">
            Loading risk analysis...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="glass-panel p-8 text-center border-truecost-danger/30">
          <svg
            className="w-12 h-12 text-truecost-danger mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-2">
            Unable to Load Risk Analysis
          </h3>
          <p className="text-body text-truecost-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!riskData) {
    return (
      <div className="p-6">
        <div className="glass-panel p-8 text-center">
          <svg
            className="w-12 h-12 text-truecost-text-muted mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="font-heading text-h3 text-truecost-text-primary mb-2">
            No Risk Analysis Available
          </h3>
          <p className="text-body text-truecost-text-secondary mb-4">
            Risk analysis has not been generated for this estimate.
          </p>
          <p className="text-body-meta text-truecost-text-muted">
            Risk analysis is generated automatically when the estimate is created.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Section Navigation */}
      <div className="glass-panel p-1.5">
        <div className="flex flex-wrap gap-1">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const isDisabled =
              (section.id === 'labor' && !riskData.laborMonteCarlo) ||
              (section.id === 'schedule' && !riskData.scheduleMonteCarlo);

            return (
              <button
                key={section.id}
                onClick={() => !isDisabled && setActiveSection(section.id)}
                disabled={isDisabled}
                className={`
                  flex-1 min-w-[120px] px-4 py-3 rounded-lg transition-all
                  ${
                    isActive
                      ? 'bg-gradient-to-r from-truecost-cyan/20 to-truecost-teal/20 border border-truecost-cyan/30'
                      : isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-truecost-glass-bg'
                  }
                `}
                title={isDisabled ? 'Data not available' : section.description}
              >
                <span
                  className={`
                    text-body font-medium
                    ${isActive ? 'text-truecost-cyan' : 'text-truecost-text-secondary'}
                  `}
                >
                  {section.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Content */}
      <div className="min-h-[400px]">
        {activeSection === 'overview' && <RiskOverview data={riskData} />}
        {activeSection === 'cost' && <CostRiskPanel data={riskData.monteCarlo} />}
        {activeSection === 'labor' && <LaborRiskPanel data={riskData.laborMonteCarlo} />}
        {activeSection === 'schedule' && (
          <ScheduleRiskPanel data={riskData.scheduleMonteCarlo} />
        )}
      </div>
    </div>
  );
}
