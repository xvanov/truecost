/**
 * Annotation Check Agent Cloud Function
 * Validates if user has annotated all required fields based on the project scope
 * This is the clarification agent for the annotation workflow
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { OpenAI } from 'openai';

// Lazy initialization to avoid timeout during module load
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[ANNOTATION_CHECK] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY not configured');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ===================
// TYPES
// ===================

interface AnnotatedShape {
  id: string;
  type: string;
  label?: string;
  itemType?: string;
  points?: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  layerId?: string;
  confidence?: number;
  source?: 'ai' | 'manual';
}

interface AnnotatedLayer {
  id: string;
  name: string;
  visible: boolean;
  shapeCount: number;
}

interface ScaleInfo {
  pixelsPerUnit: number;
  unit: 'feet' | 'inches' | 'meters';
}

interface AnnotationSnapshot {
  shapes: AnnotatedShape[];
  layers: AnnotatedLayer[];
  scale?: ScaleInfo;
}

interface AnnotationCheckRequest {
  projectId: string;
  scopeText: string;
  annotationSnapshot: AnnotationSnapshot;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage?: string;
}

// Structured clarification data extracted from conversation
interface ExtractedClarifications {
  // Confirmed quantities (from user confirmation)
  confirmedQuantities?: {
    doors?: number;
    windows?: number;
    rooms?: number;
    walls?: number;
  };
  // Area relationships (e.g., "demolition area = floor area")
  areaRelationships?: {
    demolitionArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    ceilingArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    paintArea?: 'walls_only' | 'walls_and_ceiling' | 'custom';
  };
  // Exclusions (things user confirmed are NOT needed)
  exclusions?: {
    electrical?: boolean;
    plumbing?: boolean;
    hvac?: boolean;
    demolition?: boolean;
    ceiling?: boolean;
    trim?: boolean;
    [key: string]: boolean | undefined;
  };
  // Inclusions (things user confirmed ARE needed)
  inclusions?: {
    windowTrim?: boolean;
    doorHardware?: boolean;
    baseTrim?: boolean;
    crownMolding?: boolean;
    [key: string]: boolean | undefined;
  };
  // Specific details provided
  details?: {
    ceilingType?: string;
    flooringType?: string;
    paintType?: string;
    doorStyle?: string;
    [key: string]: string | undefined;
  };
  // Raw clarification notes for LLM context
  notes?: string[];
}

interface AnnotationCheckResponse {
  success: boolean;
  message: string;
  isComplete: boolean;
  missingAnnotations: string[];
  clarificationQuestions: string[];
  extractedClarifications?: ExtractedClarifications;
  annotationSummary: {
    hasScale: boolean;
    wallCount: number;
    roomCount: number;
    doorCount: number;
    windowCount: number;
    totalWallLength: number;
    totalFloorArea: number;
  };
}

// System prompt for the annotation check agent
const ANNOTATION_CHECK_PROMPT = `You are a construction plan annotation assistant. Your role is to verify if a user has annotated all required elements on their construction plan based on their project scope.

IMPORTANT: CONVERSATION CONTEXT
You have access to the conversation history. The user may be:
1. Starting a new annotation check (saying "annotation check" or similar)
2. Answering your previous questions (e.g., "1) No 2) Yes", "yes", "no electrical work", etc.)
3. Providing additional context about their annotations or scope

When the user answers your previous questions:
- Parse their response carefully (they might use numbered answers, bullet points, or natural language)
- Acknowledge their answers and update your assessment accordingly
- Don't repeat questions they've already answered
- Use their answers to refine the completeness check

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

HANDLING FOLLOW-UP RESPONSES:
When the user provides answers to your questions:
- If they say something is NOT needed (e.g., "no electrical", "no", "N/A"), mark that as clarified and don't ask again
- If they confirm something (e.g., "yes", "correct", "that's right"), acknowledge and incorporate into your assessment
- If they provide numbered answers like "1) No 2) Yes", match each answer to the corresponding question from your previous message
- Update your completeness assessment based on their clarifications

EXTRACTING CLARIFICATIONS FOR ESTIMATION:
As users answer questions, extract structured data that will help the estimation pipeline:

1. **Confirmed Quantities**: When user confirms counts (e.g., "yes, 2 doors")
2. **Area Relationships**: When user says areas are the same (e.g., "demolition = floor area", "ceiling same as room")
3. **Exclusions**: Things user says are NOT needed (e.g., "no electrical", "no ceiling work")
4. **Inclusions**: Things user confirms ARE included (e.g., "yes, includes window trim")
5. **Details**: Specific information (e.g., "standard 6-panel doors", "latex paint")

Common patterns to recognize:
- "same as floor/room" → areaRelationships with 'same_as_floor' or 'same_as_room'
- "no [X]" or "not needed" → exclusions[X] = true
- "yes" to inclusion questions → inclusions[X] = true
- Numbers confirm counts → confirmedQuantities

Return JSON:
{
  "isComplete": boolean,
  "message": "Your response. Acknowledge what you learned from their answers.",
  "missingAnnotations": ["list of what's still missing"],
  "clarificationQuestions": ["only NEW questions"],
  "suggestions": ["helpful tips"],
  "extractedClarifications": {
    "confirmedQuantities": { "doors": 2, "windows": 1 },
    "areaRelationships": {
      "demolitionArea": "same_as_floor",
      "ceilingArea": "same_as_room"
    },
    "exclusions": {
      "electrical": true,
      "specialCeilingFeatures": true
    },
    "inclusions": {
      "windowTrim": true,
      "doorHardware": true
    },
    "details": {
      "doorStyle": "6-panel solid core",
      "paintType": "standard latex"
    },
    "notes": ["User confirmed demolition area matches floor area of 107.6 sq ft"]
  }
}

The extractedClarifications will be used by the estimation pipeline to:
- Calculate demolition quantities based on floor area
- Skip electrical line items if excluded
- Include correct door/window counts and styles
- Apply appropriate pricing based on confirmed details

If isComplete is true, congratulate the user and tell them they can proceed to generate the estimate.
If isComplete is false, clearly explain what still needs to be done.`;

// ===================
// HELPER FUNCTIONS
// ===================

function classifyLayerType(layerName: string): string {
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

interface LayerAnalysis {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  shapeCount: number;
  shapes: {
    polylines: number;
    polygons: number;
    rectangles: number;
    other: number;
  };
  measurements: {
    totalLength: number;
    totalArea: number;
  };
}

function analyzeAnnotations(snapshot: AnnotationSnapshot): AnnotationCheckResponse['annotationSummary'] {
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
  const layerMap = new Map<string, AnnotatedLayer>();
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
        const points: { x: number; y: number }[] = [];
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
    } else if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
      summary.roomCount++;
      
      // Calculate area if scale is available
      if (summary.hasScale && snapshot.scale) {
        const points: { x: number; y: number }[] = [];
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
    } else if (shape.type === 'rect' || shape.type === 'boundingbox') {
      if (layerType === 'door' || shape.itemType?.toLowerCase().includes('door')) {
        summary.doorCount++;
      } else if (layerType === 'window' || shape.itemType?.toLowerCase().includes('window')) {
        summary.windowCount++;
      }
    }
  }

  return summary;
}

function analyzeLayersInDetail(snapshot: AnnotationSnapshot): LayerAnalysis[] {
  const layerAnalyses: LayerAnalysis[] = [];
  
  // Create a map to group shapes by layer
  const shapesByLayer = new Map<string, AnnotatedShape[]>();
  
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
    shapesByLayer.get(layerId)!.push(shape);
  }
  
  // Analyze each layer
  for (const layer of snapshot.layers) {
    const shapes = shapesByLayer.get(layer.id) || [];
    const layerType = classifyLayerType(layer.name);
    
    const analysis: LayerAnalysis = {
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
          const points: { x: number; y: number }[] = [];
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
      } else if (shape.type === 'polygon') {
        analysis.shapes.polygons++;
        
        // Calculate area
        if (snapshot.scale && snapshot.scale.pixelsPerUnit > 0 && shape.points && shape.points.length >= 6) {
          const points: { x: number; y: number }[] = [];
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
      } else if (shape.type === 'rect' || shape.type === 'boundingbox') {
        analysis.shapes.rectangles++;
      } else {
        analysis.shapes.other++;
      }
    }
    
    layerAnalyses.push(analysis);
  }
  
  return layerAnalyses;
}

function formatLayerDetails(layers: LayerAnalysis[], scale: ScaleInfo | undefined): string {
  if (layers.length === 0) {
    return 'No layers have been created yet. Create layers to organize your annotations (e.g., "Walls", "Flooring", "Doors").';
  }
  
  const unit = scale?.unit || 'units';
  let details = '';
  
  for (const layer of layers) {
    details += `\n📁 **Layer: "${layer.name}"** (${layer.type} type)\n`;
    details += `   - Total shapes: ${layer.shapeCount}\n`;
    
    if (layer.shapeCount > 0) {
      const shapeParts: string[] = [];
      if (layer.shapes.polylines > 0) shapeParts.push(`${layer.shapes.polylines} polylines (walls/lines)`);
      if (layer.shapes.polygons > 0) shapeParts.push(`${layer.shapes.polygons} polygons (areas/rooms)`);
      if (layer.shapes.rectangles > 0) shapeParts.push(`${layer.shapes.rectangles} rectangles (doors/windows/fixtures)`);
      if (layer.shapes.other > 0) shapeParts.push(`${layer.shapes.other} other shapes`);
      details += `   - Shape types: ${shapeParts.join(', ')}\n`;
      
      if (scale && scale.pixelsPerUnit > 0) {
        if (layer.measurements.totalLength > 0) {
          details += `   - Total length: ${layer.measurements.totalLength.toFixed(1)} linear ${unit}\n`;
        }
        if (layer.measurements.totalArea > 0) {
          details += `   - Total area: ${layer.measurements.totalArea.toFixed(1)} sq ${unit}\n`;
        }
      }
    } else {
      details += `   ⚠️ This layer is EMPTY - no shapes have been added yet\n`;
    }
  }
  
  return details;
}

// ===================
// CLOUD FUNCTION
// ===================

export const annotationCheckAgent = onCall({
  cors: true,
  secrets: ['OPENAI_API_KEY'],
  timeoutSeconds: 60,
}, async (request) => {
  try {
    const data = request.data as AnnotationCheckRequest;
    const { scopeText, annotationSnapshot, conversationHistory, userMessage } = data;

    if (!scopeText) {
      throw new HttpsError('invalid-argument', 'Scope text is required');
    }

    // Analyze current annotations
    const annotationSummary = analyzeAnnotations(annotationSnapshot);

    // Quick check without AI if basic requirements are missing
    const missingBasics: string[] = [];
    
    if (!annotationSummary.hasScale) {
      missingBasics.push('Scale reference - needed to convert pixel measurements to real-world units');
    }
    
    if (annotationSummary.wallCount === 0 && annotationSummary.roomCount === 0) {
      missingBasics.push('Wall or room annotations - draw polylines for walls or polygons for room areas');
    }

    // If basic requirements are missing, return early without AI call
    if (missingBasics.length > 0 && !userMessage) {
      const response: AnnotationCheckResponse = {
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
- Scale: ${annotationSummary.hasScale ? `Set (${annotationSnapshot.scale?.unit})` : 'NOT SET ⚠️'}
- Total Layers: ${annotationSnapshot.layers.length}
- Total Shapes: ${annotationSnapshot.shapes.length}
- Wall Segments: ${annotationSummary.wallCount}${annotationSummary.hasScale ? ` (${annotationSummary.totalWallLength.toFixed(1)} linear ${annotationSnapshot.scale?.unit})` : ''}
- Room/Area Polygons: ${annotationSummary.roomCount}${annotationSummary.hasScale ? ` (${annotationSummary.totalFloorArea.toFixed(1)} sq ${annotationSnapshot.scale?.unit})` : ''}
- Door Annotations: ${annotationSummary.doorCount}
- Window Annotations: ${annotationSummary.windowCount}`;

    const prompt = ANNOTATION_CHECK_PROMPT
      .replace('{scopeText}', scopeText)
      .replace('{annotationSummary}', annotationSummaryText)
      .replace('{layerDetails}', layerDetailsText);

    // Build conversation messages
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
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
    } else {
      messages.push({ role: 'user', content: 'Please check if my annotations are complete for this project scope.' });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    const aiResponse = JSON.parse(responseText);

    // Parse extracted clarifications from AI response
    const extractedClarifications: ExtractedClarifications = aiResponse.extractedClarifications || {};
    
    // Ensure all fields have proper defaults
    if (!extractedClarifications.confirmedQuantities) {
      extractedClarifications.confirmedQuantities = {};
    }
    if (!extractedClarifications.areaRelationships) {
      extractedClarifications.areaRelationships = {};
    }
    if (!extractedClarifications.exclusions) {
      extractedClarifications.exclusions = {};
    }
    if (!extractedClarifications.inclusions) {
      extractedClarifications.inclusions = {};
    }
    if (!extractedClarifications.details) {
      extractedClarifications.details = {};
    }
    if (!extractedClarifications.notes) {
      extractedClarifications.notes = [];
    }

    const response: AnnotationCheckResponse = {
      success: true,
      message: aiResponse.message || 'Annotation check complete.',
      isComplete: aiResponse.isComplete || false,
      missingAnnotations: aiResponse.missingAnnotations || [],
      clarificationQuestions: aiResponse.clarificationQuestions || [],
      extractedClarifications,
      annotationSummary,
    };

    return response;
  } catch (error) {
    console.error('Annotation Check Agent Error:', error);

    if (error instanceof HttpsError) {
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

