/**
 * Estimation Pipeline Cloud Function
 * PRIMARY: Uses user annotations (polylines, polygons, bounding boxes) with scale for accurate measurements
 * SECONDARY: Uses OpenAI Vision only for inference/gap-filling when annotations are insufficient
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { OpenAI } from 'openai';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  computeQuantitiesFromAnnotations,
  buildSpaceModelFromQuantities,
  buildCSIItemsFromQuantities,
  ComputedQuantities,
} from './annotationQuantifier';

// Lazy initialization to avoid timeout during module load
let _openai: OpenAI | null = null;
let _apiKey: string | null = null;

function getApiKey(): string {
  if (_apiKey === null) {
    // Load environment variables
    const envPath = path.resolve(process.cwd(), '.env');
    const envResult = dotenv.config({ path: envPath, override: true });

    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production';
    const apiKeyFromEnv = envResult.parsed?.OPENAI_API_KEY;
    const apiKeyFromProcess = process.env.OPENAI_API_KEY;
    _apiKey = (isEmulator && apiKeyFromEnv) ? apiKeyFromEnv : (apiKeyFromProcess || apiKeyFromEnv || '');

    if (!_apiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found. LLM inference will not work.');
    }
  }
  return _apiKey;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: getApiKey() });
  }
  return _openai;
}

function initFirebaseAdmin(): void {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
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

interface AnnotationSnapshot {
  shapes: AnnotatedShape[];
  layers: AnnotatedLayer[];
  scale?: {
    pixelsPerUnit: number;
    unit: 'feet' | 'inches' | 'meters';
  };
  capturedAt?: number;
}

interface EstimationRequest {
  projectId: string;
  sessionId: string;
  planImageUrl: string;
  scopeText: string;
  clarificationData: Record<string, unknown>;
  annotationSnapshot: AnnotationSnapshot;
  passNumber: number;
}

// ===================
// CSI DIVISION TEMPLATE
// ===================

function createCSIScope(computedItems: Record<string, unknown[]>) {
  const divisions = [
    { code: '01', key: 'div01_general_requirements', name: 'General Requirements' },
    { code: '02', key: 'div02_existing_conditions', name: 'Existing Conditions' },
    { code: '03', key: 'div03_concrete', name: 'Concrete' },
    { code: '04', key: 'div04_masonry', name: 'Masonry' },
    { code: '05', key: 'div05_metals', name: 'Metals' },
    { code: '06', key: 'div06_wood_plastics_composites', name: 'Wood, Plastics, and Composites' },
    { code: '07', key: 'div07_thermal_moisture', name: 'Thermal and Moisture Protection' },
    { code: '08', key: 'div08_openings', name: 'Openings' },
    { code: '09', key: 'div09_finishes', name: 'Finishes' },
    { code: '10', key: 'div10_specialties', name: 'Specialties' },
    { code: '11', key: 'div11_equipment', name: 'Equipment' },
    { code: '12', key: 'div12_furnishings', name: 'Furnishings' },
    { code: '13', key: 'div13_special_construction', name: 'Special Construction' },
    { code: '14', key: 'div14_conveying_equipment', name: 'Conveying Equipment' },
    { code: '21', key: 'div21_fire_suppression', name: 'Fire Suppression' },
    { code: '22', key: 'div22_plumbing', name: 'Plumbing' },
    { code: '23', key: 'div23_hvac', name: 'Heating, Ventilating, and Air Conditioning' },
    { code: '25', key: 'div25_integrated_automation', name: 'Integrated Automation' },
    { code: '26', key: 'div26_electrical', name: 'Electrical' },
    { code: '27', key: 'div27_communications', name: 'Communications' },
    { code: '28', key: 'div28_electronic_safety_security', name: 'Electronic Safety and Security' },
    { code: '31', key: 'div31_earthwork', name: 'Earthwork' },
    { code: '32', key: 'div32_exterior_improvements', name: 'Exterior Improvements' },
    { code: '33', key: 'div33_utilities', name: 'Utilities' },
  ];

  const scope: Record<string, unknown> = {};

  for (const div of divisions) {
    const items = computedItems[div.key] || [];
    const hasItems = items.length > 0;

    // Build division object - Firestore doesn't accept undefined values
    const divisionObj: Record<string, unknown> = {
      code: div.code,
      name: div.name,
      status: hasItems ? 'included' : 'not_applicable',
      description: hasItems ? `${items.length} items from user annotations` : '',
      items: items,
    };

    // Only add exclusionReason when division is excluded/not_applicable
    if (!hasItems) {
      divisionObj.exclusionReason = 'No items identified in annotations';
    }

    scope[div.key] = divisionObj;
  }

  return scope;
}

// ===================
// IMAGE HELPERS
// ===================

async function imageUrlToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    let mimeType = 'image/jpeg';
    if (imageUrl.toLowerCase().includes('.png')) {
      mimeType = 'image/png';
    } else if (imageUrl.toLowerCase().includes('.webp')) {
      mimeType = 'image/webp';
    }

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isLocalUrl(url: string): boolean {
  return url.includes('127.0.0.1') ||
         url.includes('localhost') ||
         url.includes('10.0.') ||
         url.includes('192.168.');
}

// ===================
// LLM INFERENCE (SECONDARY - only for gap-filling)
// ===================

const INFERENCE_PROMPT = `You are a construction estimation assistant. The user has provided annotations on a floor plan with the following computed quantities:

COMPUTED FROM ANNOTATIONS:
{computedQuantities}

SCOPE DESCRIPTION:
{scopeText}

CLARIFICATION DATA:
{clarificationData}

Based on the computed quantities, provide ONLY the following inferences (do not override the computed quantities):
1. Room types based on layout (kitchen, bathroom, bedroom, etc.)
2. Spatial relationships (what rooms are adjacent, traffic flow)
3. Missing items that should be inferred (electrical outlets per room, HVAC returns, etc.)
4. Standard allowances for items not annotated

Return JSON with:
{
  "roomTypes": [{ "roomId": "...", "inferredType": "kitchen|bathroom|bedroom|living|other" }],
  "spatialNarrative": "Description of the layout...",
  "inferredItems": [{ "division": "div26_electrical", "item": "...", "quantity": N, "reason": "..." }],
  "standardAllowances": [{ "division": "...", "item": "...", "quantity": N, "basis": "..." }]
}

IMPORTANT: Do NOT provide quantities for walls, floors, doors, or windows - those are computed from annotations.`;

async function inferMissingData(
  quantities: ComputedQuantities,
  scopeText: string,
  clarificationData: Record<string, unknown>,
  planImageUrl?: string
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[ESTIMATION] No API key - skipping LLM inference');
    return {
      roomTypes: [],
      spatialNarrative: 'Layout analysis requires OpenAI API key',
      inferredItems: [],
      standardAllowances: [],
    };
  }

  const prompt = INFERENCE_PROMPT
    .replace('{computedQuantities}', JSON.stringify({
      totalWallLength: quantities.totalWallLength,
      totalFloorArea: quantities.totalFloorArea,
      totalRoomCount: quantities.totalRoomCount,
      totalDoorCount: quantities.totalDoorCount,
      totalWindowCount: quantities.totalWindowCount,
      rooms: quantities.rooms.map(r => ({ id: r.id, name: r.name, area: r.areaReal })),
      layerSummary: quantities.layerSummary,
    }, null, 2))
    .replace('{scopeText}', scopeText)
    .replace('{clarificationData}', JSON.stringify(clarificationData, null, 2));

  try {
    // Build messages for OpenAI
    const openai = getOpenAI();
    let response;

    if (planImageUrl) {
      let imageContent = planImageUrl;
      if (isLocalUrl(planImageUrl)) {
        imageContent = await imageUrlToBase64(planImageUrl);
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageContent, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
    } else {
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { roomTypes: [], spatialNarrative: '', inferredItems: [], standardAllowances: [] };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('[ESTIMATION] LLM inference error:', error);
    return {
      roomTypes: [],
      spatialNarrative: 'Inference failed - using annotation data only',
      inferredItems: [],
      standardAllowances: [],
    };
  }
}

// ===================
// CLOUD FUNCTION
// ===================

export const estimationPipeline = onCall({
  cors: true,
  secrets: ['OPENAI_API_KEY'],
  timeoutSeconds: 300,
  memory: '1GiB',
}, async (request) => {
  try {
    const data = request.data as EstimationRequest;
    const {
      projectId,
      sessionId,
      planImageUrl,
      scopeText,
      clarificationData,
      annotationSnapshot,
      passNumber = 1,
    } = data;

    if (!scopeText) {
      throw new HttpsError('invalid-argument', 'Scope text is required');
    }

    console.log(`[ESTIMATION] Starting pass ${passNumber} for session ${sessionId}`);

    // ===================
    // STEP 1: COMPUTE QUANTITIES FROM ANNOTATIONS (PRIMARY)
    // ===================
    console.log('[ESTIMATION] Computing quantities from user annotations...');

    // Ensure layers have required fields
    const normalizedSnapshot: AnnotationSnapshot = {
      shapes: annotationSnapshot.shapes || [],
      layers: (annotationSnapshot.layers || []).map(layer => ({
        id: layer.id,
        name: layer.name,
        visible: (layer as AnnotatedLayer).visible ?? true,
        shapeCount: (layer as AnnotatedLayer).shapeCount ?? 0,
      })),
      scale: annotationSnapshot.scale,
      capturedAt: annotationSnapshot.capturedAt || Date.now(),
    };

    const quantities = computeQuantitiesFromAnnotations(normalizedSnapshot);

    console.log('[ESTIMATION] Computed from annotations:', {
      hasScale: quantities.hasScale,
      scaleUnit: quantities.scaleUnit,
      totalWallLength: quantities.totalWallLength,
      totalFloorArea: quantities.totalFloorArea,
      roomCount: quantities.totalRoomCount,
      doorCount: quantities.totalDoorCount,
      windowCount: quantities.totalWindowCount,
    });

    // ===================
    // STEP 2: BUILD SPACE MODEL FROM ANNOTATIONS
    // ===================
    console.log('[ESTIMATION] Building space model from computed quantities...');
    const spaceModel = buildSpaceModelFromQuantities(quantities);

    // ===================
    // STEP 3: BUILD CSI ITEMS FROM ANNOTATIONS
    // ===================
    console.log('[ESTIMATION] Building CSI items from computed quantities...');
    const computedCSIItems = buildCSIItemsFromQuantities(quantities);

    // ===================
    // STEP 4: LLM INFERENCE FOR GAP-FILLING (SECONDARY)
    // ===================
    let inferredData: Record<string, unknown> = {
      roomTypes: [],
      spatialNarrative: '',
      inferredItems: [],
      standardAllowances: [],
    };

    // Only use LLM if we have annotations but need inference for non-measured items
    if (quantities.hasScale && (quantities.totalWallLength > 0 || quantities.totalFloorArea > 0)) {
      console.log('[ESTIMATION] Running LLM inference for gap-filling...');
      inferredData = await inferMissingData(quantities, scopeText, clarificationData, planImageUrl);
    } else if (!quantities.hasScale) {
      console.log('[ESTIMATION] No scale set - skipping LLM inference, using annotation data only');
    } else {
      console.log('[ESTIMATION] No annotations - LLM inference would have no basis');
    }

    // ===================
    // STEP 5: MERGE INFERRED ITEMS INTO CSI SCOPE
    // ===================
    const inferredItems = (inferredData.inferredItems as Array<{ division: string; item: string; quantity: number; reason: string }>) || [];
    const standardAllowances = (inferredData.standardAllowances as Array<{ division: string; item: string; quantity: number; basis: string }>) || [];

    // Add inferred items with lower confidence
    for (const inferred of [...inferredItems, ...standardAllowances]) {
      if (inferred.division && computedCSIItems[inferred.division]) {
        computedCSIItems[inferred.division].push({
          id: `inferred-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          item: inferred.item,
          quantity: inferred.quantity,
          unit: 'each',
          confidence: 0.7, // Lower confidence for inferred items
          source: 'inferred',
          notes: (inferred as { reason?: string; basis?: string }).reason || (inferred as { reason?: string; basis?: string }).basis,
        });
      }
    }

    // Create CSI scope with computed + inferred items
    const csiScope = createCSIScope(computedCSIItems);

    // ===================
    // STEP 6: ASSEMBLE CLARIFICATION OUTPUT
    // ===================
    const estimateId = `est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Count divisions by status
    const divisionCounts = { included: 0, excluded: 0, byOwner: 0, notApplicable: 0 };
    const includedDivisions: string[] = [];
    const excludedDivisions: string[] = [];
    const notApplicableDivisions: string[] = [];

    for (const [, div] of Object.entries(csiScope)) {
      const divObj = div as { status: string; code: string };
      switch (divObj.status) {
        case 'included':
          divisionCounts.included++;
          includedDivisions.push(divObj.code);
          break;
        case 'excluded':
          divisionCounts.excluded++;
          excludedDivisions.push(divObj.code);
          break;
        case 'not_applicable':
          divisionCounts.notApplicable++;
          notApplicableDivisions.push(divObj.code);
          break;
      }
    }

    const projectBrief = {
      projectType: (clarificationData.projectType as string) || 'other',
      location: (clarificationData.location as Record<string, unknown>) || {
        fullAddress: '',
        streetAddress: '',
        city: '',
        state: '',
        zipCode: '',
      },
      scopeSummary: {
        description: scopeText,
        totalSqft: quantities.totalFloorArea,
        rooms: quantities.rooms.map(r => r.name),
        finishLevel: (clarificationData.finishLevel as string) || 'mid_range',
        projectComplexity: quantities.totalRoomCount > 3 ? 'complex' : quantities.totalRoomCount > 1 ? 'moderate' : 'simple',
        includedDivisions,
        excludedDivisions,
        byOwnerDivisions: [] as string[],
        notApplicableDivisions,
        totalIncluded: divisionCounts.included,
        totalExcluded: divisionCounts.excluded,
      },
      specialRequirements: (clarificationData.specialRequirements as string[]) || [],
      exclusions: (clarificationData.exclusions as string[]) || [],
      timeline: {
        flexibility: (clarificationData.flexibility as string) || 'flexible',
      } as { desiredStart?: string; deadline?: string; flexibility: string },
    };

    if (clarificationData.desiredStart) {
      projectBrief.timeline.desiredStart = clarificationData.desiredStart as string;
    }
    if (clarificationData.deadline) {
      projectBrief.timeline.deadline = clarificationData.deadline as string;
    }

    // Build CAD data - using schema-valid enum values
    // Schema requires: fileType: "dwg" | "dxf" | "pdf" | "png" | "jpg"
    // Schema requires: extractionMethod: "ezdxf" | "vision"
    const getFileType = (url: string | null): "dwg" | "dxf" | "pdf" | "png" | "jpg" => {
      if (!url) return 'png'; // Default to png
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.includes('.dwg')) return 'dwg';
      if (lowerUrl.includes('.dxf')) return 'dxf';
      if (lowerUrl.includes('.pdf')) return 'pdf';
      if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) return 'jpg';
      return 'png'; // Default to png
    };

    const cadData = {
      fileUrl: planImageUrl || 'placeholder://no-image-uploaded',
      fileType: getFileType(planImageUrl),
      extractionMethod: 'vision' as const, // Schema valid: "ezdxf" | "vision"
      extractionConfidence: quantities.hasScale ? 0.95 : 0.6, // High confidence with scale
      spaceModel,
      spatialRelationships: {
        layoutNarrative: (inferredData.spatialNarrative as string) || 
          `Space contains ${quantities.totalRoomCount} rooms with ${quantities.totalWallLength.toFixed(1)} ${quantities.scaleUnit} of walls and ${quantities.totalFloorArea.toFixed(1)} square ${quantities.scaleUnit} of floor area.`,
        roomAdjacencies: [],
        entryPoints: [],
      },
    };

    // Build flags
    const flags = {
      lowConfidenceItems: [] as Array<{ field: string; confidence: number; reason: string }>,
      missingData: quantities.warnings,
      userVerificationRequired: !quantities.hasScale,
      verificationItems: [] as string[],
    };

    if (!quantities.hasScale) {
      flags.lowConfidenceItems.push({
        field: 'scale',
        confidence: 0.0,
        reason: 'No scale set - all measurements are in pixels',
      });
    }

    const clarificationOutput = {
      estimateId,
      schemaVersion: '3.0.0',
      timestamp: new Date().toISOString(),
      clarificationStatus: quantities.hasScale ? 'complete' : 'needs_review',
      projectBrief,
      csiScope,
      cadData,
      conversation: {
        inputMethod: 'mixed' as const, // Schema valid: "text" | "voice" | "mixed"
        messageCount: 0,
        clarificationQuestions: [],
        confidenceScore: quantities.hasScale ? 0.95 : 0.5,
      },
      flags,
      // Include computed quantities summary for transparency
      computedQuantities: {
        source: 'user_annotations',
        hasScale: quantities.hasScale,
        scaleUnit: quantities.scaleUnit,
        totalWallLength: quantities.totalWallLength,
        totalFloorArea: quantities.totalFloorArea,
        totalRoomCount: quantities.totalRoomCount,
        totalDoorCount: quantities.totalDoorCount,
        totalWindowCount: quantities.totalWindowCount,
        layerSummary: quantities.layerSummary,
      },
    };

    // Save to Firestore (use set with merge to create if doesn't exist)
    initFirebaseAdmin();
    const db = admin.firestore();
    await db.collection('projects').doc(projectId)
      .collection('estimations').doc(sessionId)
      .set({
        clarificationOutput,
        status: 'complete',
        analysisPassCount: passNumber,
        lastAnalysisAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(), // Will only be set on create due to merge
      }, { merge: true });

    console.log(`[ESTIMATION] Complete. Generated estimate ${estimateId}`);
    console.log(`[ESTIMATION] Used ${quantities.hasScale ? 'annotation-based' : 'pixel-only'} measurements`);
    console.log(`[ESTIMATION] Wall length: ${quantities.totalWallLength} ${quantities.scaleUnit}`);
    console.log(`[ESTIMATION] Floor area: ${quantities.totalFloorArea} sq ${quantities.scaleUnit}`);

    return {
      success: true,
      estimateId,
      clarificationOutput,
      passNumber,
      quantitiesSource: 'annotation',
    };
  } catch (error) {
    console.error('Estimation Pipeline Error:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Estimation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
