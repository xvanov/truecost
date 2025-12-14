/**
 * Estimation Pipeline Cloud Function
 * PRIMARY: Uses user annotations (polylines, polygons, bounding boxes) with scale for accurate measurements
 * SECONDARY: Uses OpenAI Vision only for inference/gap-filling when annotations are insufficient
 * 
 * ENHANCED v2.0:
 * - Comprehensive CSI coverage (all 24 divisions)
 * - Project-type-specific data extraction
 * - Schema validation before output
 * - Enhanced LLM prompts for better accuracy
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
} from './annotationQuantifier';
import { buildEnhancedCSIItems } from './enhancedCsiMapper';
import { extractProjectSpecificData, generateLayoutNarrative } from './projectSpecificExtractor';
import { validateClarificationOutput, autoFixClarificationOutput, getValidationSummary } from './schemaValidator';
import { runEnhancedInference, mergeInferenceIntoCSI } from './enhancedInference';

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

// Structured clarification context from annotation check conversations
interface ClarificationContext {
  confirmedQuantities?: {
    doors?: number;
    windows?: number;
    rooms?: number;
    walls?: number;
  };
  areaRelationships?: {
    demolitionArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    ceilingArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    paintArea?: 'walls_only' | 'walls_and_ceiling' | 'custom';
  };
  exclusions?: {
    electrical?: boolean;
    plumbing?: boolean;
    hvac?: boolean;
    demolition?: boolean;
    ceiling?: boolean;
    trim?: boolean;
    [key: string]: boolean | undefined;
  };
  inclusions?: {
    windowTrim?: boolean;
    doorHardware?: boolean;
    baseTrim?: boolean;
    crownMolding?: boolean;
    [key: string]: boolean | undefined;
  };
  details?: {
    ceilingType?: string;
    flooringType?: string;
    paintType?: string;
    doorStyle?: string;
    [key: string]: string | undefined;
  };
  notes?: string[];
}

interface EstimationRequest {
  projectId: string;
  sessionId: string;
  planImageUrl: string;
  scopeText: string;
  clarificationData: Record<string, unknown>;
  annotationSnapshot: AnnotationSnapshot;
  clarificationContext?: ClarificationContext; // Structured context from annotation check
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

/**
 * Infer project type from scope text
 */
function inferProjectType(scopeText: string): string {
  const lower = scopeText.toLowerCase();
  
  if (lower.includes('kitchen')) return 'kitchen_remodel';
  if (lower.includes('bathroom') || lower.includes('bath ')) return 'bathroom_remodel';
  if (lower.includes('bedroom')) return 'bedroom_remodel';
  if (lower.includes('living room') || lower.includes('family room')) return 'living_room_remodel';
  if (lower.includes('basement')) return 'basement_finish';
  if (lower.includes('attic')) return 'attic_conversion';
  if (lower.includes('whole house') || lower.includes('full remodel')) return 'whole_house_remodel';
  if (lower.includes('addition')) return 'addition';
  if (lower.includes('deck') || lower.includes('patio')) return 'deck_patio';
  if (lower.includes('garage')) return 'garage';
  
  return 'other';
}

// ===================
// LLM INFERENCE (SECONDARY - only for gap-filling)
// Now uses enhanced inference module for better accuracy
// ===================

async function prepareImageForInference(planImageUrl: string): Promise<string> {
  if (isLocalUrl(planImageUrl)) {
    return await imageUrlToBase64(planImageUrl);
  }
  return planImageUrl;
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
      clarificationContext: providedContext,
      passNumber = 1,
    } = data;

    if (!scopeText) {
      throw new HttpsError('invalid-argument', 'Scope text is required');
    }

    console.log(`[ESTIMATION] Starting pass ${passNumber} for session ${sessionId}`);

    // ===================
    // LOAD CLARIFICATION CONTEXT FROM FIRESTORE (if not provided)
    // ===================
    let clarificationContext: ClarificationContext = providedContext || {};
    
    // Try to load from Firestore if not provided and we have auth context
    if (!providedContext && request.auth?.uid) {
      try {
        initFirebaseAdmin();
        const db = admin.firestore();
        const contextDoc = await db
          .collection('users')
          .doc(request.auth.uid)
          .collection('projects')
          .doc(projectId)
          .collection('context')
          .doc('clarifications')
          .get();
        
        if (contextDoc.exists) {
          const contextData = contextDoc.data();
          clarificationContext = contextData?.clarifications || {};
          console.log('[ESTIMATION] Loaded clarification context from Firestore:', clarificationContext);
        }
      } catch (err) {
        console.warn('[ESTIMATION] Could not load clarification context:', err);
      }
    }
    
    console.log('[ESTIMATION] Using clarification context:', {
      hasExclusions: Object.keys(clarificationContext.exclusions || {}).length > 0,
      hasInclusions: Object.keys(clarificationContext.inclusions || {}).length > 0,
      hasAreaRelationships: Object.keys(clarificationContext.areaRelationships || {}).length > 0,
      confirmedQuantities: clarificationContext.confirmedQuantities,
    });

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
    // STEP 3: DETERMINE PROJECT CONTEXT
    // ===================
    const projectType = (clarificationData.projectType as string) || 
                        inferProjectType(scopeText) || 'other';
    const finishLevel = (clarificationData.finishLevel as 'budget' | 'mid_range' | 'high_end' | 'luxury') || 'mid_range';
    
    console.log(`[ESTIMATION] Project type: ${projectType}, Finish level: ${finishLevel}`);

    // ===================
    // STEP 4: BUILD ENHANCED CSI ITEMS FROM ANNOTATIONS
    // ===================
    console.log('[ESTIMATION] Building enhanced CSI items from computed quantities...');
    
    // Apply confirmed quantities from clarification context
    if (clarificationContext.confirmedQuantities) {
      if (clarificationContext.confirmedQuantities.doors !== undefined) {
        console.log(`[ESTIMATION] Using confirmed door count: ${clarificationContext.confirmedQuantities.doors}`);
        // Override door count if user confirmed a specific number
        quantities.totalDoorCount = clarificationContext.confirmedQuantities.doors;
      }
      if (clarificationContext.confirmedQuantities.windows !== undefined) {
        console.log(`[ESTIMATION] Using confirmed window count: ${clarificationContext.confirmedQuantities.windows}`);
        quantities.totalWindowCount = clarificationContext.confirmedQuantities.windows;
      }
    }
    
    const projectContext = {
      projectType,
      finishLevel,
      scopeText,
      clarificationData,
      clarificationContext, // Pass the full context for detailed processing
    };
    let computedCSIItems: Record<string, unknown[]> = buildEnhancedCSIItems(quantities, projectContext);

    // ===================
    // STEP 5: EXTRACT PROJECT-SPECIFIC DATA
    // ===================
    console.log('[ESTIMATION] Extracting project-specific data...');
    const projectSpecificData = extractProjectSpecificData(
      quantities,
      projectType,
      clarificationData,
      scopeText
    );

    // ===================
    // STEP 6: LLM INFERENCE FOR GAP-FILLING (SECONDARY)
    // ===================
    let inferenceResult = null;
    let spatialNarrative = '';
    
    // Only use LLM if we have annotations but need inference for non-measured items
    if (quantities.hasScale && (quantities.totalWallLength > 0 || quantities.totalFloorArea > 0)) {
      const apiKey = getApiKey();
      if (apiKey) {
        console.log('[ESTIMATION] Running enhanced LLM inference for gap-filling...');
        const openai = getOpenAI();
        
        // Prepare image URL if available
        let imageUrl = planImageUrl;
        if (planImageUrl && isLocalUrl(planImageUrl)) {
          imageUrl = await prepareImageForInference(planImageUrl);
        }
        
        inferenceResult = await runEnhancedInference(
          openai,
          quantities,
          projectType,
          finishLevel,
          scopeText,
          clarificationData,
          imageUrl
        );
        
        spatialNarrative = inferenceResult.spatialNarrative;
        
        // Merge inferred items into CSI items
        computedCSIItems = mergeInferenceIntoCSI(computedCSIItems, inferenceResult);
        
        console.log(`[ESTIMATION] LLM inference added ${inferenceResult.inferredItems.length} items, ${inferenceResult.standardAllowances.length} allowances`);
        if (inferenceResult.scopeAmbiguities.length > 0) {
          console.log(`[ESTIMATION] Found ${inferenceResult.scopeAmbiguities.length} scope ambiguities for review`);
        }
      } else {
        console.log('[ESTIMATION] No API key - using annotation data only');
      }
    } else if (!quantities.hasScale) {
      console.log('[ESTIMATION] No scale set - using annotation data only');
    } else {
      console.log('[ESTIMATION] No annotations - using defaults only');
    }
    
    // Generate layout narrative from extracted data if LLM didn't provide one
    if (!spatialNarrative || spatialNarrative.length < 200) {
      spatialNarrative = generateLayoutNarrative(quantities, projectType, projectSpecificData);
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

    const cadData: Record<string, unknown> = {
      fileUrl: planImageUrl || 'placeholder://no-image-uploaded',
      fileType: getFileType(planImageUrl),
      extractionMethod: 'vision' as const, // Schema valid: "ezdxf" | "vision"
      extractionConfidence: quantities.hasScale ? 0.95 : 0.6, // High confidence with scale
      spaceModel,
      spatialRelationships: {
        layoutNarrative: spatialNarrative,
        roomAdjacencies: [],
        entryPoints: [],
      },
    };
    
    // Add project-specific data based on project type
    if (projectSpecificData.kitchenSpecific) {
      cadData.kitchenSpecific = projectSpecificData.kitchenSpecific;
    }
    if (projectSpecificData.bathroomSpecific) {
      cadData.bathroomSpecific = projectSpecificData.bathroomSpecific;
    }
    if (projectSpecificData.bedroomSpecific) {
      cadData.bedroomSpecific = projectSpecificData.bedroomSpecific;
    }
    if (projectSpecificData.livingAreaSpecific) {
      cadData.livingAreaSpecific = projectSpecificData.livingAreaSpecific;
    }

    // Build flags with enhanced data
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
    
    // Add scope ambiguities from LLM inference as verification items
    if (inferenceResult?.scopeAmbiguities) {
      for (const ambiguity of inferenceResult.scopeAmbiguities) {
        flags.verificationItems.push(ambiguity.clarificationNeeded);
        if (ambiguity.issue) {
          flags.missingData.push(ambiguity.issue);
        }
      }
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
      // Include inference metadata for transparency
      inferenceMetadata: inferenceResult ? {
        roomTypesInferred: inferenceResult.roomTypes.length,
        itemsInferred: inferenceResult.inferredItems.length,
        allowancesAdded: inferenceResult.standardAllowances.length,
        ambiguitiesFound: inferenceResult.scopeAmbiguities.length,
        materialsRecommended: inferenceResult.materialsAndFinishes.recommended.length,
      } : null,
    };

    // ===================
    // STEP 8: VALIDATE AND AUTO-FIX OUTPUT
    // ===================
    console.log('[ESTIMATION] Validating ClarificationOutput...');
    
    // First validate
    const validationResult = validateClarificationOutput(clarificationOutput);
    console.log(`[ESTIMATION] Validation: ${validationResult.isValid ? 'PASSED' : 'NEEDS FIXES'}, Score: ${validationResult.completenessScore}/100`);
    
    if (validationResult.errors.length > 0) {
      console.log(`[ESTIMATION] Found ${validationResult.errors.length} errors, ${validationResult.warnings.length} warnings`);
      console.log(getValidationSummary(validationResult));
    }
    
    // Auto-fix common issues
    const fixedOutput = autoFixClarificationOutput(clarificationOutput);
    
    // Re-validate after fix
    const finalValidation = validateClarificationOutput(fixedOutput);
    console.log(`[ESTIMATION] After auto-fix: ${finalValidation.isValid ? 'PASSED' : 'STILL HAS ISSUES'}, Score: ${finalValidation.completenessScore}/100`);

    // Save to Firestore (use set with merge to create if doesn't exist)
    initFirebaseAdmin();
    const db = admin.firestore();
    await db.collection('projects').doc(projectId)
      .collection('estimations').doc(sessionId)
      .set({
        clarificationOutput: fixedOutput, // Use validated and fixed output
        status: finalValidation.isValid ? 'complete' : 'needs_review',
        validationScore: finalValidation.completenessScore,
        validationErrors: finalValidation.errors,
        validationWarnings: finalValidation.warnings,
        csiCoverage: finalValidation.csiCoverage,
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
      clarificationOutput: fixedOutput,
      passNumber,
      quantitiesSource: 'annotation',
      validation: {
        isValid: finalValidation.isValid,
        completenessScore: finalValidation.completenessScore,
        errorCount: finalValidation.errors.length,
        warningCount: finalValidation.warnings.length,
        csiCoverage: finalValidation.csiCoverage,
      },
      projectType,
      finishLevel,
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
