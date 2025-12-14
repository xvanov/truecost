/**
 * Project-Scoped Canvas Store Factory
 * Creates isolated Zustand stores per project to ensure complete project isolation
 */

import { create, useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import type { Shape, Lock, Presence, User, SelectionBox, TransformControls, CanvasAction, CreateActionData, UpdateActionData, MoveActionData, BulkDuplicateActionData, BulkMoveActionData, BulkRotateActionData, Layer, AlignmentType, SnapIndicator, AICommand, AIStatus, BackgroundImage, ScaleLine, UnitType, DialogueContext, DialogueStage, BillOfMaterials, MaterialCalculation, UserMaterialPreferences } from '../types';
import type { ConnectionState } from '../services/offline';
import { isHarnessEnabled, registerHarnessApi } from '../utils/harness';
import { createHistoryService } from '../services/historyService';
import { saveBackgroundImage, saveScaleLine, deleteScaleLineFromFirestore, deleteBackgroundImageFromFirestore, subscribeToBoardState, type FirestoreBoardState } from '../services/firestore';
import { AIService } from '../services/aiService';
import { AICommandExecutor } from '../services/aiCommandExecutor';

// Import the store creation logic from the original canvasStore
// We'll extract the store factory function
import type { CanvasState } from './canvasStore';
import { useCanvasStore } from './canvasStore';
import { useMemo } from 'react';

/**
 * Registry to manage project-scoped stores
 */
const projectStores = new Map<string, StoreApi<CanvasState>>();

/**
 * Get the current user from the global store as a fallback
 * This is used when the project-scoped store doesn't have the user yet
 */
const getGlobalStoreCurrentUser = (): User | null => {
  try {
    // Access the global store API - useCanvasStore is a hook, but we can access its internal state
    const globalStoreApi = (useCanvasStore as unknown as StoreApi<CanvasState>);
    const globalState = globalStoreApi.getState();
    const user = globalState?.currentUser || null;
    if (user) {
      console.log('📋 Retrieved currentUser from global store fallback:', { userId: user.uid });
    }
    return user;
  } catch (e) {
    console.warn('⚠️ Failed to get currentUser from global store:', e);
    return null;
  }
};

/**
 * Reference counts to track store usage
 * When count reaches 0, we can optionally clean up the store
 */
const storeRefCounts = new Map<string, number>();

/**
 * Default state for when projectId is undefined
 * Created once and reused to prevent infinite loops
 */
let defaultStateCache: CanvasState | null = null;

function getDefaultState(): CanvasState {
  if (defaultStateCache) {
    return defaultStateCache;
  }
  
  defaultStateCache = {
    shapes: new Map(),
    selectedShapeIds: [],
    layers: [],
    activeLayerId: 'default-layer',
    selectedShapeId: null,
    locks: new Map(),
    users: new Map(),
    currentUser: null,
    connectionState: {
      isOnline: navigator.onLine,
      isFirestoreOnline: true,
      isRTDBOnline: true,
      lastOnlineTime: null,
    },
    queuedUpdatesCount: 0,
    transformControls: {
      isVisible: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      resizeHandles: [],
    },
    selectionBox: null,
    history: {
      past: [],
      present: null,
      future: [],
      maxHistorySize: 50,
    },
    historyService: createHistoryService(50),
    gridState: {
      isVisible: false,
      size: 20,
      isSnapEnabled: false,
      color: '#CCCCCC',
      opacity: 0.5,
    },
    snapIndicators: [],
    aiCommands: [],
    aiStatus: {
      isProcessing: false,
      commandQueue: [],
      error: undefined,
    },
    aiCommandHistory: [],
    commandQueue: [],
    isProcessingAICommand: false,
    canvasScale: {
      scaleLine: null,
      backgroundImage: null,
      isScaleMode: false,
      isImageUploadMode: false,
    },
    materialDialogue: null,
    billOfMaterials: null,
    userMaterialPreferences: null,
    isAccumulatingBOM: false,
    // Viewport State (persisted across navigation)
    viewportState: { x: 0, y: 0, scale: 1 },
    setViewportState: () => {},
    // Methods - these won't be called when projectId is undefined
    createShape: () => {},
    updateShapePosition: () => {},
    updateShapeProperty: () => {},
    setShapes: () => {},
    setShapesFromMap: () => {},
    pushAction: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: () => false,
    canRedo: () => false,
    clearHistory: () => {},
    addToSelection: () => {},
    removeFromSelection: () => {},
    clearSelection: () => {},
    selectShapes: () => {},
    deleteSelectedShapes: () => {},
    duplicateSelectedShapes: () => {},
    moveSelectedShapes: () => {},
    rotateSelectedShapes: () => {},
    updateTransformControls: () => {},
    hideTransformControls: () => {},
    setSelectionBox: () => {},
    selectShape: () => {},
    deselectShape: () => {},
    lockShape: () => {},
    unlockShape: () => {},
    setLocks: () => {},
    updatePresence: () => {},
    removeUser: () => {},
    setUsers: () => {},
    setCurrentUser: () => {},
    setConnectionState: () => {},
    setQueuedUpdatesCount: () => {},
    createLayer: () => {},
    updateLayer: () => {},
    deleteLayer: () => {},
    reorderLayers: () => {},
    moveShapeToLayer: () => {},
    toggleLayerVisibility: () => {},
    toggleLayerLock: () => {},
    setActiveLayer: () => {},
    setLayers: () => {},
    alignSelectedShapes: () => {},
    distributeSelectedShapes: () => {},
    deleteShape: () => {},
    deleteShapes: () => {},
    duplicateShapes: () => {},
    toggleGrid: () => {},
    toggleSnap: () => {},
    updateGridSize: () => {},
    setSnapIndicators: () => {},
    processAICommand: async () => ({ success: false, message: 'No projectId', executedCommands: [] }),
    executeAICommand: async () => ({ success: false, message: 'No projectId', executedCommands: [] }),
    clearAIHistory: () => {},
    getAIStatus: () => ({
      isProcessing: false,
      commandQueue: [],
      error: undefined,
    }),
    addToCommandQueue: () => {},
    processCommandQueue: async () => {},
    setAIStatus: () => {},
    setBackgroundImage: () => {},
    setScaleLine: () => {},
    updateScaleLine: () => {},
    deleteScaleLine: () => {},
    setIsScaleMode: () => {},
    setIsImageUploadMode: () => {},
    initializeBoardStateSubscription: () => () => {},
    startMaterialDialogue: () => {},
    updateMaterialDialogue: () => {},
    clearMaterialDialogue: () => {},
    setBillOfMaterials: () => {},
    addMaterialCalculation: () => {},
    setUserMaterialPreferences: () => {},
    setIsAccumulatingBOM: () => {},
  };
  
  return defaultStateCache;
}

/**
 * Create a project-scoped canvas store
 * Each project gets its own isolated store instance
 */
function createProjectCanvasStore(projectId: string): StoreApi<CanvasState> {
  // Initialize history service
  const historyService = createHistoryService(50);
  
  // Initialize AI service
  const aiService = new AIService();
  
  const store = create<CanvasState>((set, get) => {
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
            
            // Note: Undo/redo operations sync through useShapes hook which has projectId
            console.warn('Skipping Firestore sync for undo/redo - shape will sync through useShapes hook');
          }
          break;
          
        case 'DELETE':
          if (action.shapeId) {
            const newShapes = new Map(state.shapes);
            newShapes.delete(action.shapeId);
            set({ shapes: newShapes });
            
            // Note: Undo/redo operations sync through useShapes hook which has projectId
            console.warn('Skipping Firestore sync for undo/redo - deletion will sync through useShapes hook');
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
            set({ shapes: newShapes });
          }
          break;
          
        case 'BULK_DUPLICATE':
          if (action.shapeIds && action.data) {
            const newShapes = new Map(state.shapes);
            const duplicateData = action.data as BulkDuplicateActionData;
            duplicateData.duplicatedShapes.forEach(shape => {
              newShapes.set(shape.id, shape);
            });
            set({ shapes: newShapes });
          }
          break;
          
        case 'BULK_MOVE':
          if (action.shapeIds && action.data) {
            const newShapes = new Map(state.shapes);
            const moveData = action.data as BulkMoveActionData;
            if ('deltaX' in moveData && 'deltaY' in moveData) {
              action.shapeIds.forEach(id => {
                const shape = newShapes.get(id);
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
          }
          break;
          
        case 'BULK_ROTATE':
          if (action.shapeIds && action.data) {
            const newShapes = new Map(state.shapes);
            const rotateData = action.data as BulkRotateActionData;
            if ('angle' in rotateData) {
              action.shapeIds.forEach(id => {
                const shape = newShapes.get(id);
                if (shape) {
                  newShapes.set(id, {
                    ...shape,
                    rotation: (shape.rotation || 0) + rotateData.angle,
                    updatedAt: Date.now(),
                    updatedBy: currentUser.uid,
                    clientUpdatedAt: Date.now(),
                  });
                }
              });
              set({ shapes: newShapes });
            }
          }
          break;
      }
    });

    return {
      // Initial state - all project-scoped stores start empty
      shapes: new Map<string, Shape>(),
      
      createShape: (shape: Shape) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          newShapes.set(shape.id, shape);
          return { shapes: newShapes };
        }),
      
      updateShapePosition: (id: string, x: number, y: number, updatedBy: string, clientUpdatedAt: number) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          const shape = newShapes.get(id);
          if (shape) {
            newShapes.set(id, {
              ...shape,
              x,
              y,
              updatedBy,
              updatedAt: Date.now(),
              clientUpdatedAt,
            });
          }
          return { shapes: newShapes };
        }),
      
      updateShapeProperty: (id: string, property: keyof Shape, value: unknown, updatedBy: string, clientUpdatedAt: number) =>
        set((state) => {
          const newShapes = new Map(state.shapes);
          const shape = newShapes.get(id);
          if (shape) {
            newShapes.set(id, {
              ...shape,
              [property]: value,
              updatedBy,
              updatedAt: Date.now(),
              clientUpdatedAt,
            });
          }
          return { shapes: newShapes };
        }),
      
      setShapes: (shapes: Shape[]) =>
        set(() => ({
          shapes: new Map(shapes.map(s => [s.id, s])),
        })),
      
      setShapesFromMap: (shapes: Map<string, Shape>) =>
        set(() => ({
          shapes: new Map(shapes),
        })),
      
      // History
      history: {
        past: [],
        present: null,
        future: [],
        maxHistorySize: 50,
      },
      historyService,
      pushAction: (action: CanvasAction) => {
        historyService.pushAction(action);
      },
      undo: () => {
        historyService.undo();
      },
      redo: () => {
        historyService.redo();
      },
      canUndo: () => historyService.canUndo(),
      canRedo: () => historyService.canRedo(),
      clearHistory: () => historyService.clearHistory(),
      
      // Multi-Select
      selectedShapeIds: [],
      addToSelection: (id: string) =>
        set((state) => ({
          selectedShapeIds: state.selectedShapeIds.includes(id)
            ? state.selectedShapeIds
            : [...state.selectedShapeIds, id],
        })),
      removeFromSelection: (id: string) =>
        set((state) => ({
          selectedShapeIds: state.selectedShapeIds.filter(sid => sid !== id),
        })),
      clearSelection: () => set({ selectedShapeIds: [] }),
      selectShapes: (ids: string[]) => set({ selectedShapeIds: ids }),
      
      // Bulk Operations
      deleteSelectedShapes: () => {
        const state = get();
        const idsToDelete = state.selectedShapeIds;
        const newShapes = new Map(state.shapes);
        idsToDelete.forEach(id => newShapes.delete(id));
        set({ shapes: newShapes, selectedShapeIds: [] });
      },
      duplicateSelectedShapes: () => {
        // Handled by useShapes hook
      },
      moveSelectedShapes: (deltaX: number, deltaY: number) =>
        set((state) => {
          const newShapes = new Map(state.shapes);
          state.selectedShapeIds.forEach(id => {
            const shape = newShapes.get(id);
            if (shape) {
              newShapes.set(id, {
                ...shape,
                x: shape.x + deltaX,
                y: shape.y + deltaY,
                updatedAt: Date.now(),
                updatedBy: state.currentUser?.uid || '',
                clientUpdatedAt: Date.now(),
              });
            }
          });
          return { shapes: newShapes };
        }),
      rotateSelectedShapes: (angle: number) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          state.selectedShapeIds.forEach((id: string) => {
            const shape = newShapes.get(id);
            if (shape) {
              newShapes.set(id, {
                ...shape,
                rotation: ((shape.rotation as number | undefined) || 0) + angle,
                updatedAt: Date.now(),
                updatedBy: state.currentUser?.uid || '',
                clientUpdatedAt: Date.now(),
              });
            }
          });
          return { shapes: newShapes };
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
        set((state: CanvasState) => ({
          transformControls: { ...state.transformControls, ...controls },
        })),
      hideTransformControls: () =>
        set((state: CanvasState) => ({
          transformControls: { ...state.transformControls, isVisible: false },
        })),
      
      // Selection Box
      selectionBox: null,
      setSelectionBox: (box: SelectionBox | null) => set({ selectionBox: box }),
      
      // Legacy single selection
      selectedShapeId: null,
      selectShape: (id: string) => set({ selectedShapeId: id }),
      deselectShape: () => set({ selectedShapeId: null }),
      
      // Locks
      locks: new Map<string, Lock>(),
      lockShape: (shapeId: string, userId: string, userName: string) =>
        set((state: CanvasState) => {
          const newLocks = new Map(state.locks);
          newLocks.set(shapeId, {
            userId,
            userName,
            lockedAt: Date.now(),
          });
          return { locks: newLocks };
        }),
      unlockShape: (shapeId: string) =>
        set((state: CanvasState) => {
          const newLocks = new Map(state.locks);
          newLocks.delete(shapeId);
          return { locks: newLocks };
        }),
      setLocks: (locks: Array<{ shapeId: string; lock: Lock }>) =>
        set(() => ({
          locks: new Map(locks.map(({ shapeId, lock }) => [shapeId, lock])),
        })),
      
      // Presence
      users: new Map<string, Presence>(),
      updatePresence: (userId: string, data: Presence) =>
        set((state: CanvasState) => {
          const newUsers = new Map(state.users);
          newUsers.set(userId, data);
          return { users: newUsers };
        }),
      removeUser: (userId: string) =>
        set((state: CanvasState) => {
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
        set((state: CanvasState) => {
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
        set((state: CanvasState) => {
          const isColorChange = Object.prototype.hasOwnProperty.call(updates, 'color');
          const updatedLayers = state.layers.map((layer: Layer) =>
            layer.id === id ? { ...layer, ...updates } : layer
          );
          
          // If color changed, update all shapes in that layer
          if (isColorChange && updates.color) {
            const newShapes = new Map(state.shapes);
            state.shapes.forEach((shape: Shape, shapeId: string) => {
              if (shape.layerId === id) {
                newShapes.set(shapeId, { ...shape, color: updates.color! });
              }
            });
            return { layers: updatedLayers, shapes: newShapes };
          }
          
          return { layers: updatedLayers };
        }),
      deleteLayer: (id: string) =>
        set((state: CanvasState) => ({
          layers: state.layers.filter((l: Layer) => l.id !== id),
        })),
      reorderLayers: (layerIds: string[]) =>
        set((state: CanvasState) => {
          const layerMap = new Map(state.layers.map((l: Layer) => [l.id, l]));
          const reorderedLayers = layerIds
            .map((id, index) => {
              const layer = layerMap.get(id);
              return layer ? { ...layer, order: index } : null;
            })
            .filter((l): l is Layer => l !== null);
          
          return { layers: reorderedLayers };
        }),
      moveShapeToLayer: (shapeId: string, layerId: string) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          const shape = newShapes.get(shapeId);
          if (shape) {
            newShapes.set(shapeId, { ...shape, layerId });
          }
          return { shapes: newShapes };
        }),
      toggleLayerVisibility: (id: string) =>
        set((state: CanvasState) => ({
          layers: state.layers.map((l: Layer) => l.id === id ? { ...l, visible: !l.visible } : l),
        })),
      toggleLayerLock: (id: string) =>
        set((state: CanvasState) => ({
          layers: state.layers.map((l: Layer) => l.id === id ? { ...l, locked: !l.locked } : l),
        })),
      setActiveLayer: (id: string, _projectId?: string) => {
        // Note: projectId is now always the same as the store's project
        set({ activeLayerId: id });
      },
      setLayers: (layers: Layer[]) => set({ layers }),
      
      // Alignment Tools
      alignSelectedShapes: (_alignment: AlignmentType) => {
        // Implementation handled by components
      },
      distributeSelectedShapes: (_direction: 'horizontal' | 'vertical') => {
        // Implementation handled by components
      },
      
      // Shape Operations
      deleteShape: (id: string) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          newShapes.delete(id);
          return { shapes: newShapes };
        }),
      deleteShapes: (ids: string[]) =>
        set((state: CanvasState) => {
          const newShapes = new Map(state.shapes);
          ids.forEach(id => newShapes.delete(id));
          return { shapes: newShapes };
        }),
      duplicateShapes: (_ids: string[], _duplicatedBy: string) => {
        // Handled by useShapes hook
      },
      
      // Grid and Snap
      gridState: {
        isVisible: false,
        size: 20,
        isSnapEnabled: false,
        color: '#CCCCCC',
        opacity: 0.5,
      },
      snapIndicators: [],
      toggleGrid: () =>
        set((state: CanvasState) => ({
          gridState: { ...state.gridState, isVisible: !state.gridState.isVisible },
        })),
      toggleSnap: () =>
        set((state: CanvasState) => ({
          gridState: { ...state.gridState, isSnapEnabled: !state.gridState.isSnapEnabled },
        })),
      updateGridSize: (size: number) =>
        set((state: CanvasState) => ({
          gridState: { ...state.gridState, size },
        })),
      setSnapIndicators: (indicators: SnapIndicator[]) => set({ snapIndicators: indicators }),
      
      // AI Canvas Agent
      aiCommands: [],
    aiStatus: {
      isProcessing: false,
      commandQueue: [],
      error: undefined,
    },
      aiCommandHistory: [],
      commandQueue: [],
      isProcessingAICommand: false,
      processAICommand: async (commandText: string, currentView?: 'scope' | 'time' | 'space' | 'money') => {
        const state = get();
        if (state.isProcessingAICommand) {
          return { success: false, message: 'Another AI command is already processing', executedCommands: [] };
        }
        
        set({ isProcessingAICommand: true });
        try {
          const userId = state.currentUser?.uid || '';
          const viewContext = currentView || 'space';
          const result = await aiService.processCommand(commandText, userId, viewContext);
          return result;
        } finally {
          set({ isProcessingAICommand: false });
        }
      },
      executeAICommand: async (command: AICommand) => {
        const state = get();
        const executor = new AICommandExecutor({
          createShape: state.createShape,
          updateShapePosition: state.updateShapePosition,
          updateShapeProperty: state.updateShapeProperty,
          deleteShape: state.deleteShape,
          deleteShapes: state.deleteShapes,
          duplicateShapes: state.duplicateShapes,
          alignShapes: () => {}, // Not implemented in store
          createLayer: (name: string) => {
            const layerId = `layer_${Date.now()}`;
            state.createLayer(name, layerId);
            return layerId;
          },
          moveShapeToLayer: state.moveShapeToLayer,
          exportCanvas: async () => {}, // Not implemented in store
          exportSelectedShapes: async () => {}, // Not implemented in store
        });
        return executor.executeCommand(command);
      },
      clearAIHistory: () => set({ aiCommandHistory: [] }),
      getAIStatus: () => get().aiStatus,
      addToCommandQueue: (command: AICommand) =>
        set((state: CanvasState) => ({
          commandQueue: [...state.commandQueue, command],
        })),
      processCommandQueue: async () => {
        const state = get();
        while (state.commandQueue.length > 0 && !state.isProcessingAICommand) {
          const command = state.commandQueue[0];
          set((s: CanvasState) => ({ commandQueue: s.commandQueue.slice(1) }));
          await get().executeAICommand(command);
        }
      },
      setAIStatus: (status: Partial<AIStatus>) =>
        set((state: CanvasState) => ({
          aiStatus: { ...state.aiStatus, ...status },
        })),
      
      // Construction Annotation Tool State
      canvasScale: {
        scaleLine: null,
        backgroundImage: null,
        isScaleMode: false,
        isImageUploadMode: false,
      },
      setBackgroundImage: ((image: BackgroundImage | null, skipFirestoreSync?: boolean) => {
        const state = get();
        console.log('🔄 setBackgroundImage called:', { 
          hasImage: !!image, 
          imageUrl: image?.url, 
          skipFirestoreSync, 
          hasUser: !!state.currentUser,
          projectId 
        });
        set({ canvasScale: { ...state.canvasScale, backgroundImage: image } });
        console.log('✅ Background image set in store:', image ? { url: image.url, width: image.width, height: image.height } : null);
        
        // Use projectId from closure
        const effectiveProjectId = projectId;
        if (state.currentUser && effectiveProjectId && !skipFirestoreSync) {
          if (image) {
            console.log('💾 Saving background image to Firestore:', { projectId: effectiveProjectId, url: image.url });
            saveBackgroundImage(image, state.currentUser.uid, effectiveProjectId).catch((error) => {
              console.error('Failed to save background image:', error);
            });
          } else {
            console.log('🗑️ Deleting background image from Firestore:', { projectId: effectiveProjectId });
            deleteBackgroundImageFromFirestore(state.currentUser.uid, effectiveProjectId).catch((error) => {
              console.error('Failed to delete background image:', error);
            });
          }
        } else if (!skipFirestoreSync) {
          console.log('⚠️ Skipping Firestore sync for background image:', { 
            hasUser: !!state.currentUser, 
            hasProjectId: !!effectiveProjectId,
            skipFirestoreSync 
          });
        }
      }) as (image: BackgroundImage | null, skipFirestoreSync?: boolean) => void,
      setScaleLine: ((scaleLine: ScaleLine | null, skipFirestoreSync?: boolean) => {
        const state = get();
        console.log('🔄 setScaleLine called:', { scaleLine, skipFirestoreSync, hasUser: !!state.currentUser });
        set({ canvasScale: { ...state.canvasScale, scaleLine } });
        console.log('✅ Scale line set in store:', scaleLine);
        
        // Use projectId from closure
        const effectiveProjectId = projectId;
        
        // Skip Firestore sync if requested (e.g., when syncing from Firestore)
        if (skipFirestoreSync) {
          return;
        }
        
        // Get user from project-scoped store, or fallback to global store
        let userId: string | null = null;
        if (state.currentUser) {
          userId = state.currentUser.uid;
        } else {
          // Fallback to global store's currentUser
          const globalUser = getGlobalStoreCurrentUser();
          if (globalUser) {
            userId = globalUser.uid;
            console.log('📋 Using currentUser from global store as fallback');
          }
        }
        
        if (userId && effectiveProjectId) {
          if (scaleLine) {
            console.log('💾 Saving scale line to Firestore:', { projectId: effectiveProjectId, scaleLine, userId });
            saveScaleLine(scaleLine, userId, effectiveProjectId).catch((error) => {
              console.error('❌ Failed to save scale line:', error);
            });
          } else {
            console.log('🗑️ Deleting scale line from Firestore:', { projectId: effectiveProjectId, userId });
            deleteScaleLineFromFirestore(userId, effectiveProjectId).catch((error) => {
              console.error('❌ Failed to delete scale line:', error);
            });
          }
        } else {
          console.warn('⚠️ Cannot save/delete scale line: missing user or projectId', { 
            hasUser: !!userId, 
            projectId: effectiveProjectId,
            userId,
            skipFirestoreSync 
          });
        }
      }) as (scaleLine: ScaleLine | null, skipFirestoreSync?: boolean) => void,
      updateScaleLine: (updates: Partial<ScaleLine>, projectIdParam?: string) => {
        const state = get();
        const currentScaleLine = state.canvasScale.scaleLine;
        if (!currentScaleLine) {
          console.warn('⚠️ updateScaleLine: No scale line found in store. Updates:', updates);
          return;
        }
        
        console.log('🔄 Updating scale line:', { current: currentScaleLine, updates });
        const updatedScaleLine = { ...currentScaleLine, ...updates };
        set({ canvasScale: { ...state.canvasScale, scaleLine: updatedScaleLine } });
        console.log('✅ Scale line updated in store:', updatedScaleLine);
        
        // Use projectIdParam if provided, otherwise use projectId from closure
        const effectiveProjectId = projectIdParam || projectId;
        
        // Get user from project-scoped store, or fallback to global store
        let userId: string | null = null;
        if (state.currentUser) {
          userId = state.currentUser.uid;
        } else {
          // Fallback to global store's currentUser
          const globalUser = getGlobalStoreCurrentUser();
          if (globalUser) {
            userId = globalUser.uid;
            console.log('📋 Using currentUser from global store as fallback');
          }
        }
        
        if (userId && effectiveProjectId) {
          console.log('💾 Saving scale line to Firestore:', { projectId: effectiveProjectId, scaleLine: updatedScaleLine, userId });
          saveScaleLine(updatedScaleLine, userId, effectiveProjectId).catch((error) => {
            console.error('❌ Failed to update scale line:', error);
          });
        } else {
          console.warn('⚠️ Cannot save scale line: missing user or projectId', { 
            hasUser: !!userId, 
            projectId: effectiveProjectId,
            userId 
          });
        }
      },
      deleteScaleLine: (projectIdParam?: string) => {
        const state = get();
        console.log('🗑️ deleteScaleLine called:', { 
          projectIdParam, 
          projectId, 
          hasUser: !!state.currentUser,
          currentScaleLine: state.canvasScale.scaleLine,
          stackTrace: new Error().stack
        });
        set({ canvasScale: { ...state.canvasScale, scaleLine: null } });
        
        // Use projectIdParam if provided, otherwise use projectId from closure
        const effectiveProjectId = projectIdParam || projectId;
        if (state.currentUser && effectiveProjectId) {
          console.log('🗑️ Calling deleteScaleLineFromFirestore:', { projectId: effectiveProjectId });
          deleteScaleLineFromFirestore(state.currentUser.uid, effectiveProjectId).catch((error) => {
            console.error('Failed to delete scale line:', error);
          });
        }
      },
      setIsScaleMode: (isScaleMode: boolean) =>
        set((state: CanvasState) => ({
          canvasScale: { ...state.canvasScale, isScaleMode },
        })),
      setIsImageUploadMode: (isImageUploadMode: boolean) =>
        set((state: CanvasState) => ({
          canvasScale: { ...state.canvasScale, isImageUploadMode },
        })),
      initializeBoardStateSubscription: (() => {
        // Use projectId from closure
        const projectIdParam = projectId;
        console.log('🔧 initializeBoardStateSubscription called for project:', projectIdParam);
        return () => {
        console.log('🔧 Setting up board state subscription for project:', projectIdParam);

        // Track if we've received the first snapshot (which fires immediately)
        let isFirstSnapshot = true;

        // Helper to apply board state to the store
        const applyBoardState = (boardState: FirestoreBoardState | null, source: string) => {
          if (!boardState) {
            console.log(`📥 [${source}] No board state to apply`);
            return;
          }

          console.log(`📥 [${source}] Applying board state:`, {
            projectId: projectIdParam,
            hasBackgroundImage: !!boardState.backgroundImage,
            hasScaleLine: !!boardState.scaleLine
          });

          // Update background image
          if (boardState.backgroundImage) {
            const uploadedAt = typeof boardState.backgroundImage.uploadedAt === 'number'
              ? boardState.backgroundImage.uploadedAt
              : Date.now();
            const bgImage: BackgroundImage = {
              id: `bg-${uploadedAt}`,
              url: boardState.backgroundImage.url,
              fileName: 'construction-plan',
              fileSize: 0,
              width: boardState.backgroundImage.width,
              height: boardState.backgroundImage.height,
              aspectRatio: boardState.backgroundImage.width / boardState.backgroundImage.height,
              uploadedAt,
              uploadedBy: boardState.backgroundImage.uploadedBy || '',
            };
            console.log(`📥 [${source}] Setting background image:`, { url: bgImage.url, width: bgImage.width, height: bgImage.height });
            // Use set() directly to ensure synchronous state update
            set((state: CanvasState) => ({
              canvasScale: { ...state.canvasScale, backgroundImage: bgImage }
            }));
            console.log(`✅ [${source}] Background image set in store`);
          }

          // Update scale line
          if (boardState.scaleLine) {
            const createdAt = typeof boardState.scaleLine.createdAt === 'number'
              ? boardState.scaleLine.createdAt
              : Date.now();
            const updatedAt = typeof boardState.scaleLine.updatedAt === 'number'
              ? boardState.scaleLine.updatedAt
              : Date.now();
            const scaleLine: ScaleLine = {
              id: boardState.scaleLine.id,
              startX: boardState.scaleLine.startX,
              startY: boardState.scaleLine.startY,
              endX: boardState.scaleLine.endX,
              endY: boardState.scaleLine.endY,
              realWorldLength: boardState.scaleLine.realWorldLength,
              unit: boardState.scaleLine.unit as UnitType,
              isVisible: boardState.scaleLine.isVisible,
              createdAt,
              updatedAt,
              createdBy: boardState.scaleLine.createdBy || '',
              updatedBy: boardState.scaleLine.updatedBy || '',
            };
            console.log(`📥 [${source}] Setting scale line:`, scaleLine);
            set((state: CanvasState) => ({
              canvasScale: { ...state.canvasScale, scaleLine }
            }));
          }
        };

        // Set up subscription - the first callback fires immediately with current data
        const unsubscribe = subscribeToBoardState(projectIdParam, (boardState) => {
          if (isFirstSnapshot) {
            // Handle the first (immediate) snapshot - this contains the current state
            isFirstSnapshot = false;
            console.log('📥 First snapshot received (immediate):', {
              projectId: projectIdParam,
              hasBoardState: !!boardState,
              hasBackgroundImage: !!boardState?.backgroundImage,
              hasScaleLine: !!boardState?.scaleLine
            });
            applyBoardState(boardState, 'Initial snapshot');
            return;
          }
          
          // Handle subsequent updates from Firestore (real-time changes)
          console.log('📥 Subsequent board state update:', {
            projectId: projectIdParam,
            hasBoardState: !!boardState,
            hasBackgroundImage: !!boardState?.backgroundImage,
            hasScaleLine: !!boardState?.scaleLine
          });

          if (boardState) {
            // Update active layer
            const currentState = get();
            if (boardState.activeLayerId && boardState.activeLayerId !== currentState.activeLayerId) {
              set({ activeLayerId: boardState.activeLayerId });
            }

            // Apply the board state updates
            applyBoardState(boardState, 'Subscription update');
          }
        });
        
        return unsubscribe;
        };
      }) as () => (() => void),
      
      // Material Estimation State
      materialDialogue: null,
      billOfMaterials: null,
      userMaterialPreferences: null,
      isAccumulatingBOM: false,
      startMaterialDialogue: (request: string) =>
        set((state: CanvasState) => ({
          materialDialogue: {
            conversationId: `dialogue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId: state.currentUser?.uid || '',
            stage: 'initial' as DialogueStage,
            currentRequest: {
              originalQuery: request,
            },
            pendingClarification: null,
            assumptions: null,
            lastCalculation: null,
            messageHistory: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        })),
      updateMaterialDialogue: (updates: Partial<DialogueContext>) =>
        set((state: CanvasState) => ({
          materialDialogue: state.materialDialogue
            ? { ...state.materialDialogue, ...updates }
            : null,
        })),
      clearMaterialDialogue: () => set({ materialDialogue: null }),
      setBillOfMaterials: (bom: BillOfMaterials | null) => set({ billOfMaterials: bom }),
      addMaterialCalculation: (_calculation: MaterialCalculation, _forceAccumulate = false) => {
        // Implementation handled by components
      },
      setUserMaterialPreferences: (preferences: UserMaterialPreferences) =>
        set({ userMaterialPreferences: preferences }),
      setIsAccumulatingBOM: (isAccumulating: boolean) =>
        set({ isAccumulatingBOM: isAccumulating }),

      // Viewport State (persisted across navigation)
      viewportState: { x: 0, y: 0, scale: 1 },
      setViewportState: (viewportState: { x: number; y: number; scale: number }) =>
        set({ viewportState }),
    };
  }) as StoreApi<CanvasState>;

  // Register with harness if enabled
  if (isHarnessEnabled()) {
    registerHarnessApi(`canvasStore-${projectId}`, {
      getState: () => store.getState().shapes,
      getHistory: () => store.getState().history,
    });
  }

  return store;
}

/**
 * Get or create a project-scoped canvas store
 */
export function getProjectCanvasStore(projectId: string): StoreApi<CanvasState> {
  if (!projectStores.has(projectId)) {
    const store = createProjectCanvasStore(projectId);
    projectStores.set(projectId, store);
    storeRefCounts.set(projectId, 0);
  }
  
  // Increment reference count
  const currentCount = storeRefCounts.get(projectId) || 0;
  storeRefCounts.set(projectId, currentCount + 1);
  
  return projectStores.get(projectId)!;
}

/**
 * Release a reference to a project store
 * When count reaches 0, optionally clean up the store
 */
export function releaseProjectCanvasStore(projectId: string): void {
  const currentCount = storeRefCounts.get(projectId) || 0;
  if (currentCount > 0) {
    storeRefCounts.set(projectId, currentCount - 1);
    
    // Optionally clean up when no references remain
    // For now, we keep stores in memory for better performance
    // Uncomment below if you want to clean up unused stores
    // if (currentCount - 1 === 0) {
    //   projectStores.delete(projectId);
    //   storeRefCounts.delete(projectId);
    // }
  }
}

/**
 * Hook to access project-scoped canvas store
 * Automatically manages store lifecycle
 */
// Create a default store instance for when projectId is undefined
// This prevents creating new default states on every render
let defaultStoreInstance: StoreApi<CanvasState> | null = null;

// @ts-expect-error - Intentionally unused, kept for potential future use
function _getDefaultStore(): StoreApi<CanvasState> {
  if (!defaultStoreInstance) {
    // Create a store with the default state
    // Zustand's create expects (set, get) => state
    // We return the cached default state object - it never changes
    const defaultState = getDefaultState();
    defaultStoreInstance = create<CanvasState>(() => {
      // Return the cached default state - this store never updates
      return defaultState;
    });
  }
  return defaultStoreInstance;
}

// Stable equality function for Maps and Arrays (currently unused, kept for future use if Zustand adds custom equality support)
// @ts-expect-error - Intentionally unused, kept for future use
const _mapArrayEquality = <T,>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (a instanceof Map && b instanceof Map) {
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a === b;
  }
  return false;
};

// Cache for default selector results to prevent infinite loops
const defaultSelectorCache = new WeakMap<(state: CanvasState) => unknown, unknown>();

const canvasStoreApi = useCanvasStore as unknown as StoreApi<CanvasState>;

export function useProjectCanvasStore<T>(
  projectId: string | undefined, 
  selector: (state: CanvasState) => T,
  _equalityFn?: (a: T, b: T) => boolean
): T {
  // Always call hooks in the same order - get store first
  const store = useMemo<StoreApi<CanvasState>>(
    () => {
      if (!projectId) {
        return canvasStoreApi;
      }
      return getProjectCanvasStore(projectId);
    },
    [projectId]
  );
  
  // Always call useStore hook - never conditionally
  const storeValue = useStore(store, selector);
  
  // If no projectId, return cached default value to prevent infinite loops
  if (!projectId) {
    // Check cache first
    const cached = defaultSelectorCache.get(selector);
    if (cached !== undefined) {
      return cached as T;
    }
    
    // Compute and cache the result
    const defaultState = getDefaultState();
    const result = selector(defaultState);
    defaultSelectorCache.set(selector, result);
    return result;
  }
  
  // Note: Zustand's useStore doesn't support custom equality functions in this version
  // We rely on Zustand's default reference equality comparison
  return storeValue;
}

/**
 * Get the raw store API for a project (for non-hook usage)
 */
export function getProjectCanvasStoreApi(projectId: string): StoreApi<CanvasState> {
  return getProjectCanvasStore(projectId);
}

export function useScopedCanvasStore<T>(
  projectId: string | undefined,
  selector: (state: CanvasState) => T,
  _equalityFn?: (a: T, b: T) => boolean
): T {
  // Always call hooks in the same order - useMemo first, then useStore
  const store = useMemo<StoreApi<CanvasState>>(
    () => {
      if (!projectId) {
        // Return global store API when no projectId
        return canvasStoreApi;
      }
      return getProjectCanvasStore(projectId);
    },
    [projectId]
  );
  
  // Always call useStore hook - never conditionally
  const storeValue = useStore(store, selector);
  
  // When projectId is undefined, use cached values to prevent infinite loops
  // This matches the behavior of useProjectCanvasStore
  if (!projectId) {
    const cached = defaultSelectorCache.get(selector);
    if (cached !== undefined) {
      return cached as T;
    }
    
    const defaultState = getDefaultState();
    const result = selector(defaultState);
    defaultSelectorCache.set(selector, result);
    return result;
  }
  
  // Use reference equality by default (no custom equality function)
  // This prevents infinite loops by only re-rendering when the selected value reference changes
  // For Maps/Arrays, reference equality is correct (they're compared by reference)
  // For functions/primitives, reference equality is also correct
  // Note: Zustand's useStore doesn't support custom equality functions in this version
  // We rely on Zustand's default reference equality comparison
  return storeValue;
}

export function useScopedCanvasStoreApi(projectId: string | undefined): StoreApi<CanvasState> {
  return useMemo<StoreApi<CanvasState>>(
    () => {
      if (projectId) {
        return getProjectCanvasStore(projectId);
      }
      // Return global store API when no projectId
      // This ensures consistent behavior with useScopedCanvasStore
      return canvasStoreApi;
    },
    [projectId]
  );
}

/**
 * Bridging helper: useCanvasStoreForProject
 * Provides a unified interface that automatically uses scoped store when projectId exists,
 * otherwise falls back to global store. This helps during migration.
 */
export function useCanvasStoreForProject<T>(
  projectId: string | undefined,
  selector: (state: CanvasState) => T,
  _fallbackSelector?: (state: CanvasState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  // Use scoped store which handles projectId automatically
  return useScopedCanvasStore(projectId, selector, equalityFn);
}

