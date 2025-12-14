import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import Canvas, { type CanvasHandle } from '../components/Canvas';
import { ShapePropertiesPanel } from '../components/ShapePropertiesPanel';
import { useCanvasStore } from '../store/canvasStore';
import { getProjectCanvasStoreApi, useScopedCanvasStore } from '../store/projectCanvasStore';
import { useAuth } from '../hooks/useAuth';
import { useShapes } from '../hooks/useShapes';
import { useLayers } from '../hooks/useLayers';
import { useLocks } from '../hooks/useLocks';
import { useOffline } from '../hooks/useOffline';
import { DiagnosticsHud } from '../components/DiagnosticsHud';
import { FloatingAIChat } from '../components/shared/FloatingAIChat';
import type { BackgroundImage, Shape, ShapeType } from '../types';
import type { EstimateConfig } from './project/ScopePage';
import { perfMetrics } from '../utils/harness';
import { AuthenticatedLayout } from '../components/layouts/AuthenticatedLayout';
// Konva types imported via Canvas component

/**
 * Board page (main canvas view)
 * Protected route - only accessible to authenticated users
 * Contains the Konva canvas with pan/zoom support
 */
export function Board() {
  const navigate = useNavigate();
  const { projectId: routeProjectId, id } = useParams<{ projectId?: string; id?: string }>();
  const projectId = routeProjectId || id;
  const location = useLocation();
  const locationState = location.state as { 
    backgroundImage?: BackgroundImage;
    estimateConfig?: EstimateConfig;
  } | null;
  const pendingBackgroundImage = locationState?.backgroundImage;
  const estimateConfig = locationState?.estimateConfig;
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
  const { createShape, reloadShapesFromFirestore, deleteShapes, duplicateShapes, updateShapeRotation } = useShapes(projectId);
  useLayers(projectId); // Initialize layer synchronization
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
    
    // Also sync currentUser to project-scoped store if projectId exists
    if (projectId && user) {
      const projectStore = getProjectCanvasStoreApi(projectId);
      projectStore.getState().setCurrentUser(user);
      console.log('✅ Synced currentUser to project-scoped store:', { projectId, userId: user.uid });
    }
  }, [user, setCurrentUser, projectId]);

  // If a background image was passed from the Plan page via navigation state, apply it to the canvas store.
  // Must wait for user to be set in project store before syncing to Firestore
  useEffect(() => {
    if (projectId && pendingBackgroundImage && setBackgroundImage && user) {
      // Ensure user is set in project store before saving background image
      const projectStore = getProjectCanvasStoreApi(projectId);
      projectStore.getState().setCurrentUser(user);
      // Now save with Firestore sync enabled
      setBackgroundImage(pendingBackgroundImage, false);
    }
  }, [projectId, pendingBackgroundImage, setBackgroundImage, user]);

  // Initialize board state subscription (background image, scale line) when projectId is available.
  // Note: This should NOT depend on `user` being loaded; board state is project-scoped and can be
  // safely hydrated as soon as we know the projectId. Writes still guard on currentUser inside the store.
  useEffect(() => {
    if (!projectId) {
      console.log('⏸️ Skipping board state subscription setup:', { hasProjectId: !!projectId });
      return;
    }
    
    console.log('🔧 Setting up board state subscription in Board.tsx:', { projectId });
    const projectStore = getProjectCanvasStoreApi(projectId);
    // initializeBoardStateSubscription is already a function that returns the unsubscribe function
    // It doesn't take any arguments - projectId comes from the store closure
    const setupSubscription = projectStore.getState().initializeBoardStateSubscription;
    if (!setupSubscription) {
      console.error('❌ initializeBoardStateSubscription is not a function!');
      return;
    }
    console.log('🔧 Calling initializeBoardStateSubscription...');
    const unsubscribe = setupSubscription();
    console.log('✅ Board state subscription setup complete, unsubscribe function:', typeof unsubscribe);
    
    return () => {
      if (unsubscribe) {
        console.log('🔌 Unsubscribing from board state in Board.tsx');
        unsubscribe();
      }
    };
  }, [projectId]);

  // Handle reconnection and reload shapes with debounce
  useEffect(() => {
    if (user && isOnline) {
      // Debounce reload to prevent excessive calls
      const timeoutId = setTimeout(() => {
        // Reload shapes from Firestore on reconnection
        reloadShapesFromFirestore();
        
        // Clear stale locks on reconnection
        clearStaleLocks();
      }, 1000); // 1 second debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, isOnline, reloadShapesFromFirestore, clearStaleLocks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle keys if user is typing in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Prevent default behavior for our custom shortcuts
      const isCustomShortcut = (
        event.key === 'Delete' || 
        event.key === 'Backspace' ||
        (event.key.toLowerCase() === 'd' && event.ctrlKey) ||
        (event.key.toLowerCase() === 'd' && event.metaKey) ||
        (event.key.toLowerCase() === 'r' && event.ctrlKey) ||
        (event.key.toLowerCase() === 'r' && event.metaKey) ||
        event.key === 'Escape'
      );

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

      // Only handle bulk operations if user is authenticated and has shapes selected
      if (!user || selectedShapeIds.length === 0) {
        return;
      }

      // Delete selected shapes
      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteShapes(selectedShapeIds);
        return;
      }

      // Duplicate selected shapes (Ctrl+D or Cmd+D)
      if (event.key.toLowerCase() === 'd' && (event.ctrlKey || event.metaKey)) {
        duplicateShapes(selectedShapeIds);
        return;
      }

      // Rotate selected shapes (Ctrl+R or Cmd+R)
      if (event.key.toLowerCase() === 'r' && (event.ctrlKey || event.metaKey)) {
        rotateSelectedShapes(90);
        // Sync rotation to Firestore for each selected shape
        selectedShapeIds.forEach(shapeId => {
          const shape = useCanvasStore.getState().shapes.get(shapeId);
          if (shape) {
            updateShapeRotation(shapeId, shape.rotation || 0);
          }
        });
        return;
      }

      // Handle Escape key to clear selection
      if (event.key === 'Escape') {
        clearSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, selectedShapeIds, deleteShapes, duplicateShapes, moveSelectedShapes, rotateSelectedShapes, clearSelection, updateShapeRotation]);

  const handleCreateShape = (type: ShapeType) => {
    if (!user) return;

    // Get viewport center from Canvas component
    const center = canvasRef.current?.getViewportCenter() || { x: 200, y: 200 };

    // Get the current active layer ID
    const activeLayerId = useCanvasStore.getState().activeLayerId;

    const layersState = (useCanvasStore.getState().layers || []) as ReturnType<typeof useCanvasStore.getState>['layers'];
    const activeLayer = layersState.find(l => l.id === activeLayerId);
    const activeColor = activeLayer?.color || '#3B82F6';
    const baseShape = {
      id: `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      x: center.x - 50, // Center the 100px shape
      y: center.y - 50,
      w: 100,
      h: 100,
      color: activeColor,
      createdAt: Date.now(),
      createdBy: user.uid,
      updatedAt: Date.now(),
      updatedBy: user.uid,
      clientUpdatedAt: Date.now(),
      layerId: activeLayerId, // Assign to the currently active layer
    };

    // Add type-specific properties
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

  return (
    <div className="min-h-screen bg-truecost-bg-primary">
      <AuthenticatedLayout>
        <div className="container-spacious max-w-full pt-20 pb-14 md:pt-24">
          <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-body-meta font-medium text-white border border-truecost-glass-border">
                Canvas
              </span>
              <h1 className="font-heading text-h1 text-truecost-text-primary">Project Canvas</h1>
              <p className="font-body text-body text-truecost-text-secondary/90">
                Edit shapes, layers, and annotations before finalizing your estimate.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-pill-secondary"
                onClick={() => projectId && navigate(`/project/${projectId}/scope`)}
                disabled={!projectId}
              >
                Back to Scope
              </button>
              <button
                className="btn-pill-primary"
                onClick={() => projectId && navigate(`/estimate/${projectId}/final`, { 
                  state: { estimateConfig } 
                })}
                disabled={!projectId}
              >
                Continue to Estimate
              </button>
            </div>
          </div>

          <div className="glass-panel p-3 md:p-4">
            <div className="rounded-xl border border-truecost-glass-border/70 bg-truecost-glass-bg/40">
              <div className="mb-3">
                <Toolbar
                  fps={fps}
                  zoom={zoom}
                  onCreateShape={handleCreateShape}
                  stageRef={canvasRef.current?.getStage()}
                  onToggleLayers={() => setShowLayersPanel(!showLayersPanel)}
                  onToggleAlignment={() => setShowAlignmentToolbar(!showAlignmentToolbar)}
                  onToggleGrid={() => {}}
                  onActivatePolylineTool={() => canvasRef.current?.activatePolylineTool()}
                  onActivatePolygonTool={() => canvasRef.current?.activatePolygonTool()}
                  onActivateBoundingBoxTool={() => canvasRef.current?.activateBoundingBoxTool()}
                  projectId={projectId}
                >
                  {/* Additional toolbar controls will be added in future PRs */}
                </Toolbar>
              </div>

              <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-[70vh]">
                <div className="flex-1 min-h-[60vh]">
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
                <ShapePropertiesPanel className="w-full lg:w-80" projectId={projectId} />
              </div>
            </div>
          </div>

          <DiagnosticsHud fps={fps} visible={showDiagnostics} />
          <FloatingAIChat />
        </div>
      </AuthenticatedLayout>
    </div>
  );
}
