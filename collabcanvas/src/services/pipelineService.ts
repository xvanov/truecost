/**
 * Pipeline Service
 * Handles agent pipeline orchestration for estimate generation
 * Story: 6-2 - Two-phase UI with progress tracking
 */

import { doc, onSnapshot, collection, query, orderBy, limit, getDoc } from 'firebase/firestore';
import { auth, firestore } from './firebase';

/**
 * Pipeline stage names (from Epic 2 deep agent pipeline)
 * Mirrors the backend AGENT_SEQUENCE defined in functions/agents/agent_cards.py
 */
export const PIPELINE_STAGES = [
  { id: 'cad_analysis', name: 'Analyzing blueprints', weight: 10 },
  { id: 'location', name: 'Gathering location data', weight: 15 },
  { id: 'scope', name: 'Defining project scope', weight: 20 },
  { id: 'code_compliance', name: 'Checking code compliance', weight: 10 },
  { id: 'cost', name: 'Calculating costs', weight: 20 },
  { id: 'risk', name: 'Assessing risks', weight: 10 },
  { id: 'timeline', name: 'Building timeline', weight: 15 },
  { id: 'final', name: 'Finalizing estimate', weight: 10 },
] as const;

export type PipelineStageId = typeof PIPELINE_STAGES[number]['id'];

/**
 * Pipeline status tracked in Firestore
 */
export interface PipelineProgress {
  status: 'idle' | 'running' | 'complete' | 'error';
  currentStage: PipelineStageId | null;
  stageName: string;
  completedStages: PipelineStageId[];
  progressPercent: number;
  startedAt: number | null;
  completedAt: number | null;
  error?: string;
}

/**
 * Agent output stored in Firestore subcollection
 */
export interface AgentOutput {
  agentId: string;
  agentName: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  output?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

/**
 * Initial pipeline progress state
 */
export const INITIAL_PROGRESS: PipelineProgress = {
  status: 'idle',
  currentStage: null,
  stageName: '',
  completedStages: [],
  progressPercent: 0,
  startedAt: null,
  completedAt: null,
};

export type ClarificationOutputPayload = Record<string, unknown> & { estimateId?: string };

const BACKEND_STAGE_MAP: Record<string, PipelineStageId> = {
  location: 'location',
  scope: 'scope',
  code_compliance: 'code_compliance',
  cost: 'cost',
  risk: 'risk',
  timeline: 'timeline',
  final: 'final',
};

function mapBackendStage(stage?: string | null): PipelineStageId | null {
  if (!stage) return null;
  return BACKEND_STAGE_MAP[stage] ?? null;
}

function mapBackendStatus(status?: string): PipelineProgress['status'] {
  if (!status) return 'idle';
  const normalized = status.toLowerCase();
  if (normalized === 'processing' || normalized === 'running') return 'running';
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'final') return 'complete';
  if (normalized === 'failed' || normalized === 'error') return 'error';
  return 'idle';
}

function coerceTimestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const ts = value as { seconds?: number; nanoseconds?: number; toMillis?: () => number };
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') {
      const nanos = typeof ts.nanoseconds === 'number' ? ts.nanoseconds : 0;
      return ts.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
}

function calculateProgress(completedStages: PipelineStageId[], currentStage: PipelineStageId | null): number {
  let completedWeight = 0;
  let currentWeight = 0;

  for (const stage of PIPELINE_STAGES) {
    if (completedStages.includes(stage.id)) {
      completedWeight += stage.weight;
    } else if (stage.id === currentStage) {
      currentWeight = stage.weight * 0.5;
      break;
    }
  }

  return Math.min(Math.round(completedWeight + currentWeight), 100);
}

function getStageName(stageId: PipelineStageId | null): string {
  if (!stageId) return '';
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId);
  return stage?.name || stageId;
}

function decorateCompletedStages(
  completed: PipelineStageId[],
  currentStage: PipelineStageId | null
): PipelineStageId[] {
  if (completed.includes('cad_analysis')) {
    return completed;
  }

  if (completed.length > 0 || currentStage) {
    return ['cad_analysis', ...completed];
  }

  return completed;
}

function getDeepPipelineHttpBaseUrl(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const override = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL;
  const region = 'us-central1';
  const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

  if (override) {
    return override.replace(/\/start_deep_pipeline$/, '');
  }

  if (useEmulators) {
    // Use localhost (not 127.0.0.1) to reduce cross-origin/CORS friction during local dev.
    return `http://localhost:5001/${projectId}/${region}`;
  }

  return `https://${region}-${projectId}.cloudfunctions.net`;
}

function ensureEstimateId(payload: ClarificationOutputPayload, projectId: string): string {
  if (typeof payload.estimateId === 'string' && payload.estimateId.length > 0) {
    return payload.estimateId;
  }
  const estimateId = `est-${projectId}-${Date.now()}`;
  payload.estimateId = estimateId;
  return estimateId;
}

/**
 * Trigger the estimate generation pipeline by calling the Python HTTP endpoint.
 */
export async function triggerEstimatePipeline(
  projectId: string,
  userId: string,
  clarificationOutput: ClarificationOutputPayload
): Promise<{ success: boolean; estimateId?: string; error?: string }> {
  try {
    const estimateId = ensureEstimateId(clarificationOutput, projectId);
    const baseUrl = getDeepPipelineHttpBaseUrl();

    let idToken: string | undefined;
    try {
      idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
    } catch {
      // Token optional when running against emulator
    }

    const response = await fetch(`${baseUrl}/start_deep_pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        userId,
        projectId,
        clarificationOutput,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; data?: { estimateId?: string }; error?: { message?: string } | string }
      | null;

    if (!response.ok || !data?.success) {
      const message =
        typeof data?.error === 'string'
          ? data.error
          : data?.error && typeof data.error === 'object'
            ? data.error.message
            : `HTTP ${response.status}`;

      console.warn('[REQUIRES ATTENTION] start_deep_pipeline failed', {
        component: 'pipelineService',
        projectId,
        httpStatus: response.status,
        body: data,
      });

      return { success: false, error: message || 'Failed to start pipeline' };
    }

    return {
      success: true,
      estimateId: data.data?.estimateId ?? estimateId,
    };
  } catch (error) {
    console.error('[PIPELINE] Error triggering pipeline:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start pipeline',
    };
  }
}

/**
 * Subscribe to pipeline progress updates via Firestore
 * Listens to /estimates/{estimateId}.pipelineStatus
 */
export function subscribeToPipelineProgress(
  estimateId: string,
  onUpdate: (progress: PipelineProgress) => void,
  onError: (error: Error) => void
): () => void {
  const estimateDocRef = doc(firestore, 'estimates', estimateId);

  return onSnapshot(
    estimateDocRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(INITIAL_PROGRESS);
        return;
      }

      const data = snapshot.data() as {
        status?: string;
        pipelineStatus?: {
          currentAgent?: string | null;
          completedAgents?: string[];
          progress?: number;
          startedAt?: unknown;
          completedAt?: unknown;
          error?: string;
        };
        startedAt?: unknown;
        completedAt?: unknown;
        error?: string;
      };

      const pipelineStatus = data.pipelineStatus || {};
      const completedAgents = pipelineStatus.completedAgents || [];
      const mappedCompleted = completedAgents
        .map((agent) => mapBackendStage(agent))
        .filter((stage): stage is PipelineStageId => Boolean(stage));
      const currentStage = mapBackendStage(pipelineStatus.currentAgent || null);
      const decoratedCompleted = decorateCompletedStages(mappedCompleted, currentStage);

      const progress: PipelineProgress = {
        status: mapBackendStatus(data.status),
        currentStage,
        stageName: getStageName(currentStage),
        completedStages: decoratedCompleted,
        progressPercent:
          typeof pipelineStatus.progress === 'number'
            ? pipelineStatus.progress
            : calculateProgress(decoratedCompleted, currentStage),
        startedAt: coerceTimestampToMillis(pipelineStatus.startedAt ?? data.startedAt ?? null),
        completedAt: coerceTimestampToMillis(pipelineStatus.completedAt ?? data.completedAt ?? null),
        error: pipelineStatus.error || data.error,
      };

      onUpdate(progress);
    },
    (error) => {
      console.error('[PIPELINE] Subscription error:', error);
      onError(error);
    }
  );
}

/**
 * Subscribe to individual agent outputs for detailed progress
 */
export function subscribeToAgentOutputs(
  estimateId: string,
  onUpdate: (outputs: AgentOutput[]) => void,
  onError: (error: Error) => void
): () => void {
  const outputsRef = collection(firestore, 'estimates', estimateId, 'agentOutputs');
  const q = query(outputsRef, orderBy('startedAt', 'desc'), limit(10));

  return onSnapshot(
    q,
    (snapshot) => {
      const outputs: AgentOutput[] = [];
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        outputs.push({
          agentId: docSnapshot.id,
          agentName: data.agentName || docSnapshot.id,
          status: data.status || 'pending',
          output: data.output,
          error: data.error,
          startedAt: data.startedAt || Date.now(),
          completedAt: data.completedAt,
        });
      });
      onUpdate(outputs);
    },
    (error) => {
      console.error('[PIPELINE] Agent outputs subscription error:', error);
      onError(error);
    }
  );
}

/**
 * Check if pipeline has already completed (BOM exists)
 */
export async function checkPipelineComplete(projectId: string): Promise<boolean> {
  try {
    const { getBOM } = await import('./bomService');
    const bom = await getBOM(projectId);
    return bom !== null && bom.totalMaterials.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the latest pipeline status for a given estimateId
 */
export async function getPipelineStatus(estimateId: string): Promise<PipelineProgress> {
  try {
    const estimateDocRef = doc(firestore, 'estimates', estimateId);
    const snapshot = await getDoc(estimateDocRef);

    if (snapshot.exists()) {
      const data = snapshot.data() as {
        status?: string;
        pipelineStatus?: {
          currentAgent?: string | null;
          completedAgents?: string[];
          progress?: number;
          startedAt?: unknown;
          completedAt?: unknown;
          error?: string;
        };
        startedAt?: unknown;
        completedAt?: unknown;
        error?: string;
      };

      const pipelineStatus = data.pipelineStatus || {};
      const completedAgents = pipelineStatus.completedAgents || [];
      const mappedCompleted = completedAgents
        .map((agent) => mapBackendStage(agent))
        .filter((stage): stage is PipelineStageId => Boolean(stage));
      const currentStage = mapBackendStage(pipelineStatus.currentAgent || null);
      const decoratedCompleted = decorateCompletedStages(mappedCompleted, currentStage);

      return {
        status: mapBackendStatus(data.status),
        currentStage,
        stageName: getStageName(currentStage),
        completedStages: decoratedCompleted,
        progressPercent:
          typeof pipelineStatus.progress === 'number'
            ? pipelineStatus.progress
            : calculateProgress(decoratedCompleted, currentStage),
        startedAt: coerceTimestampToMillis(pipelineStatus.startedAt ?? data.startedAt ?? null),
        completedAt: coerceTimestampToMillis(pipelineStatus.completedAt ?? data.completedAt ?? null),
        error: pipelineStatus.error || data.error,
      };
    }

    return INITIAL_PROGRESS;
  } catch (error) {
    console.error('[PIPELINE] Error getting status:', error);
    return INITIAL_PROGRESS;
  }
}

/**
 * Build a placeholder ClarificationOutput for debugging flows
 */
export function buildFallbackClarificationOutput(params: {
  projectId: string;
  estimateId?: string;
}): ClarificationOutputPayload {
  const estimateId = params.estimateId ?? `est-${params.projectId}-${Date.now()}`;
  return {
    estimateId,
    schemaVersion: '3.0.0',
    status: 'complete',
    projectInfo: {
      name: 'Placeholder Project',
      location: 'Unknown',
      projectType: 'renovation',
      squareFootage: 1500,
    },
    scope: {
      items: [],
      totalArea: 1500,
    },
    clarifications: [],
    cadData: {
      fileUrl: 'about:blank',
      fileType: 'image/png',
      extractionMethod: 'manual',
      extractionConfidence: 0.5,
      spaceModel: {
        totalSqft: 1500,
        boundingBox: { length: 30, width: 50, height: 9, units: 'feet' },
        scale: { detected: false, ratio: 0, units: 'feet' },
        rooms: [],
        walls: [],
        openings: [],
      },
      spatialRelationships: {
        layoutNarrative: 'Placeholder layout narrative. Replace with real annotation data.',
        roomAdjacencies: [],
        entryPoints: [],
      },
    },
    conversation: {
      inputMethod: 'text',
      messageCount: 0,
      clarificationQuestions: [],
      confidenceScore: 0.5,
    },
    flags: {
      lowConfidenceItems: [],
      missingData: ['Real clarification output not generated – using fallback payload'],
      userVerificationRequired: false,
      verificationItems: [],
    },
  };
}

