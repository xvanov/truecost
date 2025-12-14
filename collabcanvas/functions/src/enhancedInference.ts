/**
 * Enhanced LLM Inference Module
 * Improved prompts and structured output for better JSON accuracy
 */

import { OpenAI } from 'openai';
import { ComputedQuantities } from './annotationQuantifier';

// ===================
// TYPES
// ===================

interface InferenceResult {
  roomTypes: Array<{
    roomId: string;
    inferredType: 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'dining' | 'office' | 'laundry' | 'closet' | 'hallway' | 'other';
    confidence: number;
    reasoning: string;
  }>;
  spatialNarrative: string;
  inferredItems: Array<{
    division: string;
    subdivisionCode?: string;
    item: string;
    quantity: number;
    unit: string;
    reason: string;
    confidence: number;
  }>;
  standardAllowances: Array<{
    division: string;
    item: string;
    quantity: number;
    unit: string;
    basis: string;
    confidence: number;
  }>;
  materialsAndFinishes: {
    recommended: Array<{
      category: string;
      item: string;
      specification: string;
      priceRange: string;
    }>;
    alternatives: Array<{
      category: string;
      current: string;
      alternative: string;
      priceDifference: string;
    }>;
  };
  scopeAmbiguities: Array<{
    issue: string;
    clarificationNeeded: string;
    suggestedDefault: string;
  }>;
}

// ===================
// ENHANCED PROMPTS
// ===================

const SYSTEM_PROMPT = `You are an expert construction estimator with 20+ years of experience. You specialize in residential remodeling projects and are known for your accurate quantity takeoffs and material specifications.

Your role is to analyze project data and provide ONLY:
1. Inferences that CANNOT be computed from direct measurements
2. Standard industry allowances for items not explicitly annotated
3. Material and finish recommendations based on scope
4. Identification of ambiguities that need clarification

CRITICAL RULES:
- NEVER override computed quantities (walls, floors, doors, windows)
- Only infer items that cannot be measured (outlets, fixtures, MEP rough-ins)
- Always cite your reasoning
- Use confidence scores honestly (0.0-1.0)
- Follow CSI MasterFormat division structure`;

/**
 * Build an enhanced inference prompt with structured output requirements
 */
function buildInferencePrompt(
  quantities: ComputedQuantities,
  projectType: string,
  finishLevel: string,
  scopeText: string,
  clarificationData: Record<string, unknown>
): string {
  return `## PROJECT ANALYSIS REQUEST

### PROJECT CONTEXT
**Type:** ${projectType}
**Finish Level:** ${finishLevel}
**Scope Description:**
${scopeText}

### COMPUTED QUANTITIES (DO NOT OVERRIDE)
These values were measured from user annotations and are authoritative:

| Metric | Value | Unit |
|--------|-------|------|
| Total Wall Length | ${quantities.totalWallLength.toFixed(1)} | ${quantities.scaleUnit} |
| Total Floor Area | ${quantities.totalFloorArea.toFixed(1)} | sq ${quantities.scaleUnit} |
| Room Count | ${quantities.totalRoomCount} | rooms |
| Door Count | ${quantities.totalDoorCount} | doors |
| Window Count | ${quantities.totalWindowCount} | windows |
| Scale Detected | ${quantities.hasScale ? 'Yes' : 'No'} | - |

**Room Details:**
${JSON.stringify(quantities.rooms.map(r => ({
  id: r.id,
  name: r.name,
  area: r.areaReal,
  unit: r.unit,
})), null, 2)}

**Layer Summary:**
${JSON.stringify(quantities.layerSummary, null, 2)}

${quantities.warnings.length > 0 ? `**Warnings:**
${quantities.warnings.map(w => `- ${w}`).join('\n')}` : ''}

### CLARIFICATION DATA
${JSON.stringify(clarificationData, null, 2)}

### YOUR TASK
Analyze this project and provide JSON output with:

1. **roomTypes**: Infer room functions for each room based on layout, size, and context
2. **spatialNarrative**: Write a detailed 200+ character description of the space layout
3. **inferredItems**: Items that must be added but cannot be measured:
   - Electrical outlets (based on code requirements)
   - Plumbing rough-ins (based on fixture locations)
   - HVAC requirements (based on room types and sizes)
   - Specialty items (based on scope description)
4. **standardAllowances**: Industry-standard inclusions:
   - Permits and inspections
   - Temporary protection
   - Cleanup and debris removal
   - Contingency items
5. **materialsAndFinishes**: Recommendations based on finish level
6. **scopeAmbiguities**: Items that need user clarification

### OUTPUT FORMAT
Return ONLY valid JSON matching this schema:
\`\`\`json
{
  "roomTypes": [
    {
      "roomId": "room-id-from-input",
      "inferredType": "kitchen|bathroom|bedroom|living|dining|office|laundry|closet|hallway|other",
      "confidence": 0.0-1.0,
      "reasoning": "Why this room type was inferred"
    }
  ],
  "spatialNarrative": "Detailed description of the space layout, flow, and relationships (min 200 chars)",
  "inferredItems": [
    {
      "division": "div26_electrical",
      "subdivisionCode": "26 27 26",
      "item": "Item name",
      "quantity": 4,
      "unit": "each",
      "reason": "Based on NEC code requirement for X",
      "confidence": 0.85
    }
  ],
  "standardAllowances": [
    {
      "division": "div01_general_requirements",
      "item": "Building Permit",
      "quantity": 1,
      "unit": "ls",
      "basis": "Required for scope of work",
      "confidence": 0.95
    }
  ],
  "materialsAndFinishes": {
    "recommended": [
      {
        "category": "Cabinets",
        "item": "Semi-custom wood cabinets",
        "specification": "Maple with soft-close, dovetail drawers",
        "priceRange": "$$$"
      }
    ],
    "alternatives": [
      {
        "category": "Countertops",
        "current": "Quartz",
        "alternative": "Granite",
        "priceDifference": "Similar cost"
      }
    ]
  },
  "scopeAmbiguities": [
    {
      "issue": "Ceiling height not specified",
      "clarificationNeeded": "What is the ceiling height?",
      "suggestedDefault": "8 feet (standard)"
    }
  ]
}
\`\`\`

IMPORTANT GUIDELINES:
- For electrical outlets: NEC requires outlet within 6 feet of any wall point, plus dedicated circuits for kitchens/bathrooms
- For plumbing: Count fixtures and add rough-in requirements
- For HVAC: Consider room sizes for supply/return sizing
- Be conservative with confidence scores
- If uncertain, add to scopeAmbiguities instead of guessing`;
}

// ===================
// INFERENCE FUNCTION
// ===================

/**
 * Run enhanced LLM inference for gap-filling
 */
export async function runEnhancedInference(
  openai: OpenAI,
  quantities: ComputedQuantities,
  projectType: string,
  finishLevel: string,
  scopeText: string,
  clarificationData: Record<string, unknown>,
  planImageUrl?: string
): Promise<InferenceResult> {
  const prompt = buildInferencePrompt(
    quantities,
    projectType,
    finishLevel,
    scopeText,
    clarificationData
  );

  try {
    let response;

    if (planImageUrl) {
      // Vision-enabled inference
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: planImageUrl, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.2, // Lower temperature for more consistent output
        response_format: { type: 'json_object' },
      });
    } else {
      // Text-only inference
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from LLM');
    }

    const parsed = JSON.parse(content);
    
    // Validate and fix the response
    return validateAndFixInferenceResult(parsed);
  } catch (error) {
    console.error('[ENHANCED_INFERENCE] Error:', error);
    return getDefaultInferenceResult();
  }
}

/**
 * Validate and fix inference result to ensure schema compliance
 */
function validateAndFixInferenceResult(raw: Record<string, unknown>): InferenceResult {
  const result: InferenceResult = {
    roomTypes: [],
    spatialNarrative: '',
    inferredItems: [],
    standardAllowances: [],
    materialsAndFinishes: {
      recommended: [],
      alternatives: [],
    },
    scopeAmbiguities: [],
  };

  // Room types
  if (Array.isArray(raw.roomTypes)) {
    result.roomTypes = raw.roomTypes.map((rt: Record<string, unknown>) => ({
      roomId: String(rt.roomId || ''),
      inferredType: validateRoomType(rt.inferredType as string),
      confidence: Math.min(1, Math.max(0, Number(rt.confidence) || 0.5)),
      reasoning: String(rt.reasoning || ''),
    }));
  }

  // Spatial narrative
  result.spatialNarrative = String(raw.spatialNarrative || 'Space layout analysis pending.');

  // Inferred items
  if (Array.isArray(raw.inferredItems)) {
    result.inferredItems = raw.inferredItems.map((item: Record<string, unknown>) => ({
      division: String(item.division || 'div26_electrical'),
      subdivisionCode: item.subdivisionCode ? String(item.subdivisionCode) : undefined,
      item: String(item.item || ''),
      quantity: Math.max(0, Number(item.quantity) || 0),
      unit: String(item.unit || 'each'),
      reason: String(item.reason || ''),
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.7)),
    })).filter(item => item.item && item.quantity > 0);
  }

  // Standard allowances
  if (Array.isArray(raw.standardAllowances)) {
    result.standardAllowances = raw.standardAllowances.map((item: Record<string, unknown>) => ({
      division: String(item.division || 'div01_general_requirements'),
      item: String(item.item || ''),
      quantity: Math.max(0, Number(item.quantity) || 1),
      unit: String(item.unit || 'ls'),
      basis: String(item.basis || ''),
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.9)),
    })).filter(item => item.item);
  }

  // Materials and finishes
  if (raw.materialsAndFinishes && typeof raw.materialsAndFinishes === 'object') {
    const mf = raw.materialsAndFinishes as Record<string, unknown[]>;
    if (Array.isArray(mf.recommended)) {
      result.materialsAndFinishes.recommended = mf.recommended.map((r: Record<string, unknown>) => ({
        category: String(r.category || ''),
        item: String(r.item || ''),
        specification: String(r.specification || ''),
        priceRange: String(r.priceRange || '$$'),
      }));
    }
    if (Array.isArray(mf.alternatives)) {
      result.materialsAndFinishes.alternatives = mf.alternatives.map((a: Record<string, unknown>) => ({
        category: String(a.category || ''),
        current: String(a.current || ''),
        alternative: String(a.alternative || ''),
        priceDifference: String(a.priceDifference || ''),
      }));
    }
  }

  // Scope ambiguities
  if (Array.isArray(raw.scopeAmbiguities)) {
    result.scopeAmbiguities = raw.scopeAmbiguities.map((s: Record<string, unknown>) => ({
      issue: String(s.issue || ''),
      clarificationNeeded: String(s.clarificationNeeded || ''),
      suggestedDefault: String(s.suggestedDefault || ''),
    })).filter(s => s.issue);
  }

  return result;
}

/**
 * Validate room type against allowed values
 */
function validateRoomType(type: string): 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'dining' | 'office' | 'laundry' | 'closet' | 'hallway' | 'other' {
  const validTypes = ['kitchen', 'bathroom', 'bedroom', 'living', 'dining', 'office', 'laundry', 'closet', 'hallway', 'other'];
  const lower = (type || '').toLowerCase();
  return validTypes.includes(lower) ? lower as ReturnType<typeof validateRoomType> : 'other';
}

/**
 * Get default inference result when LLM fails
 */
function getDefaultInferenceResult(): InferenceResult {
  return {
    roomTypes: [],
    spatialNarrative: 'Space layout analysis requires LLM inference.',
    inferredItems: [],
    standardAllowances: [
      {
        division: 'div01_general_requirements',
        item: 'Building Permit',
        quantity: 1,
        unit: 'ls',
        basis: 'Standard requirement for remodeling work',
        confidence: 0.95,
      },
      {
        division: 'div01_general_requirements',
        item: 'Final Cleanup',
        quantity: 1,
        unit: 'ls',
        basis: 'Standard completion requirement',
        confidence: 0.95,
      },
    ],
    materialsAndFinishes: {
      recommended: [],
      alternatives: [],
    },
    scopeAmbiguities: [
      {
        issue: 'LLM inference unavailable',
        clarificationNeeded: 'Manual review of scope required',
        suggestedDefault: 'Using computed quantities only',
      },
    ],
  };
}

/**
 * Merge inference results into CSI items
 */
export function mergeInferenceIntoCSI(
  baseItems: Record<string, unknown[]>,
  inference: InferenceResult
): Record<string, unknown[]> {
  const merged = JSON.parse(JSON.stringify(baseItems)) as Record<string, unknown[]>;

  // Add inferred items
  for (const inferred of inference.inferredItems) {
    if (inferred.division && merged[inferred.division]) {
      merged[inferred.division].push({
        id: `inferred-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        item: inferred.item,
        subdivisionCode: inferred.subdivisionCode,
        quantity: inferred.quantity,
        unit: inferred.unit,
        confidence: inferred.confidence,
        source: 'inferred',
        notes: inferred.reason,
      });
    }
  }

  // Add standard allowances
  for (const allowance of inference.standardAllowances) {
    if (allowance.division && merged[allowance.division]) {
      merged[allowance.division].push({
        id: `allowance-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        item: allowance.item,
        quantity: allowance.quantity,
        unit: allowance.unit,
        confidence: allowance.confidence,
        source: 'standard_allowance',
        notes: allowance.basis,
      });
    }
  }

  return merged;
}

