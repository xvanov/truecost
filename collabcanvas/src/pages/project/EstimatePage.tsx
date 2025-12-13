/**
 * EstimatePage - Two-phase estimate generation and results view
 * Story: 6-2 - Estimate Page with Two-Phase UI, Tabs & Dual PDF Export
 *
 * Phase 1: Generate Estimate
 * - Shows "Generate Estimate" button if no estimate exists
 * - Progress bar showing pipeline stage during generation
 * - Real-time updates via Firestore subscription
 *
 * Phase 2: Results View
 * - Six tabs: Summary, Materials, Labor, Time, Price Comparison, Estimate vs Actual
 * - Dual PDF export buttons (Contractor/Client)
 * - Raw JSON viewer
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { AuthenticatedLayout } from '../../components/layouts/AuthenticatedLayout';
import { EstimateStepper } from '../../components/estimate/EstimateStepper';
import { MoneyView } from '../../components/money/MoneyView';
import { ComparisonView } from '../../components/money/ComparisonView';
import { TimeView } from '../../components/time/TimeView';
import { PriceComparisonPanel } from '../../components/estimate/PriceComparisonPanel';
import { PipelineDebugPanel } from '../../components/estimate/PipelineDebugPanel';
import { useCanvasStore } from '../../store/canvasStore';
import { useAuth } from '../../hooks/useAuth';
import { useStepCompletion } from '../../hooks/useStepCompletion';
import { getBOM } from '../../services/bomService';
import { loadScopeConfig } from '../../services/scopeConfigService';
import { functions } from '../../services/firebase';
import { getProjectCanvasStoreApi } from '../../store/projectCanvasStore';
import {
  subscribeToPipelineProgress,
  triggerEstimatePipeline,
  type PipelineProgress,
  INITIAL_PROGRESS,
  PIPELINE_STAGES,
} from '../../services/pipelineService';
import {
  generateContractorPDF,
  generateClientPDF,
  openPDFInNewTab,
} from '../../services/pdfService';
import type { EstimateConfig } from './ScopePage';
import type { CSIDivision, AnnotationSnapshot, AnnotatedShape, AnnotatedLayer } from '../../types/estimation';

type EstimatePhase = 'generate' | 'results';
type ResultTab = 'summary' | 'materials' | 'labor' | 'time' | 'priceComparison' | 'estimateVsActual';

/**
 * Tab configuration for the results view
 */
const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'materials', label: 'Materials' },
  { id: 'labor', label: 'Labor' },
  { id: 'time', label: 'Time' },
  { id: 'priceComparison', label: 'Price Comparison' },
  { id: 'estimateVsActual', label: 'Estimate vs Actual' },
];

export function EstimatePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Get estimate config from location state
  const locationState = location.state as { estimateConfig?: EstimateConfig } | null;
  const locationEstimateConfig = locationState?.estimateConfig;
  
  // Default start date: 2 weeks from today
  const defaultStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  }, []);
  
  // Default estimate config
  const defaultEstimateConfig: EstimateConfig = useMemo(() => ({
    // Project details (defaults for when navigating directly to this page)
    projectName: '',
    location: '',
    projectType: '',
    approximateSize: '',
    useUnionLabor: false,
    zipCodeOverride: '',
    // Scope
    scopeText: '',
    // Estimate configuration
    overheadPercent: 10,
    profitPercent: 10,
    contingencyPercent: 5,
    wasteFactorPercent: 10,
    startDate: defaultStartDate,
  }), [defaultStartDate]);
  
  // State for estimate config - prefer location state, then Firestore, then defaults
  const [estimateConfig, setEstimateConfig] = useState<EstimateConfig>(
    locationEstimateConfig || defaultEstimateConfig
  );
  
  // Load estimate config from Firestore if not in location state
  useEffect(() => {
    if (!locationEstimateConfig && projectId) {
      loadScopeConfig(projectId).then((config) => {
        if (config) {
          setEstimateConfig(config);
        }
      }).catch((err) => {
        console.error('EstimatePage: Failed to load scope config:', err);
      });
    }
  }, [projectId, locationEstimateConfig]);

  // Phase state
  const [phase, setPhase] = useState<EstimatePhase>('generate');
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');

  // Pipeline progress state
  const [progress, setProgress] = useState<PipelineProgress>(INITIAL_PROGRESS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfType, setPdfType] = useState<'contractor' | 'client' | null>(null);

  // Debug panel state
  const [showDebug, setShowDebug] = useState(false);
  
  // JSON generation state (for TS estimation pipeline)
  const [isGeneratingJSON, setIsGeneratingJSON] = useState(false);

  // BOM state from store
  const billOfMaterials = useCanvasStore((state) => state.billOfMaterials);
  const setBillOfMaterials = useCanvasStore((state) => state.setBillOfMaterials);
  
  // Clarification output state (from TS estimation pipeline - not used with Python pipeline)
  const [clarificationOutput, _setClarificationOutput] = useState<Record<string, unknown> | null>(null);
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());
  
  // Toggle CSI division expansion
  const toggleDivision = useCallback((divKey: string) => {
    setExpandedDivisions((prev) => {
      const next = new Set(prev);
      if (next.has(divKey)) {
        next.delete(divKey);
      } else {
        next.add(divKey);
      }
      return next;
    });
  }, []);

  // Check if estimate already exists OR if pipeline is running on mount
  useEffect(() => {
    if (!projectId) return;

    const checkExistingState = async () => {
      try {
        // First check if BOM exists (estimate complete)
        const bom = await getBOM(projectId);
        if (bom && bom.totalMaterials.length > 0) {
          setBillOfMaterials(bom);
          setPhase('results');
          return;
        }

        // If no BOM, check if pipeline is running
        const { getPipelineStatus } = await import('../../services/pipelineService');
        const pipelineStatus = await getPipelineStatus(projectId);

        if (pipelineStatus.status === 'running') {
          // Resume tracking the running pipeline
          setIsGenerating(true);
          setProgress(pipelineStatus);
        }
      } catch (err) {
        console.error('Error checking existing state:', err);
      }
    };

    checkExistingState();
  }, [projectId, setBillOfMaterials]);

  // Subscribe to pipeline progress - subscribe whenever in generate phase
  // This handles both new pipelines and resuming existing ones
  useEffect(() => {
    if (!projectId || phase !== 'generate') return;

    const unsubscribe = subscribeToPipelineProgress(
      projectId,
      (newProgress) => {
        // Only update if pipeline is actually doing something
        if (newProgress.status === 'idle' && !isGenerating) {
          return; // Don't update for idle status if we haven't started
        }

        setProgress(newProgress);

        // If pipeline is running, make sure isGenerating is true
        if (newProgress.status === 'running' && !isGenerating) {
          setIsGenerating(true);
        }

        // Check if pipeline completed
        if (newProgress.status === 'complete') {
          setIsGenerating(false);
          // Load the generated BOM
          getBOM(projectId).then((bom) => {
            if (bom) {
              setBillOfMaterials(bom);
              setPhase('results');
            }
          });
        } else if (newProgress.status === 'error') {
          setIsGenerating(false);
          setError(newProgress.error || 'Pipeline failed');
        }
      },
      (err) => {
        // Don't set error for permission errors on initial load
        // (pipeline doc may not exist yet)
        if (!isGenerating) {
          console.warn('[PIPELINE] Subscription warning:', err.message);
          return;
        }
        setError(err.message);
        setIsGenerating(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, phase, isGenerating, setBillOfMaterials]);

  // Handle generate estimate button click - uses Python pipeline
  const handleGenerateEstimate = useCallback(async () => {
    if (!projectId || !user) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ ...INITIAL_PROGRESS, status: 'running', startedAt: Date.now() });

    try {
      const result = await triggerEstimatePipeline(projectId, user.uid);

      if (!result.success) {
        setError(result.error || 'Failed to start pipeline');
        setIsGenerating(false);
      }
      // If successful, the subscription will handle progress updates
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsGenerating(false);
    }
  }, [projectId, user]);

  // Handle generate JSON button click - uses TS estimation pipeline, logs to console
  const handleGenerateJSON = useCallback(async () => {
    if (!projectId || !user) return;

    setIsGeneratingJSON(true);
    console.log('🚀 Starting JSON generation via estimationPipeline...');

    try {
      // Capture current annotations from the project canvas store
      const projectStore = getProjectCanvasStoreApi(projectId);
      const storeState = projectStore.getState();
      
      // Build annotation snapshot from current canvas state
      const shapes = Array.from(storeState.shapes.values());
      const layers = storeState.layers;
      
      const annotatedShapes: AnnotatedShape[] = shapes.map((shape) => {
        const annotated: AnnotatedShape = {
          id: shape.id,
          type: shape.type,
          x: shape.x,
          y: shape.y,
          w: shape.w,
          h: shape.h,
          confidence: shape.confidence ?? 1.0,
          source: (shape.source || 'manual') as 'ai' | 'manual',
        };
        if (shape.itemType) annotated.label = shape.itemType;
        if (shape.itemType) annotated.itemType = shape.itemType;
        if (shape.points) annotated.points = shape.points;
        if (shape.layerId) annotated.layerId = shape.layerId;
        return annotated;
      });
      
      const annotatedLayers: AnnotatedLayer[] = layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible ?? true,
        shapeCount: shapes.filter((s) => s.layerId === layer.id).length,
      }));
      
      const annotationSnapshot: AnnotationSnapshot = {
        shapes: annotatedShapes,
        layers: annotatedLayers,
        capturedAt: Date.now(),
      };
      
      // Add scale if available
      const scaleLine = storeState.canvasScale.scaleLine;
      if (scaleLine && scaleLine.realWorldLength > 0 && scaleLine.unit) {
        const dx = scaleLine.endX - scaleLine.startX;
        const dy = scaleLine.endY - scaleLine.startY;
        const pixelLength = Math.sqrt(dx * dx + dy * dy);
        const pixelsPerUnit = pixelLength / scaleLine.realWorldLength;
        
        annotationSnapshot.scale = {
          pixelsPerUnit,
          unit: scaleLine.unit as 'feet' | 'inches' | 'meters',
        };
      }

      console.log('📋 Annotation Snapshot:', annotationSnapshot);
      console.log('⚙️ Estimate Config:', estimateConfig);

      // Call the TS estimation pipeline Cloud Function
      const estimationPipelineFn = httpsCallable(functions, 'estimationPipeline');

      const result = await estimationPipelineFn({
        projectId,
        sessionId: `session-${Date.now()}`,
        planImageUrl: null,
        scopeText: estimateConfig.scopeText || 'No scope provided',
        clarificationData: {},
        annotationSnapshot,
        passNumber: 1,
        estimateConfig: {
          overheadPercent: estimateConfig.overheadPercent,
          profitPercent: estimateConfig.profitPercent,
          contingencyPercent: estimateConfig.contingencyPercent,
          wasteFactorPercent: estimateConfig.wasteFactorPercent,
          startDate: estimateConfig.startDate,
        },
      });

      console.log('✅ Estimation Pipeline Result:', result.data);
      
      // Build final JSON with estimate config
      const resultData = result.data as Record<string, unknown>;
      const finalJSON = {
        ...(resultData.clarificationOutput || resultData),
        projectScope: estimateConfig.scopeText,
        estimateConfiguration: {
          overheadPercent: estimateConfig.overheadPercent,
          profitPercent: estimateConfig.profitPercent,
          contingencyPercent: estimateConfig.contingencyPercent,
          materialWasteFactorPercent: estimateConfig.wasteFactorPercent,
          projectStartDate: estimateConfig.startDate,
        },
      };
      
      console.log('📄 Final JSON Output:', JSON.stringify(finalJSON, null, 2));
      console.log('🎉 JSON generation complete! Check the logs above for the full output.');
      
    } catch (err) {
      console.error('❌ JSON generation failed:', err);
    } finally {
      setIsGeneratingJSON(false);
    }
  }, [projectId, user, estimateConfig]);

  // Handle PDF generation
  const handleGeneratePDF = useCallback(
    async (type: 'contractor' | 'client') => {
      if (!projectId) return;

      setIsGeneratingPDF(true);
      setPdfType(type);

      try {
        const result =
          type === 'contractor'
            ? await generateContractorPDF(projectId)
            : await generateClientPDF(projectId);

        if (result.success && result.pdfUrl) {
          openPDFInNewTab(result.pdfUrl);
        } else {
          setError(result.error || 'PDF generation failed');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'PDF generation failed');
      } finally {
        setIsGeneratingPDF(false);
        setPdfType(null);
      }
    },
    [projectId]
  );

  // Navigation handlers
  const handleBackToAnnotate = () => {
    if (projectId) {
      navigate(`/project/${projectId}/annotate`);
    }
  };

  // Get actual completion state from hook
  const { completedSteps } = useStepCompletion(projectId);

  // Debug panel keyboard shortcut (Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Render Phase 1: Generate Estimate
  const renderGeneratePhase = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] glass-panel p-8">
      {isGenerating ? (
        // Progress view
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <h2 className="font-heading text-h2 text-truecost-text-primary mb-2">
              Generating Your Estimate
            </h2>
            <p className="text-body text-truecost-text-secondary">
              Our AI agents are analyzing your project...
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-body-meta text-truecost-text-secondary mb-2">
              <span>{progress.stageName || 'Starting...'}</span>
              <span>{progress.progressPercent}%</span>
            </div>
            <div className="w-full h-3 bg-truecost-glass-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-truecost-cyan to-truecost-teal transition-all duration-500 ease-out"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="space-y-2">
            {PIPELINE_STAGES.map((stage) => {
              const isCompleted = progress.completedStages.includes(stage.id);
              const isCurrent = progress.currentStage === stage.id;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCompleted
                      ? 'bg-truecost-cyan/10 text-truecost-cyan'
                      : isCurrent
                        ? 'bg-truecost-glass-bg text-truecost-text-primary animate-pulse'
                        : 'text-truecost-text-muted'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 border-2 border-truecost-cyan rounded-full border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-truecost-glass-border rounded-full" />
                  )}
                  <span className="text-body">{stage.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Initial generate button view
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-truecost-cyan/20 to-truecost-teal/20 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-truecost-cyan"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="font-heading text-h2 text-truecost-text-primary mb-3">
            Ready to Generate Your Estimate
          </h2>
          <p className="text-body text-truecost-text-secondary mb-8 max-w-md">
            Our AI will analyze your project scope, calculate materials, estimate costs, and
            generate a comprehensive estimate.
          </p>
          <button
            onClick={handleGenerateEstimate}
            className="btn-pill-primary px-8 py-3 text-lg"
          >
            Generate Estimate
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <p className="font-semibold mb-1">Error</p>
          <p className="text-body-meta">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setProgress(INITIAL_PROGRESS);
            }}
            className="mt-2 text-truecost-cyan hover:underline text-body-meta"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );

  // Render Phase 2: Results tabs
  const renderResultsPhase = () => (
    <div className="space-y-6">
      {/* PDF Export buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          onClick={() => handleGeneratePDF('contractor')}
          disabled={isGeneratingPDF}
          className="btn-pill-secondary flex items-center gap-2"
        >
          {isGeneratingPDF && pdfType === 'contractor' ? (
            <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          Contractor Estimate
        </button>
        <button
          onClick={() => handleGeneratePDF('client')}
          disabled={isGeneratingPDF}
          className="btn-pill-primary flex items-center gap-2"
        >
          {isGeneratingPDF && pdfType === 'client' ? (
            <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          Client Estimate
        </button>
      </div>

      {/* Tab navigation */}
      <div className="glass-panel p-1">
        <div className="flex flex-wrap gap-1">
          {RESULT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-body font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-br from-truecost-cyan to-truecost-teal text-truecost-bg-primary'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="glass-panel p-0 overflow-hidden">
        {activeTab === 'summary' && (
          <div className="p-6 space-y-6">
            {/* Estimate Configuration */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">Estimate Configuration</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">{estimateConfig.overheadPercent}%</p>
                  <p className="text-xs text-truecost-text-secondary mt-1">Overhead</p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">{estimateConfig.profitPercent}%</p>
                  <p className="text-xs text-truecost-text-secondary mt-1">Profit</p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">{estimateConfig.contingencyPercent}%</p>
                  <p className="text-xs text-truecost-text-secondary mt-1">Contingency</p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-2xl font-bold text-truecost-cyan">{estimateConfig.wasteFactorPercent}%</p>
                  <p className="text-xs text-truecost-text-secondary mt-1">Waste Factor</p>
                </div>
                <div className="glass-panel p-3 text-center bg-truecost-cyan/5 border-truecost-cyan/30">
                  <p className="text-lg font-bold text-truecost-cyan">
                    {new Date(estimateConfig.startDate).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </p>
                  <p className="text-xs text-truecost-text-secondary mt-1">Start Date</p>
                </div>
              </div>
            </div>

            {/* Project Scope */}
            {estimateConfig.scopeText && (
              <div className="glass-panel p-6">
                <h2 className="text-lg font-semibold text-truecost-text-primary mb-3">Project Scope</h2>
                <p className="text-sm text-truecost-text-primary/80 whitespace-pre-wrap leading-relaxed">
                  {estimateConfig.scopeText}
                </p>
              </div>
            )}

            {/* CSI Scope Breakdown */}
            {clarificationOutput && (() => {
              const csiScope = clarificationOutput.csiScope as Record<string, CSIDivision> | undefined;
              const projectBrief = clarificationOutput.projectBrief as Record<string, unknown> | undefined;
              const scopeSummary = projectBrief?.scopeSummary as Record<string, unknown> | undefined;
              const flags = clarificationOutput.flags as { lowConfidenceItems?: Array<{field: string; reason: string}>; missingData?: string[] } | undefined;

              return (
                <>
                  {/* Project Summary */}
                  {projectBrief && scopeSummary && (
                    <div className="glass-panel p-6">
                      <h2 className="text-lg font-semibold text-truecost-text-primary mb-4">Project Summary</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-truecost-text-secondary uppercase">Type</p>
                          <p className="text-sm font-medium text-truecost-text-primary">
                            {String(projectBrief.projectType || 'Unknown').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-truecost-text-secondary uppercase">Size</p>
                          <p className="text-sm font-medium text-truecost-text-primary">
                            {String(scopeSummary.totalSqft || '0')} sq ft
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-truecost-text-secondary uppercase">Finish Level</p>
                          <p className="text-sm font-medium text-truecost-text-primary capitalize">
                            {String(scopeSummary.finishLevel || 'standard').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="glass-panel p-2 text-center bg-green-500/10 border-green-500/30 flex-1">
                            <p className="text-lg font-bold text-green-400">{String(scopeSummary.totalIncluded || 0)}</p>
                            <p className="text-xs text-green-400/70">Included</p>
                          </div>
                          <div className="glass-panel p-2 text-center bg-red-500/10 border-red-500/30 flex-1">
                            <p className="text-lg font-bold text-red-400">{String(scopeSummary.totalExcluded || 0)}</p>
                            <p className="text-xs text-red-400/70">Excluded</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CSI Divisions */}
                  {csiScope && Object.keys(csiScope).length > 0 && (
                    <div className="glass-panel">
                      <div className="px-6 py-4 border-b border-truecost-glass-border">
                        <h2 className="text-lg font-semibold text-truecost-text-primary">CSI Scope Breakdown</h2>
                      </div>
                      <div className="divide-y divide-truecost-glass-border max-h-96 overflow-y-auto">
                        {Object.entries(csiScope).map(([key, division]) => {
                          const div = division as CSIDivision;
                          const isExpanded = expandedDivisions.has(key);
                          const hasItems = div.items && div.items.length > 0;
                          
                          return (
                            <div key={key} className="px-6 py-3">
                              <button
                                onClick={() => toggleDivision(key)}
                                className="w-full flex items-center justify-between text-left"
                              >
                                <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                                  <span className="text-sm font-mono text-truecost-text-secondary">{div.code}</span>
                                  <span className="font-medium text-truecost-text-primary">{div.name}</span>
                                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                                    div.status === 'included' ? 'bg-green-500/20 text-green-400'
                                    : div.status === 'excluded' ? 'bg-red-500/20 text-red-400'
                                    : div.status === 'by_owner' ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                  }`}>
                                    {div.status.replace(/_/g, ' ')}
                                  </span>
                                  {hasItems && <span className="text-xs text-truecost-text-secondary">({div.items.length} items)</span>}
                                </div>
                                <svg className={`w-5 h-5 text-truecost-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {isExpanded && hasItems && (
                                <div className="mt-3 ml-12">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-xs text-truecost-text-secondary uppercase">
                                        <th className="pb-2">Item</th>
                                        <th className="pb-2 text-right">Qty</th>
                                        <th className="pb-2">Unit</th>
                                        <th className="pb-2 text-right">Confidence</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-truecost-glass-border/50">
                                      {div.items.map((item) => (
                                        <tr key={item.id}>
                                          <td className="py-2 font-medium text-truecost-text-primary">{item.item}</td>
                                          <td className="py-2 text-right font-mono text-truecost-text-primary">{item.quantity}</td>
                                          <td className="py-2 text-truecost-text-secondary">{item.unit}</td>
                                          <td className="py-2 text-right">
                                            <span className={`inline-block w-12 text-center px-1 py-0.5 text-xs rounded ${
                                              item.confidence >= 0.9 ? 'bg-green-500/20 text-green-400'
                                              : item.confidence >= 0.7 ? 'bg-yellow-500/20 text-yellow-400'
                                              : 'bg-red-500/20 text-red-400'
                                            }`}>
                                              {Math.round(item.confidence * 100)}%
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Flags */}
                  {flags && ((flags.lowConfidenceItems && flags.lowConfidenceItems.length > 0) || (flags.missingData && flags.missingData.length > 0)) && (
                    <div className="glass-panel p-6 bg-yellow-500/10 border-yellow-500/30">
                      <h2 className="text-lg font-semibold text-yellow-400 mb-4">Review Required</h2>
                      {flags.lowConfidenceItems && flags.lowConfidenceItems.length > 0 && (
                        <div className="mb-4">
                          <h3 className="text-sm font-medium text-yellow-400/80 mb-2">Low Confidence Items</h3>
                          <ul className="list-disc list-inside text-sm text-yellow-400/70 space-y-1">
                            {flags.lowConfidenceItems.map((item, i) => (
                              <li key={i}><span className="font-mono text-xs">{item.field}</span>: {item.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {flags.missingData && flags.missingData.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-yellow-400/80 mb-2">Missing Data</h3>
                          <ul className="list-disc list-inside text-sm text-yellow-400/70 space-y-1">
                            {flags.missingData.map((item, i) => (<li key={i}>{item}</li>))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Raw JSON Viewer */}
            {clarificationOutput && (
              <details className="glass-panel">
                <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-truecost-text-primary hover:bg-truecost-glass-bg/50">
                  View Raw JSON
                </summary>
                <pre className="px-6 py-4 text-xs overflow-auto max-h-96 bg-truecost-bg-secondary text-truecost-cyan rounded-b-lg">
                  {JSON.stringify({
                    ...clarificationOutput,
                    projectScope: estimateConfig.scopeText,
                    estimateConfiguration: {
                      overheadPercent: estimateConfig.overheadPercent,
                      profitPercent: estimateConfig.profitPercent,
                      contingencyPercent: estimateConfig.contingencyPercent,
                      materialWasteFactorPercent: estimateConfig.wasteFactorPercent,
                      projectStartDate: estimateConfig.startDate,
                    },
                  }, null, 2)}
                </pre>
              </details>
            )}

            {/* Download JSON button */}
            {clarificationOutput && (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({
                      ...clarificationOutput,
                      projectScope: estimateConfig.scopeText,
                      estimateConfiguration: {
                        overheadPercent: estimateConfig.overheadPercent,
                        profitPercent: estimateConfig.profitPercent,
                        contingencyPercent: estimateConfig.contingencyPercent,
                        materialWasteFactorPercent: estimateConfig.wasteFactorPercent,
                        projectStartDate: estimateConfig.startDate,
                      },
                    }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `estimate-${projectId}-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-pill-secondary flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download JSON
                </button>
              </div>
            )}

            {/* No results yet message */}
            {!clarificationOutput && (
              <div className="glass-panel p-8 text-center">
                <p className="text-truecost-text-secondary">
                  No estimation results available yet. The summary will appear here after the estimate is generated.
                </p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'materials' && (
          <MoneyView mode="materials" />
        )}
        {activeTab === 'labor' && (
          <MoneyView mode="labor" />
        )}
        {activeTab === 'time' && projectId && (
          <TimeView projectId={projectId} />
        )}
        {activeTab === 'priceComparison' && projectId && (
          <PriceComparisonPanel projectId={projectId} />
        )}
        {activeTab === 'estimateVsActual' && billOfMaterials && (
          <div className="p-6">
            <ComparisonView bom={billOfMaterials} />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-truecost-cyan hover:underline text-body-meta"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-truecost-bg-primary">
      <AuthenticatedLayout>
        <div className="container-spacious max-w-full pt-20 pb-14 md:pt-24">
          {/* Stepper */}
          {projectId && (
            <EstimateStepper
              currentStep="estimate"
              projectId={projectId}
              completedSteps={completedSteps}
            />
          )}

          {/* Header */}
          <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-body-meta font-medium text-white border border-truecost-glass-border">
                Estimate
              </span>
              <h1 className="font-heading text-h1 text-truecost-text-primary">
                {phase === 'generate' ? 'Generate Estimate' : 'Project Estimate'}
              </h1>
              <p className="font-body text-body text-truecost-text-secondary/90">
                {phase === 'generate'
                  ? 'Generate a comprehensive estimate for your construction project.'
                  : 'Review your estimate details and export reports.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleBackToAnnotate} className="btn-pill-secondary">
                Back to Annotate
              </button>
              {/* Generate JSON button - triggers TS estimation pipeline, logs to console */}
              <button
                onClick={handleGenerateJSON}
                disabled={isGeneratingJSON}
                className="btn-pill-secondary flex items-center gap-2"
              >
                {isGeneratingJSON ? (
                  <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                )}
                Generate JSON
              </button>
              {/* Debug toggle button */}
              <button
                onClick={() => setShowDebug((prev) => !prev)}
                className={`px-3 py-2 rounded-lg text-xs font-mono transition-colors ${
                  showDebug
                    ? 'bg-truecost-cyan/20 text-truecost-cyan border border-truecost-cyan/50'
                    : 'bg-truecost-glass-bg text-truecost-text-muted hover:text-truecost-text-primary border border-truecost-glass-border'
                }`}
                title="Toggle debug panel (Shift+D)"
              >
                🔧 Debug
              </button>
            </div>
          </div>

          {/* Main content */}
          {phase === 'generate' ? renderGeneratePhase() : renderResultsPhase()}
        </div>

        {/* Debug Panel */}
        {projectId && (
          <PipelineDebugPanel
            projectId={projectId}
            isVisible={showDebug}
            onClose={() => setShowDebug(false)}
          />
        )}
      </AuthenticatedLayout>
    </div>
  );
}
