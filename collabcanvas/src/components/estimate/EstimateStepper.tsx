import { useNavigate } from 'react-router-dom';

export interface EstimateStepperProps {
  currentStep: 'scope' | 'annotate' | 'estimate';
  projectId: string;
  completedSteps: ('scope' | 'annotate' | 'estimate')[];
}

interface Step {
  id: 'scope' | 'annotate' | 'estimate';
  label: string;
  route: (projectId: string) => string;
}

const steps: Step[] = [
  { id: 'scope', label: 'Scope', route: (id) => `/project/${id}/scope` },
  { id: 'annotate', label: 'Annotate', route: (id) => `/project/${id}/annotate` },
  { id: 'estimate', label: 'Estimate', route: (id) => `/project/${id}/estimate` },
];

/**
 * EstimateStepper - Visual navigation stepper for the project estimation flow.
 *
 * Features:
 * - Three steps: Scope, Annotate, Estimate
 * - Current step is highlighted with cyan/teal gradient
 * - Completed steps are clickable (navigate to route)
 * - Next step is always accessible (users can move forward freely)
 * - Only steps 2+ ahead are disabled
 */
export function EstimateStepper({
  currentStep,
  projectId,
  completedSteps,
}: EstimateStepperProps) {
  const navigate = useNavigate();

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const getStepState = (step: Step, index: number) => {
    if (step.id === currentStep) return 'current';
    if (completedSteps.includes(step.id)) return 'completed';
    if (index < currentStepIndex) return 'completed'; // All previous steps are implicitly completed
    if (index === currentStepIndex + 1) return 'next'; // Next step is always accessible
    return 'future';
  };

  const handleStepClick = (step: Step, state: string) => {
    // Allow navigation to completed, current, or next step
    if (state === 'completed' || state === 'current' || state === 'next') {
      navigate(step.route(projectId));
    }
  };

  return (
    <div className="glass-panel p-4 mb-6">
      <div className="flex items-center justify-center">
        {steps.map((step, index) => {
          const state = getStepState(step, index);
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step Circle + Label */}
              <button
                onClick={() => handleStepClick(step, state)}
                disabled={state === 'future'}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                  ${
                    state === 'current'
                      ? 'bg-gradient-to-br from-truecost-cyan to-truecost-teal text-truecost-bg-primary font-semibold cursor-default'
                      : state === 'completed'
                        ? 'bg-truecost-glass-bg text-truecost-cyan hover:bg-truecost-cyan/20 cursor-pointer'
                        : state === 'next'
                          ? 'bg-truecost-glass-bg text-truecost-text-primary hover:bg-truecost-cyan/10 cursor-pointer border border-truecost-glass-border'
                          : 'bg-truecost-glass-bg/50 text-truecost-text-muted cursor-not-allowed opacity-50'
                  }
                `}
              >
                {/* Step Number/Check */}
                <span
                  className={`
                    flex items-center justify-center w-6 h-6 rounded-full text-body-meta font-medium
                    ${
                      state === 'current'
                        ? 'bg-white/20 text-truecost-bg-primary'
                        : state === 'completed'
                          ? 'bg-truecost-cyan/20 text-truecost-cyan'
                          : state === 'next'
                            ? 'bg-truecost-glass-border text-truecost-text-primary'
                            : 'bg-truecost-glass-border text-truecost-text-muted'
                    }
                  `}
                >
                  {state === 'completed' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>

                {/* Step Label */}
                <span className="font-body text-body">{step.label}</span>
              </button>

              {/* Connector Line */}
              {!isLast && (
                <div
                  className={`
                    w-12 h-0.5 mx-2
                    ${
                      state === 'completed' || steps[index + 1].id === currentStep
                        ? 'bg-gradient-to-r from-truecost-cyan to-truecost-teal'
                        : 'bg-truecost-glass-border'
                    }
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
