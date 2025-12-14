import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Stage, Layer, Line, Circle, Image } from 'react-konva';
import Konva from 'konva';
import { Shape as ShapeComponent } from './Shape';
import { CursorOverlay } from './CursorOverlay';
import { LockOverlay } from './LockOverlay';
import { SelectionBox } from './SelectionBox';
import { TransformControls } from './TransformControls';
import { LayersPanel } from './LayersPanel';
import { AlignmentToolbar } from './AlignmentToolbar';
import { SnapIndicators } from './SnapIndicators';
import { ScaleLine as ScaleLineComponent } from './ScaleLine';
import { MeasurementInput } from './MeasurementInput';
import { MeasurementDisplay } from './MeasurementDisplay';
import { PolylineTool } from './PolylineTool';
import { PolygonTool } from './PolygonTool';
import { BoundingBoxTool } from './BoundingBoxTool';
import { ItemTypeDialog, type ItemType } from './ItemTypeDialog';
import { createPolylineShape, createPolygonShape, createBoundingBoxShape } from '../services/shapeService';
import { useCanvasStore } from '../store/canvasStore';
import { useScopedCanvasStore } from '../store/projectCanvasStore';
import { useShapes } from '../hooks/useShapes';
import { usePresence } from '../hooks/usePresence';
import { useLocks } from '../hooks/useLocks';
import { perfMetrics } from '../utils/harness';
import { calculateViewportBounds, filterVisibleShapes } from '../utils/viewport';
import type { SelectionBox as SelectionBoxType, UnitType, Shape, Layer as LayerType, ScaleLine, BackgroundImage } from '../types';

// Component to properly load and display background image
const BackgroundImageComponent = ({ backgroundImage }: { backgroundImage: BackgroundImage }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadedDimensions, setLoadedDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Reset image state when backgroundImage changes
    setImage(null);
    setLoadedDimensions(null);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isMounted) {
        console.log('✅ Background image loaded:', { url: backgroundImage.url, width: img.width, height: img.height });
        setImage(img);
        // Store the actual loaded dimensions to use as fallback
        setLoadedDimensions({ width: img.width, height: img.height });
      }
    };
    img.onerror = (error) => {
      if (isMounted) {
        console.error('❌ Failed to load background image:', error, backgroundImage.url);
        setImage(null);
        setLoadedDimensions(null);
      }
    };
    img.src = backgroundImage.url;

    return () => {
      isMounted = false;
    };
  }, [backgroundImage.url, backgroundImage.id]); // Include id to detect when the entire object changes

  if (!image) {
    return null;
  }

  // Use stored dimensions if valid, otherwise fall back to actual loaded image dimensions
  // This fixes the bug where images with 0x0 stored dimensions become invisible
  const displayWidth = backgroundImage.width > 0 ? backgroundImage.width : (loadedDimensions?.width || image.width);
  const displayHeight = backgroundImage.height > 0 ? backgroundImage.height : (loadedDimensions?.height || image.height);

  return (
    <Image
      image={image}
      x={0}
      y={0}
      width={displayWidth}
      height={displayHeight}
      listening={false}
    />
  );
};

interface CanvasProps {
  projectId?: string;
  onFpsUpdate?: (fps: number) => void;
  onZoomChange?: (scale: number) => void;
  showLayersPanel?: boolean;
  showAlignmentToolbar?: boolean;
  onCloseLayersPanel?: () => void;
  onCloseAlignmentToolbar?: () => void;
}

export interface CanvasHandle {
  getViewportCenter: () => { x: number; y: number };
  getStage: () => Konva.Stage | null;
  activatePolylineTool: () => void;
  activatePolygonTool: () => void;
  activateBoundingBoxTool: () => void;
  deactivateDrawingTools: () => void;
}
/**
 * Main canvas component with Konva integration
 * Supports pan (click and drag) and zoom (mouse wheel) at 60 FPS
 */
const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ projectId, onFpsUpdate, onZoomChange, showLayersPanel = false, showAlignmentToolbar = false, onCloseLayersPanel, onCloseAlignmentToolbar }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Get viewport state from store for persistence across navigation
  const storedViewportState = useScopedCanvasStore(projectId, (state) => state.viewportState);
  const setViewportState = useScopedCanvasStore(projectId, (state) => state.setViewportState);

  // Helper to get localStorage key for viewport state
  const getViewportStorageKey = useCallback(() => {
    return projectId ? `canvas-viewport-${projectId}` : 'canvas-viewport-global';
  }, [projectId]);

  // Helper to load viewport state from localStorage
  const loadViewportFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(getViewportStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.scale === 'number') {
          return parsed as { x: number; y: number; scale: number };
        }
      }
    } catch (e) {
      console.warn('Failed to load viewport state from localStorage:', e);
    }
    return null;
  }, [getViewportStorageKey]);

  // Helper to save viewport state to localStorage (debounced)
  const saveViewportToStorage = useCallback((state: { x: number; y: number; scale: number }) => {
    try {
      localStorage.setItem(getViewportStorageKey(), JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save viewport state to localStorage:', e);
    }
  }, [getViewportStorageKey]);

  // Initialize viewport state - prefer localStorage over store (localStorage persists across refreshes)
  const getInitialViewportState = useCallback(() => {
    // First try localStorage (persists across page refreshes)
    const fromStorage = loadViewportFromStorage();
    if (fromStorage && (fromStorage.x !== 0 || fromStorage.y !== 0 || fromStorage.scale !== 1)) {
      return fromStorage;
    }
    // Fall back to store (persists across navigation within session)
    if (storedViewportState && (storedViewportState.x !== 0 || storedViewportState.y !== 0 || storedViewportState.scale !== 1)) {
      return storedViewportState;
    }
    return { x: 0, y: 0, scale: 1 };
  }, [loadViewportFromStorage, storedViewportState]);

  // Imperative stage position and scale to avoid React re-renders during pan/zoom
  // Initialize from localStorage/stored state for persistence
  const initialViewport = getInitialViewportState();
  const stagePosRef = useRef({ x: initialViewport.x, y: initialViewport.y });
  const stageScaleRef = useRef(initialViewport.scale);

  // Ref for debounced localStorage save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mouse position for snap indicators
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  // Measurement input modal state
  const [showMeasurementInput, setShowMeasurementInput] = useState(false);
  const [pendingScaleLine, setPendingScaleLine] = useState<{ endX: number; endY: number } | null>(null);
  // Drawing tool states
  const [activeDrawingTool, setActiveDrawingTool] = useState<'polyline' | 'polygon' | 'boundingbox' | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [drawingPreviewPoint, setDrawingPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  // Bounding box tool states
  const [boundingBoxStart, setBoundingBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boundingBoxEnd, setBoundingBoxEnd] = useState<{ x: number; y: number } | null>(null);
  const [showItemTypeDialog, setShowItemTypeDialog] = useState(false);
  const [pendingBoundingBox, setPendingBoundingBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Imperative current-user cursor to avoid React re-renders on mousemove
  const overlaysLayerRef = useRef<Konva.Layer>(null);
  const currentCursorRef = useRef<Konva.Circle>(null);
  const isDragging = useRef(false);
  const isSelecting = useRef(false);
  // Throttle mousemove handler using requestAnimationFrame to batch updates
  const rafPendingRef = useRef<number | null>(null);
  const pendingMouseMoveRef = useRef<{ pointer: { x: number; y: number } | null; stage: Konva.Stage | null } | null>(null);
  const selectionStart = useRef({ x: 0, y: 0 });
  // Throttle zoom change notifications to avoid excessive React re-renders
  const zoomChangeRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const lastFrameTime = useRef(performance.now());
  const frameCount = useRef(0);
  const rafId = useRef<number | undefined>(undefined);
  const lowFpsWarningCount = useRef(0); // Track consecutive low FPS warnings

  // Store state
  const { shapes, updateShapePosition, createShape } = useShapes(projectId);
  // Use project-scoped store for shapes when projectId is available (shapes from useShapes is already project-scoped)
  const shapeMap = useScopedCanvasStore(projectId, (state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const selectShape = useCanvasStore((state) => state.selectShape);
  const deselectShape = useCanvasStore((state) => state.deselectShape);
  const addToSelection = useCanvasStore((state) => state.addToSelection);
  const removeFromSelection = useCanvasStore((state) => state.removeFromSelection);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const selectShapes = useCanvasStore((state) => state.selectShapes);
  const selectionBox = useCanvasStore((state) => state.selectionBox);
  const setSelectionBox = useCanvasStore((state) => state.setSelectionBox);
  const transformControls = useCanvasStore((state) => state.transformControls);
  const updateTransformControls = useCanvasStore((state) => state.updateTransformControls);
  const moveSelectedShapes = useCanvasStore((state) => state.moveSelectedShapes);
  const currentUser = useCanvasStore((state) => state.currentUser);
  // Use project-scoped store for layers when projectId is available
  const activeLayerId = useScopedCanvasStore(projectId, (state) => state.activeLayerId);
  const layers = useScopedCanvasStore(projectId, (state) => state.layers);
  const gridState = useCanvasStore((state) => state.gridState);
  // Use project-scoped store for scale line operations when projectId is available
  const canvasScale = useScopedCanvasStore(projectId, (state) => state.canvasScale);
  const setScaleLine = useScopedCanvasStore(projectId, (state) => state.setScaleLine);
  const updateScaleLine = useScopedCanvasStore(projectId, (state) => state.updateScaleLine);
  const deleteScaleLine = useScopedCanvasStore(projectId, (state) => state.deleteScaleLine);
  const setIsScaleMode = useScopedCanvasStore(projectId, (state) => state.setIsScaleMode);
  
  // Debug: Track activeLayerId changes
  useEffect(() => {
    console.log('🔄 activeLayerId changed to:', activeLayerId);
  }, [activeLayerId]);
  
  // Debug: Track canvasScale changes to see if store updates are triggering re-renders
  useEffect(() => {
    console.log('🔄 canvasScale changed:', { 
      hasBackgroundImage: !!canvasScale.backgroundImage, 
      backgroundImageUrl: canvasScale.backgroundImage?.url,
      hasScaleLine: !!canvasScale.scaleLine,
      scaleLineId: canvasScale.scaleLine?.id
    });
  }, [canvasScale]);
  
  // Presence state
  const { users: otherUsers, updateCursorPosition } = usePresence();
  
  // Locks state
  const {
    locks,
    isShapeLockedByOtherUser,
    isShapeLockedByCurrentUser,
    acquireShapeLock,
    releaseShapeLock,
  } = useLocks();

  // REMOVED scheduleStateUpdate - No longer updating React state during zoom/pan for performance

  // Cursor update function (throttling handled in usePresence)
  // Cache cursor for Firefox performance optimization
  useEffect(() => {
    if (currentCursorRef.current) {
      currentCursorRef.current.cache();
    }
  }, [currentUser]);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // FPS counter using requestAnimationFrame for accurate rendering frame tracking
  useEffect(() => {
    if (!onFpsUpdate) return;

    const measureFPS = () => {
      const now = performance.now();
      frameCount.current++;
      
      const elapsed = now - lastFrameTime.current;
      
      // Update FPS every second
      if (elapsed >= 1000) {
        const fps = Math.round((frameCount.current * 1000) / elapsed);
        onFpsUpdate(fps);
        perfMetrics.recordFps(fps);
        
        // Performance warning when FPS drops below 50 (more lenient threshold)
        // Only warn every 5 seconds to reduce console spam
        if (fps < 50) {
          lowFpsWarningCount.current++;
          if (lowFpsWarningCount.current % 5 === 0) {
            console.warn(`[PERFORMANCE] FPS dropped to ${fps}. Target: 60 FPS. Consider reducing number of shapes or enabling viewport culling.`);
          }
        } else {
          lowFpsWarningCount.current = 0; // Reset counter when FPS is good
        }
        
        frameCount.current = 0;
        lastFrameTime.current = now;
      }

      // Continue measuring on next frame
      rafId.current = requestAnimationFrame(measureFPS);
    };

    // Start measuring
    rafId.current = requestAnimationFrame(measureFPS);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [onFpsUpdate]);

  // Cleanup pending RAFs and timeouts on unmount
  useEffect(() => {
    return () => {
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = null;
      }
      if (zoomChangeRafRef.current !== null) {
        cancelAnimationFrame(zoomChangeRafRef.current);
        zoomChangeRafRef.current = null;
      }
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // Helper to schedule debounced viewport save to localStorage
  const scheduleViewportSave = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveViewportToStorage({
        x: stagePosRef.current.x,
        y: stagePosRef.current.y,
        scale: stageScaleRef.current,
      });
      saveTimeoutRef.current = null;
    }, 500); // Debounce by 500ms
  }, [saveViewportToStorage]);

  // Restore viewport state from localStorage/store on mount
  useEffect(() => {
    const stage = stageRef.current;
    if (stage) {
      // Load from localStorage first (persists across refreshes), then fall back to store
      const savedState = loadViewportFromStorage() || storedViewportState;

      if (savedState) {
        // Only apply if the saved state differs from defaults
        const hasStoredPosition = savedState.x !== 0 || savedState.y !== 0;
        const hasStoredScale = savedState.scale !== 1;

        if (hasStoredPosition || hasStoredScale) {
          stagePosRef.current = { x: savedState.x, y: savedState.y };
          stageScaleRef.current = savedState.scale;
          stage.position({ x: savedState.x, y: savedState.y });
          stage.scale({ x: savedState.scale, y: savedState.scale });

          // Notify parent of restored zoom level
          if (onZoomChange) {
            onZoomChange(savedState.scale);
          }
        }
      }
    }
  // Only run on mount - viewport state is read once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save viewport state to store and localStorage on unmount for persistence
  useEffect(() => {
    return () => {
      const viewportState = {
        x: stagePosRef.current.x,
        y: stagePosRef.current.y,
        scale: stageScaleRef.current,
      };
      // Save to store (for navigation within session)
      if (setViewportState) {
        setViewportState(viewportState);
      }
      // Save to localStorage (for persistence across page refreshes)
      saveViewportToStorage(viewportState);
    };
  // Re-register cleanup when project-scoped functions change (e.g., projectId changes)
  }, [setViewportState, saveViewportToStorage]);

  // Handle wheel zoom - imperative updates for performance
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScaleRef.current;
    const pointer = stage.getPointerPosition();
    
    if (!pointer) return;

    // Calculate mouse position in stage coordinates
    const mousePointTo = {
      x: (pointer.x - stagePosRef.current.x) / oldScale,
      y: (pointer.y - stagePosRef.current.y) / oldScale,
    };

    // Zoom calculation
    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    // Clamp zoom between 0.1x and 5x
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    // Calculate new position to keep mouse point stable
    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    // Update refs imperatively
    stagePosRef.current = newPos;
    stageScaleRef.current = clampedScale;

    // Update stage directly without React re-render
    stage.position(newPos);
    stage.scale({ x: clampedScale, y: clampedScale });

    // Schedule debounced save to localStorage for persistence across refreshes
    scheduleViewportSave();

    // REMOVED: scheduleStateUpdate - Don't trigger React re-renders during zoom!
    // Throttle zoom change notifications using requestAnimationFrame to avoid excessive re-renders
    if (onZoomChange) {
      pendingZoomRef.current = clampedScale;
      
      if (zoomChangeRafRef.current === null) {
        zoomChangeRafRef.current = requestAnimationFrame(() => {
          zoomChangeRafRef.current = null;
          if (pendingZoomRef.current !== null) {
            onZoomChange(pendingZoomRef.current);
            pendingZoomRef.current = null;
          }
        });
      }
    }
  };

  // Handle keyboard events for arrow key movement and Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key to cancel scale mode
      if (e.key === 'Escape' && canvasScale.isScaleMode) {
        setIsScaleMode(false);
        if (canvasScale.scaleLine) {
          if (projectId) {
            (deleteScaleLine as (projectId?: string) => void)(projectId);
          } else {
            (deleteScaleLine as () => void)();
          }
        }
        return;
      }

      // Only handle arrow keys when canvas has focus
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }

      // Check if we have selected shapes
      if (selectedShapeIds.length === 0) {
        return;
      }

      e.preventDefault();
      
      const moveDistance = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowUp':
          moveSelectedShapes(0, -moveDistance);
          break;
        case 'ArrowDown':
          moveSelectedShapes(0, moveDistance);
          break;
        case 'ArrowLeft':
          moveSelectedShapes(-moveDistance, 0);
          break;
        case 'ArrowRight':
          moveSelectedShapes(moveDistance, 0);
          break;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedShapeIds, moveSelectedShapes, canvasScale.isScaleMode, canvasScale.scaleLine, deleteScaleLine, setIsScaleMode, projectId]);

  // Handle mouse down - start pan if clicking on empty space, or start selection
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const clickedOnEmpty = e.target === stageRef.current;
    const stage = stageRef.current;
    if (!stage) return;
    
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    // Convert pointer position to stage coordinates
    const currentStagePos = stagePosRef.current;
    const currentStageScale = stageScaleRef.current;
    
    const stageX = (pointer.x - currentStagePos.x) / currentStageScale;
    const stageY = (pointer.y - currentStagePos.y) / currentStageScale;
    
    if (clickedOnEmpty) {
      // Handle bounding box tool (click and drag)
      if (activeDrawingTool === 'boundingbox') {
        setBoundingBoxStart({ x: stageX, y: stageY });
        setBoundingBoxEnd({ x: stageX, y: stageY });
        isDragging.current = true; // Use drag state to track bounding box drawing
        return;
      }
      
      // Check if Shift key is held for multi-select
      if (e.evt.shiftKey) {
        // Start drag selection
        isSelecting.current = true;
        selectionStart.current = { x: stageX, y: stageY };
        setSelectionBox({
          x: stageX,
          y: stageY,
          width: 0,
          height: 0,
        });
      } else {
        // Clear selection and start panning
        clearSelection();
        isDragging.current = true;
      }
    }
  };

  // Process batched mousemove updates in requestAnimationFrame
  const processMouseMove = () => {
    const pending = pendingMouseMoveRef.current;
    if (!pending || !pending.pointer || !pending.stage) {
      rafPendingRef.current = null;
      return;
    }

    const pointer = pending.pointer;
    pendingMouseMoveRef.current = null;
    rafPendingRef.current = null;

    // Convert pointer position to stage coordinates (accounting for pan and zoom)
    const currentStagePos = stagePosRef.current;
    const currentStageScale = stageScaleRef.current;
    
    const stageX = (pointer.x - currentStagePos.x) / currentStageScale;
    const stageY = (pointer.y - currentStagePos.y) / currentStageScale;

    // Imperatively update current user's cursor position to avoid React re-render
    // Only update if position actually changed to prevent unnecessary redraws
    if (currentCursorRef.current) {
      const currentPos = currentCursorRef.current.position();
      if (Math.abs(currentPos.x - stageX) > 0.1 || Math.abs(currentPos.y - stageY) > 0.1) {
        currentCursorRef.current.position({ x: stageX, y: stageY });
        // Firefox optimization: draw only the cursor node, not the entire layer
        currentCursorRef.current.draw();
      }
    }

    // Update cursor position in RTDB (throttled in usePresence) - only if user is authenticated
    if (currentUser) {
      updateCursorPosition(stageX, stageY);
    }

    // Update mouse position for snap indicators - ONLY if snap is enabled
    // Use functional update to avoid unnecessary re-renders when position hasn't changed significantly
    if (gridState.isSnapEnabled) {
      setMousePosition(prev => {
        if (!prev || Math.abs(prev.x - stageX) > 2 || Math.abs(prev.y - stageY) > 2) {
          return { x: stageX, y: stageY };
        }
        return prev;
      });
    }

    // Update drawing preview point - only if changed significantly
    if (activeDrawingTool && activeDrawingTool !== 'boundingbox') {
      setDrawingPreviewPoint(prev => {
        if (!prev || Math.abs(prev.x - stageX) > 2 || Math.abs(prev.y - stageY) > 2) {
          return { x: stageX, y: stageY };
        }
        return prev;
      });
    }
  };

  // Handle mouse move - pan the canvas if dragging, track cursor position always
  // Use requestAnimationFrame to batch updates and reduce handler execution time
  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    // Get the mouse position in stage coordinates
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Handle immediate operations that need to be responsive (pan, selection, bounding box)
    const currentStagePos = stagePosRef.current;
    const currentStageScale = stageScaleRef.current;
    const stageX = (pointer.x - currentStagePos.x) / currentStageScale;
    const stageY = (pointer.y - currentStagePos.y) / currentStageScale;

    // Handle bounding box drawing (immediate, no batching)
    if (activeDrawingTool === 'boundingbox' && boundingBoxStart && isDragging.current) {
      setBoundingBoxEnd({ x: stageX, y: stageY });
      return; // Don't pan when drawing bounding box
    }

    // Handle drag selection (immediate, no batching)
    if (isSelecting.current) {
      const startX = selectionStart.current.x;
      const startY = selectionStart.current.y;
      
      const selectionBox: SelectionBoxType = {
        x: Math.min(startX, stageX),
        y: Math.min(startY, stageY),
        width: Math.abs(stageX - startX),
        height: Math.abs(stageY - startY),
      };
      
      setSelectionBox(selectionBox);
      return;
    }

    // Pan the canvas if dragging - imperative updates for performance (immediate)
    // Don't pan if drawing bounding box
    if (isDragging.current && activeDrawingTool !== 'boundingbox') {
      const newPos = {
        x: stagePosRef.current.x + e.evt.movementX,
        y: stagePosRef.current.y + e.evt.movementY,
      };

      // Update refs imperatively
      stagePosRef.current = newPos;

      // Update stage directly without React re-render
      stage.position(newPos);

      // Schedule debounced save to localStorage for persistence across refreshes
      scheduleViewportSave();

      // REMOVED: scheduleStateUpdate - Don't trigger React re-renders during pan!
      return; // Skip batched updates during pan for better responsiveness
    }

    // Batch non-critical updates (cursor, snap indicators, preview points) using requestAnimationFrame
    pendingMouseMoveRef.current = { pointer, stage };
    
    if (rafPendingRef.current === null) {
      rafPendingRef.current = requestAnimationFrame(processMouseMove);
    }
  };

  // Handle mouse up - stop panning and selection
  const handleMouseUp = () => {
    // Handle bounding box completion
    if (activeDrawingTool === 'boundingbox' && boundingBoxStart && boundingBoxEnd) {
      const x = Math.min(boundingBoxStart.x, boundingBoxEnd.x);
      const y = Math.min(boundingBoxStart.y, boundingBoxEnd.y);
      const width = Math.abs(boundingBoxEnd.x - boundingBoxStart.x);
      const height = Math.abs(boundingBoxEnd.y - boundingBoxStart.y);
      
      console.log('📦 Bounding box completed:', { x, y, width, height, minSize: width > 10 && height > 10 });
      
      // Only show dialog if box has minimum size (reduced from 10 to 5 pixels for better UX)
      if (width > 5 && height > 5) {
        console.log('✅ Showing item type dialog');
        setPendingBoundingBox({ x, y, width, height });
        setShowItemTypeDialog(true);
      } else {
        console.warn('⚠️ Bounding box too small, not showing dialog:', { width, height });
      }
      
      // Reset bounding box drawing state
      setBoundingBoxStart(null);
      setBoundingBoxEnd(null);
      isDragging.current = false;
      return;
    }
    
    if (isSelecting.current && selectionBox) {
      // Find shapes that intersect with the selection box
      const shapesArray = Array.from(shapes.values());
      const intersectingShapes = shapesArray.filter((shape: Shape) => {
        const shapeRight = shape.x + shape.w;
        const shapeBottom = shape.y + shape.h;
        const boxRight = selectionBox.x + selectionBox.width;
        const boxBottom = selectionBox.y + selectionBox.height;
        
        return !(shape.x > boxRight || 
                shapeRight < selectionBox.x || 
                shape.y > boxBottom || 
                shapeBottom < selectionBox.y);
      });
      
      // Select intersecting shapes
      if (intersectingShapes.length > 0) {
        const shapeIds = intersectingShapes.map((shape: Shape) => shape.id);
        selectShapes(shapeIds);
        
        // Update transform controls
        updateTransformControls({
          isVisible: true,
          x: Math.min(...intersectingShapes.map((s: Shape) => s.x)),
          y: Math.min(...intersectingShapes.map((s: Shape) => s.y)),
          width: Math.max(...intersectingShapes.map((s: Shape) => s.x + s.w)) - Math.min(...intersectingShapes.map((s: Shape) => s.x)),
          height: Math.max(...intersectingShapes.map((s: Shape) => s.y + s.h)) - Math.min(...intersectingShapes.map((s: Shape) => s.y)),
          rotation: 0,
          resizeHandles: ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'],
        });
      }
      
      // Clear selection box
      setSelectionBox(null);
    }
    
    isDragging.current = false;
    isSelecting.current = false;
  };

  // Handle canvas click - deselect shapes when clicking empty space or handle scale tool or drawing tools
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicking on the stage itself (not a shape), deselect
    if (e.target === stageRef.current) {
      const stage = stageRef.current;
      if (stage) {
        const pointerPosition = stage.getPointerPosition();
        if (pointerPosition) {
          // Get actual current stage position and scale
          const stagePos = stage.position();
          const stageScale = stage.scaleX(); // Use scaleX since scale is uniform
          
          // Convert screen coordinates to canvas coordinates
          const canvasX = (pointerPosition.x - stagePos.x) / stageScale;
          const canvasY = (pointerPosition.y - stagePos.y) / stageScale;
          
          // Handle scale tool clicks
          if (canvasScale.isScaleMode) {
            handleScaleToolClick(canvasX, canvasY);
            return; // Don't deselect when in scale mode
          }
          
          // Handle polyline/polygon tool clicks
          if (activeDrawingTool) {
            handleDrawingToolClick(canvasX, canvasY, e);
            return; // Don't deselect when drawing
          }
        }
      }
      
      deselectShape();
    }
  };

  // Handle item type selection for bounding box
  const handleItemTypeSelect = useCallback(async (itemType: ItemType, customType?: string) => {
    if (!currentUser || !pendingBoundingBox) {
      console.warn('⚠️ Cannot create bounding box: missing user or pending box', { currentUser: !!currentUser, pendingBoundingBox: !!pendingBoundingBox });
      return;
    }

    const activeLayer = layers.find((l: LayerType) => l.id === activeLayerId);
    const shapeColor = activeLayer?.color || '#3B82F6';
    const finalItemType = itemType === 'other' && customType ? customType : itemType;

    console.log('🎯 Creating bounding box shape:', {
      x: pendingBoundingBox.x,
      y: pendingBoundingBox.y,
      width: pendingBoundingBox.width,
      height: pendingBoundingBox.height,
      itemType: finalItemType,
      layerId: activeLayerId,
    });

    const shape = createBoundingBoxShape(
      pendingBoundingBox.x,
      pendingBoundingBox.y,
      pendingBoundingBox.width,
      pendingBoundingBox.height,
      finalItemType,
      shapeColor,
      currentUser.uid,
      activeLayerId,
      'manual'
    );

    console.log('✅ Bounding box shape created:', shape);

    try {
      await createShape(shape);
      console.log('✅ Bounding box shape saved to Firestore');
    } catch (error) {
      console.error('❌ Failed to create bounding box shape:', error);
    }

    // Reset state
    setPendingBoundingBox(null);
    setShowItemTypeDialog(false);
    setActiveDrawingTool(null);
  }, [currentUser, pendingBoundingBox, layers, activeLayerId, createShape]);

  const handleItemTypeCancel = useCallback(() => {
    setPendingBoundingBox(null);
    setShowItemTypeDialog(false);
    setActiveDrawingTool(null);
  }, []);

  // Complete the current drawing
  const completeDrawing = useCallback(() => {
    if (!currentUser || !activeDrawingTool) return;
    
    if (activeDrawingTool === 'polyline' && drawingPoints.length < 2) return;
    if (activeDrawingTool === 'polygon' && drawingPoints.length < 3) return;

    const activeLayer = layers.find((l: LayerType) => l.id === activeLayerId);
    const shapeColor = activeLayer?.color || '#3B82F6';

    const shape = activeDrawingTool === 'polyline'
      ? createPolylineShape(drawingPoints, shapeColor, currentUser.uid, activeLayerId)
      : createPolygonShape(drawingPoints, shapeColor, currentUser.uid, activeLayerId);

    createShape(shape);

    // Reset drawing state
    setDrawingPoints([]);
    setDrawingPreviewPoint(null);
    setActiveDrawingTool(null);
  }, [currentUser, activeDrawingTool, drawingPoints, layers, activeLayerId, createShape]);

  // Handle drawing tool clicks (polyline/polygon)
  const handleDrawingToolClick = useCallback((x: number, y: number, e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!activeDrawingTool || !currentUser) return;

    const point = { x, y };

    // Check if double-click to complete
    if (e.evt.detail === 2 && drawingPoints.length >= 2) {
      completeDrawing();
      return;
    }

    // Check if clicking near first point for polygon (snap to close)
    if (activeDrawingTool === 'polygon' && drawingPoints.length >= 3) {
      const firstPoint = drawingPoints[0];
      const distance = Math.sqrt(
        Math.pow(point.x - firstPoint.x, 2) + Math.pow(point.y - firstPoint.y, 2)
      );
      const snapThreshold = 10; // Fixed pixel threshold
      
      if (distance < snapThreshold) {
        completeDrawing();
        return;
      }
    }

    // Add point to drawing
    setDrawingPoints(prev => [...prev, point]);
  }, [activeDrawingTool, currentUser, drawingPoints, completeDrawing]);

  // Handle Escape key to cancel or undo point
  useEffect(() => {
    const handleDrawingKeyDown = (e: KeyboardEvent) => {
      if (!activeDrawingTool) return;

      if (e.key === 'Escape') {
        if (drawingPoints.length > 0) {
          // Undo last point
          setDrawingPoints(prev => prev.slice(0, -1));
        } else {
          // Cancel drawing
          setActiveDrawingTool(null);
          setDrawingPoints([]);
          setDrawingPreviewPoint(null);
        }
      } else if (e.key === 'Enter') {
        completeDrawing();
      }
    };

    if (activeDrawingTool) {
      window.addEventListener('keydown', handleDrawingKeyDown);
      return () => window.removeEventListener('keydown', handleDrawingKeyDown);
    }
  }, [activeDrawingTool, drawingPoints, completeDrawing]);
  // Handle scale tool clicks
  const handleScaleToolClick = (x: number, y: number) => {
    if (!canvasScale.isScaleMode || !currentUser) return;

    // If there's no existing scale line, start creating one
    if (!canvasScale.scaleLine) {
      // First click - set start point and create a temporary line
      const scaleLine = {
        id: `scale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startX: x,
        startY: y,
        endX: x, // Same as start point initially
        endY: y,
        realWorldLength: 0, // Will be set after second click
        unit: 'feet' as const,
        isVisible: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: currentUser.uid,
        updatedBy: currentUser.uid,
      };
      if (projectId) {
        (setScaleLine as (scaleLine: ScaleLine | null, projectId?: string) => void)(scaleLine, projectId);
      } else {
        (setScaleLine as (scaleLine: ScaleLine | null) => void)(scaleLine);
      }
    } else {
      // Second click - set end point and show measurement input modal
      setPendingScaleLine({ endX: x, endY: y });
      setShowMeasurementInput(true);
    }
  };

  // Handle measurement input submission
  const handleMeasurementSubmit = (value: number, unit: UnitType) => {
    console.log('📝 handleMeasurementSubmit called:', { 
      pendingScaleLine, 
      scaleLineInStore: canvasScale.scaleLine,
      projectId 
    });
    
    if (!pendingScaleLine) {
      console.warn('⚠️ Cannot update scale line: missing pendingScaleLine');
      return;
    }
    
    if (!canvasScale.scaleLine) {
      console.warn('⚠️ Cannot update scale line: scaleLine not found in store');
      return;
    }
    
    if (!projectId) {
      console.warn('⚠️ Cannot update scale line: projectId is missing');
      return;
    }
    
    // Get the current scale line from store to ensure we have the latest state
    const currentScaleLine = canvasScale.scaleLine;
    console.log('📋 Current scale line:', currentScaleLine);
    
    // Update the scale line with the measurement - pass projectId explicitly
    const updates = {
      endX: pendingScaleLine.endX,
      endY: pendingScaleLine.endY,
      realWorldLength: value,
      unit: unit,
    };
    console.log('🔄 Calling updateScaleLine with:', updates);
    if (projectId) {
      (updateScaleLine as (updates: Partial<ScaleLine>, projectId?: string) => void)(updates, projectId);
    } else {
      (updateScaleLine as (updates: Partial<ScaleLine>) => void)(updates);
    }
    
    // Exit scale mode after successful creation
    setIsScaleMode(false);
    setShowMeasurementInput(false);
    setPendingScaleLine(null);
  };

  // Handle measurement input cancellation
  const handleMeasurementCancel = () => {
    // Remove the temporary line and exit scale mode - pass projectId explicitly
    if (projectId) {
      (deleteScaleLine as (projectId?: string) => void)(projectId);
    } else {
      (deleteScaleLine as () => void)();
    }
    setIsScaleMode(false);
    setShowMeasurementInput(false);
    setPendingScaleLine(null);
  };

  // Handle measurement input modal close (without canceling/deleting)
  const handleMeasurementClose = () => {
    // Just close the modal without deleting the scale line
    // This is used when the form is submitted successfully
    setShowMeasurementInput(false);
    setPendingScaleLine(null);
  };

  // Handle shape selection
  const handleShapeSelect = (shapeId: string, event?: Konva.KonvaEventObject<MouseEvent>) => {
    if (event?.evt.shiftKey) {
      // Multi-select: add to selection if not already selected, remove if already selected
      if (selectedShapeIds.includes(shapeId)) {
        removeFromSelection(shapeId);
      } else {
        addToSelection(shapeId);
      }
    } else {
      // Single select: clear current selection and select this shape
      selectShape(shapeId);
    }
  };

  // Handle shape drag end - no additional action needed, Shape component handles it
  const handleShapeDragEnd = () => {
    // Shape component already updates the store
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    getViewportCenter: () => {
      const stage = stageRef.current;
      if (!stage) return { x: 200, y: 200 };

      // Calculate the center of the visible viewport in stage coordinates
      // Use refs for current values, not state
      const centerX = (dimensions.width / 2 - stagePosRef.current.x) / stageScaleRef.current;
      const centerY = (dimensions.height / 2 - stagePosRef.current.y) / stageScaleRef.current;

      return { x: centerX, y: centerY };
    },
    getStage: () => stageRef.current,
    activatePolylineTool: () => {
      setActiveDrawingTool('polyline');
      setDrawingPoints([]);
      setDrawingPreviewPoint(null);
    },
    activatePolygonTool: () => {
      setActiveDrawingTool('polygon');
      setDrawingPoints([]);
      setDrawingPreviewPoint(null);
    },
    activateBoundingBoxTool: () => {
      setActiveDrawingTool('boundingbox');
      setBoundingBoxStart(null);
      setBoundingBoxEnd(null);
    },
    deactivateDrawingTools: () => {
      setActiveDrawingTool(null);
      setDrawingPoints([]);
      setDrawingPreviewPoint(null);
      setBoundingBoxStart(null);
      setBoundingBoxEnd(null);
    },
  }));
  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden"
      style={{ backgroundColor: '#F5F5F5' }}
      tabIndex={0}
      onFocus={() => console.log('Canvas focused')}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          x={stagePosRef.current.x}
          y={stagePosRef.current.y}
          scaleX={stageScaleRef.current}
          scaleY={stageScaleRef.current}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleStageClick}
        >
          {/* Background Image Layer - non-interactive */}
          <Layer listening={false}>
            {canvasScale.backgroundImage && (
              <BackgroundImageComponent
                backgroundImage={canvasScale.backgroundImage}
              />
            )}
          </Layer>

          {/* Scale Line Layer - non-interactive */}
          <Layer listening={false}>
            {canvasScale.scaleLine && (
           <ScaleLineComponent
             scaleLine={canvasScale.scaleLine}
             scale={stageScaleRef.current}
           />
            )}
          </Layer>

          {/* Grid layer - non-interactive */}
          <Layer listening={false}>
            {(() => {
              if (!gridState.isVisible) return null;
              
              // Use refs to avoid triggering React re-renders
              const currentScale = stageScaleRef.current;
              const visibleWidth = dimensions.width / currentScale;
              const visibleHeight = dimensions.height / currentScale;
              const startX = -stagePosRef.current.x / currentScale;
              const startY = -stagePosRef.current.y / currentScale;
              const endX = startX + visibleWidth;
              const endY = startY + visibleHeight;
              const gridSize = gridState.size;
              const firstX = Math.floor(startX / gridSize) * gridSize;
              const firstY = Math.floor(startY / gridSize) * gridSize;
              const verticalLines = Math.ceil((endX - firstX) / gridSize) + 1;
              const horizontalLines = Math.ceil((endY - firstY) / gridSize) + 1;
              return (
                <>
                  {Array.from({ length: verticalLines }).map((_, i) => {
                    const x = firstX + i * gridSize;
                    return (
                      <Line
                        key={`v-${i}`}
                        points={[x, startY - gridSize, x, endY + gridSize]}
                        stroke={gridState.color}
                        strokeWidth={1 / currentScale}
                        opacity={gridState.opacity}
                        listening={false}
                      />
                    );
                  })}
                  {Array.from({ length: horizontalLines }).map((_, i) => {
                    const y = firstY + i * gridSize;
                    return (
                      <Line
                        key={`h-${i}`}
                        points={[startX - gridSize, y, endX + gridSize, y]}
                        stroke={gridState.color}
                        strokeWidth={1 / currentScale}
                        opacity={gridState.opacity}
                        listening={false}
                      />
                    );
                  })}
                </>
              );
            })()}
          </Layer>

          {/* Drawing tools layer - active polyline/polygon drawing */}
          {activeDrawingTool === 'polyline' && (
            <PolylineTool
              isActive={true}
              onComplete={() => setActiveDrawingTool(null)}
              points={drawingPoints}
              previewPoint={drawingPreviewPoint}
              canvasScale={canvasScale}
              layers={layers}
              activeLayerId={activeLayerId}
            />
          )}
          {activeDrawingTool === 'polygon' && (
            <PolygonTool
              isActive={true}
              onComplete={() => setActiveDrawingTool(null)}
              points={drawingPoints}
              previewPoint={drawingPreviewPoint}
              canvasScale={canvasScale}
              layers={layers}
              activeLayerId={activeLayerId}
            />
          )}
          {activeDrawingTool === 'boundingbox' && (
            <BoundingBoxTool
              isActive={true}
              startPoint={boundingBoxStart}
              endPoint={boundingBoxEnd}
              layers={layers}
              activeLayerId={activeLayerId}
            />
          )}

          {/* Shapes layer - interactive */}
          <Layer>
            {(() => {
              // Calculate viewport bounds for object culling
              // Note: Refs don't trigger re-renders, so this recalculates on every render
              // but the calculation is fast (just math operations)
              const viewportBounds = calculateViewportBounds(
                dimensions.width,
                dimensions.height,
                stagePosRef.current.x,
                stagePosRef.current.y,
                stageScaleRef.current
              );
              
              // Filter shapes to only render visible ones (viewport culling)
              // Use padding of 200px to include shapes near viewport edge
              const shapesArray = Array.from(shapeMap.values());
              const visibleShapes = filterVisibleShapes(shapesArray, viewportBounds, 200);
              
              // Log culling stats in development (only if significant reduction)
              if (import.meta.env.DEV && shapesArray.length > 50) {
                const culledCount = shapesArray.length - visibleShapes.length;
                if (culledCount > 0) {
                  console.log(`[PERFORMANCE] Viewport culling: ${visibleShapes.length}/${shapesArray.length} shapes visible (${culledCount} culled)`);
                }
              }
              
              return visibleShapes.map((shape) => {
              const isLocked = isShapeLockedByOtherUser(shape.id);
              const isSelected = selectedShapeIds.includes(shape.id);
              // Handle shapes without layerId (created before layer system) - assign them to default layer
              const shapeLayerId = shape.layerId || 'default-layer';
              const isInActiveLayer = shapeLayerId === activeLayerId;
              
              // Debug: Log shape rendering info
              if (shape.id.includes('8vuzjs6fj')) { // Log for the specific shape from your example
                console.log('🎨 Rendering shape:', {
                  shapeId: shape.id,
                  shapeLayerId,
                  activeLayerId,
                  isInActiveLayer,
                  layers: layers.map(l => ({ id: l.id, name: l.name }))
                });
              }
              
              // Find the layer to check its visibility and lock status
              const layer = layers.find(l => l.id === shapeLayerId);
              const isLayerVisible = layer ? layer.visible : true; // Default to visible if layer not found
              const isLayerLocked = layer ? layer.locked : false; // Default to unlocked if layer not found
              
              // Calculate opacity based on layer visibility and active layer
              let opacity = 1;
              if (!isLayerVisible) {
                opacity = 0; // Completely hide if layer is invisible
              } else if (!isInActiveLayer) {
                opacity = 0.3; // Dim if not in active layer
              }
              
              // Check if shape should be locked (either by user or by layer)
              const isShapeLockedByLayer = isLayerLocked;
              const isShapeLockedByUser = isLocked;
              const isShapeLocked = isShapeLockedByUser || isShapeLockedByLayer;
              
              return (
                <ShapeComponent
                  key={shape.id}
                  shape={shape}
                  isSelected={isSelected}
                  isLocked={isShapeLocked}
                  opacity={opacity}
                  onSelect={(event) => handleShapeSelect(shape.id, event)}
                  onDragEnd={handleShapeDragEnd}
                  onUpdatePosition={async (nextX, nextY) => {
                    await updateShapePosition(shape.id, nextX, nextY);
                  }}
                  onAcquireLock={async () => acquireShapeLock(shape.id)}
                  onReleaseLock={async () => releaseShapeLock(shape.id)}
                  isLockedByCurrentUser={() => isShapeLockedByCurrentUser(shape.id)}
                  isInteractionEnabled={Boolean(currentUser)}
                  selectedShapeIds={selectedShapeIds}
                  onMoveSelectedShapes={moveSelectedShapes}
                />
              );
            })})()}
          </Layer>

          {/* Measurement displays layer - non-interactive */}
          <Layer listening={false}>
            {(() => {
              // Calculate viewport bounds for measurement culling
              const viewportBounds = calculateViewportBounds(
                dimensions.width,
                dimensions.height,
                stagePosRef.current.x,
                stagePosRef.current.y,
                stageScaleRef.current
              );
              
              // Filter shapes to only render measurements for visible shapes
              const shapesArrayForMeasurements = Array.from(shapeMap.values());
              const visibleShapes = filterVisibleShapes(shapesArrayForMeasurements, viewportBounds, 200);
              
              return visibleShapes.map((shape) => {
              if (shape.type !== 'polyline' && shape.type !== 'polygon') return null;
              
              const shapeLayerId = shape.layerId || 'default-layer';
              const layer = layers.find(l => l.id === shapeLayerId);
              const isLayerVisible = layer ? layer.visible : true;
              
              if (!isLayerVisible) return null;
              
              const isInActiveLayer = shapeLayerId === activeLayerId;
              const opacity = isInActiveLayer ? 1 : 0.3;
              
              return (
                <MeasurementDisplay
                  key={`measure-${shape.id}`}
                  shape={shape}
                  canvasScale={canvasScale}
                  opacity={opacity}
                />
              );
            });
            })()}
          </Layer>

          {/* Overlays layer - non-interactive */}
          <Layer ref={overlaysLayerRef} listening={false}>
            {/* Selection box for drag selection */}
            {selectionBox && <SelectionBox selectionBox={selectionBox} />}
            
            {/* Transform controls for selected shapes */}
            <TransformControls 
              transformControls={transformControls}
              onResizeStart={(handle) => {
                // TODO: Implement resize functionality
                console.log('Resize start:', handle);
              }}
              onRotateStart={() => {
                // Rotate selected shapes by 90 degrees
                const rotateSelectedShapes = useCanvasStore.getState().rotateSelectedShapes;
                rotateSelectedShapes(90);
              }}
            />
            
            {Array.from(locks.entries()).map(([shapeId, lock]) => {
              const shape = shapeMap.get(shapeId);
              const isLockedByOther = isShapeLockedByOtherUser(shapeId);
              if (!shape || !isLockedByOther) return null;
              return (
                <LockOverlay
                  key={`lock-${shapeId}`}
                  shapeId={shapeId}
                  lock={lock}
                  x={shape.x}
                  y={shape.y}
                  width={shape.w}
                  height={shape.h}
                />
              );
            })}
            {currentUser && (
              <Circle
                key={`current-cursor-${currentUser.uid}`}
                ref={currentCursorRef}
                x={0}
                y={0}
                radius={4}
                fill="#3B82F6"
                stroke="#FFFFFF"
                strokeWidth={1}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            <CursorOverlay users={otherUsers} />
          </Layer>
        </Stage>
      )}

      {/* Snap Indicators */}
      <SnapIndicators
        mousePosition={mousePosition}
        viewport={{
          width: dimensions.width,
          height: dimensions.height,
          offsetX: stagePosRef.current.x,
          offsetY: stagePosRef.current.y,
          scale: stageScaleRef.current,
        }}
      />

      {/* Layers Panel */}
      <LayersPanel
        isVisible={showLayersPanel}
        onClose={onCloseLayersPanel || (() => {})}
        projectId={projectId}
      />

      {/* Alignment Toolbar */}
      <AlignmentToolbar
        isVisible={showAlignmentToolbar}
        onClose={onCloseAlignmentToolbar || (() => {})}
      />

      {/* Measurement Input Modal */}
      <MeasurementInput
        isOpen={showMeasurementInput}
        onClose={handleMeasurementClose}
        onCancel={handleMeasurementCancel}
        onSubmit={handleMeasurementSubmit}
        title="Set Scale Measurement"
      />

      {/* Item Type Dialog for Bounding Box */}
      <ItemTypeDialog
        isOpen={showItemTypeDialog}
        onSelect={handleItemTypeSelect}
        onCancel={handleItemTypeCancel}
      />
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;
