import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Canvas, { type CanvasHandle } from '../../components/Canvas';
import { ShapePropertiesPanel } from '../../components/ShapePropertiesPanel';
import { ChatPanel } from '../../components/estimate/ChatPanel';
import { CanvasNavbar } from '../../components/navigation/CanvasNavbar';
import { useCanvasStore } from '../../store/canvasStore';
import { getProjectCanvasStoreApi, useScopedCanvasStore } from '../../store/projectCanvasStore';
import { useProjectStore } from '../../store/projectStore';
import { useAuth } from '../../hooks/useAuth';
import { useShapes } from '../../hooks/useShapes';
import { useLayers } from '../../hooks/useLayers';
import { useLayerTemplates } from '../../hooks/useLayerTemplates';
import { useLocks } from '../../hooks/useLocks';
import { useOffline } from '../../hooks/useOffline';
import { DiagnosticsHud } from '../../components/DiagnosticsHud';
import { loadScopeConfig } from '../../services/scopeConfigService';
import type { BackgroundImage, Shape, ShapeType } from '../../types';
import type { EstimateConfig } from './ScopePage';
import { perfMetrics } from '../../utils/harness';

/**
 * AnnotatePage - Plan annotation page with canvas and chatbot.
 *
 * Features:
 * - Canvas for plan annotation (existing Board component logic)
 * - ChatPanel with clarification agent
 * - Agent runs back-and-forth Q&A with user
 * - Shows "Generate Estimate" button when agent signals completion
 * - EstimateStepper at top showing current step
 */
export function AnnotatePage() {
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();
  const location = useLocation();
  const locationState = location.state as {
    backgroundImage?: BackgroundImage;
    estimateConfig?: EstimateConfig;
  } | null;
  const pendingBackgroundImage = locationState?.backgroundImage;
  const locationEstimateConfig = locationState?.estimateConfig;
  
  // State for estimate config - prefer location state, fall back to Firestore
  const [estimateConfig, setEstimateConfig] = useState<EstimateConfig | undefined>(locationEstimateConfig);
  
  // Load estimate config from Firestore if not in location state
  useEffect(() => {
    if (!locationEstimateConfig && projectId) {
      loadScopeConfig(projectId).then((config) => {
        if (config) {
          setEstimateConfig(config);
        }
      }).catch((err) => {
        console.error('Failed to load scope config:', err);
      });
    }
  }, [projectId, locationEstimateConfig]);

  // Project store for loading project data when no navigation state
  const loadProject = useProjectStore((state) => state.loadProject);
  const [loadedFromProject, setLoadedFromProject] = useState(false);

  const [fps, setFps] = useState<number>(60);
  const [zoom, setZoom] = useState<number>(1);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showAlignmentToolbar, setShowAlignmentToolbar] = useState(false);

  const { user } = useAuth();
  const setCurrentUser = useCanvasStore((state) => state.setCurrentUser);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const moveSelectedShapes = useCanvasStore((state) => state.moveSelectedShapes);
  const rotateSelectedShapes = useCanvasStore((state) => state.rotateSelectedShapes);
  const setBackgroundImage = useScopedCanvasStore(projectId, (state) => state.setBackgroundImage);

  const { createShape, reloadShapesFromFirestore, deleteShapes, duplicateShapes, updateShapeRotation } =
    useShapes(projectId);
  useLayers(projectId);
  
  // Layer templates - pre-populate layers based on scope text analysis
  const {
    createTemplatedLayers,
    layersInitialized,
    isLoading: layersLoading,
  } = useLayerTemplates(projectId, estimateConfig);
  
  const { clearStaleLocks } = useLocks();
  const { isOnline } = useOffline();
  const canvasRef = useRef<CanvasHandle | null>(null);

  const showDiagnosticsDefault = useMemo(() => {
    if (typeof window === 'undefined') return perfMetrics.enabled;
    const params = new URLSearchParams(window.location.search);
    if (params.has('diagnostics') || params.get('diag') === '1') {
      return true;
    }
    const stored = window.localStorage.getItem('collabcanvas:diagnosticsHUD');
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    return perfMetrics.enabled;
  }, []);
  const [showDiagnostics, setShowDiagnostics] = useState(showDiagnosticsDefault);

  // Update current user in store when user changes
  useEffect(() => {
    setCurrentUser(user);

    if (projectId && user) {
      const projectStore = getProjectCanvasStoreApi(projectId);
      projectStore.getState().setCurrentUser(user);
    }
  }, [user, setCurrentUser, projectId]);

  // Apply background image from navigation state
  // Must wait for user to be set in project store before syncing to Firestore
  useEffect(() => {
    if (projectId && pendingBackgroundImage && setBackgroundImage && user) {
      // Ensure user is set in project store before saving background image
      const projectStore = getProjectCanvasStoreApi(projectId);
      projectStore.getState().setCurrentUser(user);
      // Only sync to Firestore if we have valid dimensions
      // If dimensions are 0, skip sync to avoid saving broken data
      // The Canvas component will use the actual loaded image dimensions
      const hasValidDimensions = pendingBackgroundImage.width > 0 && pendingBackgroundImage.height > 0;
      setBackgroundImage(pendingBackgroundImage, !hasValidDimensions);
      setLoadedFromProject(true); // Mark as loaded to prevent duplicate loading
    }
  }, [projectId, pendingBackgroundImage, setBackgroundImage, user]);

  // Load background image from project data when no navigation state
  // This handles the case when user navigates directly to annotate page or navigates back
  useEffect(() => {
    if (!projectId || !user || pendingBackgroundImage || loadedFromProject) return;

    // Load project to get planImageUrl
    loadProject(projectId).then((project) => {
      if (project?.planImageUrl && setBackgroundImage) {
        const bgImage: BackgroundImage = {
          id: `bg-${Date.now()}`,
          url: project.planImageUrl,
          fileName: project.planImageFileName || 'plan',
          fileSize: 0,
          width: 0,
          height: 0,
          aspectRatio: 1,
          uploadedAt: Date.now(),
          uploadedBy: user.uid,
        };

        // Ensure user is set in project store
        const projectStore = getProjectCanvasStoreApi(projectId);
        projectStore.getState().setCurrentUser(user);

        // Set background image but skip Firestore sync since we don't have valid dimensions
        // The Canvas component will use the actual loaded image dimensions for display
        // This prevents overwriting valid dimensions in Firestore with 0x0
        setBackgroundImage(bgImage, true);
        setLoadedFromProject(true);
      }
    }).catch((err) => {
      console.error('Failed to load project for background image:', err);
    });
  }, [projectId, user, pendingBackgroundImage, loadedFromProject, loadProject, setBackgroundImage]);

  // Initialize board state subscription
  useEffect(() => {
    if (!projectId) return;

    const projectStore = getProjectCanvasStoreApi(projectId);
    const setupSubscription = projectStore.getState().initializeBoardStateSubscription;
    if (!setupSubscription) return;

    const unsubscribe = setupSubscription();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [projectId]);
  
  // Auto-create templated layers based on scope when entering annotate page
  useEffect(() => {
    if (!projectId || !estimateConfig || layersInitialized || layersLoading) return;
    
    // Wait a bit for existing layers to load from Firestore before creating templates
    const timer = setTimeout(() => {
      console.log('[AnnotatePage] Creating templated layers based on scope...');
      createTemplatedLayers();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [projectId, estimateConfig, layersInitialized, layersLoading, createTemplatedLayers]);

  // Handle reconnection and reload shapes
  useEffect(() => {
    if (user && isOnline) {
      const timeoutId = setTimeout(() => {
        reloadShapesFromFirestore();
        clearStaleLocks();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [user, isOnline, reloadShapesFromFirestore, clearStaleLocks]);

  // Keyboard shortcuts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isCustomShortcut =
        event.key === 'Delete' ||
        event.key === 'Backspace' ||
        (event.key.toLowerCase() === 'd' && event.ctrlKey) ||
        (event.key.toLowerCase() === 'd' && event.metaKey) ||
        (event.key.toLowerCase() === 'r' && event.ctrlKey) ||
        (event.key.toLowerCase() === 'r' && event.metaKey) ||
        event.key === 'Escape';

      if (isCustomShortcut) {
        event.preventDefault();
      }

      // Diagnostics toggle (Shift+D)
      if (event.key.toLowerCase() === 'd' && event.shiftKey) {
        setShowDiagnostics((prev) => {
          const next = !prev;
          window.localStorage.setItem('collabcanvas:diagnosticsHUD', next ? 'on' : 'off');
          return next;
        });
        return;
      }

      if (!user || selectedShapeIds.length === 0) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteShapes(selectedShapeIds);
        return;
      }

      if (event.key.toLowerCase() === 'd' && (event.ctrlKey || event.metaKey)) {
        duplicateShapes(selectedShapeIds);
        return;
      }

      if (event.key.toLowerCase() === 'r' && (event.ctrlKey || event.metaKey)) {
        rotateSelectedShapes(90);
        selectedShapeIds.forEach((shapeId) => {
          const shape = useCanvasStore.getState().shapes.get(shapeId);
          if (shape) {
            updateShapeRotation(shapeId, shape.rotation || 0);
          }
        });
        return;
      }

      if (event.key === 'Escape') {
        clearSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    user,
    selectedShapeIds,
    deleteShapes,
    duplicateShapes,
    moveSelectedShapes,
    rotateSelectedShapes,
    clearSelection,
    updateShapeRotation,
  ]);

  const handleCreateShape = (type: ShapeType) => {
    if (!user) return;

    const center = canvasRef.current?.getViewportCenter() || { x: 200, y: 200 };
    const activeLayerId = useCanvasStore.getState().activeLayerId;
    const layersState = (useCanvasStore.getState().layers || []) as ReturnType<
      typeof useCanvasStore.getState
    >['layers'];
    const activeLayer = layersState.find((l) => l.id === activeLayerId);
    const activeColor = activeLayer?.color || '#3B82F6';

    const baseShape = {
      id: `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      x: center.x - 50,
      y: center.y - 50,
      w: 100,
      h: 100,
      color: activeColor,
      createdAt: Date.now(),
      createdBy: user.uid,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      clientUpdatedAt: Date.now(),
      layerId: activeLayerId,
    };

    const shape: Shape = { ...baseShape };
    switch (type) {
      case 'circle':
        shape.radius = 50;
        break;
      case 'text':
        shape.text = '';
        shape.fontSize = 16;
        shape.w = 200;
        shape.h = 50;
        break;
      case 'line':
        shape.strokeWidth = 2;
        shape.points = [0, 0, 100, 0];
        shape.h = 0;
        break;
    }

    createShape(shape);
  };

  const handleGenerateEstimate = () => {
    if (projectId) {
      navigate(`/project/${projectId}/estimate`, {
        state: { estimateConfig }
      });
    }
  };

  const handleBackToScope = () => {
    if (projectId) {
      navigate(`/project/${projectId}/scope`);
    }
  };

  return (
    <div className="h-screen bg-truecost-bg-primary flex flex-col overflow-hidden">
      {/* Integrated navbar with toolbar */}
      <CanvasNavbar
        projectId={projectId}
        onBackToScope={handleBackToScope}
        onGenerateEstimate={handleGenerateEstimate}
        canGenerateEstimate={true}
        onCreateShape={handleCreateShape}
        stageRef={canvasRef.current?.getStage()}
        onToggleLayers={() => setShowLayersPanel(!showLayersPanel)}
        onToggleAlignment={() => setShowAlignmentToolbar(!showAlignmentToolbar)}
        onToggleGrid={() => {}}
        onActivatePolylineTool={() => canvasRef.current?.activatePolylineTool()}
        onActivatePolygonTool={() => canvasRef.current?.activatePolygonTool()}
        onActivateBoundingBoxTool={() => canvasRef.current?.activateBoundingBoxTool()}
        zoom={zoom}
      />

      {/* Main content - full height below navbar */}
      <div className="flex-1 pt-12 flex overflow-hidden">
        {/* Canvas area - takes most of the space */}
        <div className="flex-1 flex flex-col min-w-0 p-2">
          <div className="flex-1 rounded-lg border border-truecost-glass-border/50 bg-truecost-glass-bg/20 overflow-hidden">
            <Canvas
              ref={canvasRef}
              projectId={projectId}
              onFpsUpdate={setFps}
              onZoomChange={setZoom}
              showLayersPanel={showLayersPanel}
              showAlignmentToolbar={showAlignmentToolbar}
              onCloseLayersPanel={() => setShowLayersPanel(false)}
              onCloseAlignmentToolbar={() => setShowAlignmentToolbar(false)}
            />
          </div>
          {/* Properties panel - collapsible at bottom */}
          <div className="mt-2">
            <ShapePropertiesPanel className="w-full" projectId={projectId} />
          </div>
        </div>

        {/* AI Chat sidebar - fixed width */}
        <div className="w-80 lg:w-96 flex flex-col border-l border-truecost-glass-border bg-truecost-bg-secondary/50">
          <ChatPanel 
            projectId={projectId || ''} 
            estimateConfig={estimateConfig}
            navigateToEstimate={`/project/${projectId}/estimate`}
          />
        </div>
      </div>

      <DiagnosticsHud fps={fps} visible={showDiagnostics} />
    </div>
  );
}
