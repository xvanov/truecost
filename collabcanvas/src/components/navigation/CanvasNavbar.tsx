import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { useCanvasStore } from '../../store/canvasStore';
import { useScopedCanvasStore } from '../../store/projectCanvasStore';
import { useShapes } from '../../hooks/useShapes';
import { useOffline } from '../../hooks/useOffline';
import { FileUpload } from '../FileUpload';
import { ScaleTool } from '../ScaleTool';
import { ExportDialog } from '../ExportDialog';
import { ShortcutsHelp } from '../ShortcutsHelp';
import { FloatingChatPanel } from '../estimate/FloatingChatPanel';
import { MaterialEstimationPanel } from '../MaterialEstimationPanel';
import logo from '../../assets/logo.png';
import Konva from 'konva';
import type { ShapeType, ExportOptions } from '../../types';
import { createExportService } from '../../services/exportService';

interface CanvasNavbarProps {
  projectId: string | undefined;
  onBackToScope: () => void;
  onGenerateEstimate: () => void;
  canGenerateEstimate: boolean;
  // Toolbar props
  onCreateShape?: (type: ShapeType) => void;
  stageRef?: Konva.Stage | null;
  onToggleLayers?: () => void;
  onToggleAlignment?: () => void;
  onToggleGrid?: () => void;
  onActivatePolylineTool?: () => void;
  onActivatePolygonTool?: () => void;
  onActivateBoundingBoxTool?: () => void;
  zoom?: number;
}

/**
 * CanvasNavbar - Combined navigation and toolbar for the annotate page.
 * Maximizes canvas real estate by integrating all tools into the top bar.
 */
export function CanvasNavbar({
  projectId,
  onBackToScope,
  onGenerateEstimate,
  canGenerateEstimate,
  onCreateShape,
  stageRef,
  onToggleLayers,
  onToggleAlignment,
  onToggleGrid,
  onActivatePolylineTool,
  onActivatePolygonTool,
  onActivateBoundingBoxTool,
  zoom,
}: CanvasNavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  // Store state - use scoped store for project-specific state
  const currentUser = useCanvasStore((state) => state.currentUser);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const shapes = useCanvasStore((state) => state.shapes);
  // Use project-scoped undo/redo when projectId is available
  const undo = useScopedCanvasStore(projectId, (state) => state.undo);
  const redo = useScopedCanvasStore(projectId, (state) => state.redo);
  const canUndo = useScopedCanvasStore(projectId, (state) => state.canUndo);
  const canRedo = useScopedCanvasStore(projectId, (state) => state.canRedo);
  const gridState = useCanvasStore((state) => state.gridState);
  const toggleGrid = useCanvasStore((state) => state.toggleGrid);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const isProcessingAICommand = useCanvasStore((state) => state.isProcessingAICommand);

  // Hooks
  const { deleteShapes: deleteShapesFromHook } = useShapes(projectId);
  const { connectionStatus, connectionStatusColor } = useOffline();

  // Dropdown states
  const [isComponentsMenuOpen, setIsComponentsMenuOpen] = useState(false);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isAdvancedMenuOpen, setIsAdvancedMenuOpen] = useState(false);

  // Dialog states
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isMaterialPanelOpen, setIsMaterialPanelOpen] = useState(false);

  // Refs
  const componentsMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const advancedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (componentsMenuRef.current && !componentsMenuRef.current.contains(event.target as Node)) {
        setIsComponentsMenuOpen(false);
      }
      if (editMenuRef.current && !editMenuRef.current.contains(event.target as Node)) {
        setIsEditMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(event.target as Node)) {
        setIsAdvancedMenuOpen(false);
      }
    };

    if (isComponentsMenuOpen || isEditMenuOpen || isToolsMenuOpen || isAdvancedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isComponentsMenuOpen, isEditMenuOpen, isToolsMenuOpen, isAdvancedMenuOpen]);

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
    }
  };

  const deleteSelectedShapes = () => {
    if (selectedShapeIds.length > 0 && deleteShapesFromHook) {
      deleteShapesFromHook(selectedShapeIds);
      clearSelection();
    }
  };

  const annotationButtons = [
    {
      id: 'polyline',
      label: 'Polyline (Wall)',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6l6 6 4-4 6 6" />
        </svg>
      ),
      onClick: onActivatePolylineTool,
    },
    {
      id: 'polygon',
      label: 'Polygon (Area)',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l4 8h8l-6 6 2 8-6-4-6 4 2-8-6-6h8z" />
        </svg>
      ),
      onClick: onActivatePolygonTool,
    },
    {
      id: 'boundingbox',
      label: 'Bounding Box',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="4" y="4" width="16" height="16" strokeWidth="2" rx="1" />
        </svg>
      ),
      onClick: onActivateBoundingBoxTool,
    },
  ];

  const shapeButtons = [
    { type: 'rect' as ShapeType, label: 'Rectangle' },
    { type: 'circle' as ShapeType, label: 'Circle' },
    { type: 'text' as ShapeType, label: 'Text' },
    { type: 'line' as ShapeType, label: 'Line' },
  ];

  const menuButtonClass = "flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg/50 rounded-md transition-colors";
  const dropdownClass = "absolute top-full left-0 mt-1 w-48 bg-truecost-bg-surface border border-truecost-glass-border rounded-lg shadow-xl backdrop-blur-md z-50";
  const dropdownItemClass = "flex items-center gap-2 w-full px-3 py-2 text-sm text-truecost-text-primary hover:text-truecost-cyan hover:bg-truecost-glass-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <>
      <header
        className={`
          fixed top-0 left-0 right-0 z-50
          transition-all duration-300
          border-b border-truecost-glass-border/70
          ${scrolled ? 'bg-truecost-bg-primary/95 backdrop-blur-md shadow-lg' : 'bg-truecost-bg-primary/92 backdrop-blur-md'}
        `}
      >
        <nav className="px-4">
          <div className="flex items-center justify-between h-12">
            {/* Left: Logo + Step indicator + Tool menus */}
            <div className="flex items-center gap-4">
              {/* Logo */}
              <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src={logo} alt="TrueCost" className="w-7 h-7 object-contain" />
                <span className="font-heading text-base font-bold text-truecost-text-primary hidden sm:block">
                  TrueCost
                </span>
              </Link>

              {/* Divider */}
              <div className="w-px h-6 bg-truecost-glass-border hidden sm:block" />

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onBackToScope}
                  className="text-sm text-truecost-text-muted hover:text-truecost-cyan transition-colors"
                >
                  Scope
                </button>
                <svg className="w-4 h-4 text-truecost-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-medium text-truecost-cyan">Annotate</span>
                <svg className="w-4 h-4 text-truecost-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={onGenerateEstimate}
                  className="text-sm text-truecost-text-muted hover:text-truecost-cyan transition-colors"
                >
                  Estimate
                </button>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-truecost-glass-border" />

              {/* Tool Menus */}
              <div className="flex items-center gap-1">
                {/* Components Menu */}
                <div className="relative" ref={componentsMenuRef}>
                  <button
                    onClick={() => setIsComponentsMenuOpen(!isComponentsMenuOpen)}
                    className={menuButtonClass}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                    Draw
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isComponentsMenuOpen && (
                    <div className={dropdownClass}>
                      <div className="py-1">
                        <div className="px-3 py-1.5 text-xs font-semibold text-truecost-text-muted uppercase">
                          Measurements
                        </div>
                        {annotationButtons.map(({ id, label, icon, onClick }) => (
                          <button
                            key={id}
                            onClick={() => { if (onClick) onClick(); setIsComponentsMenuOpen(false); }}
                            disabled={!currentUser || !onClick}
                            className={dropdownItemClass}
                          >
                            {icon}
                            {label}
                          </button>
                        ))}
                        <div className="my-1 border-t border-truecost-glass-border" />
                        <div className="px-3 py-1.5 text-xs font-semibold text-truecost-text-muted uppercase">
                          Shapes
                        </div>
                        {shapeButtons.map(({ type, label }) => (
                          <button
                            key={type}
                            onClick={() => { if (onCreateShape) onCreateShape(type); setIsComponentsMenuOpen(false); }}
                            disabled={!currentUser}
                            className={dropdownItemClass}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit Menu */}
                <div className="relative" ref={editMenuRef}>
                  <button
                    onClick={() => setIsEditMenuOpen(!isEditMenuOpen)}
                    className={menuButtonClass}
                  >
                    Edit
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isEditMenuOpen && (
                    <div className={dropdownClass}>
                      <div className="py-1">
                        <button
                          onClick={() => { undo(); setIsEditMenuOpen(false); }}
                          disabled={!canUndo() || !currentUser}
                          className={dropdownItemClass}
                        >
                          <span className="flex-1">Undo</span>
                          <span className="text-xs text-truecost-text-muted">⌘Z</span>
                        </button>
                        <button
                          onClick={() => { redo(); setIsEditMenuOpen(false); }}
                          disabled={!canRedo() || !currentUser}
                          className={dropdownItemClass}
                        >
                          <span className="flex-1">Redo</span>
                          <span className="text-xs text-truecost-text-muted">⌘⇧Z</span>
                        </button>
                        <div className="my-1 border-t border-truecost-glass-border" />
                        <button
                          onClick={() => { deleteSelectedShapes(); setIsEditMenuOpen(false); }}
                          disabled={selectedShapeIds.length === 0}
                          className={dropdownItemClass}
                        >
                          <span className="flex-1">Delete Selected</span>
                          <span className="text-xs text-truecost-text-muted">⌫</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tools Menu */}
                <div className="relative" ref={toolsMenuRef}>
                  <button
                    onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                    className={menuButtonClass}
                  >
                    Tools
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isToolsMenuOpen && (
                    <div className={dropdownClass}>
                      <div className="py-1">
                        <div className="px-3 py-2">
                          <FileUpload
                            projectId={projectId}
                            onUploadComplete={() => setIsToolsMenuOpen(false)}
                            onUploadError={(error) => console.error('Upload error:', error)}
                          />
                        </div>
                        <div className="px-3 py-2">
                          <ScaleTool
                            projectId={projectId}
                            onScaleComplete={() => setIsToolsMenuOpen(false)}
                          />
                        </div>
                        <div className="my-1 border-t border-truecost-glass-border" />
                        <button
                          onClick={() => { setIsExportDialogOpen(true); setIsToolsMenuOpen(false); }}
                          disabled={!currentUser || !stageRef}
                          className={dropdownItemClass}
                        >
                          Export Canvas
                        </button>
                        <button
                          onClick={() => { setIsShortcutsHelpOpen(true); setIsToolsMenuOpen(false); }}
                          className={dropdownItemClass}
                        >
                          Keyboard Shortcuts
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Advanced Menu */}
                <div className="relative" ref={advancedMenuRef}>
                  <button
                    onClick={() => setIsAdvancedMenuOpen(!isAdvancedMenuOpen)}
                    className={menuButtonClass}
                  >
                    View
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isAdvancedMenuOpen && (
                    <div className={dropdownClass}>
                      <div className="py-1">
                        <button
                          onClick={() => { if (onToggleLayers) onToggleLayers(); setIsAdvancedMenuOpen(false); }}
                          disabled={!onToggleLayers}
                          className={dropdownItemClass}
                        >
                          Layers Panel
                        </button>
                        <button
                          onClick={() => { if (onToggleAlignment) onToggleAlignment(); setIsAdvancedMenuOpen(false); }}
                          disabled={!onToggleAlignment}
                          className={dropdownItemClass}
                        >
                          Alignment Tools
                        </button>
                        <button
                          onClick={() => { toggleGrid(); if (onToggleGrid) onToggleGrid(); setIsAdvancedMenuOpen(false); }}
                          className={dropdownItemClass}
                        >
                          {gridState.isVisible ? 'Hide Grid' : 'Show Grid'}
                        </button>
                        <div className="my-1 border-t border-truecost-glass-border" />
                        <button
                          onClick={() => { setIsAIAssistantOpen(true); setIsAdvancedMenuOpen(false); }}
                          disabled={!currentUser}
                          className={dropdownItemClass}
                        >
                          {isProcessingAICommand ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-truecost-cyan" />
                          ) : null}
                          AI Assistant
                        </button>
                        <button
                          onClick={() => { setIsMaterialPanelOpen(true); setIsAdvancedMenuOpen(false); }}
                          disabled={!currentUser}
                          className={dropdownItemClass}
                        >
                          BOM Panel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Status + Actions + User */}
            <div className="flex items-center gap-3">
              {/* Connection status */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                <div className={`h-1.5 w-1.5 rounded-full ${connectionStatusColor.replace('text-', 'bg-')}`} />
                <span className={`${connectionStatusColor}`}>{connectionStatus}</span>
              </div>

              {/* Zoom indicator */}
              {zoom !== undefined && (
                <span className="hidden sm:block text-xs text-truecost-text-muted">
                  {Math.round(zoom * 100)}%
                </span>
              )}

              {/* Generate Estimate Button */}
              {canGenerateEstimate && (
                <button
                  onClick={onGenerateEstimate}
                  className="px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-truecost-cyan to-truecost-teal text-truecost-bg-primary rounded-md hover:opacity-90 transition-opacity"
                >
                  Generate Estimate
                </button>
              )}

              {/* User Menu */}
              <UserMenu />
            </div>
          </div>
        </nav>
      </header>

      {/* Dialogs */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={handleExport}
        hasSelectedShapes={selectedShapeIds.length > 0}
      />
      <ShortcutsHelp
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
      />
      <FloatingChatPanel
        isVisible={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
      />
      <MaterialEstimationPanel
        isVisible={isMaterialPanelOpen}
        onClose={() => setIsMaterialPanelOpen(false)}
      />
    </>
  );
}
