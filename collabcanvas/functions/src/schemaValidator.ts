/**
 * Schema Validator for ClarificationOutput
 * Validates the JSON output against the v3.0.0 schema requirements
 */

// ===================
// TYPES
// ===================

interface ValidationError {
  code: string;
  field: string;
  message: string;
  severity: 'error';
}

interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  severity: 'warning';
  suggestion?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  completenessScore: number;
  csiCoverage: {
    included: number;
    excluded: number;
    byOwner: number;
    notApplicable: number;
    missing: string[];
  };
}

interface CSIDivision {
  code: string;
  name: string;
  status: string;
  exclusionReason?: string;
  description: string;
  items: unknown[];
}

// All required CSI division keys per schema v3.0.0
const REQUIRED_CSI_DIVISIONS = [
  'div01_general_requirements',
  'div02_existing_conditions',
  'div03_concrete',
  'div04_masonry',
  'div05_metals',
  'div06_wood_plastics_composites',
  'div07_thermal_moisture',
  'div08_openings',
  'div09_finishes',
  'div10_specialties',
  'div11_equipment',
  'div12_furnishings',
  'div13_special_construction',
  'div14_conveying_equipment',
  'div21_fire_suppression',
  'div22_plumbing',
  'div23_hvac',
  'div25_integrated_automation',
  'div26_electrical',
  'div27_communications',
  'div28_electronic_safety_security',
  'div31_earthwork',
  'div32_exterior_improvements',
  'div33_utilities',
];

const VALID_CSI_STATUSES = ['included', 'excluded', 'by_owner', 'not_applicable'];
const VALID_PROJECT_TYPES = [
  'kitchen_remodel', 'bathroom_remodel', 'bedroom_remodel', 'living_room_remodel',
  'basement_finish', 'attic_conversion', 'whole_house_remodel', 'addition',
  'deck_patio', 'garage', 'other'
];
const VALID_FINISH_LEVELS = ['budget', 'mid_range', 'high_end', 'luxury'];
const VALID_COMPLEXITIES = ['simple', 'moderate', 'complex'];

// ===================
// VALIDATION FUNCTIONS
// ===================

/**
 * Main validation function for ClarificationOutput
 */
export function validateClarificationOutput(output: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const csiCoverage = {
    included: 0,
    excluded: 0,
    byOwner: 0,
    notApplicable: 0,
    missing: [] as string[],
  };

  // ===================
  // METADATA VALIDATION
  // ===================
  
  if (!output.estimateId || typeof output.estimateId !== 'string') {
    errors.push({
      code: 'MISSING_ESTIMATE_ID',
      field: 'estimateId',
      message: 'estimateId is required and must be a string',
      severity: 'error',
    });
  }

  if (output.schemaVersion !== '3.0.0') {
    errors.push({
      code: 'INVALID_SCHEMA_VERSION',
      field: 'schemaVersion',
      message: `schemaVersion must be "3.0.0", got "${output.schemaVersion}"`,
      severity: 'error',
    });
  }

  if (!output.timestamp || typeof output.timestamp !== 'string') {
    errors.push({
      code: 'MISSING_TIMESTAMP',
      field: 'timestamp',
      message: 'timestamp is required (ISO 8601 format)',
      severity: 'error',
    });
  }

  if (!['complete', 'needs_review'].includes(output.clarificationStatus as string)) {
    errors.push({
      code: 'INVALID_STATUS',
      field: 'clarificationStatus',
      message: 'clarificationStatus must be "complete" or "needs_review"',
      severity: 'error',
    });
  }

  // ===================
  // PROJECT BRIEF VALIDATION
  // ===================
  
  const projectBrief = output.projectBrief as Record<string, unknown> | undefined;
  if (!projectBrief) {
    errors.push({
      code: 'MISSING_PROJECT_BRIEF',
      field: 'projectBrief',
      message: 'projectBrief is required',
      severity: 'error',
    });
  } else {
    // Project Type
    if (!VALID_PROJECT_TYPES.includes(projectBrief.projectType as string)) {
      warnings.push({
        code: 'INVALID_PROJECT_TYPE',
        field: 'projectBrief.projectType',
        message: `projectType "${projectBrief.projectType}" is not a standard type`,
        severity: 'warning',
        suggestion: `Use one of: ${VALID_PROJECT_TYPES.join(', ')}`,
      });
    }

    // Location validation
    const location = projectBrief.location as Record<string, unknown> | undefined;
    if (!location) {
      errors.push({
        code: 'MISSING_LOCATION',
        field: 'projectBrief.location',
        message: 'location is required',
        severity: 'error',
      });
    } else {
      const requiredFields = ['fullAddress', 'city', 'state', 'zipCode'];
      for (const field of requiredFields) {
        if (!location[field]) {
          warnings.push({
            code: 'INCOMPLETE_LOCATION',
            field: `projectBrief.location.${field}`,
            message: `${field} is recommended for accurate location-based pricing`,
            severity: 'warning',
          });
        }
      }
    }

    // Scope Summary
    const scopeSummary = projectBrief.scopeSummary as Record<string, unknown> | undefined;
    if (scopeSummary) {
      if (!VALID_FINISH_LEVELS.includes(scopeSummary.finishLevel as string)) {
        warnings.push({
          code: 'INVALID_FINISH_LEVEL',
          field: 'projectBrief.scopeSummary.finishLevel',
          message: `finishLevel "${scopeSummary.finishLevel}" should be one of: ${VALID_FINISH_LEVELS.join(', ')}`,
          severity: 'warning',
        });
      }

      if (!VALID_COMPLEXITIES.includes(scopeSummary.projectComplexity as string)) {
        warnings.push({
          code: 'INVALID_COMPLEXITY',
          field: 'projectBrief.scopeSummary.projectComplexity',
          message: `projectComplexity should be one of: ${VALID_COMPLEXITIES.join(', ')}`,
          severity: 'warning',
        });
      }

      if (typeof scopeSummary.totalSqft !== 'number' || (scopeSummary.totalSqft as number) <= 0) {
        warnings.push({
          code: 'INVALID_SQFT',
          field: 'projectBrief.scopeSummary.totalSqft',
          message: 'totalSqft should be a positive number',
          severity: 'warning',
          suggestion: 'Ensure scale is set correctly for accurate area calculations',
        });
      }
    }
  }

  // ===================
  // CSI SCOPE VALIDATION
  // ===================
  
  const csiScope = output.csiScope as Record<string, unknown> | undefined;
  if (!csiScope) {
    errors.push({
      code: 'MISSING_CSI_SCOPE',
      field: 'csiScope',
      message: 'csiScope is required with all 24 divisions',
      severity: 'error',
    });
  } else {
    // Check all 24 divisions are present
    for (const divKey of REQUIRED_CSI_DIVISIONS) {
      const division = csiScope[divKey] as CSIDivision | undefined;
      
      if (!division) {
        errors.push({
          code: 'CSI_DIVISION_MISSING',
          field: `csiScope.${divKey}`,
          message: `Division ${divKey} is required`,
          severity: 'error',
        });
        csiCoverage.missing.push(divKey);
        continue;
      }

      // Validate division status
      if (!VALID_CSI_STATUSES.includes(division.status)) {
        errors.push({
          code: 'INVALID_CSI_STATUS',
          field: `csiScope.${divKey}.status`,
          message: `Status "${division.status}" must be one of: ${VALID_CSI_STATUSES.join(', ')}`,
          severity: 'error',
        });
      }

      // Track coverage
      switch (division.status) {
        case 'included':
          csiCoverage.included++;
          if (!division.items || (division.items as unknown[]).length === 0) {
            warnings.push({
              code: 'EMPTY_INCLUDED_DIVISION',
              field: `csiScope.${divKey}.items`,
              message: `Division ${divKey} is "included" but has no line items`,
              severity: 'warning',
              suggestion: 'Add at least one line item for included divisions',
            });
          }
          break;
        case 'excluded':
          csiCoverage.excluded++;
          if (!division.exclusionReason) {
            errors.push({
              code: 'MISSING_EXCLUSION_REASON',
              field: `csiScope.${divKey}.exclusionReason`,
              message: `Division ${divKey} is "excluded" but has no exclusionReason`,
              severity: 'error',
            });
          }
          break;
        case 'by_owner':
          csiCoverage.byOwner++;
          break;
        case 'not_applicable':
          csiCoverage.notApplicable++;
          break;
      }

      // Validate line items structure
      if (division.items && Array.isArray(division.items)) {
        for (let i = 0; i < division.items.length; i++) {
          const item = division.items[i] as Record<string, unknown>;
          if (!item.id || !item.item || item.quantity === undefined) {
            warnings.push({
              code: 'INCOMPLETE_LINE_ITEM',
              field: `csiScope.${divKey}.items[${i}]`,
              message: 'Line item missing required fields (id, item, quantity)',
              severity: 'warning',
            });
          }
          if (typeof item.confidence === 'number' && (item.confidence < 0 || item.confidence > 1)) {
            warnings.push({
              code: 'INVALID_CONFIDENCE',
              field: `csiScope.${divKey}.items[${i}].confidence`,
              message: 'Confidence should be between 0 and 1',
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  // ===================
  // CAD DATA VALIDATION
  // ===================
  
  const cadData = output.cadData as Record<string, unknown> | undefined;
  if (!cadData) {
    errors.push({
      code: 'MISSING_CAD_DATA',
      field: 'cadData',
      message: 'cadData is required (CAD upload is mandatory)',
      severity: 'error',
    });
  } else {
    if (!cadData.fileUrl || cadData.fileUrl === 'placeholder://no-image-uploaded') {
      errors.push({
        code: 'MISSING_CAD_FILE',
        field: 'cadData.fileUrl',
        message: 'A valid CAD file URL is required',
        severity: 'error',
      });
    }

    const spaceModel = cadData.spaceModel as Record<string, unknown> | undefined;
    if (spaceModel) {
      const scale = spaceModel.scale as Record<string, unknown> | undefined;
      if (!scale?.detected) {
        warnings.push({
          code: 'SCALE_NOT_DETECTED',
          field: 'cadData.spaceModel.scale',
          message: 'Scale was not detected - measurements may be inaccurate',
          severity: 'warning',
          suggestion: 'User should set the scale using the calibration tool',
        });
      }
    }

    const spatialRelationships = cadData.spatialRelationships as Record<string, unknown> | undefined;
    if (spatialRelationships) {
      const narrative = spatialRelationships.layoutNarrative as string | undefined;
      if (!narrative || narrative.length < 200) {
        warnings.push({
          code: 'SHORT_LAYOUT_NARRATIVE',
          field: 'cadData.spatialRelationships.layoutNarrative',
          message: `Layout narrative should be at least 200 characters (current: ${narrative?.length || 0})`,
          severity: 'warning',
          suggestion: 'Provide detailed description of room layout and relationships',
        });
      }
    }

    // Check for project-type-specific data
    const projectType = (projectBrief?.projectType as string) || '';
    if (projectType.includes('kitchen') && !cadData.kitchenSpecific) {
      warnings.push({
        code: 'MISSING_PROJECT_SPECIFIC_DATA',
        field: 'cadData.kitchenSpecific',
        message: 'Kitchen remodel should include kitchenSpecific data',
        severity: 'warning',
      });
    }
    if (projectType.includes('bathroom') && !cadData.bathroomSpecific) {
      warnings.push({
        code: 'MISSING_PROJECT_SPECIFIC_DATA',
        field: 'cadData.bathroomSpecific',
        message: 'Bathroom remodel should include bathroomSpecific data',
        severity: 'warning',
      });
    }
  }

  // ===================
  // CONVERSATION VALIDATION
  // ===================
  
  const conversation = output.conversation as Record<string, unknown> | undefined;
  if (!conversation) {
    warnings.push({
      code: 'MISSING_CONVERSATION',
      field: 'conversation',
      message: 'conversation object is recommended for audit trail',
      severity: 'warning',
    });
  }

  // ===================
  // COMPUTE COMPLETENESS SCORE
  // ===================
  
  const totalDivisions = REQUIRED_CSI_DIVISIONS.length;
  const presentDivisions = totalDivisions - csiCoverage.missing.length;
  const divisionScore = (presentDivisions / totalDivisions) * 40; // 40% weight

  const totalChecks = 10; // Simplified check count
  const passedChecks = totalChecks - errors.length;
  const errorScore = Math.max(0, (passedChecks / totalChecks) * 40); // 40% weight

  const warningPenalty = Math.min(warnings.length * 2, 20); // Max 20% penalty
  const completenessScore = Math.round(Math.max(0, divisionScore + errorScore + (20 - warningPenalty)));

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    completenessScore,
    csiCoverage,
  };
}

/**
 * Fixes common issues in ClarificationOutput to improve validity
 */
export function autoFixClarificationOutput(output: Record<string, unknown>): Record<string, unknown> {
  const fixed = JSON.parse(JSON.stringify(output));

  // Fix schema version
  if (fixed.schemaVersion !== '3.0.0') {
    fixed.schemaVersion = '3.0.0';
  }

  // Ensure timestamp
  if (!fixed.timestamp) {
    fixed.timestamp = new Date().toISOString();
  }

  // Ensure estimateId
  if (!fixed.estimateId) {
    fixed.estimateId = `est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Ensure CSI scope has all divisions
  if (!fixed.csiScope) {
    fixed.csiScope = {};
  }

  const csiScope = fixed.csiScope as Record<string, unknown>;
  for (const divKey of REQUIRED_CSI_DIVISIONS) {
    if (!csiScope[divKey]) {
      const divCode = divKey.match(/div(\d+)/)?.[1] || '00';
      const divName = divKey.replace(/^div\d+_/, '').replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      
      csiScope[divKey] = {
        code: divCode,
        name: divName,
        status: 'not_applicable',
        exclusionReason: 'No items identified in annotations or scope',
        description: '',
        items: [],
      };
    } else {
      const div = csiScope[divKey] as Record<string, unknown>;
      // Add exclusion reason if missing for excluded divisions
      if (div.status === 'excluded' && !div.exclusionReason) {
        div.exclusionReason = 'Not included in project scope';
      }
    }
  }

  return fixed;
}

/**
 * Get a human-readable validation summary
 */
export function getValidationSummary(result: ValidationResult): string {
  const lines: string[] = [];
  
  lines.push(`=== ClarificationOutput Validation ===`);
  lines.push(`Valid: ${result.isValid ? '✅ Yes' : '❌ No'}`);
  lines.push(`Completeness Score: ${result.completenessScore}/100`);
  lines.push('');
  
  lines.push('CSI Division Coverage:');
  lines.push(`  Included: ${result.csiCoverage.included}`);
  lines.push(`  Excluded: ${result.csiCoverage.excluded}`);
  lines.push(`  By Owner: ${result.csiCoverage.byOwner}`);
  lines.push(`  N/A: ${result.csiCoverage.notApplicable}`);
  if (result.csiCoverage.missing.length > 0) {
    lines.push(`  Missing: ${result.csiCoverage.missing.join(', ')}`);
  }
  lines.push('');
  
  if (result.errors.length > 0) {
    lines.push(`Errors (${result.errors.length}):`);
    for (const error of result.errors) {
      lines.push(`  ❌ [${error.code}] ${error.field}: ${error.message}`);
    }
    lines.push('');
  }
  
  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ [${warning.code}] ${warning.field}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`     💡 ${warning.suggestion}`);
      }
    }
  }
  
  return lines.join('\n');
}

