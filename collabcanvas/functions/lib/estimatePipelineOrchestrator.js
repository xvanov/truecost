"use strict";
/**
 * Estimate Pipeline Orchestrator
 * Dedicated cloud function to trigger and initialize the estimate generation pipeline.
 * Story: 6-2 - Two-phase UI with progress tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePipelineStage = exports.triggerEstimatePipeline = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
// Initialize Firebase Admin if not already initialized
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
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
];
/**
 * Get the Python pipeline URL based on environment
 */
function getPythonPipelineUrl() {
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
function buildClarificationOutput(context, pipelineId) {
    var _a, _b, _c;
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
            address: '',
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
            imageUrl: ((_a = context.backgroundImage) === null || _a === void 0 ? void 0 : _a.url) || null,
            imageWidth: ((_b = context.backgroundImage) === null || _b === void 0 ? void 0 : _b.width) || 0,
            imageHeight: ((_c = context.backgroundImage) === null || _c === void 0 ? void 0 : _c.height) || 0,
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
async function gatherProjectContext(projectId) {
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
    const shapes = [];
    shapesSnapshot.forEach((doc) => {
        const data = doc.data();
        shapes.push(Object.assign({ id: doc.id, type: data.type, x: data.x, y: data.y, w: data.w, h: data.h }, data));
    });
    return {
        projectId,
        projectName: (projectData === null || projectData === void 0 ? void 0 : projectData.name) || '',
        projectDescription: (projectData === null || projectData === void 0 ? void 0 : projectData.description) || '',
        backgroundImage: (boardData === null || boardData === void 0 ? void 0 : boardData.backgroundImage)
            ? {
                url: boardData.backgroundImage.url,
                width: boardData.backgroundImage.width,
                height: boardData.backgroundImage.height,
            }
            : null,
        scopeItems: (scopeData === null || scopeData === void 0 ? void 0 : scopeData.items) || [],
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
exports.triggerEstimatePipeline = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
    memory: '512MiB', // Increased for context gathering
}, async (request) => {
    var _a;
    try {
        const { projectId, userId } = request.data;
        // Validate required fields
        if (!projectId) {
            throw new https_1.HttpsError('invalid-argument', 'Project ID is required');
        }
        if (!userId) {
            throw new https_1.HttpsError('invalid-argument', 'User ID is required');
        }
        // Verify auth
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Verify the user has access to this project
        const projectRef = db.collection('projects').doc(projectId);
        const projectDoc = await projectRef.get();
        if (!projectDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Project not found');
        }
        const projectData = projectDoc.data();
        if ((projectData === null || projectData === void 0 ? void 0 : projectData.ownerId) !== request.auth.uid) {
            // Check if user is a collaborator
            const collaborators = (projectData === null || projectData === void 0 ? void 0 : projectData.collaborators) || [];
            const isCollaborator = collaborators.some((c) => { var _a; return c.id === ((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid); });
            if (!isCollaborator) {
                throw new https_1.HttpsError('permission-denied', 'User does not have access to this project');
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
        const pipelineStatus = {
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
        await statusRef.set(Object.assign(Object.assign({}, pipelineStatus), { pipelineId, updatedAt: firestore_1.FieldValue.serverTimestamp() }));
        // Store the project context separately for agent consumption
        const contextRef = db.collection('projects').doc(projectId).collection('pipeline').doc('context');
        await contextRef.set(Object.assign(Object.assign({}, projectContext), { pipelineId, createdAt: firestore_1.FieldValue.serverTimestamp() }));
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
                    projectId,
                    clarificationOutput,
                }),
            });
            const pythonResult = await response.json();
            if (!response.ok) {
                console.error('[PIPELINE] Python pipeline failed:', pythonResult);
                // Update status to error but don't throw - let the user see partial progress
                await statusRef.update({
                    status: 'error',
                    error: ((_a = pythonResult.error) === null || _a === void 0 ? void 0 : _a.message) || 'Python pipeline failed to start',
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            else {
                console.log('[PIPELINE] Python pipeline started:', pythonResult);
            }
        }
        catch (pythonError) {
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
    }
    catch (error) {
        console.error('[PIPELINE] Error starting pipeline:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to start pipeline');
    }
});
/**
 * Update pipeline stage (called by agent functions as they complete)
 */
exports.updatePipelineStage = (0, https_1.onCall)({
    cors: true,
    maxInstances: 20,
    memory: '256MiB',
}, async (request) => {
    try {
        const { projectId, completedStage, nextStage, error } = request.data;
        if (!projectId) {
            throw new https_1.HttpsError('invalid-argument', 'Project ID is required');
        }
        const statusRef = db.collection('projects').doc(projectId).collection('pipeline').doc('status');
        const statusDoc = await statusRef.get();
        if (!statusDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Pipeline status not found');
        }
        const currentStatus = statusDoc.data();
        const completedStages = [...(currentStatus.completedStages || [])];
        if (completedStage && !completedStages.includes(completedStage)) {
            completedStages.push(completedStage);
        }
        const updateData = {
            completedStages,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (error) {
            updateData.status = 'error';
            updateData.error = error;
            updateData.completedAt = Date.now();
        }
        else if (nextStage) {
            updateData.currentStage = nextStage;
        }
        else if (completedStage === 'final') {
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
    }
    catch (error) {
        console.error('[PIPELINE] Error updating stage:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to update pipeline stage');
    }
});
//# sourceMappingURL=estimatePipelineOrchestrator.js.map