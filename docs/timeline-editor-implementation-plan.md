# Interactive Timeline Editor - Complete Implementation Plan

## Overview

Add interactive CPM/Gantt chart editing to the existing TimeView component with real-time auto-save. This feature allows users to visualize and edit project schedules after estimation is complete.

## User Requirements

- **Feature**: Project scheduling visualization with Critical Path Method (CPM) and Gantt chart views
- **Location**: New Timeline tab within estimates (after estimation is done)
- **Data Source**: JSON data from estimation (projected timeline)
- **Editability**: Users can modify timeline based on their expectations
- **Real-time**: Updates reflect immediately as user edits

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Gantt Library** | `@wamra/gantt-task-react` | Native React/TypeScript, MIT license, built-in drag editing, lightweight (~40KB) |
| **Tab Strategy** | Extend existing Time tab | Add edit mode toggle rather than separate tab |
| **Persistence** | Real-time auto-save | Debounced saves (500ms) with optimistic updates |
| **State Management** | Zustand store | Consistent with existing codebase patterns |

---

## Files to Create

### 1. Mock Data: `src/data/mockTimelineData.ts`

**Status**: CREATED

Contains:
- `MOCK_TIMELINE_DATA` - 23-task kitchen renovation project
- `SIMPLE_MOCK_TIMELINE` - 5-task simple project for testing
- `EXTENDED_CATEGORY_COLORS` - Color mapping with ganttColor for library
- `TASK_CATEGORIES` - All available category types
- `getCategoryColor()` - Helper function

---

### 2. Timeline Store: `src/store/timelineStore.ts`

```typescript
import { create } from 'zustand';
import type { Unsubscribe } from 'firebase/firestore';
import type { CPM, CPMTask } from '../types/cpm';
import { getCPM, saveCPM, calculateCriticalPath } from '../services/cpmService';

interface HistoryEntry {
  tasks: CPMTask[];
  timestamp: number;
  action: string;
}

interface TimelineState {
  // Data
  cpm: CPM | null;
  loading: boolean;
  error: string | null;

  // Edit Mode
  isEditing: boolean;
  isDirty: boolean;
  isSaving: boolean;

  // Selection
  selectedTaskIds: string[];

  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;

  // Real-time subscription
  unsubscribe: Unsubscribe | null;

  // Actions - Data Loading
  loadCPM: (projectId: string) => Promise<void>;
  subscribeToCPM: (projectId: string) => void;
  setCPM: (cpm: CPM | null) => void;

  // Actions - Edit Mode
  setEditMode: (editing: boolean) => void;

  // Actions - Task CRUD
  updateTask: (taskId: string, updates: Partial<CPMTask>) => void;
  addTask: (task: Omit<CPMTask, 'id'>) => void;
  deleteTask: (taskId: string) => void;
  reorderTasks: (taskIds: string[]) => void;

  // Actions - Dependencies
  addDependency: (taskId: string, dependencyId: string) => void;
  removeDependency: (taskId: string, dependencyId: string) => void;

  // Actions - Persistence
  saveCPM: (projectId: string, userId: string) => Promise<void>;

  // Actions - History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions - Selection
  selectTask: (taskId: string, multiSelect?: boolean) => void;
  clearSelection: () => void;

  // Cleanup
  cleanup: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  // Initial state
  cpm: null,
  loading: false,
  error: null,
  isEditing: false,
  isDirty: false,
  isSaving: false,
  selectedTaskIds: [],
  history: [],
  historyIndex: -1,
  unsubscribe: null,

  loadCPM: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await getCPM(projectId);
      set({ cpm: data, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load timeline',
        loading: false,
      });
    }
  },

  subscribeToCPM: (projectId: string) => {
    // Cleanup existing subscription
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();

    // TODO: Implement Firestore real-time listener
    // const newUnsubscribe = onSnapshot(doc(firestore, 'projects', projectId, 'cpm', 'data'), ...);
    // set({ unsubscribe: newUnsubscribe });
  },

  setCPM: (cpm: CPM | null) => set({ cpm }),

  setEditMode: (editing: boolean) => {
    const { cpm } = get();
    if (editing && cpm) {
      // Push initial state to history when entering edit mode
      set({
        isEditing: true,
        history: [{ tasks: [...cpm.tasks], timestamp: Date.now(), action: 'initial' }],
        historyIndex: 0,
      });
    } else {
      set({ isEditing: false });
    }
  },

  updateTask: (taskId: string, updates: Partial<CPMTask>) => {
    const { cpm, history, historyIndex } = get();
    if (!cpm) return;

    const updatedTasks = cpm.tasks.map((task) =>
      task.id === taskId ? { ...task, ...updates } : task
    );

    // Recalculate critical path
    const { criticalPath, totalDuration } = calculateCriticalPath(updatedTasks);

    // Update history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      tasks: updatedTasks,
      timestamp: Date.now(),
      action: `Updated ${taskId}`,
    });
    if (newHistory.length > 50) newHistory.shift();

    set({
      cpm: { ...cpm, tasks: updatedTasks, criticalPath, totalDuration },
      isDirty: true,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  addTask: (task: Omit<CPMTask, 'id'>) => {
    const { cpm, history, historyIndex } = get();
    if (!cpm) return;

    const newTask: CPMTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    const updatedTasks = [...cpm.tasks, newTask];
    const { criticalPath, totalDuration } = calculateCriticalPath(updatedTasks);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      tasks: updatedTasks,
      timestamp: Date.now(),
      action: `Added ${newTask.name}`,
    });
    if (newHistory.length > 50) newHistory.shift();

    set({
      cpm: { ...cpm, tasks: updatedTasks, criticalPath, totalDuration },
      isDirty: true,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  deleteTask: (taskId: string) => {
    const { cpm, history, historyIndex } = get();
    if (!cpm) return;

    // Remove task and any dependencies pointing to it
    const updatedTasks = cpm.tasks
      .filter((t) => t.id !== taskId)
      .map((t) => ({
        ...t,
        dependencies: t.dependencies.filter((d) => d !== taskId),
      }));

    const { criticalPath, totalDuration } = calculateCriticalPath(updatedTasks);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      tasks: updatedTasks,
      timestamp: Date.now(),
      action: `Deleted task`,
    });
    if (newHistory.length > 50) newHistory.shift();

    set({
      cpm: { ...cpm, tasks: updatedTasks, criticalPath, totalDuration },
      isDirty: true,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      selectedTaskIds: [],
    });
  },

  reorderTasks: (taskIds: string[]) => {
    const { cpm } = get();
    if (!cpm) return;

    const taskMap = new Map(cpm.tasks.map((t) => [t.id, t]));
    const reorderedTasks = taskIds.map((id) => taskMap.get(id)!).filter(Boolean);

    set({
      cpm: { ...cpm, tasks: reorderedTasks },
      isDirty: true,
    });
  },

  addDependency: (taskId: string, dependencyId: string) => {
    const { cpm, history, historyIndex } = get();
    if (!cpm) return;

    // Prevent circular dependencies
    const task = cpm.tasks.find((t) => t.id === taskId);
    if (!task || task.dependencies.includes(dependencyId)) return;

    const updatedTasks = cpm.tasks.map((t) =>
      t.id === taskId ? { ...t, dependencies: [...t.dependencies, dependencyId] } : t
    );

    const { criticalPath, totalDuration } = calculateCriticalPath(updatedTasks);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      tasks: updatedTasks,
      timestamp: Date.now(),
      action: `Added dependency`,
    });

    set({
      cpm: { ...cpm, tasks: updatedTasks, criticalPath, totalDuration },
      isDirty: true,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  removeDependency: (taskId: string, dependencyId: string) => {
    const { cpm, history, historyIndex } = get();
    if (!cpm) return;

    const updatedTasks = cpm.tasks.map((t) =>
      t.id === taskId
        ? { ...t, dependencies: t.dependencies.filter((d) => d !== dependencyId) }
        : t
    );

    const { criticalPath, totalDuration } = calculateCriticalPath(updatedTasks);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      tasks: updatedTasks,
      timestamp: Date.now(),
      action: `Removed dependency`,
    });

    set({
      cpm: { ...cpm, tasks: updatedTasks, criticalPath, totalDuration },
      isDirty: true,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  saveCPM: async (projectId: string, userId: string) => {
    const { cpm } = get();
    if (!cpm) return;

    set({ isSaving: true });
    try {
      await saveCPM(projectId, { ...cpm, updatedAt: Date.now() }, userId);
      set({ isDirty: false, isSaving: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to save',
        isSaving: false,
      });
      throw err;
    }
  },

  undo: () => {
    const { history, historyIndex, cpm } = get();
    if (historyIndex <= 0 || !cpm) return;

    const newIndex = historyIndex - 1;
    const previousState = history[newIndex];

    const { criticalPath, totalDuration } = calculateCriticalPath(previousState.tasks);

    set({
      cpm: { ...cpm, tasks: previousState.tasks, criticalPath, totalDuration },
      historyIndex: newIndex,
      isDirty: newIndex > 0,
    });
  },

  redo: () => {
    const { history, historyIndex, cpm } = get();
    if (historyIndex >= history.length - 1 || !cpm) return;

    const newIndex = historyIndex + 1;
    const nextState = history[newIndex];

    const { criticalPath, totalDuration } = calculateCriticalPath(nextState.tasks);

    set({
      cpm: { ...cpm, tasks: nextState.tasks, criticalPath, totalDuration },
      historyIndex: newIndex,
      isDirty: true,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  selectTask: (taskId: string, multiSelect = false) => {
    set((state) => ({
      selectedTaskIds: multiSelect
        ? state.selectedTaskIds.includes(taskId)
          ? state.selectedTaskIds.filter((id) => id !== taskId)
          : [...state.selectedTaskIds, taskId]
        : [taskId],
    }));
  },

  clearSelection: () => set({ selectedTaskIds: [] }),

  cleanup: () => {
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();
    set({
      cpm: null,
      unsubscribe: null,
      error: null,
      isEditing: false,
      isDirty: false,
      selectedTaskIds: [],
      history: [],
      historyIndex: -1,
    });
  },
}));
```

---

### 3. GanttTaskAdapter: `src/components/time/GanttEditor/GanttTaskAdapter.ts`

```typescript
/**
 * Adapter to convert between CPMTask and gantt-task-react Task types
 */

import type { Task, ViewMode } from '@wamra/gantt-task-react';
import type { CPMTask } from '../../../types/cpm';
import { getCategoryColor } from '../../../data/mockTimelineData';

/**
 * Convert CPMTask array to gantt-task-react Task array
 * Calculates actual dates based on dependencies and durations
 */
export function cpmTasksToGanttTasks(
  tasks: CPMTask[],
  projectStartDate: Date = new Date()
): Task[] {
  // First pass: calculate start days using forward pass algorithm
  const taskStartDays = new Map<string, number>();
  const taskEndDays = new Map<string, number>();

  // Initialize all tasks
  tasks.forEach((task) => {
    taskStartDays.set(task.id, 0);
    taskEndDays.set(task.id, 0);
  });

  // Forward pass to calculate earliest start/end times
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach((task) => {
      let maxDependencyEnd = 0;
      task.dependencies.forEach((depId) => {
        const depEnd = taskEndDays.get(depId) || 0;
        if (depEnd > maxDependencyEnd) {
          maxDependencyEnd = depEnd;
        }
      });

      const currentStart = taskStartDays.get(task.id) || 0;
      if (maxDependencyEnd > currentStart) {
        taskStartDays.set(task.id, maxDependencyEnd);
        taskEndDays.set(task.id, maxDependencyEnd + task.duration);
        changed = true;
      } else if (taskEndDays.get(task.id) === 0) {
        taskEndDays.set(task.id, maxDependencyEnd + task.duration);
        changed = true;
      }
    });
  }

  // Convert to gantt tasks with actual dates
  return tasks.map((task) => {
    const startDay = taskStartDays.get(task.id) || 0;
    const endDay = taskEndDays.get(task.id) || task.duration;

    const start = new Date(projectStartDate);
    start.setDate(start.getDate() + startDay);

    const end = new Date(projectStartDate);
    end.setDate(end.getDate() + endDay);

    const categoryColor = getCategoryColor(task.category);

    return {
      id: task.id,
      name: task.name,
      start,
      end,
      progress: 0, // Can be extended to support progress tracking
      type: 'task' as const,
      dependencies: task.dependencies,
      styles: {
        backgroundColor: task.isCritical ? '#ef4444' : categoryColor.ganttColor,
        backgroundSelectedColor: task.isCritical ? '#dc2626' : categoryColor.ganttColor,
        progressColor: task.isCritical ? '#b91c1c' : categoryColor.ganttColor,
        progressSelectedColor: task.isCritical ? '#991b1b' : categoryColor.ganttColor,
      },
      isDisabled: false,
    };
  });
}

/**
 * Convert gantt-task-react Task back to CPMTask after editing
 * Extracts duration from date difference
 */
export function ganttTaskToCPMTask(
  ganttTask: Task,
  originalTask: CPMTask,
  projectStartDate: Date
): CPMTask {
  // Calculate duration from dates
  const startTime = ganttTask.start.getTime();
  const endTime = ganttTask.end.getTime();
  const durationMs = endTime - startTime;
  const durationDays = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)));

  return {
    ...originalTask,
    id: ganttTask.id,
    name: ganttTask.name,
    duration: durationDays,
    dependencies: ganttTask.dependencies || originalTask.dependencies,
  };
}

/**
 * Calculate project start date (default: today or from config)
 */
export function getProjectStartDate(startDateString?: string): Date {
  if (startDateString) {
    return new Date(startDateString);
  }
  // Default to next Monday
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  today.setDate(today.getDate() + daysUntilMonday);
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Get view mode options for the Gantt chart
 */
export const VIEW_MODE_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Day', value: 'Day' },
  { label: 'Week', value: 'Week' },
  { label: 'Month', value: 'Month' },
];

/**
 * Default Gantt chart styling
 */
export const GANTT_STYLES = {
  headerHeight: 50,
  columnWidth: 60,
  listCellWidth: '200px',
  rowHeight: 40,
  barCornerRadius: 4,
  barFill: 60,
  handleWidth: 8,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '12px',
  arrowColor: '#9ca3af',
  arrowIndent: 20,
  todayColor: 'rgba(59, 130, 246, 0.1)',
  projectBackgroundColor: '#3b82f6',
  projectBackgroundSelectedColor: '#2563eb',
  milestoneBackgroundColor: '#f59e0b',
  milestoneBackgroundSelectedColor: '#d97706',
};
```

---

### 4. GanttToolbar: `src/components/time/GanttEditor/GanttToolbar.tsx`

```tsx
import { useState } from 'react';
import type { ViewMode } from '@wamra/gantt-task-react';
import { VIEW_MODE_OPTIONS } from './GanttTaskAdapter';

interface GanttToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAddTask: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onExitEdit: () => void;
}

export function GanttToolbar({
  viewMode,
  onViewModeChange,
  onAddTask,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isDirty,
  isSaving,
  onExitEdit,
}: GanttToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
      {/* Left: Add Task */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAddTask}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Task
        </button>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Cmd+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Cmd+Shift+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center: View Mode Toggle */}
      <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
        {VIEW_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onViewModeChange(option.value)}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              viewMode === option.value
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Right: Save Status & Exit */}
      <div className="flex items-center gap-3">
        {/* Save Status */}
        <span className="text-sm text-gray-500">
          {isSaving ? (
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </span>
          ) : isDirty ? (
            <span className="text-amber-600">Unsaved changes</span>
          ) : (
            <span className="text-green-600">Saved</span>
          )}
        </span>

        {/* Exit Edit Mode */}
        <button
          onClick={onExitEdit}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
        >
          Exit Edit Mode
        </button>
      </div>
    </div>
  );
}
```

---

### 5. TaskEditModal: `src/components/time/GanttEditor/TaskEditModal.tsx`

```tsx
import { useState, useEffect } from 'react';
import type { CPMTask } from '../../../types/cpm';
import { TASK_CATEGORIES } from '../../../data/mockTimelineData';

interface TaskEditModalProps {
  task: CPMTask | null;
  allTasks: CPMTask[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: CPMTask) => void;
  onDelete?: (taskId: string) => void;
  isNewTask?: boolean;
}

export function TaskEditModal({
  task,
  allTasks,
  isOpen,
  onClose,
  onSave,
  onDelete,
  isNewTask = false,
}: TaskEditModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(1);
  const [category, setCategory] = useState<string>('prep');
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description || '');
      setDuration(task.duration);
      setCategory(task.category || 'prep');
      setDependencies(task.dependencies);
    } else {
      // New task defaults
      setName('');
      setDescription('');
      setDuration(1);
      setCategory('prep');
      setDependencies([]);
    }
    setShowDeleteConfirm(false);
  }, [task, isOpen]);

  if (!isOpen) return null;

  const availableDependencies = allTasks.filter((t) => t.id !== task?.id);

  const handleSave = () => {
    const updatedTask: CPMTask = {
      id: task?.id || `task-${Date.now()}`,
      name: name.trim() || 'Untitled Task',
      description: description.trim() || undefined,
      duration: Math.max(1, duration),
      category,
      dependencies,
    };
    onSave(updatedTask);
    onClose();
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id);
      onClose();
    }
  };

  const toggleDependency = (depId: string) => {
    setDependencies((prev) =>
      prev.includes(depId) ? prev.filter((d) => d !== depId) : [...prev, depId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNewTask ? 'Add New Task' : 'Edit Task'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter task name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional description"
            />
          </div>

          {/* Duration & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                min={1}
                max={365}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {TASK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dependencies */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dependencies ({dependencies.length} selected)
            </label>
            <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
              {availableDependencies.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No other tasks available</p>
              ) : (
                availableDependencies.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={dependencies.includes(t.id)}
                      onChange={() => toggleDependency(t.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{t.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {/* Delete Button */}
          {!isNewTask && onDelete && (
            <div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Delete?</span>
                  <button
                    onClick={handleDelete}
                    className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Delete Task
                </button>
              )}
            </div>
          )}

          {/* Save/Cancel */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isNewTask ? 'Add Task' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### 6. GanttEditor: `src/components/time/GanttEditor/GanttEditor.tsx`

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Gantt, ViewMode, Task } from '@wamra/gantt-task-react';
import '@wamra/gantt-task-react/dist/index.css';

import { useTimelineStore } from '../../../store/timelineStore';
import { GanttToolbar } from './GanttToolbar';
import { TaskEditModal } from './TaskEditModal';
import {
  cpmTasksToGanttTasks,
  ganttTaskToCPMTask,
  getProjectStartDate,
  GANTT_STYLES,
} from './GanttTaskAdapter';
import type { CPMTask } from '../../../types/cpm';

interface GanttEditorProps {
  projectId: string;
  userId: string;
  startDate?: string;
}

export function GanttEditor({ projectId, userId, startDate }: GanttEditorProps) {
  const {
    cpm,
    isDirty,
    isSaving,
    updateTask,
    addTask,
    deleteTask,
    saveCPM,
    undo,
    redo,
    canUndo,
    canRedo,
    setEditMode,
  } = useTimelineStore();

  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [editingTask, setEditingTask] = useState<CPMTask | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);

  const projectStartDate = useMemo(() => getProjectStartDate(startDate), [startDate]);

  // Convert CPM tasks to Gantt tasks
  const ganttTasks = useMemo(() => {
    if (!cpm?.tasks) return [];
    return cpmTasksToGanttTasks(cpm.tasks, projectStartDate);
  }, [cpm?.tasks, projectStartDate]);

  // Auto-save with debounce
  useEffect(() => {
    if (!isDirty || isSaving) return;

    const timer = setTimeout(() => {
      saveCPM(projectId, userId);
    }, 500);

    return () => clearTimeout(timer);
  }, [isDirty, isSaving, projectId, userId, saveCPM]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if (e.key === 'Escape') {
        setEditingTask(null);
        setIsAddingTask(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Handle task date change (drag to resize)
  const handleDateChange = useCallback(
    (task: Task) => {
      const originalTask = cpm?.tasks.find((t) => t.id === task.id);
      if (!originalTask) return;

      const updatedCPMTask = ganttTaskToCPMTask(task, originalTask, projectStartDate);
      updateTask(task.id, { duration: updatedCPMTask.duration });
    },
    [cpm?.tasks, projectStartDate, updateTask]
  );

  // Handle task double-click (open edit modal)
  const handleDoubleClick = useCallback(
    (task: Task) => {
      const cpmTask = cpm?.tasks.find((t) => t.id === task.id);
      if (cpmTask) {
        setEditingTask(cpmTask);
      }
    },
    [cpm?.tasks]
  );

  // Handle task save from modal
  const handleTaskSave = useCallback(
    (task: CPMTask) => {
      if (isAddingTask) {
        addTask(task);
      } else {
        updateTask(task.id, task);
      }
      setEditingTask(null);
      setIsAddingTask(false);
    },
    [isAddingTask, addTask, updateTask]
  );

  // Handle add new task
  const handleAddTask = useCallback(() => {
    setIsAddingTask(true);
    setEditingTask(null);
  }, []);

  // Handle delete task
  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTask(taskId);
      setEditingTask(null);
    },
    [deleteTask]
  );

  // Exit edit mode
  const handleExitEdit = useCallback(() => {
    setEditMode(false);
  }, [setEditMode]);

  if (!cpm) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No timeline data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <GanttToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddTask={handleAddTask}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo()}
        canRedo={canRedo()}
        isDirty={isDirty}
        isSaving={isSaving}
        onExitEdit={handleExitEdit}
      />

      {/* Gantt Chart */}
      <div className="flex-1 overflow-auto">
        {ganttTasks.length > 0 ? (
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            onDateChange={handleDateChange}
            onDoubleClick={handleDoubleClick}
            listCellWidth={GANTT_STYLES.listCellWidth}
            columnWidth={
              viewMode === 'Month' ? 300 : viewMode === 'Week' ? 150 : GANTT_STYLES.columnWidth
            }
            rowHeight={GANTT_STYLES.rowHeight}
            barCornerRadius={GANTT_STYLES.barCornerRadius}
            handleWidth={GANTT_STYLES.handleWidth}
            fontFamily={GANTT_STYLES.fontFamily}
            fontSize={GANTT_STYLES.fontSize}
            arrowColor={GANTT_STYLES.arrowColor}
            arrowIndent={GANTT_STYLES.arrowIndent}
            todayColor={GANTT_STYLES.todayColor}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            No tasks. Click "Add Task" to create your first task.
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <TaskEditModal
        task={isAddingTask ? null : editingTask}
        allTasks={cpm.tasks}
        isOpen={editingTask !== null || isAddingTask}
        onClose={() => {
          setEditingTask(null);
          setIsAddingTask(false);
        }}
        onSave={handleTaskSave}
        onDelete={handleDeleteTask}
        isNewTask={isAddingTask}
      />
    </div>
  );
}
```

---

### 7. Barrel Export: `src/components/time/GanttEditor/index.ts`

```typescript
export { GanttEditor } from './GanttEditor';
export { GanttToolbar } from './GanttToolbar';
export { TaskEditModal } from './TaskEditModal';
export * from './GanttTaskAdapter';
```

---

## Files to Modify

### 1. TimeView.tsx Modifications

Add edit mode toggle and integrate GanttEditor:

```tsx
// Add imports
import { GanttEditor } from './GanttEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { MOCK_TIMELINE_DATA } from '../../data/mockTimelineData';

// Inside TimeView component, add:
const { isEditing, setEditMode, setCPM, cpm: storeCpm } = useTimelineStore();

// Add edit mode toggle button in header
<button
  onClick={() => {
    if (!isEditing) {
      // Load mock data or real data when entering edit mode
      if (!storeCpm) {
        setCPM(cpm || MOCK_TIMELINE_DATA);
      }
    }
    setEditMode(!isEditing);
  }}
  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
    isEditing
      ? 'bg-amber-100 text-amber-800'
      : 'bg-blue-600 text-white hover:bg-blue-700'
  }`}
>
  {isEditing ? 'Exit Edit Mode' : 'Edit Timeline'}
</button>

// Modify content rendering
{viewMode === 'gantt' && isEditing ? (
  <GanttEditor
    projectId={projectId}
    userId="current-user" // Get from auth context
    startDate={/* from estimation config */}
  />
) : viewMode === 'gantt' ? (
  <GanttChart tasks={processedTasks.tasks} totalDuration={processedTasks.totalDuration} />
) : viewMode === 'network' ? (
  <CPMNetworkDiagram tasks={processedTasks.tasks} criticalPath={processedTasks.criticalPath} />
) : (
  <TaskListView tasks={processedTasks.tasks} />
)}
```

### 2. cpm.ts Type Updates (if needed)

```typescript
export interface CPMTask {
  id: string;
  name: string;
  description?: string;
  duration: number;
  dependencies: string[];
  startDate?: number;
  endDate?: number;
  isCritical?: boolean;
  slack?: number;
  category?: string;
  progress?: number; // NEW: Optional progress tracking (0-100)
}
```

---

## Auto-Save Implementation Details

```typescript
// In GanttEditor or a custom hook

// Debounced auto-save (500ms after last change)
useEffect(() => {
  if (!isDirty || isSaving) return;

  const timer = setTimeout(async () => {
    try {
      await saveCPM(projectId, userId);
    } catch (err) {
      // Show error toast
      console.error('Auto-save failed:', err);
    }
  }, 500);

  return () => clearTimeout(timer);
}, [isDirty, isSaving, cpm?.tasks, projectId, userId, saveCPM]);
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Delete` / `Backspace` | Delete selected task |
| `Escape` | Close modal / Deselect |
| `Enter` | Save modal (when focused) |

---

## Component Hierarchy

```
TimeView (existing)
├── Header
│   ├── Title + Duration Info (existing)
│   ├── Edit Mode Toggle (NEW)
│   └── View Mode Toggle (existing)
│
├── Content
│   ├── [viewMode='gantt' && isEditing]
│   │   └── GanttEditor (NEW)
│   │       ├── GanttToolbar
│   │       │   ├── Add Task Button
│   │       │   ├── Undo/Redo Buttons
│   │       │   ├── View Mode (Day/Week/Month)
│   │       │   └── Save Status Indicator
│   │       ├── Gantt (@wamra/gantt-task-react)
│   │       └── TaskEditModal (on double-click)
│   │
│   ├── [viewMode='gantt' && !isEditing]
│   │   └── GanttChart (existing read-only)
│   │
│   ├── [viewMode='network']
│   │   └── CPMNetworkDiagram (existing)
│   │
│   └── [viewMode='list']
│       └── TaskListView (existing)
```

---

## Testing Checklist

- [ ] Mock data loads correctly
- [ ] Gantt chart renders with correct task positions
- [ ] Critical path tasks highlighted in red
- [ ] Drag to resize task duration works
- [ ] Double-click opens edit modal
- [ ] Add new task works
- [ ] Delete task works (with dependency cleanup)
- [ ] Undo/Redo works correctly
- [ ] Auto-save triggers after changes
- [ ] Keyboard shortcuts work
- [ ] View mode toggle (Day/Week/Month) works
- [ ] Edit mode toggle works
- [ ] Dependency arrows render correctly

---

## Installation Steps Summary

1. `npm install @wamra/gantt-task-react`
2. Create `src/data/mockTimelineData.ts` (DONE)
3. Create `src/store/timelineStore.ts`
4. Create `src/components/time/GanttEditor/` directory with all components
5. Modify `src/components/time/TimeView.tsx`
6. Test the implementation

---

## Future Enhancements (Out of Scope)

- Progress tracking per task
- Milestone support
- Resource assignment
- Export to PDF/image
- Collaborative real-time editing
- Drag-and-drop dependency creation
- Task grouping/phases
- Baseline comparison
