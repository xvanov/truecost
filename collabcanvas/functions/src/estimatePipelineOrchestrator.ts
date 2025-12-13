/**
 * Estimate Pipeline Orchestrator
 * Dedicated cloud function to trigger and initialize the estimate generation pipeline.
 * Story: 6-2 - Two-phase UI with progress tracking
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

// Lazy initialization to avoid timeout during module load
let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    // Initialize Firebase Admin if not already initialized
    if (getApps().length === 0) {
      initializeApp();
    }
    _db = getFirestore();
  }
  return _db;
}

/**
 * Project context data gathered for the pipeline
 */
interface ProjectContext {
  projectId: string;
  projectName: string;
  projectDescription: string;
  backgroundImage: {
    url: string;
    width: number;
    height: number;
  } | null;
  scopeItems: Array<{
    scope: string;
    description: string;
  }>;
  shapes: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    // Additional shape properties
    [key: string]: unknown;
  }>;
}

/**
 * Pipeline stages for the estimate generation pipeline
 * Note: Clarification runs separately during Annotate phase (Epic 3)
 */
const _PIPELINE_STAGES = [
  'cad_analysis',
  'location',
  'scope',
  'cost',
  'risk',
  'final',
] as const;

type PipelineStageId = typeof _PIPELINE_STAGES[number];

interface PipelineStatus {
  status: 'idle' | 'running' | 'complete' | 'error';
  currentStage: PipelineStageId | null;
  completedStages: PipelineStageId[];
  startedAt: number | null;
  completedAt: number | null;
  error?: string;
  triggeredBy: string;
  projectId: string;
}

/**
 * Get the Python pipeline URL based on environment
 */
function getPythonPipelineUrl(): string {
  // Allow override via environment variable for flexible local dev
  if (process.env.PYTHON_FUNCTIONS_URL) {
    return `${process.env.PYTHON_FUNCTIONS_URL}/collabcanvas-dev/us-central1/start_deep_pipeline`;
  }
  // Check if we're running in the emulator
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // Python functions run on separate port (5002) to avoid conflict with TS emulator (5001)
    // Start Python server: cd ../functions && source venv/bin/activate && python serve_local.py
    return 'http://127.0.0.1:5002/collabcanvas-dev/us-central1/start_deep_pipeline';
  }
  // Production URL
  return 'https://us-central1-collabcanvas-dev.cloudfunctions.net/start_deep_pipeline';
}

/**
 * Build ClarificationOutput v3.0.0 from project context
 * This bridges the TypeScript orchestrator with the Python agent pipeline
 */
function buildClarificationOutput(
  context: ProjectContext,
  pipelineId: string
): Record<string, unknown> {
  return {
    version: '3.0.0',
    estimateId: pipelineId,
    timestamp: new Date().toISOString(),
    project: {
      name: context.projectName,
      description: context.projectDescription,
      type: 'construction', // Default, will be refined by agents
    },
    location: {
      address: '', // To be filled by location agent
      city: '',
      state: '',
      zip: '',
    },
    scope: {
      items: context.scopeItems.map((item) => ({
        category: item.scope,
        description: item.description,
        quantity: 1,
        unit: 'LS',
      })),
      totalArea: 0, // To be calculated from CAD
    },
    cadData: {
      hasBackgroundImage: !!context.backgroundImage,
      imageUrl: context.backgroundImage?.url || null,
      imageWidth: context.backgroundImage?.width || 0,
      imageHeight: context.backgroundImage?.height || 0,
      annotations: context.shapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        x: shape.x,
        y: shape.y,
        width: shape.w,
        height: shape.h,
      })),
    },
    metadata: {
      source: 'typescript-orchestrator',
      projectId: context.projectId,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Gather project context data for the pipeline
 */
async function gatherProjectContext(projectId: string): Promise<ProjectContext> {
  const db = getDb();

  // Get project document
  const projectRef = db.collection('projects').doc(projectId);
  const projectDoc = await projectRef.get();
  const projectData = projectDoc.data();

  // Get board state (background image)
  const boardRef = db.collection('projects').doc(projectId).collection('board').doc('state');
  const boardDoc = await boardRef.get();
  const boardData = boardDoc.exists ? boardDoc.data() : null;

  // Get scope items
  const scopeRef = db.collection('projects').doc(projectId).collection('scope').doc('data');
  const scopeDoc = await scopeRef.get();
  const scopeData = scopeDoc.exists ? scopeDoc.data() : null;

  // Get shapes (annotations)
  const shapesRef = db.collection('projects').doc(projectId).collection('shapes');
  const shapesSnapshot = await shapesRef.get();
  const shapes: ProjectContext['shapes'] = [];
  shapesSnapshot.forEach((doc) => {
    const data = doc.data();
    shapes.push({
      id: doc.id,
      type: data.type,
      x: data.x,
      y: data.y,
      w: data.w,
      h: data.h,
      ...data,
    });
  });

  return {
    projectId,
    projectName: projectData?.name || '',
    projectDescription: projectData?.description || '',
    backgroundImage: boardData?.backgroundImage
      ? {
          url: boardData.backgroundImage.url,
          width: boardData.backgroundImage.width,
          height: boardData.backgroundImage.height,
        }
      : null,
    scopeItems: scopeData?.items || [],
    shapes,
  };
}

/**
 * Trigger the estimate generation pipeline
 * This function:
 * 1. Validates the request
 * 2. Gathers project context (scope, plan, annotations)
 * 3. Creates/updates the pipeline status document with context
 * 4. Returns a pipelineId for tracking
 *
 * The actual agent execution is handled by the existing deep pipeline
 * infrastructure from Epic 2.
 */
export const triggerEstimatePipeline = onCall({
  cors: true,
  maxInstances: 10,
  memory: '512MiB', // Increased for context gathering
}, async (request) => {
  try {
    const { projectId, userId } = request.data;

    // Validate required fields
    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Project ID is required');
    }

    if (!userId) {
      throw new HttpsError('invalid-argument', 'User ID is required');
    }

    // Verify auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = getDb();

    // Verify the user has access to this project
    const projectRef = db.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      throw new HttpsError('not-found', 'Project not found');
    }

    const projectData = projectDoc.data();
    if (projectData?.ownerId !== request.auth.uid) {
      // Check if user is a collaborator
      const collaborators = projectData?.collaborators || [];
      const isCollaborator = collaborators.some(
        (c: { id: string }) => c.id === request.auth?.uid
      );
      if (!isCollaborator) {
        throw new HttpsError('permission-denied', 'User does not have access to this project');
      }
    }

    // Gather project context data
    console.log(`[PIPELINE] Gathering context for project ${projectId}`);
    const projectContext = await gatherProjectContext(projectId);
    console.log(`[PIPELINE] Context gathered:`, {
      projectName: projectContext.projectName,
      hasBackgroundImage: !!projectContext.backgroundImage,
      scopeItemCount: projectContext.scopeItems.length,
      shapeCount: projectContext.shapes.length,
    });

    // Generate pipeline ID
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = Date.now();

    // Initialize pipeline status document with context
    // Start from cad_analysis (clarification runs separately in Annotate phase)
    const pipelineStatus: PipelineStatus = {
      status: 'running',
      currentStage: 'cad_analysis',
      completedStages: [],
      startedAt,
      completedAt: null,
      triggeredBy: userId,
      projectId,
    };

    // Create/update the pipeline status document
    const statusRef = db.collection('projects').doc(projectId).collection('pipeline').doc('status');
    await statusRef.set({
      ...pipelineStatus,
      pipelineId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Store the project context separately for agent consumption
    const contextRef = db.collection('projects').doc(projectId).collection('pipeline').doc('context');
    await contextRef.set({
      ...projectContext,
      pipelineId,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`[PIPELINE] Started pipeline ${pipelineId} for project ${projectId}`);

    // Trigger the Python deep agent pipeline
    // The Python pipeline will sync progress back to /projects/{projectId}/pipeline/status
    try {
      const pythonPipelineUrl = getPythonPipelineUrl();
      console.log(`[PIPELINE] Calling Python pipeline at: ${pythonPipelineUrl}`);

      // Construct ClarificationOutput v3.0.0 from project context
      // This bridges the TypeScript orchestrator with the Python agent pipeline
      const clarificationOutput = buildClarificationOutput(projectContext, pipelineId);

      const response = await fetch(pythonPipelineUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          projectId, // Pass projectId for UI sync
          clarificationOutput,
        }),
      });

      const pythonResult = await response.json();

      if (!response.ok) {
        console.error('[PIPELINE] Python pipeline failed:', pythonResult);
        // Update status to error but don't throw - let the user see partial progress
        await statusRef.update({
          status: 'error',
          error: pythonResult.error?.message || 'Python pipeline failed to start',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        console.log('[PIPELINE] Python pipeline started:', pythonResult);
      }
    } catch (pythonError) {
      console.error('[PIPELINE] Failed to call Python pipeline:', pythonError);
      // Don't fail the whole function - the status is already created
      // The debug panel can be used to manually trigger the Python pipeline
    }

    return {
      success: true,
      pipelineId,
      message: 'Pipeline started successfully',
      status: pipelineStatus,
      context: {
        projectName: projectContext.projectName,
        hasBackgroundImage: !!projectContext.backgroundImage,
        scopeItemCount: projectContext.scopeItems.length,
        shapeCount: projectContext.shapes.length,
      },
    };

  } catch (error) {
    console.error('[PIPELINE] Error starting pipeline:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to start pipeline'
    );
  }
});

/**
 * Update pipeline stage (called by agent functions as they complete)
 */
export const updatePipelineStage = onCall({
  cors: true,
  maxInstances: 20,
  memory: '256MiB',
}, async (request) => {
  try {
    const { projectId, completedStage, nextStage, error } = request.data;

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Project ID is required');
    }

    const db = getDb();
    const statusRef = db.collection('projects').doc(projectId).collection('pipeline').doc('status');
    const statusDoc = await statusRef.get();

    if (!statusDoc.exists) {
      throw new HttpsError('not-found', 'Pipeline status not found');
    }

    const currentStatus = statusDoc.data() as PipelineStatus;
    const completedStages = [...(currentStatus.completedStages || [])];

    if (completedStage && !completedStages.includes(completedStage)) {
      completedStages.push(completedStage);
    }

    const updateData: Partial<PipelineStatus> & { updatedAt: FieldValue } = {
      completedStages,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (error) {
      updateData.status = 'error';
      updateData.error = error;
      updateData.completedAt = Date.now();
    } else if (nextStage) {
      updateData.currentStage = nextStage;
    } else if (completedStage === 'final') {
      // Pipeline complete
      updateData.status = 'complete';
      updateData.currentStage = null;
      updateData.completedAt = Date.now();
    }

    await statusRef.update(updateData);

    console.log(`[PIPELINE] Updated stage for project ${projectId}: ${completedStage} -> ${nextStage || 'complete'}`);

    return {
      success: true,
      completedStages,
      currentStage: updateData.currentStage || currentStatus.currentStage,
      status: updateData.status || currentStatus.status,
    };

  } catch (error) {
    console.error('[PIPELINE] Error updating stage:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to update pipeline stage'
    );
  }
});
