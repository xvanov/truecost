/**
 * Time View Component
 * Story 6-2: CPM visualization with Gantt chart and timeline
 * Displays project schedule from agent pipeline output
 */

import { useState, useEffect, useMemo } from 'react';
import { getCPM, calculateCriticalPath } from '../../services/cpmService';
import type { CPM, CPMTask } from '../../types/cpm';

interface TimeViewProps {
  projectId: string;
}

type ViewMode = 'gantt' | 'network' | 'list';

/**
 * Node position for network diagram layout
 */
interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sample CPM data for when no real data exists
 * This simulates what the agent pipeline would produce
 */
const SAMPLE_CPM: CPM = {
  id: 'sample-cpm',
  projectId: 'sample',
  tasks: [
    { id: 't1', name: 'Site Preparation', duration: 2, dependencies: [], category: 'prep' },
    { id: 't2', name: 'Demolition', duration: 3, dependencies: ['t1'], category: 'demo' },
    { id: 't3', name: 'Foundation Work', duration: 5, dependencies: ['t2'], category: 'foundation' },
    { id: 't4', name: 'Rough Framing', duration: 7, dependencies: ['t3'], category: 'framing' },
    { id: 't5', name: 'Electrical Rough-In', duration: 4, dependencies: ['t4'], category: 'electrical' },
    { id: 't6', name: 'Plumbing Rough-In', duration: 4, dependencies: ['t4'], category: 'plumbing' },
    { id: 't7', name: 'HVAC Installation', duration: 3, dependencies: ['t4'], category: 'hvac' },
    { id: 't8', name: 'Insulation', duration: 2, dependencies: ['t5', 't6', 't7'], category: 'insulation' },
    { id: 't9', name: 'Drywall Installation', duration: 4, dependencies: ['t8'], category: 'drywall' },
    { id: 't10', name: 'Interior Painting', duration: 3, dependencies: ['t9'], category: 'finish' },
    { id: 't11', name: 'Flooring Installation', duration: 3, dependencies: ['t9'], category: 'finish' },
    { id: 't12', name: 'Fixture Installation', duration: 2, dependencies: ['t10', 't11'], category: 'finish' },
    { id: 't13', name: 'Final Inspection', duration: 1, dependencies: ['t12'], category: 'finish' },
  ],
  criticalPath: [],
  totalDuration: 0,
  createdAt: Date.now(),
  createdBy: 'system',
  updatedAt: Date.now(),
};

/**
 * Task category color mapping (dark theme compatible)
 */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  prep: { bg: 'bg-slate-700/50', border: 'border-slate-500', text: 'text-slate-200' },
  demo: { bg: 'bg-red-900/50', border: 'border-red-600', text: 'text-red-300' },
  foundation: { bg: 'bg-amber-900/50', border: 'border-amber-600', text: 'text-amber-300' },
  framing: { bg: 'bg-yellow-900/50', border: 'border-yellow-600', text: 'text-yellow-300' },
  electrical: { bg: 'bg-blue-900/50', border: 'border-blue-500', text: 'text-blue-300' },
  plumbing: { bg: 'bg-cyan-900/50', border: 'border-cyan-500', text: 'text-cyan-300' },
  hvac: { bg: 'bg-green-900/50', border: 'border-green-500', text: 'text-green-300' },
  insulation: { bg: 'bg-purple-900/50', border: 'border-purple-500', text: 'text-purple-300' },
  drywall: { bg: 'bg-indigo-900/50', border: 'border-indigo-500', text: 'text-indigo-300' },
  finish: { bg: 'bg-pink-900/50', border: 'border-pink-500', text: 'text-pink-300' },
};

export function TimeView({ projectId }: TimeViewProps) {
  const [cpm, setCpm] = useState<CPM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('gantt');

  // Load CPM data
  useEffect(() => {
    const loadCPM = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getCPM(projectId);

        if (data) {
          setCpm(data);
        } else {
          // Use sample data when no real CPM exists
          setCpm(SAMPLE_CPM);
        }
      } catch (err) {
        console.error('Error loading CPM:', err);
        // Fall back to sample data on error
        setCpm(SAMPLE_CPM);
      } finally {
        setLoading(false);
      }
    };

    loadCPM();
  }, [projectId]);

  // Calculate critical path and task positions
  const processedTasks = useMemo(() => {
    if (!cpm) return { tasks: [], criticalPath: [], totalDuration: 0 };

    const { criticalPath, totalDuration, taskEndDates } = calculateCriticalPath(cpm.tasks);

    // Calculate start dates for each task
    const taskStartDates = new Map<string, number>();
    cpm.tasks.forEach((task) => {
      const endDate = taskEndDates.get(task.id) || 0;
      taskStartDates.set(task.id, endDate - task.duration);
    });

    // Enhance tasks with calculated values
    const enhancedTasks: (CPMTask & { startDay: number; isCritical: boolean })[] = cpm.tasks.map(
      (task) => ({
        ...task,
        startDay: taskStartDates.get(task.id) || 0,
        isCritical: criticalPath.includes(task.id),
      })
    );

    return {
      tasks: enhancedTasks,
      criticalPath,
      totalDuration,
    };
  }, [cpm]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-truecost-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-truecost-text-secondary">Loading project schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-truecost-danger mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-truecost-cyan text-truecost-bg-primary rounded hover:bg-truecost-teal"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!cpm) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-truecost-text-primary mb-2">No Schedule Data</h3>
          <p className="text-truecost-text-secondary">Generate an estimate to see the project timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-truecost-glass-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-truecost-text-primary">Project Timeline</h1>
            <p className="text-sm text-truecost-text-secondary mt-1">
              Total Duration: <span className="font-semibold text-truecost-cyan">{processedTasks.totalDuration} days</span>
              {processedTasks.criticalPath.length > 0 && (
                <span className="ml-4">
                  Critical Path:{' '}
                  <span className="font-semibold text-truecost-danger">
                    {processedTasks.criticalPath.length} tasks
                  </span>
                </span>
              )}
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-truecost-glass-border bg-truecost-glass-bg p-1">
            <button
              onClick={() => setViewMode('gantt')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === 'gantt'
                  ? 'bg-gradient-to-r from-truecost-cyan/20 to-truecost-teal/20 border border-truecost-cyan/40 text-truecost-cyan'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg border border-transparent'
              }`}
            >
              Gantt Chart
            </button>
            <button
              onClick={() => setViewMode('network')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === 'network'
                  ? 'bg-gradient-to-r from-truecost-cyan/20 to-truecost-teal/20 border border-truecost-cyan/40 text-truecost-cyan'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg border border-transparent'
              }`}
            >
              CPM Network
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-truecost-cyan/20 to-truecost-teal/20 border border-truecost-cyan/40 text-truecost-cyan'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary hover:bg-truecost-glass-bg border border-transparent'
              }`}
            >
              Task List
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'gantt' && (
          <GanttChart
            tasks={processedTasks.tasks}
            totalDuration={processedTasks.totalDuration}
          />
        )}

        {viewMode === 'network' && (
          <CPMNetworkDiagram
            tasks={processedTasks.tasks}
            criticalPath={processedTasks.criticalPath}
          />
        )}

        {viewMode === 'list' && <TaskListView tasks={processedTasks.tasks} />}
      </div>
    </div>
  );
}

/**
 * Gantt Chart visualization
 */
function GanttChart({
  tasks,
  totalDuration,
}: {
  tasks: (CPMTask & { startDay: number; isCritical: boolean })[];
  totalDuration: number;
}) {
  // Generate day markers
  const dayMarkers = Array.from({ length: totalDuration + 1 }, (_, i) => i);

  // Calculate pixel width per day (responsive)
  const dayWidth = 40;
  const chartWidth = (totalDuration + 1) * dayWidth;

  return (
    <div className="glass-panel rounded-lg shadow-sm border border-truecost-glass-border overflow-hidden">
      {/* Legend */}
      <div className="px-4 py-2 bg-truecost-bg-secondary border-b border-truecost-glass-border flex items-center gap-4 text-sm">
        <span className="font-medium text-gray-700">Legend:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-500 rounded" />
          <span className="text-truecost-text-secondary">Critical Path</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-500 rounded" />
          <span className="text-truecost-text-secondary">Standard Task</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: chartWidth + 200 }}>
          {/* Header row with days */}
          <div className="flex border-b border-truecost-glass-border">
            <div className="w-48 flex-shrink-0 px-4 py-2 bg-gray-100 font-medium text-gray-700 border-r border-truecost-glass-border">
              Task
            </div>
            <div className="flex-1 flex">
              {dayMarkers.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs text-truecost-text-muted border-r border-truecost-glass-border"
                  style={{ width: dayWidth }}
                >
                  Day {day + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Task rows */}
          {tasks.map((task, index) => {
            const colors = CATEGORY_COLORS[task.category || 'prep'] || CATEGORY_COLORS.prep;

            return (
              <div
                key={task.id}
                className={`flex border-b border-truecost-glass-border ${
                  index % 2 === 0 ? 'glass-panel' : 'bg-truecost-bg-secondary/50'
                }`}
              >
                {/* Task name */}
                <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-truecost-glass-border">
                  <div className="font-medium text-truecost-text-primary text-sm">{task.name}</div>
                  <div className="text-xs text-truecost-text-muted">
                    {task.duration} day{task.duration !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Gantt bar area */}
                <div className="flex-1 relative py-2">
                  <div
                    className={`absolute h-8 rounded ${
                      task.isCritical ? 'bg-red-500' : colors.bg
                    } ${task.isCritical ? '' : colors.border} border flex items-center justify-center text-xs font-medium ${
                      task.isCritical ? 'text-white' : colors.text
                    }`}
                    style={{
                      left: task.startDay * dayWidth,
                      width: task.duration * dayWidth - 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {task.duration > 2 && task.name}
                    {task.isCritical && <span className="ml-1">★</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Task List view
 */
function TaskListView({
  tasks,
}: {
  tasks: (CPMTask & { startDay: number; isCritical: boolean })[];
}) {
  return (
    <div className="glass-panel rounded-lg shadow-sm border border-truecost-glass-border">
      <table className="w-full">
        <thead>
          <tr className="bg-truecost-bg-secondary border-b border-truecost-glass-border">
            <th className="text-left py-3 px-4 font-semibold text-truecost-text-secondary">Task</th>
            <th className="text-left py-3 px-4 font-semibold text-truecost-text-secondary">Category</th>
            <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">Duration</th>
            <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">Start Day</th>
            <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">End Day</th>
            <th className="text-center py-3 px-4 font-semibold text-truecost-text-secondary">Dependencies</th>
            <th className="text-center py-3 px-4 font-semibold text-truecost-text-secondary">Critical</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => (
            <tr
              key={task.id}
              className={`border-b border-truecost-glass-border ${
                task.isCritical ? 'bg-red-50' : index % 2 === 0 ? 'glass-panel' : 'bg-truecost-bg-secondary/50'
              }`}
            >
              <td className="py-3 px-4 font-medium text-truecost-text-primary">{task.name}</td>
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    CATEGORY_COLORS[task.category || 'prep']?.bg || 'bg-gray-200'
                  } ${CATEGORY_COLORS[task.category || 'prep']?.text || 'text-gray-800'}`}
                >
                  {task.category || 'General'}
                </span>
              </td>
              <td className="py-3 px-4 text-right text-truecost-text-primary">
                {task.duration} day{task.duration !== 1 ? 's' : ''}
              </td>
              <td className="py-3 px-4 text-right text-truecost-text-primary">Day {task.startDay + 1}</td>
              <td className="py-3 px-4 text-right text-truecost-text-primary">
                Day {task.startDay + task.duration}
              </td>
              <td className="py-3 px-4 text-center text-truecost-text-secondary text-sm">
                {task.dependencies.length > 0
                  ? tasks
                      .filter((t) => task.dependencies.includes(t.id))
                      .map((t) => t.name)
                      .join(', ')
                  : '—'}
              </td>
              <td className="py-3 px-4 text-center">
                {task.isCritical ? (
                  <span className="text-red-600 font-bold">★ Yes</span>
                ) : (
                  <span className="text-truecost-text-muted">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * CPM Network Diagram - displays task nodes with edges showing dependencies
 * Critical path is highlighted in red
 */
function CPMNetworkDiagram({
  tasks,
  criticalPath,
}: {
  tasks: (CPMTask & { startDay: number; isCritical: boolean })[];
  criticalPath: string[];
}) {
  const [selectedTask, setSelectedTask] = useState<(CPMTask & { startDay: number; isCritical: boolean }) | null>(null);

  // Calculate node positions using a layered approach
  // Tasks are positioned based on their dependencies (topological layers)
  const nodePositions = useMemo(() => {
    const positions = new Map<string, NodePosition>();
    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 100;
    const H_SPACING = 80;
    const V_SPACING = 40;

    // Build dependency graph
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const dependents = new Map<string, string[]>();
    tasks.forEach((task) => {
      task.dependencies.forEach((depId) => {
        if (!dependents.has(depId)) {
          dependents.set(depId, []);
        }
        dependents.get(depId)!.push(task.id);
      });
    });

    // Calculate layer for each task (longest path from any start node)
    const layers = new Map<string, number>();

    function calculateLayer(taskId: string, visited: Set<string>): number {
      if (layers.has(taskId)) return layers.get(taskId)!;
      if (visited.has(taskId)) return 0; // Cycle detection

      visited.add(taskId);
      const task = taskMap.get(taskId);
      if (!task || task.dependencies.length === 0) {
        layers.set(taskId, 0);
        return 0;
      }

      let maxDepLayer = -1;
      task.dependencies.forEach((depId) => {
        maxDepLayer = Math.max(maxDepLayer, calculateLayer(depId, visited));
      });

      const layer = maxDepLayer + 1;
      layers.set(taskId, layer);
      return layer;
    }

    tasks.forEach((task) => calculateLayer(task.id, new Set()));

    // Group tasks by layer
    const layerGroups = new Map<number, string[]>();
    layers.forEach((layer, taskId) => {
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(taskId);
    });

    // Position nodes
    const maxLayer = Math.max(...Array.from(layers.values()));
    layerGroups.forEach((taskIds, layer) => {
      const x = layer * (NODE_WIDTH + H_SPACING) + 50;
      taskIds.forEach((taskId, index) => {
        const y = index * (NODE_HEIGHT + V_SPACING) + 50;
        positions.set(taskId, { x, y, width: NODE_WIDTH, height: NODE_HEIGHT });
      });
    });

    return { positions, maxLayer, layerGroups };
  }, [tasks]);

  // Calculate SVG dimensions
  const svgWidth = (nodePositions.maxLayer + 1) * 260 + 100;
  const maxNodesInLayer = Math.max(
    ...Array.from(nodePositions.layerGroups.values()).map((g) => g.length)
  );
  const svgHeight = maxNodesInLayer * 140 + 100;

  // Helper to calculate edge path between two nodes
  function getEdgePath(fromId: string, toId: string): string {
    const from = nodePositions.positions.get(fromId);
    const to = nodePositions.positions.get(toId);
    if (!from || !to) return '';

    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y + to.height / 2;

    // Bezier curve for smooth edges
    const ctrlX1 = startX + 40;
    const ctrlX2 = endX - 40;

    return `M ${startX} ${startY} C ${ctrlX1} ${startY}, ${ctrlX2} ${endY}, ${endX} ${endY}`;
  }

  // Check if edge is on critical path
  function isEdgeCritical(fromId: string, toId: string): boolean {
    const fromIndex = criticalPath.indexOf(fromId);
    const toIndex = criticalPath.indexOf(toId);
    return fromIndex !== -1 && toIndex !== -1 && toIndex === fromIndex + 1;
  }

  return (
    <div className="glass-panel rounded-lg shadow-sm border border-truecost-glass-border overflow-hidden">
      {/* Legend */}
      <div className="px-4 py-2 bg-truecost-bg-secondary border-b border-truecost-glass-border flex items-center gap-4 text-sm">
        <span className="font-medium text-gray-700">Legend:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-700" />
          <span className="text-truecost-text-secondary">Critical Path</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-100 rounded border-2 border-blue-400" />
          <span className="text-truecost-text-secondary">Standard Task</span>
        </div>
        <div className="flex items-center gap-1">
          <svg width="30" height="10">
            <line x1="0" y1="5" x2="30" y2="5" stroke="#ef4444" strokeWidth="3" markerEnd="url(#arrowhead-critical)" />
          </svg>
          <span className="text-truecost-text-secondary">Critical Dependency</span>
        </div>
        <div className="flex items-center gap-1">
          <svg width="30" height="10">
            <line x1="0" y1="5" x2="30" y2="5" stroke="#9ca3af" strokeWidth="2" />
          </svg>
          <span className="text-truecost-text-secondary">Standard Dependency</span>
        </div>
      </div>

      {/* Network Diagram */}
      <div className="overflow-auto p-4" style={{ maxHeight: '70vh' }}>
        <svg width={svgWidth} height={svgHeight} className="min-w-full">
          <defs>
            {/* Arrowhead marker for critical edges */}
            <marker
              id="arrowhead-critical"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
            {/* Arrowhead marker for standard edges */}
            <marker
              id="arrowhead-standard"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
            </marker>
          </defs>

          {/* Draw edges first (so they appear behind nodes) */}
          {tasks.map((task) =>
            task.dependencies.map((depId) => {
              const isCritical = isEdgeCritical(depId, task.id);
              return (
                <path
                  key={`${depId}-${task.id}`}
                  d={getEdgePath(depId, task.id)}
                  fill="none"
                  stroke={isCritical ? '#ef4444' : '#9ca3af'}
                  strokeWidth={isCritical ? 3 : 2}
                  markerEnd={isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead-standard)'}
                  className="transition-all"
                />
              );
            })
          )}

          {/* Draw nodes */}
          {tasks.map((task) => {
            const pos = nodePositions.positions.get(task.id);
            if (!pos) return null;

            const colors = CATEGORY_COLORS[task.category || 'prep'] || CATEGORY_COLORS.prep;
            const ES = task.startDay; // Early Start
            const EF = task.startDay + task.duration; // Early Finish
            // For simplicity, LS/LF = ES/EF for critical tasks, otherwise calculate slack
            const slack = task.isCritical ? 0 : 1; // Simplified - in real CPM this would be calculated
            const LS = ES + slack; // Late Start
            const LF = EF + slack; // Late Finish

            return (
              <g
                key={task.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => setSelectedTask(task)}
                className="cursor-pointer"
              >
                {/* Node background */}
                <rect
                  width={pos.width}
                  height={pos.height}
                  rx="8"
                  ry="8"
                  fill={task.isCritical ? '#fef2f2' : '#f0f9ff'}
                  stroke={task.isCritical ? '#ef4444' : '#3b82f6'}
                  strokeWidth={task.isCritical ? 3 : 2}
                  className="transition-all hover:stroke-[4px]"
                />

                {/* Task name header */}
                <rect
                  width={pos.width}
                  height={28}
                  rx="8"
                  ry="8"
                  fill={task.isCritical ? '#ef4444' : colors.bg.replace('bg-', '#').replace('-200', '')}
                  className={task.isCritical ? '' : colors.bg}
                />
                <rect
                  y={20}
                  width={pos.width}
                  height={8}
                  fill={task.isCritical ? '#ef4444' : colors.bg.replace('bg-', '#').replace('-200', '')}
                  className={task.isCritical ? '' : colors.bg}
                />

                {/* Task name */}
                <text
                  x={pos.width / 2}
                  y={18}
                  textAnchor="middle"
                  className={`text-xs font-semibold ${task.isCritical ? 'fill-white' : colors.text}`}
                  fill={task.isCritical ? 'white' : undefined}
                >
                  {task.name.length > 20 ? task.name.substring(0, 18) + '...' : task.name}
                </text>

                {/* Duration */}
                <text x={pos.width / 2} y={45} textAnchor="middle" className="text-xs fill-gray-600">
                  Duration: {task.duration} day{task.duration !== 1 ? 's' : ''}
                </text>

                {/* ES/EF row */}
                <text x={10} y={65} className="text-[10px] fill-gray-500">
                  ES: {ES}
                </text>
                <text x={pos.width - 10} y={65} textAnchor="end" className="text-[10px] fill-gray-500">
                  EF: {EF}
                </text>

                {/* LS/LF row */}
                <text x={10} y={82} className="text-[10px] fill-gray-500">
                  LS: {LS}
                </text>
                <text x={pos.width - 10} y={82} textAnchor="end" className="text-[10px] fill-gray-500">
                  LF: {LF}
                </text>

                {/* Float/Slack */}
                <text x={pos.width / 2} y={95} textAnchor="middle" className="text-[10px] fill-gray-400">
                  Float: {slack}
                </text>

                {/* Critical path indicator */}
                {task.isCritical && (
                  <text
                    x={pos.width - 8}
                    y={18}
                    textAnchor="end"
                    className="text-xs fill-yellow-300 font-bold"
                  >
                    ★
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTask(null)}>
          <div className="glass-panel rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-truecost-text-primary">{selectedTask.name}</h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-truecost-text-muted hover:text-truecost-text-secondary"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-truecost-text-secondary">Category:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${CATEGORY_COLORS[selectedTask.category || 'prep']?.bg || 'bg-gray-200'} ${CATEGORY_COLORS[selectedTask.category || 'prep']?.text || 'text-gray-800'}`}>
                  {selectedTask.category || 'General'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-secondary">Duration:</span>
                <span className="font-medium">{selectedTask.duration} day{selectedTask.duration !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-secondary">Start Day:</span>
                <span className="font-medium">Day {selectedTask.startDay + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-secondary">End Day:</span>
                <span className="font-medium">Day {selectedTask.startDay + selectedTask.duration}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-truecost-text-secondary">Critical Path:</span>
                {selectedTask.isCritical ? (
                  <span className="text-red-600 font-bold">★ Yes</span>
                ) : (
                  <span className="text-truecost-text-muted">No</span>
                )}
              </div>
              {selectedTask.dependencies.length > 0 && (
                <div>
                  <span className="text-truecost-text-secondary">Dependencies:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedTask.dependencies.map((depId) => {
                      const depTask = tasks.find((t) => t.id === depId);
                      return (
                        <span key={depId} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {depTask?.name || depId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
