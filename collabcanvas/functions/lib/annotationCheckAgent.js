"use strict";
/**
 * Annotation Check Agent Cloud Function
 * Validates if user has annotated all required fields based on the project scope
 * This is the clarification agent for the annotation workflow
 */
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.annotationCheckAgent = void 0;
const https_1 = require("firebase-functions/v2/https");
const openai_1 = require("openai");
const dotenv = require("dotenv");
const path = require("path");
// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
const envResult = dotenv.config({ path: envPath, override: true });
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production';
const apiKeyFromEnv = (_a = envResult.parsed) === null || _a === void 0 ? void 0 : _a.OPENAI_API_KEY;
const apiKeyFromProcess = process.env.OPENAI_API_KEY;
const apiKey = (isEmulator && apiKeyFromEnv) ? apiKeyFromEnv : (apiKeyFromProcess || apiKeyFromEnv || '');
const openai = new openai_1.OpenAI({ apiKey });
if (!apiKey) {
    console.warn('⚠️ OPENAI_API_KEY not found. Annotation check agent will not work.');
}
// System prompt for the annotation check agent
const ANNOTATION_CHECK_PROMPT = `You are a construction plan annotation assistant. Your role is to verify if a user has annotated all required elements on their construction plan based on their project scope.

PROJECT SCOPE AND DETAILS:
{scopeText}

Note: The scope above may include:
1. A natural language description of the project
2. A "--- Clarification Details ---" section with structured JSON data extracted from a clarification conversation

Pay attention to BOTH the natural language description AND the clarification details to understand:
- Project type (e.g., bedroom remodel, kitchen renovation)
- Square footage mentioned
- Specific work items (flooring, painting, doors, trim, etc.)
- What's included vs excluded
- Any special requirements

CURRENT ANNOTATIONS ON THE PLAN:

**Overall Summary:**
{annotationSummary}

**Detailed Layer Breakdown:**
{layerDetails}

IMPORTANT: Users typically organize their annotations into LAYERS. Each layer represents a category of work (e.g., "Walls", "Flooring", "Doors", "Windows", "Electrical", etc.).

When checking completeness:
1. First, look at the LAYER NAMES - they tell you what the user intends to annotate
2. Check if each layer has appropriate shapes for its purpose
3. Match layers against the project scope to ensure all work items are covered

For example:
- If scope mentions "install hardwood flooring" → look for a flooring/room layer with polygon shapes
- If scope mentions "replace 2 doors" → look for a doors layer with 2 rectangle/bounding box shapes
- If scope mentions "paint walls" → look for a walls layer with polyline shapes
- If scope mentions "100 sq ft" → verify the room/area annotations roughly match that

REQUIRED for all projects:
- Scale reference (REQUIRED - needed to convert pixels to real measurements)

LAYER-BASED VALIDATION:
- Check if user has created relevant layers for their scope
- Verify each layer has appropriate annotations
- If a layer exists but is empty or has few shapes, ask about it
- If scope mentions work but no matching layer exists, suggest creating one

Return JSON:
{
  "isComplete": boolean,
  "message": "Your response explaining what's complete/missing. Reference specific layers and their contents. Be specific about WHY each annotation is needed based on the scope.",
  "missingAnnotations": ["list of what's missing - reference layers and shape types needed"],
  "clarificationQuestions": ["any questions if scope or layer purpose is unclear"],
  "suggestions": ["helpful tips for organizing annotations into layers"]
}

If isComplete is true, congratulate the user and tell them they can proceed to generate the estimate. Mention which layers contain the key information.
If isComplete is false, clearly explain what needs to be annotated, suggest relevant layer names, and tie it back to the project scope.`;
// ===================
// HELPER FUNCTIONS
// ===================
function classifyLayerType(layerName) {
    const name = layerName.toLowerCase().trim();
    if (name.includes('wall') || name.includes('partition') || name.includes('framing')) {
        return 'wall';
    }
    if (name.includes('room') || name.includes('floor') || name.includes('area') || name.includes('space')) {
        return 'room';
    }
    if (name.includes('door') || name.includes('entry') || name.includes('exit')) {
        return 'door';
    }
    if (name.includes('window') || name.includes('glazing') || name.includes('glass')) {
        return 'window';
    }
    return 'other';
}
function analyzeAnnotations(snapshot) {
    var _a, _b;
    const summary = {
        hasScale: false,
        wallCount: 0,
        roomCount: 0,
        doorCount: 0,
        windowCount: 0,
        totalWallLength: 0,
        totalFloorArea: 0,
    };
    // Check for scale
    if (snapshot.scale && snapshot.scale.pixelsPerUnit > 0) {
        summary.hasScale = true;
    }
    // Create layer lookup
    const layerMap = new Map();
    for (const layer of snapshot.layers) {
        layerMap.set(layer.id, layer);
    }
    // Analyze shapes
    for (const shape of snapshot.shapes) {
        const layer = layerMap.get(shape.layerId || '') || { name: 'Default', id: '', visible: true, shapeCount: 0 };
        const layerType = classifyLayerType(layer.name);
        if (shape.type === 'polyline' && shape.points && shape.points.length >= 4) {
            summary.wallCount++;
            // Calculate length if scale is available
            if (summary.hasScale && snapshot.scale) {
                const points = [];
                for (let i = 0; i < shape.points.length; i += 2) {
                    points.push({ x: shape.points[i], y: shape.points[i + 1] });
                }
                let length = 0;
                for (let i = 0; i < points.length - 1; i++) {
                    const dx = points[i + 1].x - points[i].x;
                    const dy = points[i + 1].y - points[i].y;
                    length += Math.sqrt(dx * dx + dy * dy);
                }
                summary.totalWallLength += length / snapshot.scale.pixelsPerUnit;
            }
        }
        else if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
            summary.roomCount++;
            // Calculate area if scale is available
            if (summary.hasScale && snapshot.scale) {
                const points = [];
                for (let i = 0; i < shape.points.length; i += 2) {
                    points.push({ x: shape.points[i], y: shape.points[i + 1] });
                }
                // Shoelace formula
                let area = 0;
                const n = points.length;
                for (let i = 0; i < n; i++) {
                    const j = (i + 1) % n;
                    area += points[i].x * points[j].y;
                    area -= points[j].x * points[i].y;
                }
                area = Math.abs(area / 2);
                summary.totalFloorArea += area / (snapshot.scale.pixelsPerUnit * snapshot.scale.pixelsPerUnit);
            }
        }
        else if (shape.type === 'rect' || shape.type === 'boundingbox') {
            if (layerType === 'door' || ((_a = shape.itemType) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('door'))) {
                summary.doorCount++;
            }
            else if (layerType === 'window' || ((_b = shape.itemType) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('window'))) {
                summary.windowCount++;
            }
        }
    }
    return summary;
}
function analyzeLayersInDetail(snapshot) {
    const layerAnalyses = [];
    // Create a map to group shapes by layer
    const shapesByLayer = new Map();
    // Initialize with all layers (including empty ones)
    for (const layer of snapshot.layers) {
        shapesByLayer.set(layer.id, []);
    }
    // Group shapes by layer
    for (const shape of snapshot.shapes) {
        const layerId = shape.layerId || 'default';
        if (!shapesByLayer.has(layerId)) {
            shapesByLayer.set(layerId, []);
        }
        shapesByLayer.get(layerId).push(shape);
    }
    // Analyze each layer
    for (const layer of snapshot.layers) {
        const shapes = shapesByLayer.get(layer.id) || [];
        const layerType = classifyLayerType(layer.name);
        const analysis = {
            id: layer.id,
            name: layer.name,
            type: layerType,
            visible: layer.visible,
            shapeCount: shapes.length,
            shapes: {
                polylines: 0,
                polygons: 0,
                rectangles: 0,
                other: 0,
            },
            measurements: {
                totalLength: 0,
                totalArea: 0,
            },
        };
        for (const shape of shapes) {
            if (shape.type === 'polyline') {
                analysis.shapes.polylines++;
                // Calculate length
                if (snapshot.scale && snapshot.scale.pixelsPerUnit > 0 && shape.points && shape.points.length >= 4) {
                    const points = [];
                    for (let i = 0; i < shape.points.length; i += 2) {
                        points.push({ x: shape.points[i], y: shape.points[i + 1] });
                    }
                    let length = 0;
                    for (let i = 0; i < points.length - 1; i++) {
                        const dx = points[i + 1].x - points[i].x;
                        const dy = points[i + 1].y - points[i].y;
                        length += Math.sqrt(dx * dx + dy * dy);
                    }
                    analysis.measurements.totalLength += length / snapshot.scale.pixelsPerUnit;
                }
            }
            else if (shape.type === 'polygon') {
                analysis.shapes.polygons++;
                // Calculate area
                if (snapshot.scale && snapshot.scale.pixelsPerUnit > 0 && shape.points && shape.points.length >= 6) {
                    const points = [];
                    for (let i = 0; i < shape.points.length; i += 2) {
                        points.push({ x: shape.points[i], y: shape.points[i + 1] });
                    }
                    let area = 0;
                    const n = points.length;
                    for (let i = 0; i < n; i++) {
                        const j = (i + 1) % n;
                        area += points[i].x * points[j].y;
                        area -= points[j].x * points[i].y;
                    }
                    area = Math.abs(area / 2);
                    analysis.measurements.totalArea += area / (snapshot.scale.pixelsPerUnit * snapshot.scale.pixelsPerUnit);
                }
            }
            else if (shape.type === 'rect' || shape.type === 'boundingbox') {
                analysis.shapes.rectangles++;
            }
            else {
                analysis.shapes.other++;
            }
        }
        layerAnalyses.push(analysis);
    }
    return layerAnalyses;
}
function formatLayerDetails(layers, scale) {
    if (layers.length === 0) {
        return 'No layers have been created yet. Create layers to organize your annotations (e.g., "Walls", "Flooring", "Doors").';
    }
    const unit = (scale === null || scale === void 0 ? void 0 : scale.unit) || 'units';
    let details = '';
    for (const layer of layers) {
        details += `\n📁 **Layer: "${layer.name}"** (${layer.type} type)\n`;
        details += `   - Total shapes: ${layer.shapeCount}\n`;
        if (layer.shapeCount > 0) {
            const shapeParts = [];
            if (layer.shapes.polylines > 0)
                shapeParts.push(`${layer.shapes.polylines} polylines (walls/lines)`);
            if (layer.shapes.polygons > 0)
                shapeParts.push(`${layer.shapes.polygons} polygons (areas/rooms)`);
            if (layer.shapes.rectangles > 0)
                shapeParts.push(`${layer.shapes.rectangles} rectangles (doors/windows/fixtures)`);
            if (layer.shapes.other > 0)
                shapeParts.push(`${layer.shapes.other} other shapes`);
            details += `   - Shape types: ${shapeParts.join(', ')}\n`;
            if (scale && scale.pixelsPerUnit > 0) {
                if (layer.measurements.totalLength > 0) {
                    details += `   - Total length: ${layer.measurements.totalLength.toFixed(1)} linear ${unit}\n`;
                }
                if (layer.measurements.totalArea > 0) {
                    details += `   - Total area: ${layer.measurements.totalArea.toFixed(1)} sq ${unit}\n`;
                }
            }
        }
        else {
            details += `   ⚠️ This layer is EMPTY - no shapes have been added yet\n`;
        }
    }
    return details;
}
// ===================
// CLOUD FUNCTION
// ===================
exports.annotationCheckAgent = (0, https_1.onCall)({
    cors: true,
    secrets: ['OPENAI_API_KEY'],
    timeoutSeconds: 60,
}, async (request) => {
    var _a, _b, _c, _d, _e;
    try {
        const data = request.data;
        const { scopeText, annotationSnapshot, conversationHistory, userMessage } = data;
        if (!scopeText) {
            throw new https_1.HttpsError('invalid-argument', 'Scope text is required');
        }
        // Analyze current annotations
        const annotationSummary = analyzeAnnotations(annotationSnapshot);
        // Quick check without AI if basic requirements are missing
        const missingBasics = [];
        if (!annotationSummary.hasScale) {
            missingBasics.push('Scale reference - needed to convert pixel measurements to real-world units');
        }
        if (annotationSummary.wallCount === 0 && annotationSummary.roomCount === 0) {
            missingBasics.push('Wall or room annotations - draw polylines for walls or polygons for room areas');
        }
        // If basic requirements are missing, return early without AI call
        if (missingBasics.length > 0 && !userMessage) {
            const response = {
                success: true,
                message: `Before generating an estimate, please add the following annotations:\n\n${missingBasics.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nUse the annotation tools in the toolbar to draw on your plan.`,
                isComplete: false,
                missingAnnotations: missingBasics,
                clarificationQuestions: [],
                annotationSummary,
            };
            return response;
        }
        // Analyze layers in detail
        const layerAnalyses = analyzeLayersInDetail(annotationSnapshot);
        const layerDetailsText = formatLayerDetails(layerAnalyses, annotationSnapshot.scale);
        // Use AI to do a more detailed check based on the scope
        const annotationSummaryText = `
- Scale: ${annotationSummary.hasScale ? `Set (${(_a = annotationSnapshot.scale) === null || _a === void 0 ? void 0 : _a.unit})` : 'NOT SET ⚠️'}
- Total Layers: ${annotationSnapshot.layers.length}
- Total Shapes: ${annotationSnapshot.shapes.length}
- Wall Segments: ${annotationSummary.wallCount}${annotationSummary.hasScale ? ` (${annotationSummary.totalWallLength.toFixed(1)} linear ${(_b = annotationSnapshot.scale) === null || _b === void 0 ? void 0 : _b.unit})` : ''}
- Room/Area Polygons: ${annotationSummary.roomCount}${annotationSummary.hasScale ? ` (${annotationSummary.totalFloorArea.toFixed(1)} sq ${(_c = annotationSnapshot.scale) === null || _c === void 0 ? void 0 : _c.unit})` : ''}
- Door Annotations: ${annotationSummary.doorCount}
- Window Annotations: ${annotationSummary.windowCount}`;
        const prompt = ANNOTATION_CHECK_PROMPT
            .replace('{scopeText}', scopeText)
            .replace('{annotationSummary}', annotationSummaryText)
            .replace('{layerDetails}', layerDetailsText);
        // Build conversation messages
        const messages = [
            { role: 'system', content: prompt },
        ];
        // Add conversation history
        for (const msg of conversationHistory) {
            messages.push({
                role: msg.role,
                content: msg.content,
            });
        }
        // Add current user message
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
        else {
            messages.push({ role: 'user', content: 'Please check if my annotations are complete for this project scope.' });
        }
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'json_object' },
        });
        const responseText = (_e = (_d = completion.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
        if (!responseText) {
            throw new Error('No response from OpenAI');
        }
        const aiResponse = JSON.parse(responseText);
        const response = {
            success: true,
            message: aiResponse.message || 'Annotation check complete.',
            isComplete: aiResponse.isComplete || false,
            missingAnnotations: aiResponse.missingAnnotations || [],
            clarificationQuestions: aiResponse.clarificationQuestions || [],
            annotationSummary,
        };
        return response;
    }
    catch (error) {
        console.error('Annotation Check Agent Error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        return {
            success: false,
            message: 'I encountered an error while checking annotations. Please try again.',
            isComplete: false,
            missingAnnotations: [],
            clarificationQuestions: [],
            annotationSummary: {
                hasScale: false,
                wallCount: 0,
                roomCount: 0,
                doorCount: 0,
                windowCount: 0,
                totalWallLength: 0,
                totalFloorArea: 0,
            },
            error: error instanceof Error ? error.message : String(error),
        };
    }
});
//# sourceMappingURL=annotationCheckAgent.js.map