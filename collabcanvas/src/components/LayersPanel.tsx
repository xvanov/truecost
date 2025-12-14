/**
 * LayersPanel component
 * Displays layer hierarchy with drag-to-reorder functionality
 */

import React, { useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useScopedCanvasStore } from '../store/projectCanvasStore';
import { useLayers } from '../hooks/useLayers';
import { useShapes } from '../hooks/useShapes';
import { ColorPicker } from './ColorPicker';
import { 
  calculatePolylineLength, 
  calculatePolygonArea, 
  convertToRealWorld, 
  convertAreaToRealWorld,
  formatMeasurement 
} from '../services/measurementService';
import { flatPointsToPoints } from '../services/shapeService';

interface LayersPanelProps {
  isVisible: boolean;
  onClose: () => void;
  projectId?: string;
}

export function LayersPanel({ isVisible, onClose, projectId }: LayersPanelProps) {
  // Use project-scoped store when projectId is available
  const layers = useScopedCanvasStore(projectId, (state) => state.layers);
  const activeLayerId = useScopedCanvasStore(projectId, (state) => state.activeLayerId);
  const setActiveLayer = useScopedCanvasStore(projectId, (state) => state.setActiveLayer);
  const shapes = useScopedCanvasStore(projectId, (state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const reorderLayers = useScopedCanvasStore(projectId, (state) => state.reorderLayers);
  const toggleLayerVisibility = useScopedCanvasStore(projectId, (state) => state.toggleLayerVisibility);
  const toggleLayerLock = useScopedCanvasStore(projectId, (state) => state.toggleLayerLock);
  const updateLayerInStore = useScopedCanvasStore(projectId, (state) => state.updateLayer);
  const canvasScale = useScopedCanvasStore(projectId, (state) => state.canvasScale);
  
  const {
    createLayer,
    updateLayer,
    deleteLayer,
  } = useLayers(projectId);
  
  const { updateShapeProperty } = useShapes(projectId);

  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [draggedShapeId, setDraggedShapeId] = useState<string | null>(null);
  const [newLayerName, setNewLayerName] = useState('');
  const [isCreatingLayer, setIsCreatingLayer] = useState(false);

  // Helper function to get measurement for a shape
  const getShapeMeasurement = (shape: { type: string; points?: number[] }) => {
    if (!canvasScale.scaleLine) return null;
    
    if (shape.type === 'polyline' && shape.points && shape.points.length >= 4) {
      const points = flatPointsToPoints(shape.points);
      const pixelLength = calculatePolylineLength(points);
      const realLength = convertToRealWorld(pixelLength, canvasScale);
      return realLength !== null ? formatMeasurement(realLength, canvasScale.scaleLine.unit) : null;
    }
    
    if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
      const points = flatPointsToPoints(shape.points);
      const pixelArea = calculatePolygonArea(points);
      const realArea = convertAreaToRealWorld(pixelArea, canvasScale);
      return realArea !== null ? formatMeasurement(realArea, canvasScale.scaleLine.unit, true) : null;
    }
    
    return null;
  };

  // Helper function to calculate layer totals
  const getLayerTotals = (layerShapes: Array<{ type: string; points?: number[] }>) => {
    if (!canvasScale.scaleLine) return null;
    
    let totalLength = 0;
    let totalArea = 0;
    let hasPolylines = false;
    let hasPolygons = false;
    
    layerShapes.forEach(shape => {
      if (shape.type === 'polyline' && shape.points && shape.points.length >= 4) {
        hasPolylines = true;
        const points = flatPointsToPoints(shape.points);
        const pixelLength = calculatePolylineLength(points);
        const realLength = convertToRealWorld(pixelLength, canvasScale);
        if (realLength !== null) totalLength += realLength;
      }
      
      if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
        hasPolygons = true;
        const points = flatPointsToPoints(shape.points);
        const pixelArea = calculatePolygonArea(points);
        const realArea = convertAreaToRealWorld(pixelArea, canvasScale);
        if (realArea !== null) totalArea += realArea;
      }
    });
    
    return {
      totalLength: hasPolylines ? formatMeasurement(totalLength, canvasScale.scaleLine.unit) : null,
      totalArea: hasPolygons ? formatMeasurement(totalArea, canvasScale.scaleLine.unit, true) : null,
    };
  };

  if (!isVisible) return null;

  const handleCreateLayer = () => {
    if (newLayerName.trim()) {
      createLayer(newLayerName.trim());
      setNewLayerName('');
      setIsCreatingLayer(false);
    }
  };

  const handleDeleteLayer = (layerId: string) => {
    if (layerId === 'default-layer') return; // Can't delete default layer
    deleteLayer(layerId);
  };

  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    setDraggedLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetLayerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Handle shape drop (moving shape to different layer)
    if (draggedShapeId && draggedShapeId !== null) {
      const shape = Array.from(shapes.values()).find(s => s.id === draggedShapeId);
      if (shape && shape.layerId !== targetLayerId) {
        await updateShapeProperty(draggedShapeId, 'layerId', targetLayerId);
      }
      setDraggedShapeId(null);
      return;
    }
    
    // Handle layer reorder (existing functionality)
    if (draggedLayerId && draggedLayerId !== targetLayerId) {
      const draggedLayer = layers.find(l => l.id === draggedLayerId);
      const targetLayer = layers.find(l => l.id === targetLayerId);
      
      if (draggedLayer && targetLayer) {
        const newOrder = layers.map(layer => {
          if (layer.id === draggedLayerId) {
            return { ...layer, order: targetLayer.order };
          } else if (layer.id === targetLayerId) {
            return { ...layer, order: draggedLayer.order };
          }
          return layer;
        });
        
        reorderLayers(newOrder.map(l => l.id));
      }
    }
    
    setDraggedLayerId(null);
  };
  
  const handleShapeDragStart = (e: React.DragEvent, shapeId: string) => {
    setDraggedShapeId(shapeId);
    e.dataTransfer.effectAllowed = 'move';
    // Add visual feedback
    e.dataTransfer.setData('text/plain', shapeId);
  };
  
  const handleShapeDragEnd = () => {
    setDraggedShapeId(null);
  };

  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

  return (
    <div className="fixed right-4 top-16 w-80 bg-truecost-bg-surface border border-truecost-glass-border rounded-lg shadow-xl backdrop-blur-md z-40 flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-truecost-glass-border flex-shrink-0 bg-truecost-glass-bg/50">
        <h3 className="text-base font-semibold text-truecost-text-primary">Layers</h3>
        <button
          onClick={onClose}
          className="p-1 text-truecost-text-secondary hover:text-truecost-text-primary rounded transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-3 flex-shrink-0 border-b border-truecost-glass-border">
          {/* Create Layer */}
          <div>
            {isCreatingLayer ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  placeholder="Layer name"
                  className="flex-1 px-3 py-1.5 bg-truecost-glass-bg border border-truecost-glass-border rounded-md text-sm text-truecost-text-primary placeholder:text-truecost-text-muted focus:outline-none focus:ring-2 focus:ring-truecost-cyan/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateLayer();
                    if (e.key === 'Escape') setIsCreatingLayer(false);
                  }}
                />
                <button
                  onClick={handleCreateLayer}
                  className="px-3 py-1.5 bg-truecost-cyan text-truecost-bg-primary rounded-md text-sm font-medium hover:bg-truecost-cyan/90 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setIsCreatingLayer(false)}
                  className="px-3 py-1.5 bg-truecost-glass-bg text-truecost-text-secondary border border-truecost-glass-border rounded-md text-sm hover:bg-truecost-glass-bg/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingLayer(true)}
                className="w-full px-3 py-2 bg-truecost-glass-bg text-truecost-text-secondary border border-truecost-glass-border rounded-md text-sm hover:bg-truecost-glass-bg/80 hover:text-truecost-text-primary flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Layer
              </button>
            )}
          </div>
        </div>

        {/* Layers List - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
          {sortedLayers.map((layer) => {
            // Handle shapes without layerId (created before layer system) - assign them to default layer
            const shapesInLayer = Array.from(shapes.values()).filter(shape => {
              const shapeLayerId = shape.layerId || 'default-layer';
              return shapeLayerId === layer.id;
            });
            
            const isSelected = selectedShapeIds.some(shapeId => 
              shapesInLayer.some(shape => shape.id === shapeId)
            );

            return (
              <div
                key={layer.id}
                draggable
                onDragStart={(e) => handleDragStart(e, layer.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedShapeId) {
                    e.currentTarget.classList.add('border-truecost-cyan/50', 'bg-truecost-cyan/10');
                  }
                  handleDragOver(e);
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('border-truecost-cyan/50', 'bg-truecost-cyan/10');
                }}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('border-truecost-cyan/50', 'bg-truecost-cyan/10');
                  handleDrop(e, layer.id);
                }}
                onClick={() => setActiveLayer(layer.id)}
                className={`p-2.5 border rounded-md cursor-pointer transition-colors ${
                  layer.id === activeLayerId 
                    ? 'border-truecost-cyan bg-truecost-cyan/10' 
                    : isSelected 
                      ? 'border-truecost-cyan/50 bg-truecost-cyan/5' 
                      : 'border-truecost-glass-border bg-truecost-glass-bg/30 hover:bg-truecost-glass-bg/50'
                } ${draggedLayerId === layer.id ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                      className="text-truecost-text-muted hover:text-truecost-text-primary transition-colors flex-shrink-0"
                    >
                      {layer.visible ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      )}
                    </button>
                    
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }}
                      className="text-truecost-text-muted hover:text-truecost-text-primary transition-colors flex-shrink-0"
                    >
                      {layer.locked ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="sr-only">{layer.name}</span>
                        <input
                          className="text-sm font-medium text-truecost-text-primary bg-transparent border-b border-transparent focus:border-truecost-cyan focus:outline-none truncate max-w-[120px]"
                          value={layer.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const name = e.target.value;
                            updateLayerInStore(layer.id, { name });
                          }}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (name && name !== layer.name) {
                              updateLayer(layer.id, { name });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === 'Escape') {
                              (e.target as HTMLInputElement).value = layer.name;
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        <span className="text-xs text-truecost-text-muted flex-shrink-0">
                          ({shapesInLayer.length})
                        </span>
                      </div>
                      {/* Layer totals */}
                      {(() => {
                        const totals = getLayerTotals(shapesInLayer);
                        if (!totals) return null;
                        return (
                          <div className="text-xs text-truecost-text-secondary mt-0.5 font-mono truncate">
                            {totals.totalLength && <span className="mr-2">📏 {totals.totalLength}</span>}
                            {totals.totalArea && <span>📐 {totals.totalArea}</span>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ColorPicker
                      currentColor={layer.color || '#3B82F6'}
                      onColorChange={(c) => {
                        updateLayerInStore(layer.id, { color: c });
                        updateLayer(layer.id, { color: c });
                      }}
                      swatchOnly
                    />
                    {layer.id !== 'default-layer' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete this layer and ALL shapes on it? This cannot be undone.')) {
                            handleDeleteLayer(layer.id);
                          }
                        }}
                        className="text-red-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Shapes in layer */}
                {shapesInLayer.length > 0 && (
                  <div className="mt-2 ml-4 space-y-1 max-h-32 overflow-y-auto">
                    {shapesInLayer.map((shape) => {
                      const measurement = getShapeMeasurement(shape);
                      const isDragging = draggedShapeId === shape.id;
                      
                      return (
                        <div
                          key={shape.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleShapeDragStart(e, shape.id);
                          }}
                          onDragEnd={handleShapeDragEnd}
                          className={`text-xs p-1.5 rounded cursor-move transition-all ${
                            isDragging
                              ? 'opacity-50 bg-truecost-glass-bg'
                              : selectedShapeIds.includes(shape.id) 
                                ? 'bg-truecost-cyan/20 text-truecost-cyan border border-truecost-cyan/30' 
                                : 'text-truecost-text-secondary hover:bg-truecost-glass-bg/50 bg-truecost-bg-primary/50 border border-truecost-glass-border/50'
                          }`}
                          title="Drag to move to different layer"
                        >
                          <div className="flex items-center gap-1.5">
                            <svg 
                              className="w-3 h-3 text-truecost-text-muted flex-shrink-0" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 12h16M4 16h16" />
                            </svg>
                            <span className="truncate font-medium capitalize">{shape.type}</span>
                            <span className="text-truecost-text-muted text-xs flex-shrink-0">({shape.id.slice(-4)})</span>
                            {measurement && (
                              <span className="font-mono text-xs text-truecost-text-secondary flex-shrink-0 ml-auto">
                                {measurement}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
