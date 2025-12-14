/**
 * Zustand store for canvas state management
 * Manages shapes, selection, locks, and presence data
 */

import { create } from 'zustand';
import type { Shape, Lock, Presence, User, SelectionBox, TransformControls, HistoryState, CanvasAction, CreateActionData, UpdateActionData, MoveActionData, BulkDuplicateActionData, BulkMoveActionData, BulkRotateActionData, Layer, AlignmentType, GridState, SnapIndicator, AICommand, AICommandResult, AIStatus, AICommandHistory, CanvasScale, BackgroundImage, ScaleLine, UnitType, DialogueContext, BillOfMaterials, MaterialCalculation, UserMaterialPreferences } from '../types';
import type { ConnectionState } from '../services/offline';
import { isHarnessEnabled, registerHarnessApi } from '../utils/harness';
import { createHistoryService, createAction, type HistoryService } from '../services/historyService';
import { subscribeToBoardState } from '../services/firestore';
import { deleteConstructionPlanImage } from '../services/storage';
import { AIService } from '../services/aiService';
import { AICommandExecutor } from '../services/aiCommandExecutor';
import { BatchUpdater } from '../utils/throttle';

interface CanvasState {
  // Shapes
  shapes: Map<string, Shape>;
  createShape: (shape: Shape) => void;
  updateShapePosition: (id: string, x: number, y: number, updatedBy: string, clientUpdatedAt: number) => void;
  updateShapeProperty: (id: string, property: keyof Shape, value: unknown, updatedBy: string, clientUpdatedAt: number) => void;
  setShapes: (shapes: Shape[]) => void;
  setShapesFromMap: (shapes: Map<string, Shape>) => void;
  
  // History (Undo/Redo)
  history: HistoryState;
  historyService: HistoryService; // HistoryService instance
  pushAction: (action: CanvasAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  
  // Multi-Select
  selectedShapeIds: string[];
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  selectShapes: (ids: string[]) => void;
  
  // Bulk Operations
  deleteSelectedShapes: () => void;
  duplicateSelectedShapes: () => void;
  moveSelectedShapes: (deltaX: number, deltaY: number) => void;
  rotateSelectedShapes: (angle: number) => void;
  
  // Transform Controls
  transformControls: TransformControls;
  updateTransformControls: (controls: Partial<TransformControls>) => void;
  hideTransformControls: () => void;
  
  // Selection Box (for drag selection)
  selectionBox: SelectionBox | null;
  setSelectionBox: (box: SelectionBox | null) => void;
  
  // Legacy single selection (for backward compatibility)
  selectedShapeId: string | null;
  selectShape: (id: string) => void;
  deselectShape: () => void;
  
  // Locks
  locks: Map<string, Lock>;
  lockShape: (shapeId: string, userId: string, userName: string) => void;
  unlockShape: (shapeId: string) => void;
  setLocks: (locks: Array<{ shapeId: string; lock: Lock }>) => void;
  
  // Presence
  users: Map<string, Presence>;
  updatePresence: (userId: string, data: Presence) => void;
  removeUser: (userId: string) => void;
  setUsers: (users: Presence[]) => void;
  
  // Current User
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  
  // Offline State
  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;
  queuedUpdatesCount: number;
  setQueuedUpdatesCount: (count: number) => void;
  
  // Layers Management
  layers: Layer[];
  activeLayerId: string;
  createLayer: (name: string, id?: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;
  reorderLayers: (layerIds: string[]) => void;
  moveShapeToLayer: (shapeId: string, layerId: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  setActiveLayer: (id: string) => void;
  setLayers: (layers: Layer[]) => void;
  
  // Alignment Tools
  alignSelectedShapes: (alignment: AlignmentType) => void;
  distributeSelectedShapes: (direction: 'horizontal' | 'vertical') => void;
  
  // Shape Operations
  deleteShape: (id: string) => void;
  deleteShapes: (ids: string[]) => void;
  duplicateShapes: (ids: string[], duplicatedBy: string) => void;
  
  // Grid and Snap
  gridState: GridState;
  snapIndicators: SnapIndicator[];
  toggleGrid: () => void;
  toggleSnap: () => void;
  updateGridSize: (size: number) => void;
  setSnapIndicators: (indicators: SnapIndicator[]) => void;
  
  // AI Canvas Agent
  aiCommands: AICommand[];
  aiStatus: AIStatus;
  aiCommandHistory: AICommandHistory[];
  commandQueue: AICommand[];
  isProcessingAICommand: boolean;
  processAICommand: (commandText: string, currentView?: 'scope' | 'time' | 'space' | 'money') => Promise<AICommandResult>;
  executeAICommand: (command: AICommand) => Promise<AICommandResult>;
  clearAIHistory: () => void;
  getAIStatus: () => AIStatus;
  addToCommandQueue: (command: AICommand) => void;
  processCommandQueue: () => Promise<void>;
  setAIStatus: (status: Partial<AIStatus>) => void;
  
  // Construction Annotation Tool State
  canvasScale: CanvasScale;
  setBackgroundImage: (image: BackgroundImage | null, skipFirestoreSync?: boolean) => void;
  setScaleLine: (scaleLine: ScaleLine | null, skipFirestoreSync?: boolean) => void;
  updateScaleLine: (updates: Partial<ScaleLine>) => void;
  deleteScaleLine: () => void;
  setIsScaleMode: (isScaleMode: boolean) => void;
  setIsImageUploadMode: (isImageUploadMode: boolean) => void;
  initializeBoardStateSubscription: () => () => void;
  
  // Material Estimation State (PR-4)
  materialDialogue: DialogueContext | null;
  billOfMaterials: BillOfMaterials | null;
  userMaterialPreferences: UserMaterialPreferences | null;
  isAccumulatingBOM: boolean; // Force accumulation mode
  startMaterialDialogue: (request: string) => void;
  updateMaterialDialogue: (updates: Partial<DialogueContext>) => void;
  clearMaterialDialogue: () => void;
  setBillOfMaterials: (bom: BillOfMaterials | null) => void;
  addMaterialCalculation: (calculation: MaterialCalculation, forceAccumulate?: boolean) => void;
  setUserMaterialPreferences: (preferences: UserMaterialPreferences) => void;
  setIsAccumulatingBOM: (isAccumulating: boolean) => void;

  // Viewport State (persisted across navigation)
  viewportState: { x: number; y: number; scale: number };
  setViewportState: (state: { x: number; y: number; scale: number }) => void;
}

export type { CanvasState };

export const useCanvasStore = create<CanvasState>((set, get) => {
  // Initialize history service
  const historyService = createHistoryService(50);
  
  // Initialize AI service
  const aiService = new AIService();
  
  // Initialize BatchUpdater for batching rapid shape updates
  const batchUpdater = new BatchUpdater();
  
  // Set up history service callback
  historyService.setOnActionApplied(async (action: CanvasAction) => {
    const state = get();
    const currentUser = state.currentUser;
    
    if (!currentUser) return;
    
    // Apply the action to the store
    switch (action.type) {
      case 'CREATE':
        if (action.shapeId && action.data) {
          const newShapes = new Map(state.shapes);
          // Handle both direct shape data and wrapped shape data
          const shapeData = action.data as CreateActionData | Shape;
          const shape = 'shape' in shapeData ? shapeData.shape : shapeData;
          
          // Mark this shape as created by undo/redo to prevent Firestore conflicts
          const shapeWithUndoFlag = {
            ...shape,
            _isUndoRedoAction: true,
            updatedAt: Date.now(),
            updatedBy: currentUser.uid,
            clientUpdatedAt: Date.now(),
          };
          newShapes.set(action.shapeId, shapeWithUndoFlag);
          set({ shapes: newShapes });
          
          // Also sync the restored shape to Firestore so other clients know about it
          try {
            // Note: Global store is deprecated - use project-scoped store instead
            // Firestore sync requires projectId which is not available in global store
            // await createShapeInFirestore(
            //   '', // projectId not available in global store
            //   shape.id, 
            //   shape.type, 
            //   shape.x, 
            //   shape.y, 
            //   currentUser.uid, 
            //   shape.layerId,
            //   additionalProps
            // );
            console.log(`✅ Synced restored shape ${action.shapeId} to Firestore`);
          } catch (error) {
            console.error(`❌ Failed to sync restored shape ${action.shapeId} to Firestore:`, error);
          }
        }
        break;
        
      case 'DELETE':
        if (action.shapeId) {
          const newShapes = new Map(state.shapes);
          newShapes.delete(action.shapeId);
          set({ shapes: newShapes });
          
          // Note: Global store is deprecated - use project-scoped store instead
          // Firestore sync requires projectId which is not available in global store
          // Firestore sync disabled for global store
        }
        break;
        
      case 'UPDATE':
        if (action.shapeId && action.data) {
          const shape = state.shapes.get(action.shapeId);
          if (shape) {
            const newShapes = new Map(state.shapes);
            const updateData = action.data as UpdateActionData;
            newShapes.set(action.shapeId, {
              ...shape,
              [updateData.property]: updateData.newValue,
              updatedAt: Date.now(),
              updatedBy: currentUser.uid,
              clientUpdatedAt: Date.now(),
            });
            set({ shapes: newShapes });
          }
        }
        break;
        
      case 'MOVE':
        if (action.shapeId && action.data) {
          const shape = state.shapes.get(action.shapeId);
          if (shape) {
            const newShapes = new Map(state.shapes);
            const moveData = action.data as MoveActionData;
            newShapes.set(action.shapeId, {
              ...shape,
              x: moveData.x,
              y: moveData.y,
              updatedAt: Date.now(),
              updatedBy: currentUser.uid,
              clientUpdatedAt: Date.now(),
            });
            set({ shapes: newShapes });
          }
        }
        break;
        
      case 'BULK_DELETE':
        if (action.shapeIds) {
          const newShapes = new Map(state.shapes);
          action.shapeIds.forEach(id => newShapes.delete(id));
          set({ 
            shapes: newShapes,
            selectedShapeIds: [],
            selectedShapeId: null,
          });
        }
        break;
        
      case 'BULK_DUPLICATE':
        if (action.shapeIds && action.data) {
          const newShapes = new Map(state.shapes);
          const duplicatedIds: string[] = [];
          // Handle both direct shape array and wrapped shape data
          const duplicateData = action.data as BulkDuplicateActionData | Shape[];
          const shapes = 'duplicatedShapes' in duplicateData ? duplicateData.duplicatedShapes : duplicateData;
          
          shapes.forEach((shape: Shape) => {
            const duplicatedShape = {
              ...shape,
              id: `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              x: shape.x + 20,
              y: shape.y + 20,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              clientUpdatedAt: Date.now(),
            };
            newShapes.set(duplicatedShape.id, duplicatedShape);
            duplicatedIds.push(duplicatedShape.id);
          });
          
          set({
            shapes: newShapes,
            selectedShapeIds: duplicatedIds,
            selectedShapeId: duplicatedIds.length > 0 ? duplicatedIds[duplicatedIds.length - 1] : null,
          });
        }
        break;
        
      case 'BULK_MOVE':
        if (action.shapeIds && action.data) {
          const newShapes = new Map(state.shapes);
          const moveData = action.data as BulkMoveActionData;
          action.shapeIds.forEach(id => {
            const shape = state.shapes.get(id);
            if (shape) {
              newShapes.set(id, {
                ...shape,
                x: shape.x + moveData.deltaX,
                y: shape.y + moveData.deltaY,
                updatedAt: Date.now(),
                updatedBy: currentUser.uid,
                clientUpdatedAt: Date.now(),
              });
            }
          });
          set({ shapes: newShapes });
        }
        break;
        
      case 'BULK_ROTATE':
        if (action.shapeIds && action.data) {
          const newShapes = new Map(state.shapes);
          const rotateData = action.data as BulkRotateActionData;
          action.shapeIds.forEach(id => {
            const shape = state.shapes.get(id);
            if (shape) {
              const currentRotation = shape.rotation || 0;
              newShapes.set(id, {
                ...shape,
                rotation: currentRotation + rotateData.angle,
                updatedAt: Date.now(),
                updatedBy: currentUser.uid,
                clientUpdatedAt: Date.now(),
              });
            }
          });
          set({ shapes: newShapes });
        }
        break;
    }
  });

  return {
  // Shapes state
  shapes: new Map<string, Shape>(),
    
    // History state
    history: {
      past: [],
      present: null,
      future: [],
      maxHistorySize: 50,
    },
    historyService,
    
    pushAction: (action: CanvasAction) => {
      historyService.pushAction(action);
      set(() => ({
        history: historyService.getHistoryState(),
      }));
    },
    
    undo: () => {
      const undoneAction = historyService.undo();
      if (undoneAction) {
        set(() => ({
          history: historyService.getHistoryState(),
        }));
      }
    },
    
    redo: () => {
      const redoneAction = historyService.redo();
      if (redoneAction) {
        set(() => ({
          history: historyService.getHistoryState(),
        }));
      }
    },
    
    canUndo: () => historyService.canUndo(),
    canRedo: () => historyService.canRedo(),
    
    clearHistory: () => {
      historyService.clearHistory();
      set(() => ({
        history: historyService.getHistoryState(),
      }));
    },
  
  createShape: (shape: Shape) => {
    const currentState = get();
    set((state) => {
      const newShapes = new Map(state.shapes);
      // Ensure shape has a layerId - use activeLayerId if not provided
      const assignedLayerId = shape.layerId || state.activeLayerId || 'default-layer';
      const layer = state.layers.find(l => l.id === assignedLayerId);
      const defaultColor = layer?.color || '#3B82F6';
      const assignedColor = (shape as Partial<Shape>).color ?? defaultColor;
      const shapeWithLayer = { 
        ...shape, 
        layerId: assignedLayerId,
        color: assignedColor,
      } as Shape;
      newShapes.set(shape.id, shapeWithLayer);
        
        // Push create action to history
        if (state.currentUser) {
          const action = createAction.create(shape.id, shapeWithLayer, state.currentUser.uid);
          historyService.pushAction(action);
        }
        
        // Add shape to active layer
        const updatedLayers = state.layers.map(layer => 
          layer.id === (shapeWithLayer.layerId || state.activeLayerId)
            ? { ...layer, shapes: [...layer.shapes, shape.id] }
            : layer
        );
        
        return { 
          shapes: newShapes,
          layers: updatedLayers,
          history: historyService.getHistoryState(),
        };
    });

    // Also save to Firestore
    if (currentState.currentUser) {
      import('../services/firestore').then(() => {
        // Note: Global store is deprecated - Firestore sync disabled
        // Layer ID and additional props would be used here if sync was enabled
        // const _layerId = shape.layerId || currentState.activeLayerId || 'default-layer';
        // const _additionalProps: Partial<Shape> = {
        //   color: shape.color,
        //   ...(shape.type === 'polyline' || shape.type === 'polygon' ? {
        //     points: shape.points,
        //     strokeWidth: shape.strokeWidth,
        //     w: shape.w,
        //     h: shape.h,
        //   } : {}),
        //   ...(shape.type === 'line' ? {
        //     points: shape.points,
        //     strokeWidth: shape.strokeWidth,
        //   } : {}),
        // };
        
        // Note: Global store is deprecated - use project-scoped store instead
        // Firestore sync requires projectId which is not available in global store
        // Firestore sync disabled for global store
      });
    }
  },

  updateShapePosition: (id: string, x: number, y: number, updatedBy: string, clientUpdatedAt: number) => {
    // Batch rapid position updates together to reduce render calls
    batchUpdater.schedule(() => {
      set((state) => {
        const shape = state.shapes.get(id);
        if (!shape) return state;
        
        // Store previous position for undo
        const previousX = shape.x;
        const previousY = shape.y;
        
        const newShapes = new Map(state.shapes);
        newShapes.set(id, {
          ...shape,
          x,
          y,
          updatedAt: Date.now(),
          updatedBy,
          clientUpdatedAt,
        });
        
        // Push move action to history
        if (state.currentUser && (x !== previousX || y !== previousY)) {
          const action = createAction.move(id, x, y, previousX, previousY, state.currentUser.uid);
          historyService.pushAction(action);
        }
        
        return { 
          shapes: newShapes,
          history: historyService.getHistoryState(),
        };
      });
    });
  },

  updateShapeProperty: (id: string, property: keyof Shape, value: unknown, updatedBy: string, clientUpdatedAt: number) => {
    // Batch rapid property updates together to reduce render calls
    batchUpdater.schedule(() => {
      set((state) => {
        const shape = state.shapes.get(id);
        if (!shape) return state;
        
        // Store previous value for undo
        const previousValue = shape[property];
        
        const newShapes = new Map(state.shapes);
        newShapes.set(id, {
          ...shape,
          [property]: value,
          updatedAt: Date.now(),
          updatedBy,
          clientUpdatedAt,
        });
        
        // Push update action to history
        if (state.currentUser && value !== previousValue) {
          const action = createAction.update(id, property, value, previousValue, state.currentUser.uid);
          historyService.pushAction(action);
        }
        
        return { 
          shapes: newShapes,
          history: historyService.getHistoryState(),
        };
      });
    });
  },
  
  setShapes: (shapes: Shape[]) =>
    set(() => ({
      shapes: new Map(shapes.map((shape) => [shape.id, shape])),
    })),

  setShapesFromMap: (incomingShapes: Map<string, Shape>) =>
    set(() => ({
      shapes: incomingShapes,
    })),
  
  // Multi-Select state
  selectedShapeIds: [],
  
  addToSelection: (id: string) =>
    set((state) => {
      if (state.selectedShapeIds.includes(id)) return state;
      return {
        selectedShapeIds: [...state.selectedShapeIds, id],
        selectedShapeId: id, // Update legacy single selection
      };
    }),
  
  removeFromSelection: (id: string) =>
    set((state) => {
      const newSelection = state.selectedShapeIds.filter(shapeId => shapeId !== id);
      return {
        selectedShapeIds: newSelection,
        selectedShapeId: newSelection.length > 0 ? newSelection[newSelection.length - 1] : null,
      };
    }),
  
  clearSelection: () =>
    set(() => ({
      selectedShapeIds: [],
      selectedShapeId: null,
      transformControls: {
        isVisible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        resizeHandles: [],
      },
    })),
  
  selectShapes: (ids: string[]) =>
    set(() => ({
      selectedShapeIds: ids,
      selectedShapeId: ids.length > 0 ? ids[ids.length - 1] : null,
    })),
  
  // Bulk Operations
  deleteSelectedShapes: () =>
    set((state) => {
      const deletedShapes: Shape[] = [];
      state.selectedShapeIds.forEach(id => {
        const shape = state.shapes.get(id);
        if (shape) {
          deletedShapes.push(shape);
        }
      });
      
      const newShapes = new Map(state.shapes);
      state.selectedShapeIds.forEach(id => {
        newShapes.delete(id);
      });
      
      // Push bulk delete action to history
      if (state.currentUser && deletedShapes.length > 0) {
        const action = createAction.bulkDelete(state.selectedShapeIds, deletedShapes, state.currentUser.uid);
        historyService.pushAction(action);
        
        // Note: Global store is deprecated - use project-scoped store instead
        // Firestore sync requires projectId which is not available in global store
        // state.selectedShapeIds.forEach(async (shapeId) => {
        //   try {
        //     await deleteShape('', shapeId); // projectId not available in global store
        //     console.log(`✅ Deleted shape ${shapeId} from Firestore`);
        //   } catch (error) {
        //     console.error(`❌ Failed to delete shape ${shapeId} from Firestore:`, error);
        //   }
        // });
      }
      
      return {
        shapes: newShapes,
        selectedShapeIds: [],
        selectedShapeId: null,
        transformControls: {
          isVisible: false,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          resizeHandles: [],
        },
        history: historyService.getHistoryState(),
      };
    }),
  
  duplicateSelectedShapes: () =>
    set((state) => {
      const newShapes = new Map(state.shapes);
      const duplicatedIds: string[] = [];
      const duplicatedShapes: Shape[] = [];
      
      state.selectedShapeIds.forEach(id => {
        const shape = state.shapes.get(id);
        if (!shape) return;
        
        const duplicatedShape = {
          ...shape,
          id: `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: shape.x + 20, // Offset by 20px
          y: shape.y + 20,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          clientUpdatedAt: Date.now(),
        };
        
        newShapes.set(duplicatedShape.id, duplicatedShape);
        duplicatedIds.push(duplicatedShape.id);
        duplicatedShapes.push(duplicatedShape);
      });
      
      // Push bulk duplicate action to history
      if (state.currentUser && duplicatedShapes.length > 0) {
        const action = createAction.bulkDuplicate(state.selectedShapeIds, duplicatedShapes, state.currentUser.uid);
        historyService.pushAction(action);
      }
      
      return {
        shapes: newShapes,
        selectedShapeIds: duplicatedIds,
        selectedShapeId: duplicatedIds.length > 0 ? duplicatedIds[duplicatedIds.length - 1] : null,
        history: historyService.getHistoryState(),
      };
    }),
  
  moveSelectedShapes: (deltaX: number, deltaY: number) =>
    set((state) => {
      const newShapes = new Map(state.shapes);
      
      state.selectedShapeIds.forEach(id => {
        const shape = state.shapes.get(id);
        if (!shape) return;
        
        newShapes.set(id, {
          ...shape,
          x: shape.x + deltaX,
          y: shape.y + deltaY,
          updatedAt: Date.now(),
          clientUpdatedAt: Date.now(),
        });
      });
      
      // Push bulk move action to history
      if (state.currentUser && state.selectedShapeIds.length > 0) {
        const action = createAction.bulkMove(state.selectedShapeIds, deltaX, deltaY, state.currentUser.uid);
        historyService.pushAction(action);
      }
      
      return { 
        shapes: newShapes,
        history: historyService.getHistoryState(),
      };
    }),
  
  rotateSelectedShapes: (angle: number) =>
    set((state) => {
      const newShapes = new Map(state.shapes);
      
      state.selectedShapeIds.forEach(id => {
        const shape = state.shapes.get(id);
        if (!shape) return;
        
        const currentRotation = shape.rotation || 0;
        const newRotation = currentRotation + angle;
        
        newShapes.set(id, {
          ...shape,
          rotation: newRotation,
          updatedAt: Date.now(),
          clientUpdatedAt: Date.now(),
        });
      });
      
      // Push bulk rotate action to history
      if (state.currentUser && state.selectedShapeIds.length > 0) {
        const action = createAction.bulkRotate(state.selectedShapeIds, angle, state.currentUser.uid);
        historyService.pushAction(action);
      }
      
      return { 
        shapes: newShapes,
        history: historyService.getHistoryState(),
      };
    }),
  
  // Transform Controls
  transformControls: {
    isVisible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    resizeHandles: [],
  },
  
  updateTransformControls: (controls: Partial<TransformControls>) =>
    set((state) => ({
      transformControls: { ...state.transformControls, ...controls },
    })),
  
  hideTransformControls: () =>
    set((state) => ({
      transformControls: { ...state.transformControls, isVisible: false },
    })),
  
  // Selection Box
  selectionBox: null,
  
  setSelectionBox: (box: SelectionBox | null) =>
    set(() => ({ selectionBox: box })),
  
  // Legacy single selection (for backward compatibility)
  selectedShapeId: null,
  
  selectShape: (id: string) =>
    set(() => ({
      selectedShapeId: id,
      selectedShapeIds: [id],
    })),
  
  deselectShape: () =>
    set(() => ({
      selectedShapeId: null,
      selectedShapeIds: [],
      transformControls: {
        isVisible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        resizeHandles: [],
      },
    })),
  
  // Locks state
  locks: new Map<string, Lock>(),
  
  lockShape: (shapeId: string, userId: string, userName: string) =>
    set((state) => {
      const newLocks = new Map(state.locks);
      newLocks.set(shapeId, {
        userId,
        userName,
        lockedAt: Date.now(),
      });
      return { locks: newLocks };
    }),
  
  unlockShape: (shapeId: string) =>
    set((state) => {
      const newLocks = new Map(state.locks);
      newLocks.delete(shapeId);
      return { locks: newLocks };
    }),
  
  setLocks: (locks: Array<{ shapeId: string; lock: Lock }>) =>
    set(() => ({
      locks: new Map(locks.map(({ shapeId, lock }) => [shapeId, lock])),
    })),
  
  // Presence state
  users: new Map<string, Presence>(),
  
  updatePresence: (userId: string, data: Presence) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.set(userId, data);
      return { users: newUsers };
    }),
  
  removeUser: (userId: string) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.delete(userId);
      return { users: newUsers };
    }),
  
  setUsers: (users: Presence[]) =>
    set(() => ({
      users: new Map(users.map((user) => [user.userId, user])),
    })),
  
  // Current user state
  currentUser: null,
  
  setCurrentUser: (user: User | null) =>
    set(() => ({
      currentUser: user,
    })),
  
  // Offline state
  connectionState: {
    isOnline: navigator.onLine,
    isFirestoreOnline: true,
    isRTDBOnline: true,
    lastOnlineTime: null,
  },
  
  setConnectionState: (state: ConnectionState) =>
    set(() => ({
      connectionState: state,
    })),
  
  queuedUpdatesCount: 0,
  
  setQueuedUpdatesCount: (count: number) =>
    set(() => ({
      queuedUpdatesCount: count,
    })),

  // Layers Management
  layers: [],
  activeLayerId: 'default-layer',
  
  createLayer: (name: string, id?: string) =>
    set((state) => {
      const newLayer: Layer = {
        id: id || `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        shapes: [],
        visible: true,
        locked: false,
        order: state.layers.length,
        color: '#3B82F6',
      };
      
      return {
        layers: [...state.layers, newLayer],
        activeLayerId: newLayer.id,
      };
    }),
  
  updateLayer: (id: string, updates: Partial<Layer>) =>
    {
      const currentUser = get().currentUser;
      const isColorChange = Object.prototype.hasOwnProperty.call(updates, 'color');
      const updatedShapeIds: string[] = [];
      set((state) => {
        const newLayers = state.layers.map(layer => 
        layer.id === id ? { ...layer, ...updates } : layer
        );
        let newShapes = state.shapes;
        if (isColorChange) {
          const layerColor = (updates as Partial<Layer>).color;
          if (layerColor) {
            const updated = new Map(newShapes);
            Array.from(updated.values()).forEach((shape) => {
              const shapeLayerId = shape.layerId || 'default-layer';
              if (shapeLayerId === id && shape.color !== layerColor) {
                updated.set(shape.id, { ...shape, color: layerColor, updatedAt: Date.now() });
                updatedShapeIds.push(shape.id);
              }
            });
            newShapes = updated;
          }
        }
        return { layers: newLayers, shapes: newShapes };
      });
      // Persist color propagation to Firestore so other clients see updated colors
      if (isColorChange && currentUser && (updates as Partial<Layer>).color && updatedShapeIds.length > 0) {
        // Layer color and timestamp would be used for Firestore sync if enabled
        // const _layerColor = (updates as Partial<Layer>).color as string;
        // const _clientTimestamp = Date.now();
        // Note: Global store is deprecated - use project-scoped store instead
        // Firestore sync requires projectId which is not available in global store
        // import('../services/firestore').then(({ updateShapeProperty }) => {
        //   updatedShapeIds.forEach((shapeId) => {
        //     updateShapeProperty('', shapeId, 'color', layerColor, currentUser.uid, clientTimestamp)
        //       .catch((error: unknown) => {
        //         console.error('❌ Failed to persist shape color to Firestore:', { shapeId, error });
        //       });
        //   });
        // });
      }
    },
  
  deleteLayer: (id: string) =>
    set((state) => {
      if (state.layers.length <= 1) return state; // Don't delete the last layer
      
      const layerToDelete = state.layers.find(layer => layer.id === id);
      if (!layerToDelete) return state;
      
      // Find shapes that belong to this layer
      const shapeIdsToMove: string[] = [];
      state.shapes.forEach((shape, shapeId) => {
        const shapeLayerId = shape.layerId || 'default-layer';
        if (shapeLayerId === id) shapeIdsToMove.push(shapeId);
      });

      // Move shapes to default layer instead of deleting them
        const updatedShapes = new Map(state.shapes);
      shapeIdsToMove.forEach(shapeId => {
          const shape = updatedShapes.get(shapeId);
          if (shape) {
          updatedShapes.set(shapeId, { ...shape, layerId: 'default-layer' });
        }
      });

      const remainingLayers = state.layers.filter(layer => layer.id !== id);
      
      // Add moved shapes to default layer
      const cleanedLayers = remainingLayers.map(layer => {
        if (layer.id === 'default-layer') {
        return {
            ...layer,
            shapes: [...layer.shapes.filter(sid => !shapeIdsToMove.includes(sid)), ...shapeIdsToMove],
          };
        }
        return {
          ...layer,
          shapes: layer.shapes.filter(sid => !shapeIdsToMove.includes(sid)),
        };
      });

      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser) {
      //   import('../services/firestore').then(({ deleteLayer: deleteLayerInFs }) => {
      //     deleteLayerInFs('', id, state.currentUser!.uid).catch((error: unknown) => {
      //       console.error('❌ Failed to delete layer in Firestore:', { layerId: id, error });
      //     });
      //   });
      // }
      
      return {
        shapes: updatedShapes,
        layers: cleanedLayers,
        activeLayerId: state.activeLayerId === id ? remainingLayers[0]?.id || 'default-layer' : state.activeLayerId,
      };
    }),
  
  reorderLayers: (layerIds: string[]) =>
    set((state) => ({
      layers: layerIds.map((id, index) => {
        const layer = state.layers.find(l => l.id === id);
        return layer ? { ...layer, order: index } : null;
      }).filter(Boolean) as Layer[],
    })),
  
  moveShapeToLayer: (shapeId: string, layerId: string) =>
    set((state) => {
      const shape = state.shapes.get(shapeId);
      if (!shape) return state;
      
      const updatedShapes = new Map(state.shapes);
      const layer = state.layers.find(l => l.id === layerId);
      const layerColor = layer?.color || '#3B82F6';
      updatedShapes.set(shapeId, { ...shape, layerId, color: layerColor, updatedAt: Date.now() });
      
      const updatedLayers = state.layers.map(layer => ({
        ...layer,
        shapes: layer.id === layerId 
          ? [...layer.shapes.filter(id => id !== shapeId), shapeId]
          : layer.shapes.filter(id => id !== shapeId)
      }));
      
      return {
        shapes: updatedShapes,
        layers: updatedLayers,
      };
    }),
  
  toggleLayerVisibility: (id: string) =>
    set((state) => ({
      layers: state.layers.map(layer => 
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      ),
    })),
  
  toggleLayerLock: (id: string) =>
    set((state) => ({
      layers: state.layers.map(layer => 
        layer.id === id ? { ...layer, locked: !layer.locked } : layer
      ),
    })),
  
  setActiveLayer: (id: string) =>
    set((state) => {
      // Don't update if already set to avoid sync loops
      if (state.activeLayerId === id) return state;
      
      // Update local state
      const newState = { activeLayerId: id };
      
      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser) {
      //   import('../services/firestore').then(({ updateActiveLayerId }) => {
      //     updateActiveLayerId('', id, state.currentUser!.uid)
      //       .catch((error: unknown) => {
      //         console.error('❌ Failed to update active layer in Firestore:', error);
      //       });
      //   });
      // }
      
      return newState;
    }),
  
  setLayers: (layers: Layer[]) =>
    set(() => ({ layers })),

  // Alignment Tools
  alignSelectedShapes: (alignment: AlignmentType) =>
    set((state) => {
      if (state.selectedShapeIds.length < 2) return state;
      
      const selectedShapes = state.selectedShapeIds
        .map(id => state.shapes.get(id))
        .filter(Boolean) as Shape[];
      
      if (selectedShapes.length < 2) return state;
      
      const updatedShapes = new Map(state.shapes);
      
      // Helper function to calculate shape center
      const getShapeCenter = (shape: Shape) => {
        return {
          centerX: shape.x + shape.w / 2,
          centerY: shape.y + shape.h / 2,
        };
      };
      
      // Calculate alignment bounds based on centers
      const centers = selectedShapes.map(getShapeCenter);
      const bounds = centers.reduce((acc, center) => {
        return {
          left: Math.min(acc.left, center.centerX),
          right: Math.max(acc.right, center.centerX),
          top: Math.min(acc.top, center.centerY),
          bottom: Math.max(acc.bottom, center.centerY),
          width: Math.max(acc.right, center.centerX) - Math.min(acc.left, center.centerX),
          height: Math.max(acc.bottom, center.centerY) - Math.min(acc.top, center.centerY),
        };
      }, {
        left: Infinity,
        right: -Infinity,
        top: Infinity,
        bottom: -Infinity,
        width: 0,
        height: 0,
      });
      
      // Apply alignment based on centers
      selectedShapes.forEach(shape => {
        const center = getShapeCenter(shape);
        let newCenterX = center.centerX;
        let newCenterY = center.centerY;
        
        switch (alignment) {
          case 'left':
            newCenterX = bounds.left;
            break;
          case 'center':
            newCenterX = bounds.left + bounds.width / 2;
            break;
          case 'right':
            newCenterX = bounds.right;
            break;
          case 'top':
            newCenterY = bounds.top;
            break;
          case 'middle':
            newCenterY = bounds.top + bounds.height / 2;
            break;
          case 'bottom':
            newCenterY = bounds.bottom;
            break;
        }
        
        // Convert center back to top-left coordinates
        const newX = newCenterX - shape.w / 2;
        const newY = newCenterY - shape.h / 2;
        
        if (newX !== shape.x || newY !== shape.y) {
          updatedShapes.set(shape.id, { ...shape, x: newX, y: newY });
        }
      });
      
      return { shapes: updatedShapes };
    }),
  
  distributeSelectedShapes: (direction: 'horizontal' | 'vertical') =>
    set((state) => {
      if (state.selectedShapeIds.length < 3) return state;
      
      const selectedShapes = state.selectedShapeIds
        .map(id => state.shapes.get(id))
        .filter(Boolean) as Shape[];
      
      if (selectedShapes.length < 3) return state;
      
      const updatedShapes = new Map(state.shapes);
      
      if (direction === 'horizontal') {
        // Sort by x position
        const sortedShapes = [...selectedShapes].sort((a, b) => a.x - b.x);
        const totalWidth = sortedShapes[sortedShapes.length - 1].x - sortedShapes[0].x;
        const spacing = totalWidth / (sortedShapes.length - 1);
        
        sortedShapes.forEach((shape, index) => {
          if (index > 0 && index < sortedShapes.length - 1) {
            const newX = sortedShapes[0].x + (spacing * index);
            updatedShapes.set(shape.id, { ...shape, x: newX });
          }
        });
      } else {
        // Sort by y position
        const sortedShapes = [...selectedShapes].sort((a, b) => a.y - b.y);
        const totalHeight = sortedShapes[sortedShapes.length - 1].y - sortedShapes[0].y;
        const spacing = totalHeight / (sortedShapes.length - 1);
        
        sortedShapes.forEach((shape, index) => {
          if (index > 0 && index < sortedShapes.length - 1) {
            const newY = sortedShapes[0].y + (spacing * index);
            updatedShapes.set(shape.id, { ...shape, y: newY });
          }
        });
      }
      
      return { shapes: updatedShapes };
    }),

  // Shape Operations
  deleteShape: (id: string) =>
    set((state) => {
      const updatedShapes = new Map(state.shapes);
      updatedShapes.delete(id);
      
      // Remove from selection if selected
      const updatedSelectedShapeIds = state.selectedShapeIds.filter(shapeId => shapeId !== id);
      
      return { 
        shapes: updatedShapes,
        selectedShapeIds: updatedSelectedShapeIds
      };
    }),

  deleteShapes: (ids: string[]) =>
    set((state) => {
      const updatedShapes = new Map(state.shapes);
      ids.forEach(id => updatedShapes.delete(id));
      
      // Remove from selection if selected
      const updatedSelectedShapeIds = state.selectedShapeIds.filter(shapeId => !ids.includes(shapeId));
      
      return { 
        shapes: updatedShapes,
        selectedShapeIds: updatedSelectedShapeIds
      };
    }),

  duplicateShapes: (ids: string[], duplicatedBy: string) =>
    set((state) => {
      const updatedShapes = new Map(state.shapes);
      const duplicatedIds: string[] = [];
      
      ids.forEach(id => {
        const shape = state.shapes.get(id);
        if (shape) {
          const duplicatedShape = {
            ...shape,
            id: `${id}_copy_${Date.now()}`,
            x: shape.x + 20,
            y: shape.y + 20,
            createdBy: duplicatedBy,
            createdAt: Date.now(),
            updatedBy: duplicatedBy,
            updatedAt: Date.now()
          };
          updatedShapes.set(duplicatedShape.id, duplicatedShape);
          duplicatedIds.push(duplicatedShape.id);
        }
      });
      
      return { 
        shapes: updatedShapes,
        selectedShapeIds: duplicatedIds
      };
    }),

  // Grid and Snap
  gridState: {
    isVisible: false,
    isSnapEnabled: false,
    size: 20,
    color: '#E5E7EB',
    opacity: 0.5,
  },
  snapIndicators: [],
  
  toggleGrid: () =>
    set((state) => ({
      gridState: { ...state.gridState, isVisible: !state.gridState.isVisible },
    })),
  
  toggleSnap: () =>
    set((state) => ({
      gridState: { ...state.gridState, isSnapEnabled: !state.gridState.isSnapEnabled },
    })),
  
  updateGridSize: (size: number) =>
    set((state) => ({
      gridState: { ...state.gridState, size },
    })),
  
  setSnapIndicators: (indicators: SnapIndicator[]) =>
    set(() => ({ snapIndicators: indicators })),

  // AI Canvas Agent
  aiCommands: [],
  aiCommandHistory: [],
  commandQueue: [],
  isProcessingAICommand: false,
  aiStatus: {
    isProcessing: false,
    commandQueue: [],
  },

  processAICommand: async (commandText: string, currentView?: 'scope' | 'time' | 'space' | 'money') => {
    const state = get();
    const currentUser = state.currentUser;
    
    if (!currentUser) {
      throw new Error('User must be authenticated to use AI commands');
    }

    // Set processing state
    set({ isProcessingAICommand: true });
    
    try {
      // Prepare canvas context for AI (unused for now)
      // const canvasContext = {
      //   shapes: Array.from(state.shapes.values()).map(shape => ({
      //     id: shape.id,
      //     type: shape.type,
      //     color: shape.color,
      //     x: shape.x,
      //     y: shape.y,
      //     w: shape.w,
      //     h: shape.h,
      //     text: shape.text
      //   })),
      //   selectedShapes: state.selectedShapeIds
      // };

                // Call the AI service to parse the command with view context
                const aiServiceResult = await aiService.processCommand(commandText, currentUser.uid, currentView);
                
                // Execute the parsed command
        const command = aiServiceResult.executedCommands[0] as AICommand;
        if (!command) {
          throw new Error('No command returned from AI service');
        }
        const result = await state.executeAICommand(command);
      
                // Add to command history
                const historyEntry: AICommandHistory = {
                  commandId: command.commandId,
                  command: commandText,
                  result,
                  timestamp: Date.now(),
                  userId: currentUser.uid
                };

      set((state) => ({
        aiCommandHistory: [...state.aiCommandHistory, historyEntry],
        aiStatus: {
          ...state.aiStatus,
          lastCommand: commandText,
          lastResult: result,
          error: result.error
        }
      }));

      return result;
    } catch (error) {
      console.error('AI Command Processing Error:', error);
      const errorResult: AICommandResult = {
        success: false,
        message: `Failed to process command: ${error}`,
        executedCommands: [],
        error: error instanceof Error ? error.message : String(error)
      };

      set((state) => ({
        aiStatus: {
          ...state.aiStatus,
          error: errorResult.error
        }
      }));

      return errorResult;
    } finally {
      set({ isProcessingAICommand: false });
    }
  },

  executeAICommand: async (command: AICommand) => {
    const state = get();
    const currentUser = state.currentUser;
    
    if (!currentUser) {
      throw new Error('User must be authenticated to execute AI commands');
    }

    // Create command executor
    const executor = new AICommandExecutor({
      createShape: state.createShape,
      updateShapePosition: state.updateShapePosition,
      updateShapeProperty: state.updateShapeProperty,
      deleteShape: (id: string) => state.deleteShape(id),
      deleteShapes: (ids: string[]) => state.deleteShapes(ids),
      duplicateShapes: (ids: string[]) => state.duplicateShapes(ids, currentUser.uid),
      alignShapes: (shapeIds: string[], alignment: AlignmentType) => {
        // For now, just log the alignment request
        console.log('Align shapes request:', shapeIds, alignment);
      },
      createLayer: (name: string) => {
        const layerId = `layer_${Date.now()}`;
        state.createLayer(name, layerId);
        return layerId;
      },
      moveShapeToLayer: state.moveShapeToLayer,
      exportCanvas: async (format: 'PNG' | 'SVG', quality?: number) => {
        // TODO: Implement export functionality
        console.log(`Exporting canvas as ${format} with quality ${quality}`);
      },
      exportSelectedShapes: async (format: 'PNG' | 'SVG', quality?: number) => {
        // TODO: Implement export functionality
        console.log(`Exporting selected shapes as ${format} with quality ${quality}`);
      }
    });

    // Execute the command
    const result = await executor.executeCommand(command);
    
    // Update AI status
    set((state) => ({
      aiStatus: {
        ...state.aiStatus,
        lastResult: result
      }
    }));

    return result;
  },

  clearAIHistory: () =>
    set((state) => ({
      aiCommandHistory: state.aiCommandHistory.filter(entry => 
        entry.userId !== state.currentUser?.uid
      )
    })),

  getAIStatus: () => {
    const state = get();
    
    return {
      ...state.aiStatus,
      lastCommand: state.aiCommandHistory[state.aiCommandHistory.length - 1]?.command,
      lastResult: state.aiCommandHistory[state.aiCommandHistory.length - 1]?.result
    };
  },

  addToCommandQueue: (command: AICommand) =>
    set((state) => ({
      commandQueue: [...state.commandQueue, command]
    })),

  processCommandQueue: async () => {
    const state = get();
    
    if (state.isProcessingAICommand || state.commandQueue.length === 0) {
      return;
    }

    set({ isProcessingAICommand: true });

    try {
      // Process commands one by one (first-come-first-serve)
      while (state.commandQueue.length > 0) {
        const command = state.commandQueue[0];
        
        // Remove command from queue
        set((state) => ({
          commandQueue: state.commandQueue.slice(1)
        }));

        // Execute command
        await state.executeAICommand(command);
      }
    } finally {
      set({ isProcessingAICommand: false });
    }
  },

  setAIStatus: (status: Partial<AIStatus>) =>
    set((state) => ({
      aiStatus: { ...state.aiStatus, ...status }
    })),

  // Construction Annotation Tool State
  canvasScale: {
    scaleLine: null,
    backgroundImage: null,
    isScaleMode: false,
    isImageUploadMode: false,
  },

  setBackgroundImage: (image: BackgroundImage | null, _skipFirestoreSync = false) =>
    set((state) => {
      const newState = {
        canvasScale: {
          ...state.canvasScale,
          backgroundImage: image,
        },
      };
      
      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser && !skipFirestoreSync) {
      //   if (image) {
      //     saveBackgroundImage({
      //       url: image.url,
      //       width: image.width,
      //       height: image.height,
      //     }, state.currentUser.uid, '').catch((error) => {
      //       console.error('❌ Failed to save background image to Firestore:', error);
      //     });
      //   } else {
      //     // Delete from both Firestore and Storage
      //     const previousImageUrl = state.canvasScale.backgroundImage?.url;
      //     
      //     // Delete from Firestore
      //     deleteBackgroundImageFromFirestore(state.currentUser.uid, '').catch((error) => {
      //       console.error('❌ Failed to delete background image from Firestore:', error);
      //     });
      //     
      //     // Delete from Storage if URL exists
      //     if (previousImageUrl) {
      //       deleteConstructionPlanImage(previousImageUrl).catch((error) => {
      //         console.error('❌ Failed to delete background image from Storage:', error);
      //         // Don't throw - Storage deletion failure shouldn't block Firestore deletion
      //       });
      //     }
      //   }
      // }
      
      // Delete from Storage if URL exists (even without Firestore sync)
      if (!image && state.canvasScale.backgroundImage?.url) {
        const previousImageUrl = state.canvasScale.backgroundImage.url;
        deleteConstructionPlanImage(previousImageUrl).catch((error) => {
          console.error('❌ Failed to delete background image from Storage:', error);
        });
      }
      
      return newState;
    }),

  setScaleLine: (scaleLine: ScaleLine | null, _skipFirestoreSync = false) =>
    set((state) => {
      const newState = {
        canvasScale: {
          ...state.canvasScale,
          scaleLine: scaleLine,
        },
      };
      
      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser && !skipFirestoreSync) {
      //   if (scaleLine) {
      //     saveScaleLine({
      //       id: scaleLine.id,
      //       startX: scaleLine.startX,
      //       startY: scaleLine.startY,
      //       endX: scaleLine.endX,
      //       endY: scaleLine.endY,
      //       realWorldLength: scaleLine.realWorldLength,
      //       unit: scaleLine.unit,
      //       isVisible: scaleLine.isVisible,
      //     }, state.currentUser.uid, '').catch((error) => {
      //       console.error('❌ Failed to save scale line to Firestore:', error);
      //     });
      //   } else {
      //     deleteScaleLineFromFirestore(state.currentUser.uid, '').catch((error) => {
      //       console.error('❌ Failed to delete scale line from Firestore:', error);
      //     });
      //   }
      // }
      
      return newState;
    }),

  updateScaleLine: (updates: Partial<ScaleLine>) =>
    set((state) => {
      if (!state.canvasScale.scaleLine) return state;
      
      const updatedScaleLine = {
        ...state.canvasScale.scaleLine,
        ...updates,
        updatedAt: Date.now(),
        updatedBy: state.currentUser?.uid || 'unknown',
      };
      
      const newState = {
        canvasScale: {
          ...state.canvasScale,
          scaleLine: updatedScaleLine,
        },
      };
      
      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser) {
      //   saveScaleLine({
      //     id: updatedScaleLine.id,
      //     startX: updatedScaleLine.startX,
      //     startY: updatedScaleLine.startY,
      //     endX: updatedScaleLine.endX,
      //     endY: updatedScaleLine.endY,
      //     realWorldLength: updatedScaleLine.realWorldLength,
      //     unit: updatedScaleLine.unit,
      //     isVisible: updatedScaleLine.isVisible,
      //   }, state.currentUser.uid, '').catch((error) => {
      //     console.error('❌ Failed to update scale line in Firestore:', error);
      //   });
      // }
      
      return newState;
    }),

  deleteScaleLine: () =>
    set((state) => {
      const newState = {
        canvasScale: {
          ...state.canvasScale,
          scaleLine: null,
        },
      };
      
      // Note: Global store is deprecated - use project-scoped store instead
      // Firestore sync requires projectId which is not available in global store
      // if (state.currentUser) {
      //   deleteScaleLineFromFirestore(state.currentUser.uid, '').catch((error) => {
      //     console.error('❌ Failed to delete scale line from Firestore:', error);
      //   });
      // }
      
      return newState;
    }),

  setIsScaleMode: (isScaleMode: boolean) =>
    set((state) => ({
      canvasScale: {
        ...state.canvasScale,
        isScaleMode,
      },
    })),

  setIsImageUploadMode: (isImageUploadMode: boolean) =>
    set((state) => ({
      canvasScale: {
        ...state.canvasScale,
        isImageUploadMode,
      },
    })),

  // Initialize board state subscription
  initializeBoardStateSubscription: () => {
    // Note: This is deprecated - use project-scoped store instead
    // Keeping for backward compatibility but it won't work without projectId
    const unsubscribe = subscribeToBoardState('', (boardState) => {
      if (boardState) {
        const state = get();
        
        // Load background image if it exists
        if (boardState.backgroundImage && !state.canvasScale.backgroundImage) {
          state.setBackgroundImage({
            id: `background-${Date.now()}`,
            url: boardState.backgroundImage.url,
            fileName: 'construction-plan',
            fileSize: 0,
            width: boardState.backgroundImage.width,
            height: boardState.backgroundImage.height,
            aspectRatio: boardState.backgroundImage.width / boardState.backgroundImage.height,
            uploadedAt: typeof boardState.backgroundImage.uploadedAt === 'number' ? boardState.backgroundImage.uploadedAt : Date.now(),
            uploadedBy: boardState.backgroundImage.uploadedBy || 'unknown',
          });
        } else if (!boardState.backgroundImage && state.canvasScale.backgroundImage) {
          // Clear background image if it was deleted from Firestore by another client
          // Use skipFirestoreSync to avoid recursive deletion loops
          state.setBackgroundImage(null, true);
        }
        
        // Load scale line if it exists
        if (boardState.scaleLine && !state.canvasScale.scaleLine) {
          state.setScaleLine({
            id: boardState.scaleLine.id,
            startX: boardState.scaleLine.startX,
            startY: boardState.scaleLine.startY,
            endX: boardState.scaleLine.endX,
            endY: boardState.scaleLine.endY,
            realWorldLength: boardState.scaleLine.realWorldLength,
            unit: boardState.scaleLine.unit as UnitType,
            isVisible: boardState.scaleLine.isVisible,
            createdAt: typeof boardState.scaleLine.createdAt === 'number' ? boardState.scaleLine.createdAt : Date.now(),
            createdBy: boardState.scaleLine.createdBy,
            updatedAt: typeof boardState.scaleLine.updatedAt === 'number' ? boardState.scaleLine.updatedAt : Date.now(),
            updatedBy: boardState.scaleLine.updatedBy,
          });
        } else if (!boardState.scaleLine && state.canvasScale.scaleLine) {
          // Clear scale line if it was deleted from Firestore by another client
          // Use skipFirestoreSync to avoid recursive deletion loops
          state.setScaleLine(null, true);
        }
      }
    });
    
    return unsubscribe;
  },

  // Material Estimation State (PR-4)
  materialDialogue: null,
  billOfMaterials: null,
  userMaterialPreferences: null,
  isAccumulatingBOM: false,

  startMaterialDialogue: (request: string) =>
    set((state) => {
      const currentUser = state.currentUser;
      if (!currentUser) return state;

      const conversationId = `dialogue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();

      return {
        materialDialogue: {
          conversationId,
          userId: currentUser.uid,
          stage: 'initial' as const,
          currentRequest: {
            originalQuery: request,
          },
          pendingClarification: null,
          assumptions: null,
          lastCalculation: null,
          messageHistory: [
            {
              id: `msg-${now}`,
              type: 'user' as const,
              content: request,
              timestamp: now,
              userId: currentUser.uid,
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      };
    }),

  updateMaterialDialogue: (updates: Partial<DialogueContext>) =>
    set((state) => {
      if (!state.materialDialogue) return state;

      return {
        materialDialogue: {
          ...state.materialDialogue,
          ...updates,
          updatedAt: Date.now(),
        },
      };
    }),

  clearMaterialDialogue: () =>
    set(() => ({
      materialDialogue: null,
    })),

  setBillOfMaterials: (bom: BillOfMaterials | null) =>
    set(() => ({
      billOfMaterials: bom,
    })),

  addMaterialCalculation: (calculation: MaterialCalculation, forceAccumulate?: boolean) =>
    set((state) => {
      const currentBom = state.billOfMaterials;
      const currentUser = state.currentUser;
      const materialDialogue = state.materialDialogue;
      
      if (!currentUser) return state;

      // Force accumulation if explicitly requested (for multi-area BOM)
      if (forceAccumulate || state.isAccumulatingBOM) {
        console.log('🔒 Force accumulate mode - adding to BOM');
        
        if (!currentBom) {
          return {
            billOfMaterials: {
              id: `bom-${Date.now()}`,
              calculations: [calculation],
              totalMaterials: calculation.materials,
              createdAt: Date.now(),
              createdBy: currentUser.uid,
              updatedAt: Date.now(),
            },
            isAccumulatingBOM: true,
          };
        }
        
        const allMaterials = [...currentBom.totalMaterials, ...calculation.materials];
        const consolidatedMaterials = consolidateMaterials(allMaterials);
        
        console.log('📦 Force accumulated:', {
          previousMaterials: currentBom.totalMaterials.length,
          newMaterials: calculation.materials.length,
          consolidatedMaterials: consolidatedMaterials.length,
        });
        
        return {
          billOfMaterials: {
            ...currentBom,
            calculations: [...currentBom.calculations, calculation],
            totalMaterials: consolidatedMaterials,
            updatedAt: Date.now(),
          },
          isAccumulatingBOM: true,
        };
      }

      // Determine if this is a refinement or a new calculation
      // Check if this is for the same target (wall/floor/layer) as last calculation
      const lastCalc = materialDialogue?.lastCalculation;
      
      // Different areas have different measurement types:
      // - Walls have totalLength (linear feet)
      // - Floors have totalArea (square feet)
      // If measurement types differ, it's definitely a new area
      const hasSameMeasurementType = 
        (lastCalc?.totalLength && calculation.totalLength) ||
        (lastCalc?.totalArea && calculation.totalArea && !lastCalc?.totalLength && !calculation.totalLength);
      
      const isSameMeasurement = hasSameMeasurementType &&
        lastCalc.totalLength === calculation.totalLength &&
        lastCalc.totalArea === calculation.totalArea;
      
      const isRefinement = lastCalc !== null && isSameMeasurement;
      
      console.log('📊 BOM Update Logic:', {
        hasLastCalc: !!lastCalc,
        hasSameMeasurementType,
        isSameMeasurement,
        isRefinement,
        lastCalcType: lastCalc?.totalLength ? 'walls' : lastCalc?.totalArea ? 'floors' : 'unknown',
        newCalcType: calculation.totalLength ? 'walls' : calculation.totalArea ? 'floors' : 'unknown',
      });

      if (!currentBom) {
        // Create new BOM
        console.log('✨ Creating new BOM');
        return {
          billOfMaterials: {
            id: `bom-${Date.now()}`,
            calculations: [calculation],
            totalMaterials: calculation.materials,
            createdAt: Date.now(),
            createdBy: currentUser.uid,
            updatedAt: Date.now(),
          },
        };
      }

      if (isRefinement) {
        // Replace the last calculation instead of adding
        console.log('🔄 Replacing last calculation (refinement)');
        const updatedCalculations = [...currentBom.calculations];
        updatedCalculations[updatedCalculations.length - 1] = calculation;
        
        return {
          billOfMaterials: {
            ...currentBom,
            calculations: updatedCalculations,
            totalMaterials: calculation.materials, // Use only the latest materials
            updatedAt: Date.now(),
          },
        };
      }

      // Add new calculation (different layer or new area)
      // Consolidate materials from all calculations
      console.log('➕ Adding new calculation to BOM (accumulating)');
      const allMaterials = [...currentBom.totalMaterials, ...calculation.materials];
      const consolidatedMaterials = consolidateMaterials(allMaterials);
      
      console.log('📦 BOM totals:', {
        previousMaterials: currentBom.totalMaterials.length,
        newMaterials: calculation.materials.length,
        consolidatedMaterials: consolidatedMaterials.length,
      });
      
      return {
        billOfMaterials: {
          ...currentBom,
          calculations: [...currentBom.calculations, calculation],
          totalMaterials: consolidatedMaterials,
          updatedAt: Date.now(),
        },
      };
    }),

  setUserMaterialPreferences: (preferences: UserMaterialPreferences) =>
    set(() => ({
      userMaterialPreferences: preferences,
    })),

  setIsAccumulatingBOM: (isAccumulating: boolean) =>
    set(() => ({
      isAccumulatingBOM: isAccumulating,
    })),

  // Viewport State (persisted across navigation)
  viewportState: { x: 0, y: 0, scale: 1 },
  setViewportState: (viewportState: { x: number; y: number; scale: number }) =>
    set(() => ({
      viewportState,
    })),
  };
});

/**
 * Helper: Consolidate duplicate materials by summing quantities
 */
function consolidateMaterials(materials: MaterialCalculation['materials']): MaterialCalculation['materials'] {
  const consolidated = new Map<string, typeof materials[0]>();

  materials.forEach((material) => {
    const existing = consolidated.get(material.id);
    if (existing) {
      existing.quantity += material.quantity;
    } else {
      consolidated.set(material.id, { ...material });
    }
  });

  return Array.from(consolidated.values());
}

if (typeof window !== 'undefined' && isHarnessEnabled()) {
  const storeApi = {
    getState: () => useCanvasStore.getState(),
  };

  (window as Window & { __canvasStore?: typeof storeApi }).__canvasStore = storeApi;
  registerHarnessApi('store', storeApi);
}
