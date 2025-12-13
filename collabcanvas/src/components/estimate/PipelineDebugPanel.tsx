/**
 * PipelineDebugPanel - Debug view for pipeline status and context
 * Toggle with Shift+D or the debug button
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../../services/firebase';
import { PIPELINE_STAGES, triggerEstimatePipeline, buildFallbackClarificationOutput } from '../../services/pipelineService';
import { useAuth } from '../../hooks/useAuth';

interface PipelineDebugPanelProps {
  projectId: string;
  isVisible: boolean;
  onClose: () => void;
}

interface PipelineStatusData {
  status: string;
  currentStage: string | null;
  completedStages: string[];
  startedAt: number | null;
  completedAt: number | null;
  error?: string;
  pipelineId?: string;
  triggeredBy?: string;
  updatedAt?: unknown;
}

interface PipelineContextData {
  projectId: string;
  projectName: string;
  projectDescription: string;
  backgroundImage: {
    url: string;
    width: number;
    height: number;
  } | null;
  scopeItems: Array<{ scope: string; description: string }>;
  shapes: Array<{ id: string; type: string; [key: string]: unknown }>;
  pipelineId?: string;
  createdAt?: unknown;
}

// Mock scope data for testing (simple context for TypeScript orchestrator)
const MOCK_SCOPE_CONTEXT: Omit<PipelineContextData, 'pipelineId' | 'createdAt'> = {
  projectId: '',
  projectName: 'Test Kitchen Renovation',
  projectDescription: 'Full kitchen renovation including cabinets, countertops, flooring, and appliances',
  backgroundImage: {
    url: 'https://example.com/kitchen-plan.png',
    width: 1920,
    height: 1080,
  },
  scopeItems: [
    { scope: 'Demolition', description: 'Remove existing cabinets, countertops, flooring, and appliances' },
    { scope: 'Electrical', description: 'Update wiring for new appliances, add under-cabinet lighting' },
    { scope: 'Plumbing', description: 'Relocate sink, add dishwasher connection' },
    { scope: 'Cabinets', description: 'Install 20 linear feet of shaker-style cabinets' },
    { scope: 'Countertops', description: 'Quartz countertops, 45 sq ft total' },
    { scope: 'Flooring', description: 'LVP flooring, 150 sq ft' },
    { scope: 'Appliances', description: 'Refrigerator, range, dishwasher, microwave' },
  ],
  shapes: [
    { id: 'shape-1', type: 'boundingbox', x: 100, y: 100, w: 200, h: 150, itemType: 'cabinet' },
    { id: 'shape-2', type: 'boundingbox', x: 350, y: 100, w: 100, h: 100, itemType: 'appliance' },
    { id: 'shape-3', type: 'boundingbox', x: 100, y: 300, w: 300, h: 50, itemType: 'countertop' },
  ],
};

export function PipelineDebugPanel({ projectId, isVisible, onClose }: PipelineDebugPanelProps) {
  const [status, setStatus] = useState<PipelineStatusData | null>(null);
  const [context, setContext] = useState<PipelineContextData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  // Subscribe to pipeline status
  useEffect(() => {
    if (!projectId || !isVisible) return;

    const statusRef = doc(firestore, 'projects', projectId, 'pipeline', 'status');

    const unsubscribe = onSnapshot(
      statusRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setStatus(snapshot.data() as PipelineStatusData);
          setLastUpdate(new Date());
          setError(null);
        } else {
          setStatus(null);
        }
      },
      (err) => {
        setError(`Status subscription error: ${err.message}`);
      }
    );

    return () => unsubscribe();
  }, [projectId, isVisible]);

  // Load pipeline context
  useEffect(() => {
    if (!projectId || !isVisible) return;

    const loadContext = async () => {
      try {
        const contextRef = doc(firestore, 'projects', projectId, 'pipeline', 'context');
        const contextDoc = await getDoc(contextRef);

        if (contextDoc.exists()) {
          setContext(contextDoc.data() as PipelineContextData);
        } else {
          setContext(null);
        }
      } catch (err) {
        setError(`Context load error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    loadContext();
  }, [projectId, isVisible, status?.pipelineId]);

  // Inject mock scope data
  const handleInjectMockScope = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pipelineId = status?.pipelineId || `mock_${Date.now()}`;
      const contextRef = doc(firestore, 'projects', projectId, 'pipeline', 'context');

      await setDoc(contextRef, {
        ...MOCK_SCOPE_CONTEXT,
        projectId,
        pipelineId,
        createdAt: serverTimestamp(),
      });

      // Also initialize status if not exists
      const statusRef = doc(firestore, 'projects', projectId, 'pipeline', 'status');
      const statusDoc = await getDoc(statusRef);

      if (!statusDoc.exists()) {
        await setDoc(statusRef, {
          status: 'running',
          currentStage: PIPELINE_STAGES[0].id,
          completedStages: [],
          startedAt: Date.now(),
          completedAt: null,
          pipelineId,
          triggeredBy: 'debug-panel',
          projectId,
          updatedAt: serverTimestamp(),
        });
      }

      console.log('[DEBUG] Mock scope injected');
    } catch (err) {
      setError(`Failed to inject mock scope: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Advance to next stage
  const handleAdvanceStage = async () => {
    if (!status) return;
    setIsLoading(true);
    setError(null);

    try {
      const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === status.currentStage);
      const completedStages = [...(status.completedStages || [])];

      // Add current stage to completed if not already there
      if (status.currentStage && !completedStages.includes(status.currentStage)) {
        completedStages.push(status.currentStage);
      }

      const statusRef = doc(firestore, 'projects', projectId, 'pipeline', 'status');

      if (currentIndex >= PIPELINE_STAGES.length - 1) {
        // Final stage - mark complete
        await updateDoc(statusRef, {
          status: 'complete',
          currentStage: null,
          completedStages,
          completedAt: Date.now(),
          updatedAt: serverTimestamp(),
        });
        console.log('[DEBUG] Pipeline marked complete');
      } else {
        // Advance to next stage
        const nextStage = PIPELINE_STAGES[currentIndex + 1].id;
        await updateDoc(statusRef, {
          currentStage: nextStage,
          completedStages,
          updatedAt: serverTimestamp(),
        });
        console.log(`[DEBUG] Advanced to stage: ${nextStage}`);
      }
    } catch (err) {
      setError(`Failed to advance stage: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset pipeline
  const handleResetPipeline = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const statusRef = doc(firestore, 'projects', projectId, 'pipeline', 'status');
      const pipelineId = `reset_${Date.now()}`;

      await setDoc(statusRef, {
        status: 'running',
        currentStage: PIPELINE_STAGES[0].id,
        completedStages: [],
        startedAt: Date.now(),
        completedAt: null,
        pipelineId,
        triggeredBy: 'debug-panel',
        projectId,
        updatedAt: serverTimestamp(),
      });

      console.log('[DEBUG] Pipeline reset');
    } catch (err) {
      setError(`Failed to reset pipeline: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Run the REAL Python agent pipeline via TypeScript orchestrator
  // This calls triggerEstimatePipeline which gathers context and calls Python server-to-server
  const handleRunRealPipeline = async () => {
    if (!user) {
      setError('You must be logged in to run the real pipeline');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[DEBUG] Calling triggerEstimatePipeline for project:', projectId);
      const fallbackPayload = buildFallbackClarificationOutput({ projectId });
      const result = await triggerEstimatePipeline(projectId, user.uid, fallbackPayload);

      if (!result.success) {
        throw new Error(result.error || 'Pipeline failed to start');
      }

      console.log('[DEBUG] Pipeline started:', result);

      // Pipeline is now running - status will be updated via Firestore subscription
      setError(null);
      alert(`Pipeline started!\n\nEstimate ID: ${result.estimateId}\nProject ID: ${projectId}\n\nThe TypeScript orchestrator gathers project context and calls the Python agent pipeline.\nYou should see real-time updates in the status panel above.`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[DEBUG] Real pipeline error:', err);
      setError(`Failed to start real pipeline: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getElapsedTime = () => {
    if (!status?.startedAt) return 'N/A';
    const elapsed = Date.now() - status.startedAt;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="fixed bottom-4 right-4 w-[500px] max-h-[600px] bg-truecost-bg-primary border border-truecost-glass-border rounded-xl shadow-2xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-truecost-glass-bg border-b border-truecost-glass-border">
        <div className="flex items-center gap-2">
          <span className="text-truecost-cyan font-mono text-sm">🔧 Pipeline Debug</span>
          {status?.status === 'running' && (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-truecost-text-muted hover:text-truecost-text-primary"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto max-h-[500px] space-y-3 font-mono text-xs">
        {/* Dev Controls */}
        <div className="space-y-2">
          <div className="text-yellow-400 font-semibold">Dev Controls (Mock/Manual)</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleInjectMockScope}
              disabled={isLoading}
              className="px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 rounded text-yellow-400 disabled:opacity-50"
            >
              {isLoading ? '...' : '📋 Inject Mock Scope'}
            </button>
            <button
              onClick={handleAdvanceStage}
              disabled={isLoading || !status || status.status === 'complete'}
              className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 rounded text-green-400 disabled:opacity-50"
            >
              {isLoading ? '...' : '⏭️ Advance Stage'}
            </button>
            <button
              onClick={handleResetPipeline}
              disabled={isLoading}
              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 disabled:opacity-50"
            >
              {isLoading ? '...' : '🔄 Reset Pipeline'}
            </button>
          </div>
        </div>

        {/* Real Pipeline Control */}
        <div className="space-y-2">
          <div className="text-purple-400 font-semibold">Real Python Pipeline (Epic 2)</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRunRealPipeline}
              disabled={isLoading}
              className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded text-purple-400 disabled:opacity-50"
            >
              {isLoading ? '...' : '🚀 Run Real Pipeline'}
            </button>
          </div>
          <p className="text-[10px] text-truecost-text-muted">
            Calls TypeScript orchestrator which gathers project context and triggers Python pipeline.
            Progress syncs to /projects/{'{projectId}'}/pipeline/status for real-time UI updates.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400">
            {error}
          </div>
        )}

        {/* Status Section */}
        <div className="space-y-1">
          <div className="text-truecost-cyan font-semibold">Pipeline Status</div>
          {status ? (
            <div className="bg-truecost-glass-bg p-2 rounded space-y-1">
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Status:</span>
                <span className={`font-semibold ${
                  status.status === 'running' ? 'text-green-400' :
                  status.status === 'complete' ? 'text-truecost-cyan' :
                  status.status === 'error' ? 'text-red-400' :
                  'text-truecost-text-secondary'
                }`}>{status.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Current Stage:</span>
                <span className="text-truecost-text-primary">{status.currentStage || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Completed:</span>
                <span className="text-truecost-text-primary">
                  {status.completedStages?.length || 0} stages
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Elapsed:</span>
                <span className="text-truecost-text-primary">{getElapsedTime()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Started:</span>
                <span className="text-truecost-text-primary">{formatTime(status.startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Pipeline ID:</span>
                <span className="text-truecost-text-primary text-[10px]">{status.pipelineId || 'N/A'}</span>
              </div>
              {status.error && (
                <div className="mt-2 p-2 bg-red-500/10 rounded text-red-400">
                  Error: {status.error}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-truecost-glass-bg p-2 rounded text-truecost-text-muted">
              No pipeline status found
            </div>
          )}
        </div>

        {/* Completed Stages */}
        {status?.completedStages && status.completedStages.length > 0 && (
          <div className="space-y-1">
            <div className="text-truecost-cyan font-semibold">Completed Stages</div>
            <div className="bg-truecost-glass-bg p-2 rounded">
              {status.completedStages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 text-green-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {stage}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context Section */}
        <div className="space-y-1">
          <div className="text-truecost-cyan font-semibold">Pipeline Context</div>
          {context ? (
            <div className="bg-truecost-glass-bg p-2 rounded space-y-1">
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Project:</span>
                <span className="text-truecost-text-primary">{context.projectName || 'Unnamed'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Has Plan Image:</span>
                <span className={context.backgroundImage ? 'text-green-400' : 'text-red-400'}>
                  {context.backgroundImage ? 'Yes' : 'No'}
                </span>
              </div>
              {context.backgroundImage && (
                <div className="flex justify-between">
                  <span className="text-truecost-text-muted">Image Size:</span>
                  <span className="text-truecost-text-primary">
                    {context.backgroundImage.width}x{context.backgroundImage.height}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Scope Items:</span>
                <span className="text-truecost-text-primary">{context.scopeItems?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-muted">Shapes:</span>
                <span className="text-truecost-text-primary">{context.shapes?.length || 0}</span>
              </div>
              {context.projectDescription && (
                <div className="mt-2">
                  <span className="text-truecost-text-muted">Description:</span>
                  <div className="text-truecost-text-secondary mt-1 text-[10px] break-words">
                    {context.projectDescription.slice(0, 200)}
                    {context.projectDescription.length > 200 && '...'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-truecost-glass-bg p-2 rounded text-truecost-text-muted">
              No context data (pipeline not started?)
            </div>
          )}
        </div>

        {/* Raw Data Toggle */}
        <details className="space-y-1">
          <summary className="text-truecost-cyan font-semibold cursor-pointer hover:text-truecost-teal">
            Raw Data (click to expand)
          </summary>
          <div className="bg-truecost-glass-bg p-2 rounded overflow-x-auto">
            <pre className="text-[10px] text-truecost-text-secondary whitespace-pre-wrap">
              {JSON.stringify({ status, context }, null, 2)}
            </pre>
          </div>
        </details>

        {/* Last Update */}
        <div className="text-truecost-text-muted text-[10px] text-right">
          Last update: {lastUpdate?.toLocaleTimeString() || 'Never'}
        </div>
      </div>
    </div>
  );
}
