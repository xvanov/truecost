/**
 * Scope View Component
 * Simplified scope input and plan upload - no chatbot on this page
 * After upload, user proceeds to Space tab to annotate the plan
 */

import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useEstimationStore } from '../../store/estimationStore';
import { ScopeInputPanel } from './ScopeInputPanel';
import { saveBackgroundImage } from '../../services/firestore';
import type { PlanImage } from '../../types/scope';

type WorkflowStep = 'input' | 'ready';

export function ScopeView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { 
    session, 
    loading, 
    error, 
    loadSession, 
    createSession, 
    cleanup,
  } = useEstimationStore();

  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');

  // Load existing session on mount
  useEffect(() => {
    if (!projectId) return;
    loadSession(projectId);
    
    return () => cleanup();
  }, [projectId]);

  // Determine current step based on session state
  useEffect(() => {
    if (!session) {
      setCurrentStep('input');
    } else if (session.scopeText && session.planImageUrl) {
      setCurrentStep('ready');
    } else {
      setCurrentStep('input');
    }
  }, [session]);

  const handleScopeSubmit = useCallback(async (scopeText: string, planImage: PlanImage) => {
    if (!projectId || !user) return;
    
    try {
      await createSession(projectId, scopeText, planImage, user.uid);
      setCurrentStep('ready');
    } catch (err) {
      console.error('Failed to create estimation session:', err);
    }
  }, [projectId, user, createSession]);

  const handleProceedToAnnotate = useCallback(async () => {
    if (!projectId || !user || !session) return;
    
    // Set the plan image as background for the Space tab
    if (session.planImageUrl) {
      try {
        await saveBackgroundImage(
          {
            url: session.planImageUrl,
            width: 1000,
            height: 800,
          },
          user.uid,
          projectId
        );
      } catch (err) {
        console.error('Failed to set plan as background:', err);
      }
    }
    
    navigate(`/project/${projectId}/annotate`);
  }, [projectId, navigate, user, session]);

  if (loading && !session) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Project Scope</h1>
            <p className="text-sm text-gray-500 mt-1">
              {currentStep === 'input' && 'Upload your floor plan and define the project scope'}
              {currentStep === 'ready' && 'Scope defined - proceed to annotate your plan'}
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center space-x-4">
              <StepIndicator 
                step={1} 
                label="Define Scope" 
                active={currentStep === 'input'}
                complete={currentStep === 'ready'}
              />
              <div className="flex-1 h-0.5 bg-gray-200">
                <div 
                  className={`h-full bg-blue-600 transition-all ${
                    currentStep === 'ready' ? 'w-full' : 'w-0'
                  }`}
                />
              </div>
              <StepIndicator 
                step={2} 
                label="Annotate Plan" 
                active={false}
                complete={false}
              />
              <div className="flex-1 h-0.5 bg-gray-200" />
              <StepIndicator 
                step={3} 
                label="Generate Estimate" 
                active={false}
                complete={false}
              />
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Content based on step */}
          {currentStep === 'input' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <ScopeInputPanel 
                  onScopeSubmit={handleScopeSubmit}
                  loading={loading}
                  existingScope={session?.scopeText}
                  existingImage={session?.planImageUrl ? {
                    url: session.planImageUrl,
                    fileName: session.planImageFileName,
                    fileSize: 0,
                    width: 0,
                    height: 0,
                    uploadedAt: 0,
                  } : undefined}
                />
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Tips for Better Estimates</h3>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Include the project location (city, state, zip)
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Describe the finish level (budget, mid-range, high-end)
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Mention any special requirements or constraints
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Upload a clear, scaled floor plan image
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Note what's included vs excluded from scope
                  </li>
                </ul>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Next Steps</h4>
                  <p className="text-sm text-blue-700">
                    After defining your scope, you'll annotate the plan in the Space tab 
                    to mark walls, rooms, doors, and windows. Then use the AI chat to 
                    verify all required annotations are complete.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'ready' && session && (
            <div className="space-y-6">
              {/* Scope Summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Scope Summary</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Plan Preview */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Floor Plan</h3>
                    {session.planImageUrl && (
                      <img 
                        src={session.planImageUrl} 
                        alt="Floor plan" 
                        className="w-full rounded-lg border border-gray-200"
                      />
                    )}
                  </div>
                  
                  {/* Scope Text */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Scope Definition</h3>
                    <div className="bg-gray-50 rounded-lg p-4 h-full">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {session.scopeText}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Ready to Annotate</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Go to the Space tab to annotate walls, rooms, doors, and windows on your plan.
                    </p>
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setCurrentStep('input')}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Edit Scope
                    </button>
                    <button
                      onClick={handleProceedToAnnotate}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                    >
                      <span>Annotate Plan</span>
                      <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Annotation Instructions */}
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
                <h3 className="font-medium text-blue-900 mb-3">
                  <span className="mr-2">📝</span>
                  Annotation Instructions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
                  <div>
                    <p className="font-medium mb-2">Required Annotations:</p>
                    <ul className="space-y-1">
                      <li>• <strong>Scale</strong> - Set a reference measurement</li>
                      <li>• <strong>Walls</strong> - Draw polylines for wall segments</li>
                      <li>• <strong>Rooms</strong> - Draw polygons for room areas</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Optional Annotations:</p>
                    <ul className="space-y-1">
                      <li>• <strong>Doors</strong> - Mark door locations</li>
                      <li>• <strong>Windows</strong> - Mark window locations</li>
                      <li>• <strong>Fixtures</strong> - Mark fixtures and equipment</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-4 text-sm text-blue-700">
                  <strong>Tip:</strong> Use the AI chat command <code className="bg-blue-100 px-1 rounded">annotation check</code> to verify all required annotations are complete before generating the estimate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Indicator Component
function StepIndicator({ 
  step, 
  label, 
  active, 
  complete 
}: { 
  step: number; 
  label: string; 
  active: boolean; 
  complete: boolean;
}) {
  return (
    <div className="flex items-center space-x-2">
      <div 
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          complete 
            ? 'bg-blue-600 text-white'
            : active 
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-500'
        }`}
      >
        {complete ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          step
        )}
      </div>
      <span className={`text-sm font-medium ${active ? 'text-blue-600' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}
