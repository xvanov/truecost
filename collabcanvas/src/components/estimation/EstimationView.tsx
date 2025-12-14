/**
 * Estimation View Component
 * Displays the estimation analysis and generated ClarificationOutput JSON
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../hooks/useAuth';
import { functions } from '../../services/firebase';
import { getProjectCanvasStoreApi } from '../../store/projectCanvasStore';
import {
  getLatestEstimationSession,
  subscribeToEstimationSession,
  startEstimationAnalysis,
  saveAnnotationSnapshot,
  markEstimationFailed,
} from '../../services/estimationService';
import type { EstimationSession, CSIDivision, AnnotationSnapshot, AnnotatedShape, AnnotatedLayer } from '../../types/estimation';

export function EstimationView() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  
  const [session, setSession] = useState<EstimationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());

  // Load and subscribe to session
  useEffect(() => {
    if (!projectId) return;

    let unsubscribe: (() => void) | undefined;

    const loadSession = async () => {
      try {
        const latestSession = await getLatestEstimationSession(projectId);
        if (latestSession) {
          setSession(latestSession);
          
          // Subscribe to real-time updates
          unsubscribe = subscribeToEstimationSession(projectId, latestSession.id, (updated) => {
            setSession(updated);
            if (updated?.status === 'complete' || updated?.status === 'error') {
              setAnalyzing(false);
            }
          });
        }
      } catch (err) {
        console.error('Failed to load estimation session:', err);
        setError('Failed to load estimation data');
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [projectId]);

  const handleStartAnalysis = useCallback(async () => {
    if (!projectId || !user || !session) return;

    setAnalyzing(true);
    setError(null);

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
        // Only add optional fields if they have values (Firestore rejects undefined)
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
      // Only add scale if scale line exists (Firestore rejects undefined values)
      const scaleLine = storeState.canvasScale.scaleLine;
      if (scaleLine && scaleLine.realWorldLength > 0 && scaleLine.unit) {
        // Calculate pixels per unit from scale line geometry
        const dx = scaleLine.endX - scaleLine.startX;
        const dy = scaleLine.endY - scaleLine.startY;
        const pixelLength = Math.sqrt(dx * dx + dy * dy);
        const pixelsPerUnit = pixelLength / scaleLine.realWorldLength;
        
        annotationSnapshot.scale = {
          pixelsPerUnit,
          unit: scaleLine.unit as 'feet' | 'inches' | 'meters',
        };
      }
      
      // Save annotation snapshot to session
      await saveAnnotationSnapshot(projectId, session.id, annotationSnapshot, user.uid);
      
      await startEstimationAnalysis(projectId, session.id, user.uid);

      // Call the estimation pipeline
      const estimationPipeline = httpsCallable(functions, 'estimationPipeline');

      // Build clarification data from messages
      const clarificationData: Record<string, unknown> = {};
      for (const msg of session.clarificationMessages) {
        if (msg.extractedData) {
          Object.assign(clarificationData, msg.extractedData);
        }
      }

      await estimationPipeline({
        projectId,
        sessionId: session.id,
        planImageUrl: session.planImageUrl,
        scopeText: session.scopeText,
        clarificationData,
        annotationSnapshot,
        passNumber: session.analysisPassCount + 1,
      });
    } catch (err) {
      console.error('Analysis failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMessage);
      setAnalyzing(false);
      
      // Update session status to 'error' so the button becomes clickable again
      if (projectId && session && user) {
        try {
          await markEstimationFailed(projectId, session.id, errorMessage, user.uid);
        } catch (updateErr) {
          console.error('Failed to update session status:', updateErr);
        }
      }
    }
  }, [projectId, user, session]);

  const handleDownloadJSON = useCallback(() => {
    if (!session?.clarificationOutput) return;

    const blob = new Blob([JSON.stringify(session.clarificationOutput, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-${session.clarificationOutput.estimateId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session]);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading estimation...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Estimation Started</h3>
          <p className="mt-2 text-sm text-gray-500">
            Go to the Scope tab to upload your project scope and plan image, then complete the clarification process.
          </p>
        </div>
      </div>
    );
  }

  const output = session.clarificationOutput;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Estimation Analysis</h1>
            <p className="text-sm text-gray-500">
              {session.status === 'complete' && output
                ? `Estimate ID: ${output.estimateId}`
                : `Status: ${session.status}`}
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            {session.status === 'complete' && output && (
              <button
                onClick={handleDownloadJSON}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Download JSON
              </button>
            )}
            
            <button
              onClick={handleStartAnalysis}
              disabled={analyzing}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                analyzing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : session.status === 'error'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {analyzing ? (
                <span className="flex items-center">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                  Analyzing...
                </span>
              ) : session.status === 'error' ? (
                'Retry Analysis'
              ) : session.analysisPassCount > 0 ? (
                `Re-analyze (Pass ${session.analysisPassCount + 1})`
              ) : (
                'Start Analysis'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {(error || session.status === 'error') && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-red-800">Analysis Failed</p>
                <p className="text-sm text-red-700 mt-1">{error || 'An error occurred during analysis. Please try again.'}</p>
                <p className="text-xs text-red-600 mt-2">Click "Retry Analysis" to try again.</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {analyzing || session.status === 'analyzing' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-lg font-medium text-gray-900">Analyzing Plan...</p>
            <p className="mt-2 text-sm text-gray-500">
              Pass {session.analysisPassCount + 1} - This may take a few minutes
            </p>
          </div>
        ) : session.status === 'error' && !output ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="h-16 w-16 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-4 text-lg font-medium text-gray-900">Analysis Failed</p>
            <p className="mt-2 text-sm text-gray-500 text-center max-w-md">
              The analysis could not be completed. Please check your annotations and scale settings, then click "Retry Analysis".
            </p>
          </div>
        ) : output ? (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Project Brief Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Type</p>
                  <p className="text-sm font-medium text-gray-900">
                    {output.projectBrief.projectType.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Location</p>
                  <p className="text-sm font-medium text-gray-900">
                    {output.projectBrief.location.city}, {output.projectBrief.location.state}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Size</p>
                  <p className="text-sm font-medium text-gray-900">
                    {output.projectBrief.scopeSummary.totalSqft} sq ft
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Finish Level</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {output.projectBrief.scopeSummary.finishLevel.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 uppercase mb-2">Description</p>
                <p className="text-sm text-gray-700">{output.projectBrief.scopeSummary.description}</p>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <div className="bg-green-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-green-700">{output.projectBrief.scopeSummary.totalIncluded}</p>
                  <p className="text-xs text-green-600">Included</p>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-red-700">{output.projectBrief.scopeSummary.totalExcluded}</p>
                  <p className="text-xs text-red-600">Excluded</p>
                </div>
                <div className="bg-yellow-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-yellow-700">{output.projectBrief.scopeSummary.byOwnerDivisions.length}</p>
                  <p className="text-xs text-yellow-600">By Owner</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-gray-700">{output.projectBrief.scopeSummary.notApplicableDivisions.length}</p>
                  <p className="text-xs text-gray-600">N/A</p>
                </div>
              </div>
            </div>

            {/* CSI Scope Divisions */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">CSI Scope Breakdown</h2>
              </div>
              
              <div className="divide-y divide-gray-100">
                {Object.entries(output.csiScope).map(([key, division]) => {
                  const div = division as CSIDivision;
                  const isExpanded = expandedDivisions.has(key);
                  const hasItems = div.items && div.items.length > 0;
                  
                  return (
                    <div key={key} className="px-6 py-3">
                      <button
                        onClick={() => toggleDivision(key)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-mono text-gray-400">{div.code}</span>
                          <span className="font-medium text-gray-900">{div.name}</span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              div.status === 'included'
                                ? 'bg-green-100 text-green-700'
                                : div.status === 'excluded'
                                ? 'bg-red-100 text-red-700'
                                : div.status === 'by_owner'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {div.status.replace(/_/g, ' ')}
                          </span>
                          {hasItems && (
                            <span className="text-xs text-gray-400">
                              ({div.items.length} items)
                            </span>
                          )}
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {isExpanded && (
                        <div className="mt-3 ml-12">
                          {div.description && (
                            <p className="text-sm text-gray-600 mb-2">{div.description}</p>
                          )}
                          {div.exclusionReason && (
                            <p className="text-sm text-red-600 italic mb-2">
                              Reason: {div.exclusionReason}
                            </p>
                          )}
                          
                          {hasItems && (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-gray-500 uppercase">
                                  <th className="pb-2">Item</th>
                                  <th className="pb-2 text-right">Qty</th>
                                  <th className="pb-2">Unit</th>
                                  <th className="pb-2 text-right">Confidence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {div.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-2">
                                      <div className="font-medium text-gray-900">{item.item}</div>
                                      {item.specifications && (
                                        <div className="text-xs text-gray-500">{item.specifications}</div>
                                      )}
                                    </td>
                                    <td className="py-2 text-right font-mono">{item.quantity}</td>
                                    <td className="py-2 text-gray-600">{item.unit}</td>
                                    <td className="py-2 text-right">
                                      <span
                                        className={`inline-block w-12 text-center px-1 py-0.5 text-xs rounded ${
                                          item.confidence >= 0.9
                                            ? 'bg-green-100 text-green-700'
                                            : item.confidence >= 0.7
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}
                                      >
                                        {Math.round(item.confidence * 100)}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Flags */}
            {(output.flags.lowConfidenceItems.length > 0 || output.flags.missingData.length > 0) && (
              <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
                <h2 className="text-lg font-semibold text-yellow-900 mb-4">Review Required</h2>
                
                {output.flags.lowConfidenceItems.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-yellow-800 mb-2">Low Confidence Items</h3>
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {output.flags.lowConfidenceItems.map((item, i) => (
                        <li key={i}>
                          <span className="font-mono text-xs">{item.field}</span>: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {output.flags.missingData.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800 mb-2">Missing Data</h3>
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {output.flags.missingData.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Raw JSON Viewer */}
            <details className="bg-white rounded-lg border border-gray-200">
              <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                View Raw JSON
              </summary>
              <pre className="px-6 py-4 text-xs overflow-auto max-h-96 bg-gray-900 text-green-400 rounded-b-lg">
                {JSON.stringify(output, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500">
              Complete the clarification process and add annotations in the Space tab,
              then click "Start Analysis" to generate the estimate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

