import { AuthButton } from './AuthButton';
import FPSCounter from './FPSCounter';
import ZoomIndicator from './ZoomIndicator';
import { useCanvasStore } from '../store/canvasStore';
import { usePresence } from '../hooks/usePresence';
import { useOffline } from '../hooks/useOffline';
import { useShapes } from '../hooks/useShapes';
import type { Shape, ShapeType, ExportOptions } from '../types';
import { useState, useEffect, useRef } from 'react';
import { ExportDialog } from './ExportDialog';
import { ShortcutsHelp } from './ShortcutsHelp';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { createExportService } from '../services/exportService';
import Konva from 'konva';
import { AIClarificationDialog } from './AIClarificationDialog';
import { FileUpload } from './FileUpload';
import { ScaleTool } from './ScaleTool';
import { MaterialEstimationPanel } from './MaterialEstimationPanel';
import { FloatingChatPanel } from './estimate/FloatingChatPanel';

interface ToolbarProps {
  children?: React.ReactNode;
  fps?: number;
  zoom?: number;
  onCreateShape?: (type: ShapeType) => void;
  stageRef?: Konva.Stage | null; // Konva Stage reference for export
  onToggleLayers?: () => void;
  onToggleAlignment?: () => void;
  onToggleGrid?: () => void;
  onActivatePolylineTool?: () => void;
  onActivatePolygonTool?: () => void;
  onActivateBoundingBoxTool?: () => void;
  projectId?: string;
}

/**
 * Toolbar component
 * Top navigation bar with user authentication info, FPS counter, zoom level, and shape creation controls
 */
export function Toolbar({ children, fps, zoom, onCreateShape, stageRef, onToggleLayers, onToggleAlignment, onToggleGrid, onActivatePolylineTool, onActivatePolygonTool, onActivateBoundingBoxTool, projectId }: ToolbarProps) {
  const createShape = useCanvasStore((state) => state.createShape);
  const currentUser = useCanvasStore((state) => state.currentUser);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const shapes = useCanvasStore((state) => state.shapes);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const canUndo = useCanvasStore((state) => state.canUndo);
  const canRedo = useCanvasStore((state) => state.canRedo);
  // Use project-scoped deleteShapes if projectId is available, otherwise fall back to global store
  const { deleteShapes: deleteShapesFromHook } = useShapes(projectId);
  const deleteSelectedShapesGlobal = useCanvasStore((state) => state.deleteSelectedShapes);
  const deleteSelectedShapes = projectId && deleteShapesFromHook 
    ? () => {
        const ids = selectedShapeIds;
        if (ids.length > 0) {
          deleteShapesFromHook(ids);
          // Clear selection after deletion
          clearSelection();
        }
      }
    : deleteSelectedShapesGlobal;
  const duplicateSelectedShapes = useCanvasStore((state) => state.duplicateSelectedShapes);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const selectShapes = useCanvasStore((state) => state.selectShapes);
  const gridState = useCanvasStore((state) => state.gridState);
  const toggleGrid = useCanvasStore((state) => state.toggleGrid);
  const { activeUsersCount } = usePresence();
  const { 
    connectionStatus, 
    connectionStatusColor, 
    hasQueuedUpdates, 
    queuedUpdatesCount,
    retryQueuedUpdates 
  } = useOffline();

  // Export dialog state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  
  // Dropdown menu states
  const [isShapesMenuOpen, setIsShapesMenuOpen] = useState(false);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isProfessionalMenuOpen, setIsProfessionalMenuOpen] = useState(false);
  
  const shapesMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const professionalMenuRef = useRef<HTMLDivElement>(null);
  
  // Unified AI Assistant state
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [clarificationDialog, setClarificationDialog] = useState<{
    question: string;
    options: Array<{
      label: string;
      value: string;
      shapeIds?: string[];
    }>;
  } | null>(null);
  
  // Material Estimation Panel state
  const [isMaterialPanelOpen, setIsMaterialPanelOpen] = useState(false);
  
  // AI status from store
  const isProcessingAICommand = useCanvasStore((state) => state.isProcessingAICommand);

  // Click outside handlers for all dropdown menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(event.target as Node)) {
        setIsShapesMenuOpen(false);
      }
      if (editMenuRef.current && !editMenuRef.current.contains(event.target as Node)) {
        setIsEditMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
      if (professionalMenuRef.current && !professionalMenuRef.current.contains(event.target as Node)) {
        setIsProfessionalMenuOpen(false);
      }
    };

    if (isShapesMenuOpen || isEditMenuOpen || isToolsMenuOpen || isProfessionalMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isShapesMenuOpen, isEditMenuOpen, isToolsMenuOpen, isProfessionalMenuOpen]);

  // Export functionality
  const handleExport = async (options: ExportOptions) => {
    if (!stageRef || !currentUser) return;

    try {
      const exportService = createExportService(stageRef);
      
      let blob: Blob;
      if (options.selectedOnly && selectedShapeIds.length > 0) {
        const selectedShapes = Array.from(shapes.values()).filter(shape => selectedShapeIds.includes(shape.id));
        blob = await exportService.exportSelectedShapes(options, selectedShapes, selectedShapeIds);
      } else {
        blob = await exportService.exportCanvas(options);
      }
      
      const filename = exportService.generateFilename(options);
      exportService.downloadBlob(blob, filename);
    } catch (error) {
      console.error('Export failed:', error);
      // TODO: Show error toast
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: canUndo() ? undo : undefined,
    onRedo: canRedo() ? redo : undefined,
    onExport: () => setIsExportDialogOpen(true),
    onShowShortcuts: () => setIsShortcutsHelpOpen(true),
    onDelete: selectedShapeIds.length > 0 ? deleteSelectedShapes : undefined,
    onDuplicate: selectedShapeIds.length > 0 ? duplicateSelectedShapes : undefined,
    onSelectAll: () => selectShapes(Array.from(shapes.keys())),
    onClearSelection: clearSelection,
  });

  const handleCreateShape = (type: ShapeType) => {
    if (!currentUser) return;

    if (onCreateShape) {
      // Parent will calculate viewport center and create the shape
      onCreateShape(type);
      return;
    }

    // Fallback: create at origin
    // Get the current active layer ID
    const activeLayerId = useCanvasStore.getState().activeLayerId;
    
    const layersState = (useCanvasStore.getState().layers || []) as ReturnType<typeof useCanvasStore.getState>['layers'];
    const activeLayer = layersState.find(l => l.id === activeLayerId);
    const activeColor = activeLayer?.color || '#3B82F6';
    const baseShape: Shape = {
      id: `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      color: activeColor,
      createdAt: Date.now(),
      createdBy: currentUser.uid,
      updatedAt: Date.now(),
      updatedBy: currentUser.uid,
      clientUpdatedAt: Date.now(),
      layerId: activeLayerId, // Assign to the currently active layer
    };

    // Add type-specific properties
    const shape = { ...baseShape };
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

  const shapeButtons = [
    {
      type: 'rect' as ShapeType,
      label: 'Rectangle',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="4" y="4" width="16" height="16" strokeWidth="2" rx="2" />
        </svg>
      ),
    },
    {
      type: 'circle' as ShapeType,
      label: 'Circle',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="8" strokeWidth="2" />
        </svg>
      ),
    },
    {
      type: 'text' as ShapeType,
      label: 'Text',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
    },
    {
      type: 'line' as ShapeType,
      label: 'Line',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12h16" />
        </svg>
      ),
    },
  ];

  const annotationButtons = [
    {
      id: 'polyline',
      label: 'Polyline (Wall Measurement)',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6l6 6 4-4 6 6" />
        </svg>
      ),
      onClick: onActivatePolylineTool,
    },
    {
      id: 'polygon',
      label: 'Polygon (Room Area)',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l4 8h8l-6 6 2 8-6-4-6 4 2-8-6-6h8z" />
        </svg>
      ),
      onClick: onActivatePolygonTool,
    },
    {
      id: 'boundingbox',
      label: 'Bounding Box (Annotation)',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="4" y="4" width="16" height="16" strokeWidth="2" rx="1" />
        </svg>
      ),
      onClick: onActivateBoundingBoxTool,
    },
  ];

  return (
    <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-gray-900">Projective</h1>
        
        {/* Four Dropdown Menus - Always Visible */}
        <div className="flex items-center gap-2">
          
          {/* Components Dropdown */}
          <div className="relative" ref={shapesMenuRef}>
            <button
              onClick={() => setIsShapesMenuOpen(!isShapesMenuOpen)}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              title="Create components"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
              Components
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isShapesMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="py-2">
                  {/* Annotation Tools Section */}
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Measurement Tools
                  </div>
                  {annotationButtons.map(({ id, label, icon, onClick }) => (
                    <button
                      key={id}
                      onClick={() => {
                        if (onClick) onClick();
                        setIsShapesMenuOpen(false);
                      }}
                      disabled={!currentUser || !onClick}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                  
                  {/* Divider */}
                  <div className="my-2 border-t border-gray-200"></div>
                  
                  {/* Basic Shapes Section */}
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Basic Shapes
                  </div>
                  {shapeButtons.map(({ type, label, icon }) => (
                    <button
                      key={type}
                      onClick={() => {
                        handleCreateShape(type);
                        setIsShapesMenuOpen(false);
                      }}
                      disabled={!currentUser}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {icon}
                      Create {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Edit Dropdown */}
          <div className="relative" ref={editMenuRef}>
            <button
              onClick={() => setIsEditMenuOpen(!isEditMenuOpen)}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              title="Edit actions"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isEditMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="py-2">
                  <button
                    onClick={() => {
                      undo();
                      setIsEditMenuOpen(false);
                    }}
                    disabled={!canUndo() || !currentUser}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Undo
                  </button>
                  <button
                    onClick={() => {
                      redo();
                      setIsEditMenuOpen(false);
                    }}
                    disabled={!canRedo() || !currentUser}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                    </svg>
                    Redo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tools Dropdown */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              title="Tools"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Tools
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isToolsMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="py-2">
                  
                  {/* File Upload */}
                  <div className="px-4 py-2">
                    <FileUpload
                      projectId={projectId}
                      onUploadComplete={(image) => {
                        console.log('Image uploaded:', image);
                        setIsToolsMenuOpen(false);
                      }}
                      onUploadError={(error) => {
                        console.error('Upload error:', error);
                        alert(`Upload failed: ${error}`);
                      }}
                    />
                  </div>
                  
                  {/* Scale Tool */}
                  <div className="px-4 py-2">
                    <ScaleTool
                      projectId={projectId}
                      onScaleComplete={(scaleLine) => {
                        console.log('Scale line created:', scaleLine);
                        setIsToolsMenuOpen(false);
                      }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsExportDialogOpen(true);
                      setIsToolsMenuOpen(false);
                    }}
                    disabled={!currentUser || !stageRef}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export Canvas
                  </button>
                  <button
                    onClick={() => {
                      setIsShortcutsHelpOpen(true);
                      setIsToolsMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Help & Shortcuts
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Dropdown */}
          <div className="relative" ref={professionalMenuRef}>
            <button
              onClick={() => setIsProfessionalMenuOpen(!isProfessionalMenuOpen)}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              title="Advanced tools"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Advanced
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isProfessionalMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="py-2">
                  <button
                    onClick={() => {
                      if (onToggleLayers) onToggleLayers();
                      setIsProfessionalMenuOpen(false);
                    }}
                    disabled={!onToggleLayers}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Layers Panel
                  </button>
                  <button
                    onClick={() => {
                      if (onToggleAlignment) onToggleAlignment();
                      setIsProfessionalMenuOpen(false);
                    }}
                    disabled={!onToggleAlignment}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Alignment Toolbar
                  </button>
                  <button
                    onClick={() => {
                      toggleGrid();
                      if (onToggleGrid) onToggleGrid();
                      setIsProfessionalMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    {gridState.isVisible ? 'Hide Grid' : 'Show Grid'}
                  </button>
                  
                  {/* Unified AI Assistant */}
                  <div className="border-t border-gray-200 my-2"></div>
                  <button
                    onClick={() => {
                      setIsAIAssistantOpen(true);
                      setIsProfessionalMenuOpen(false);
                    }}
                    disabled={!currentUser}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessingAICommand ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                    AI Assistant
                  </button>
                  <button
                    onClick={() => {
                      setIsMaterialPanelOpen(true);
                      setIsProfessionalMenuOpen(false);
                    }}
                    disabled={!currentUser}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    BOM Panel
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {children}
      </div>
      <div className="flex items-center gap-6">
        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`h-2 w-2 rounded-full ${connectionStatusColor.replace('text-', 'bg-')}`}></div>
          <span className={`font-medium ${connectionStatusColor}`}>
            {connectionStatus}
          </span>
          {hasQueuedUpdates && (
            <button
              onClick={retryQueuedUpdates}
              className="ml-2 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
              title={`Retry ${queuedUpdatesCount} queued updates`}
            >
              Retry ({queuedUpdatesCount})
            </button>
          )}
        </div>

        {/* Active Users Count */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="font-medium">{activeUsersCount + (currentUser ? 1 : 0)}</span>
            <span className="text-gray-500">active</span>
          </div>
        </div>
        
        {zoom !== undefined && <ZoomIndicator scale={zoom} />}
        {fps !== undefined && <FPSCounter fps={fps} />}
        <AuthButton />
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={handleExport}
        hasSelectedShapes={selectedShapeIds.length > 0}
      />

      {/* Shortcuts Help Dialog */}
      <ShortcutsHelp
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
      />

      {/* Floating AI Chat */}
      <FloatingChatPanel
        isVisible={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
      />

      {/* AI Clarification Dialog */}
      {clarificationDialog && (
        <AIClarificationDialog
          clarification={clarificationDialog}
          onSelect={(option) => {
            // Handle clarification selection
            console.log('Selected option:', option);
            setClarificationDialog(null);
            // TODO: Resubmit command with clarification
          }}
          onCancel={() => setClarificationDialog(null)}
        />
      )}

      {/* BOM Panel */}
      <MaterialEstimationPanel
        isVisible={isMaterialPanelOpen}
        onClose={() => setIsMaterialPanelOpen(false)}
      />
    </div>
  );
}
