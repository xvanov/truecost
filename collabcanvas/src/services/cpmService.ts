/**
 * CPM Service
 * Handles Critical Path Method generation and operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { CPM, CPMTask } from '../types/cpm';

export interface CPMGenerationOptions {
  projectId: string;
  userId: string;
  scope?: { items: Array<{ scope: string; description: string }> };
  annotations?: unknown[]; // Shape data from canvas for context
}

/**
 * Generate CPM for a project
 * Calls Cloud Function to analyze scope and generate task dependencies
 */
export async function generateCPM(options: CPMGenerationOptions): Promise<CPM> {
  try {
    // TODO: Create generateCPM Cloud Function
    // For now, return a placeholder structure
    // The actual implementation will call a Cloud Function that uses AI to analyze
    // scope and generate tasks with dependencies
    
    const generateCPMFn = httpsCallable(functions, 'generateCPM');
    
    const result = await generateCPMFn({
      projectId: options.projectId,
      userId: options.userId,
      scope: options.scope,
      annotations: options.annotations || [],
    });

    const data = result.data as { cpm: CPM; success: boolean; error?: string };
    
    if (!data.success || !data.cpm) {
      throw new Error(data.error || 'Failed to generate CPM');
    }

    return data.cpm;
  } catch (error) {
    console.error('CPM Generation Error:', error);
    throw new Error(`Failed to generate CPM: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get CPM for a project from Firestore
 */
export async function getCPM(projectId: string): Promise<CPM | null> {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { firestore } = await import('./firebase');
    
    const cpmRef = doc(firestore, 'projects', projectId, 'cpm', 'data');
    const cpmSnap = await getDoc(cpmRef);
    
    if (!cpmSnap.exists()) {
      return null;
    }
    
    const data = cpmSnap.data();
    return {
      id: cpmSnap.id,
      ...data,
    } as CPM;
  } catch (error) {
    console.error('Error getting CPM:', error);
    throw error;
  }
}

/**
 * Save CPM to Firestore
 */
export async function saveCPM(projectId: string, cpm: CPM, userId: string): Promise<void> {
  try {
    const { doc, setDoc, getDoc } = await import('firebase/firestore');
    const { firestore } = await import('./firebase');

    const cpmRef = doc(firestore, 'projects', projectId, 'cpm', 'data');

    // Check if document exists to determine if we need createdAt/createdBy
    const existingDoc = await getDoc(cpmRef);
    const now = Date.now();

    const dataToSave = {
      ...cpm,
      projectId,
      updatedAt: now,
      updatedBy: userId,
      // Only set createdAt/createdBy if document doesn't exist
      ...(existingDoc.exists() ? {} : {
        createdAt: now,
        createdBy: userId,
      }),
    };

    await setDoc(cpmRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error saving CPM:', error);
    throw error;
  }
}

/**
 * Calculate critical path from tasks
 */
export function calculateCriticalPath(tasks: CPMTask[]): {
  criticalPath: string[];
  totalDuration: number;
  taskEndDates: Map<string, number>;
} {
  // Maximum iterations to prevent infinite loops from circular dependencies
  const MAX_ITERATIONS = tasks.length * 2 + 10;

  // Simple forward pass to calculate earliest start/end times
  const earliestStart = new Map<string, number>();
  const earliestEnd = new Map<string, number>();

  // Initialize all tasks
  tasks.forEach(task => {
    earliestStart.set(task.id, 0);
    earliestEnd.set(task.id, 0);
  });

  // Forward pass with iteration limit
  let changed = true;
  let iterations = 0;
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    tasks.forEach(task => {
      let maxDependencyEnd = 0;
      task.dependencies.forEach(depId => {
        const depEnd = earliestEnd.get(depId) || 0;
        if (depEnd > maxDependencyEnd) {
          maxDependencyEnd = depEnd;
        }
      });

      const currentStart = earliestStart.get(task.id) || 0;
      if (maxDependencyEnd > currentStart) {
        earliestStart.set(task.id, maxDependencyEnd);
        earliestEnd.set(task.id, maxDependencyEnd + task.duration);
        changed = true;
      } else if (earliestEnd.get(task.id) === 0) {
        earliestEnd.set(task.id, maxDependencyEnd + task.duration);
        changed = true;
      }
    });
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn('CPM calculation hit iteration limit - possible circular dependencies');
  }

  // Find total project duration
  let totalDuration = 0;
  tasks.forEach(task => {
    const endTime = earliestEnd.get(task.id) || 0;
    if (endTime > totalDuration) {
      totalDuration = endTime;
    }
  });

  // Backward pass to find critical path
  const latestStart = new Map<string, number>();
  const latestEnd = new Map<string, number>();

  // Initialize latest times
  tasks.forEach(task => {
    latestEnd.set(task.id, totalDuration);
    latestStart.set(task.id, totalDuration);
  });

  // Backward pass with iteration limit
  changed = true;
  iterations = 0;
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    tasks.forEach(task => {
      const endTime = latestEnd.get(task.id) || totalDuration;
      const startTime = endTime - task.duration;
      latestStart.set(task.id, startTime);

      // Update dependencies
      task.dependencies.forEach(depId => {
        const depLatestEnd = latestStart.get(task.id) || totalDuration;
        const currentLatestEnd = latestEnd.get(depId) || totalDuration;
        if (depLatestEnd < currentLatestEnd) {
          latestEnd.set(depId, depLatestEnd);
          changed = true;
        }
      });
    });
  }

  // Find critical path (tasks with zero slack)
  const criticalPath: string[] = [];
  tasks.forEach(task => {
    const earliestStartTime = earliestStart.get(task.id) || 0;
    const latestStartTime = latestStart.get(task.id) || totalDuration;
    const slack = latestStartTime - earliestStartTime;

    if (slack === 0) {
      criticalPath.push(task.id);
    }
  });

  return {
    criticalPath,
    totalDuration,
    taskEndDates: earliestEnd,
  };
}

/**
 * Timeline Output from the estimation pipeline's Timeline Agent
 * This is the structure stored in estimates/{estimateId}.timelineOutput
 */
export interface TimelineOutputTask {
  id: string;
  name: string;
  phase: string;
  duration: number;
  start?: string;
  end?: string;
  dependencies: string[];
  isCritical: boolean;
  isMilestone?: boolean;
  trade?: string;
  laborHours?: number;
}

export interface TimelineOutput {
  estimateId: string;
  generatedDate?: string;
  startDate: string;
  endDate: string;
  tasks: TimelineOutputTask[];
  milestones?: Array<{
    id: string;
    name: string;
    date: string;
    description?: string;
  }>;
  criticalPath: string[];
  totalDuration: number;
  totalCalendarDays: number;
  durationRange?: {
    optimistic: number;
    expected: number;
    pessimistic: number;
  };
  weatherImpact?: {
    expectedDelayDays: number;
    bufferDays: number;
    riskLevel: string;
  };
  summary?: string;
  assumptions?: string[];
  scheduleRisks?: string[];
  confidence?: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Map Timeline Agent phase names to CPM category names
 */
const PHASE_TO_CATEGORY: Record<string, string> = {
  preconstruction: 'prep',
  demolition: 'demo',
  site_prep: 'prep',
  foundation: 'foundation',
  framing: 'framing',
  rough_in: 'rough-in',
  insulation: 'insulation',
  drywall: 'drywall',
  finish: 'finish',
  fixtures: 'finish',
  final_inspection: 'finish',
  punch_list: 'finish',
};

/**
 * Transform Timeline Agent output to CPM format
 *
 * @param timelineOutput - The timelineOutput from estimates/{estimateId}
 * @param projectId - The project ID
 * @param userId - The user ID who generated the estimate
 * @returns CPM object ready to save, or null if timeline has no valid tasks
 */
export function transformTimelineOutputToCPM(
  timelineOutput: TimelineOutput,
  projectId: string,
  userId: string
): CPM | null {
  // Check if timeline has an error or no tasks
  if (timelineOutput.error || !timelineOutput.tasks || timelineOutput.tasks.length === 0) {
    console.warn('[transformTimelineOutputToCPM] Timeline has no valid tasks or has error:', timelineOutput.error);
    return null;
  }

  const now = Date.now();

  // Transform tasks
  const cpmTasks: CPMTask[] = timelineOutput.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.trade ? `Trade: ${task.trade}` : undefined,
    duration: task.duration,
    dependencies: task.dependencies || [],
    isCritical: task.isCritical,
    category: PHASE_TO_CATEGORY[task.phase] || task.phase || 'general',
    // Optional: include start/end dates if available
    ...(task.start && { startDate: new Date(task.start).getTime() }),
    ...(task.end && { endDate: new Date(task.end).getTime() }),
  }));

  // Use critical path from timeline output, or calculate it
  let criticalPath = timelineOutput.criticalPath || [];
  let totalDuration = timelineOutput.totalDuration || 0;

  // If critical path not provided, calculate it
  if (criticalPath.length === 0 || totalDuration === 0) {
    const calculated = calculateCriticalPath(cpmTasks);
    criticalPath = calculated.criticalPath;
    totalDuration = calculated.totalDuration;
  }

  return {
    id: `cpm-${projectId}`,
    projectId,
    tasks: cpmTasks,
    criticalPath,
    totalDuration,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
  };
}

