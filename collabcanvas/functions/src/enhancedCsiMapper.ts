/**
 * Enhanced CSI Mapper
 * Maps computed quantities to comprehensive CSI divisions with intelligent inference
 */

import { ComputedQuantities } from './annotationQuantifier';

// ===================
// TYPES
// ===================

interface CSILineItem {
  id: string;
  item: string;
  subdivisionCode?: string;
  quantity: number;
  unit: string;
  unitDescription?: string;
  specifications?: string;
  notes?: string;
  confidence: number;
  source: 'cad_extraction' | 'user_input' | 'inferred' | 'standard_allowance';
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

interface ProjectContext {
  projectType: string;
  finishLevel: 'budget' | 'mid_range' | 'high_end' | 'luxury';
  scopeText: string;
  clarificationData: Record<string, unknown>;
  clarificationContext?: ClarificationContext;
}

// ===================
// FINISH LEVEL MULTIPLIERS
// ===================

const FINISH_MULTIPLIERS = {
  budget: 0.7,
  mid_range: 1.0,
  high_end: 1.5,
  luxury: 2.2,
};

// ===================
// INTELLIGENT CSI MAPPING
// ===================

/**
 * Build comprehensive CSI items from computed quantities and project context
 */
export function buildEnhancedCSIItems(
  quantities: ComputedQuantities,
  context: ProjectContext
): Record<string, CSILineItem[]> {
  const items: Record<string, CSILineItem[]> = {};
  const finishMultiplier = FINISH_MULTIPLIERS[context.finishLevel] || 1.0;
  const cc = context.clarificationContext || {}; // Shorthand for clarification context

  // ===================
  // APPLY CLARIFICATION CONTEXT
  // ===================
  
  // Helper function to check if a work type is excluded
  const isExcluded = (type: string): boolean => {
    return cc.exclusions?.[type] === true;
  };
  
  // Helper function to check if something is explicitly included
  const isIncluded = (type: string): boolean => {
    return cc.inclusions?.[type] === true;
  };
  
  // Helper function to get area based on relationship
  const getAreaForRelationship = (relationship?: string): number => {
    switch (relationship) {
      case 'same_as_floor':
        return quantities.totalFloorArea;
      case 'same_as_room':
        return quantities.totalFloorArea; // Rooms are floor areas
      case 'none':
        return 0;
      default:
        return quantities.totalFloorArea; // Default to floor area
    }
  };
  
  // Calculate derived quantities from clarification context
  const demolitionArea = getAreaForRelationship(cc.areaRelationships?.demolitionArea);
  const ceilingArea = getAreaForRelationship(cc.areaRelationships?.ceilingArea);
  const paintWallsOnly = cc.areaRelationships?.paintArea === 'walls_only';
  
  // Get details from clarification
  const doorStyle = cc.details?.doorStyle || getFinishSpec(context.finishLevel, 'door');
  const flooringType = cc.details?.flooringType;
  const paintType = cc.details?.paintType || 'latex paint';
  
  console.log('[CSI MAPPER] Clarification context applied:', {
    exclusions: Object.keys(cc.exclusions || {}),
    inclusions: Object.keys(cc.inclusions || {}),
    demolitionArea,
    ceilingArea,
    paintWallsOnly,
    doorStyle,
  });

  // Initialize all divisions
  const allDivisions = [
    'div01_general_requirements', 'div02_existing_conditions', 'div03_concrete',
    'div04_masonry', 'div05_metals', 'div06_wood_plastics_composites',
    'div07_thermal_moisture', 'div08_openings', 'div09_finishes',
    'div10_specialties', 'div11_equipment', 'div12_furnishings',
    'div13_special_construction', 'div14_conveying_equipment', 'div21_fire_suppression',
    'div22_plumbing', 'div23_hvac', 'div25_integrated_automation',
    'div26_electrical', 'div27_communications', 'div28_electronic_safety_security',
    'div31_earthwork', 'div32_exterior_improvements', 'div33_utilities',
  ];

  for (const div of allDivisions) {
    items[div] = [];
  }

  // ===================
  // DIVISION 01 - GENERAL REQUIREMENTS
  // ===================
  
  if (quantities.totalFloorArea > 0 || quantities.totalWallLength > 0) {
    items.div01_general_requirements.push({
      id: 'gen-001',
      item: 'Project Management & Supervision',
      subdivisionCode: '01 31 00',
      quantity: 1,
      unit: 'ls',
      unitDescription: 'lump sum',
      specifications: 'Project management, scheduling, coordination',
      confidence: 1.0,
      source: 'standard_allowance',
    });

    items.div01_general_requirements.push({
      id: 'gen-002',
      item: 'Temporary Protection',
      subdivisionCode: '01 56 00',
      quantity: quantities.totalFloorArea,
      unit: 'sf',
      unitDescription: 'square feet of protected area',
      specifications: 'Floor protection, dust barriers',
      confidence: 0.9,
      source: 'inferred',
    });

    items.div01_general_requirements.push({
      id: 'gen-003',
      item: 'Final Cleaning',
      subdivisionCode: '01 74 23',
      quantity: quantities.totalFloorArea,
      unit: 'sf',
      unitDescription: 'square feet to clean',
      specifications: 'Construction cleanup and final cleaning',
      confidence: 0.95,
      source: 'standard_allowance',
    });
  }

  // ===================
  // DIVISION 02 - EXISTING CONDITIONS (Demo)
  // ===================
  
  const scopeLower = context.scopeText.toLowerCase();
  const isRemodel = scopeLower.includes('remodel') || scopeLower.includes('renovation') ||
                    scopeLower.includes('demo') || scopeLower.includes('remove');

  // Skip demolition if explicitly excluded in clarification context
  if (!isExcluded('demolition')) {
    // Use demolitionArea from clarification context, or fall back to floor area
    const effectiveDemoArea = demolitionArea > 0 ? demolitionArea : quantities.totalFloorArea;
    
    if (isRemodel && effectiveDemoArea > 0) {
      // Demo floor finishes
      items.div02_existing_conditions.push({
        id: 'demo-001',
        item: 'Flooring Demolition',
        subdivisionCode: '02 41 19',
        quantity: effectiveDemoArea,
        unit: 'sf',
        unitDescription: 'square feet of flooring to remove',
        specifications: 'Remove existing flooring, prep subfloor',
        confidence: demolitionArea > 0 ? 1.0 : 0.85, // Higher confidence if user confirmed
        source: demolitionArea > 0 ? 'user_input' : 'inferred',
        notes: demolitionArea > 0 ? 'Quantity confirmed via annotation check clarification' : undefined,
      });
    }

    if (isRemodel && quantities.totalWallLength > 0) {
      // Demo wall finishes
      const wallDemoSf = quantities.totalWallLength * 8; // Assume 8ft ceiling
      items.div02_existing_conditions.push({
        id: 'demo-002',
        item: 'Wall Finish Demolition',
        subdivisionCode: '02 41 19',
        quantity: wallDemoSf,
        unit: 'sf',
        unitDescription: 'square feet of wall finish to remove',
        specifications: 'Remove existing wall finishes, patch as needed',
        confidence: 0.8,
        source: 'inferred',
      });
    }

    if (quantities.totalDoorCount > 0 && isRemodel) {
      items.div02_existing_conditions.push({
        id: 'demo-003',
        item: 'Door Removal',
        subdivisionCode: '02 41 19',
        quantity: quantities.totalDoorCount,
        unit: 'each',
        specifications: 'Remove existing doors and frames',
        confidence: 0.75,
        source: 'inferred',
      });
    }
  } else {
    console.log('[CSI MAPPER] Demolition excluded per clarification context');
  }

  // ===================
  // DIVISION 06 - WOOD, PLASTICS, COMPOSITES
  // ===================
  
  if (quantities.totalWallLength > 0) {
    items.div06_wood_plastics_composites.push({
      id: 'frame-001',
      item: 'Wall Framing - Studs',
      subdivisionCode: '06 11 10',
      quantity: quantities.totalWallLength,
      unit: 'lf',
      unitDescription: 'linear feet of wall',
      specifications: '2x4 studs @ 16" OC, includes top/bottom plates',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: `Calculated from ${quantities.walls.length} annotated wall segments`,
    });

    // Blocking for cabinets if kitchen
    if (context.projectType.includes('kitchen')) {
      items.div06_wood_plastics_composites.push({
        id: 'frame-002',
        item: 'Blocking for Cabinets',
        subdivisionCode: '06 10 53',
        quantity: quantities.totalWallLength * 0.6, // 60% of walls for cabinet blocking
        unit: 'lf',
        unitDescription: 'linear feet of blocking',
        specifications: '2x4 horizontal blocking for upper cabinet support',
        confidence: 0.85,
        source: 'inferred',
      });
    }
  }

  // Cabinets for kitchen/bathroom
  if (context.projectType.includes('kitchen') || context.projectType.includes('bathroom')) {
    const cabinetLinearFeet = quantities.totalWallLength * 0.4; // Estimate 40% of wall for cabinets
    
    if (context.projectType.includes('kitchen')) {
      items.div06_wood_plastics_composites.push({
        id: 'cab-001',
        item: 'Base Cabinets',
        subdivisionCode: '06 41 00',
        quantity: cabinetLinearFeet,
        unit: 'lf',
        unitDescription: 'linear feet of cabinet face',
        specifications: getFinishSpec('cabinets', context.finishLevel),
        confidence: 0.8,
        source: 'inferred',
        notes: 'Estimated from wall lengths',
      });

      items.div06_wood_plastics_composites.push({
        id: 'cab-002',
        item: 'Upper Cabinets',
        subdivisionCode: '06 41 00',
        quantity: cabinetLinearFeet * 0.85, // Upper typically 85% of base
        unit: 'lf',
        unitDescription: 'linear feet of cabinet face',
        specifications: getFinishSpec('cabinets', context.finishLevel),
        confidence: 0.75,
        source: 'inferred',
      });
    }

    if (context.projectType.includes('bathroom')) {
      items.div06_wood_plastics_composites.push({
        id: 'cab-003',
        item: 'Vanity Cabinet',
        subdivisionCode: '06 41 00',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('vanity', context.finishLevel),
        confidence: 0.9,
        source: 'inferred',
      });
    }
  }

  // ===================
  // DIVISION 07 - THERMAL & MOISTURE
  // ===================
  
  if (quantities.totalWallLength > 0) {
    const insulationSf = quantities.totalWallLength * 8; // 8ft walls
    items.div07_thermal_moisture.push({
      id: 'insul-001',
      item: 'Wall Insulation',
      subdivisionCode: '07 21 00',
      quantity: insulationSf,
      unit: 'sf',
      unitDescription: 'square feet of insulation',
      specifications: 'R-13 batt insulation for interior walls',
      confidence: 0.85,
      source: 'inferred',
    });
  }

  if (context.projectType.includes('bathroom')) {
    items.div07_thermal_moisture.push({
      id: 'moist-001',
      item: 'Shower Waterproofing Membrane',
      subdivisionCode: '07 13 00',
      quantity: 48, // Standard shower area
      unit: 'sf',
      specifications: 'Waterproof membrane for wet areas',
      confidence: 0.9,
      source: 'standard_allowance',
    });
  }

  // ===================
  // DIVISION 08 - OPENINGS
  // Uses COUNT of doors/windows (not areas)
  // Standard USA sizes applied
  // ===================
  
  if (quantities.doors.length > 0) {
    // Standard USA interior door sizes
    const doorSpec = getDoorSpecWithSize(context.finishLevel);
    
    // Use door style from clarification if provided
    const effectiveDoorSpec = doorStyle || doorSpec.spec;
    const doorConfidence = doorStyle ? 1.0 : 1.0;
    const doorSource: 'user_input' | 'cad_extraction' = doorStyle ? 'user_input' : 'cad_extraction';
    
    items.div08_openings.push({
      id: 'door-001',
      item: 'Interior Doors',
      subdivisionCode: '08 14 00',
      quantity: quantities.doors.length,  // COUNT, not area
      unit: 'each',
      unitDescription: 'door unit complete with frame',
      specifications: effectiveDoorSpec,
      notes: doorStyle 
        ? `Door style confirmed via clarification: ${doorStyle}. Count from ${quantities.doors.length} annotated door location(s)`
        : `Standard size: ${doorSpec.size}. Count from ${quantities.doors.length} annotated door location(s)`,
      confidence: doorConfidence,
      source: doorSource,
    });

    items.div08_openings.push({
      id: 'door-002',
      item: 'Door Frames',
      subdivisionCode: '08 11 00',
      quantity: quantities.doors.length,  // COUNT
      unit: 'each',
      unitDescription: 'pre-hung door frame',
      specifications: `Standard ${doorSpec.size} pre-hung frame, painted`,
      confidence: 1.0,
      source: 'cad_extraction',
    });

    // Only include door hardware if not excluded and is either included or assumed
    if (isIncluded('doorHardware') || !isExcluded('doorHardware')) {
      items.div08_openings.push({
        id: 'door-003',
        item: 'Door Hardware Sets',
        subdivisionCode: '08 71 00',
        quantity: quantities.doors.length,  // COUNT
        unit: 'each',
        specifications: getFinishSpec('door_hardware', context.finishLevel),
        notes: isIncluded('doorHardware') 
          ? 'Door hardware confirmed via annotation check clarification'
          : 'Includes hinges, passage/privacy set, and strike plate',
        confidence: isIncluded('doorHardware') ? 1.0 : 1.0,
        source: isIncluded('doorHardware') ? 'user_input' : 'cad_extraction',
      });
    }

    items.div08_openings.push({
      id: 'door-004',
      item: 'Door Casing/Trim',
      subdivisionCode: '06 22 00',
      quantity: quantities.doors.length,  // COUNT
      unit: 'each',
      unitDescription: 'set (both sides)',
      specifications: `2-1/4" colonial casing, ${doorSpec.trimLf} LF per door`,
      notes: `Total trim: ${quantities.doors.length * doorSpec.trimLf} LF`,
      confidence: 0.95,
      source: 'cad_extraction',
    });
  }

  if (quantities.windows.length > 0) {
    // Standard USA window sizes
    const windowSpec = getWindowSpecWithSize(context.finishLevel);
    
    items.div08_openings.push({
      id: 'win-001',
      item: 'Windows',
      subdivisionCode: '08 50 00',
      quantity: quantities.windows.length,  // COUNT, not area
      unit: 'each',
      unitDescription: 'window unit complete',
      specifications: windowSpec.spec,
      notes: `Standard size: ${windowSpec.size}. Count from ${quantities.windows.length} annotated window location(s)`,
      confidence: 1.0,
      source: 'cad_extraction',
    });

    // Only include window trim if confirmed included or not excluded
    if (isIncluded('windowTrim') || !isExcluded('trim')) {
      items.div08_openings.push({
        id: 'win-002',
        item: 'Window Casing/Trim',
        subdivisionCode: '06 22 00',
        quantity: quantities.windows.length,  // COUNT
        unit: 'each',
        unitDescription: 'set (interior trim)',
        specifications: `2-1/4" colonial casing, ${windowSpec.trimLf} LF per window`,
        notes: isIncluded('windowTrim')
          ? `Window trim confirmed via annotation check clarification. Total: ${quantities.windows.length * windowSpec.trimLf} LF`
          : `Total trim: ${quantities.windows.length * windowSpec.trimLf} LF`,
        confidence: isIncluded('windowTrim') ? 1.0 : 0.95,
        source: isIncluded('windowTrim') ? 'user_input' : 'cad_extraction',
      });

      items.div08_openings.push({
        id: 'win-003',
        item: 'Window Sill',
        subdivisionCode: '06 22 00',
        quantity: quantities.windows.length,  // COUNT
        unit: 'each',
        specifications: `3/4" x 5-1/4" window sill, ${windowSpec.sillWidth}" wide`,
        confidence: isIncluded('windowTrim') ? 1.0 : 0.9,
        source: isIncluded('windowTrim') ? 'user_input' : 'cad_extraction',
      });
    }
  }

  // ===================
  // DIVISION 09 - FINISHES
  // ===================
  
  if (quantities.totalWallLength > 0) {
    const wallSqft = quantities.totalWallLength * 8 * 2; // 8ft height, both sides
    
    items.div09_finishes.push({
      id: 'dw-001',
      item: 'Drywall - Walls',
      subdivisionCode: '09 29 00',
      quantity: wallSqft,
      unit: 'sf',
      unitDescription: 'square feet of drywall',
      specifications: '1/2" gypsum board, tape, mud, finish',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: 'Calculated from wall lengths × 8ft height × 2 sides',
    });

    items.div09_finishes.push({
      id: 'paint-001',
      item: 'Wall Paint',
      subdivisionCode: '09 91 00',
      quantity: wallSqft,
      unit: 'sf',
      specifications: getFinishSpec('wall_paint', context.finishLevel),
      confidence: 1.0,
      source: 'cad_extraction',
    });
  }

  if (quantities.totalFloorArea > 0) {
    // Use flooring type from clarification if provided
    const flooringSpec = flooringType || getFinishSpec('flooring', context.finishLevel);
    
    items.div09_finishes.push({
      id: 'floor-001',
      item: 'Flooring',
      subdivisionCode: '09 60 00',
      quantity: quantities.totalFloorArea,
      unit: 'sf',
      unitDescription: 'square feet of flooring',
      specifications: flooringSpec,
      confidence: flooringType ? 1.0 : 1.0,
      source: flooringType ? 'user_input' : 'cad_extraction',
      notes: flooringType 
        ? `Flooring type confirmed via clarification: ${flooringType}`
        : `Calculated from ${quantities.rooms.length} annotated room areas`,
    });

    // Only include ceiling work if not excluded
    if (!isExcluded('ceiling')) {
      // Use ceiling area from clarification context if provided
      const effectiveCeilingArea = ceilingArea > 0 ? ceilingArea : quantities.totalFloorArea;
      
      items.div09_finishes.push({
        id: 'ceil-001',
        item: 'Ceiling Drywall',
        subdivisionCode: '09 29 00',
        quantity: effectiveCeilingArea,
        unit: 'sf',
        specifications: '1/2" gypsum board ceiling',
        confidence: ceilingArea > 0 ? 1.0 : 0.95,
        source: ceilingArea > 0 ? 'user_input' : 'cad_extraction',
        notes: ceilingArea > 0 ? 'Ceiling area confirmed via annotation check clarification' : undefined,
      });

      // Only add ceiling paint if paint area includes ceiling
      if (!paintWallsOnly) {
        items.div09_finishes.push({
          id: 'ceil-002',
          item: 'Ceiling Paint',
          subdivisionCode: '09 91 00',
          quantity: effectiveCeilingArea,
          unit: 'sf',
          specifications: `Ceiling ${paintType}, flat white, 2 coats`,
          confidence: ceilingArea > 0 ? 1.0 : 0.95,
          source: ceilingArea > 0 ? 'user_input' : 'cad_extraction',
        });
      }
    } else {
      console.log('[CSI MAPPER] Ceiling work excluded per clarification context');
    }

    // Tile for wet areas
    if (context.projectType.includes('kitchen') || context.projectType.includes('bathroom')) {
      const backsplashLf = context.projectType.includes('kitchen') ? 
        quantities.totalWallLength * 0.4 : 0;
      
      if (backsplashLf > 0) {
        items.div09_finishes.push({
          id: 'tile-001',
          item: 'Kitchen Backsplash Tile',
          subdivisionCode: '09 30 00',
          quantity: backsplashLf * 1.5, // 18" backsplash = 1.5 sf/lf
          unit: 'sf',
          specifications: getFinishSpec('backsplash', context.finishLevel),
          confidence: 0.8,
          source: 'inferred',
        });
      }

      if (context.projectType.includes('bathroom')) {
        items.div09_finishes.push({
          id: 'tile-002',
          item: 'Bathroom Floor Tile',
          subdivisionCode: '09 30 00',
          quantity: quantities.totalFloorArea,
          unit: 'sf',
          specifications: getFinishSpec('floor_tile', context.finishLevel),
          confidence: 0.9,
          source: 'inferred',
        });

        items.div09_finishes.push({
          id: 'tile-003',
          item: 'Shower Wall Tile',
          subdivisionCode: '09 30 00',
          quantity: 48, // Standard shower surround
          unit: 'sf',
          specifications: getFinishSpec('wall_tile', context.finishLevel),
          confidence: 0.85,
          source: 'standard_allowance',
        });
      }
    }

    // Countertops for kitchen
    if (context.projectType.includes('kitchen')) {
      const countertopSf = quantities.totalWallLength * 0.4 * 2; // 40% wall × 2ft deep
      items.div09_finishes.push({
        id: 'counter-001',
        item: 'Countertops',
        subdivisionCode: '12 36 00', // Actually Div 12 but often quoted in 09
        quantity: countertopSf,
        unit: 'sf',
        specifications: getFinishSpec('countertop', context.finishLevel),
        confidence: 0.8,
        source: 'inferred',
      });
    }
  }

  // Base and shoe molding
  if (quantities.totalWallLength > 0) {
    items.div09_finishes.push({
      id: 'trim-001',
      item: 'Base Molding',
      subdivisionCode: '06 22 00', // Actually Div 06 but often in 09 for installs
      quantity: quantities.totalWallLength,
      unit: 'lf',
      specifications: getFinishSpec('baseboard', context.finishLevel),
      confidence: 0.95,
      source: 'cad_extraction',
    });
  }

  // ===================
  // DIVISION 10 - SPECIALTIES
  // ===================
  
  if (context.projectType.includes('bathroom')) {
    items.div10_specialties.push({
      id: 'spec-001',
      item: 'Bathroom Accessories',
      subdivisionCode: '10 28 00',
      quantity: 1,
      unit: 'ls',
      unitDescription: 'set',
      specifications: 'Towel bars, toilet paper holder, robe hooks',
      confidence: 0.9,
      source: 'standard_allowance',
    });

    items.div10_specialties.push({
      id: 'spec-002',
      item: 'Bathroom Mirror',
      subdivisionCode: '10 28 13',
      quantity: 1,
      unit: 'each',
      specifications: getFinishSpec('mirror', context.finishLevel),
      confidence: 0.9,
      source: 'standard_allowance',
    });
  }

  // ===================
  // DIVISION 11 - EQUIPMENT
  // ===================
  
  if (context.projectType.includes('kitchen')) {
    items.div11_equipment.push({
      id: 'appl-001',
      item: 'Range/Cooktop',
      subdivisionCode: '11 31 00',
      quantity: 1,
      unit: 'each',
      specifications: getFinishSpec('range', context.finishLevel),
      confidence: 0.85,
      source: 'standard_allowance',
    });

    items.div11_equipment.push({
      id: 'appl-002',
      item: 'Refrigerator',
      subdivisionCode: '11 31 00',
      quantity: 1,
      unit: 'each',
      specifications: getFinishSpec('refrigerator', context.finishLevel),
      confidence: 0.85,
      source: 'standard_allowance',
    });

    items.div11_equipment.push({
      id: 'appl-003',
      item: 'Dishwasher',
      subdivisionCode: '11 31 00',
      quantity: 1,
      unit: 'each',
      specifications: getFinishSpec('dishwasher', context.finishLevel),
      confidence: 0.8,
      source: 'standard_allowance',
    });

    items.div11_equipment.push({
      id: 'appl-004',
      item: 'Microwave/Range Hood',
      subdivisionCode: '11 31 00',
      quantity: 1,
      unit: 'each',
      specifications: getFinishSpec('range_hood', context.finishLevel),
      confidence: 0.8,
      source: 'standard_allowance',
    });
  }

  // ===================
  // DIVISION 22 - PLUMBING
  // ===================
  
  // Skip plumbing if explicitly excluded in clarification context
  if (!isExcluded('plumbing')) {
    if (context.projectType.includes('kitchen')) {
      items.div22_plumbing.push({
        id: 'plumb-001',
        item: 'Kitchen Sink',
        subdivisionCode: '22 41 13',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('kitchen_sink', context.finishLevel),
        confidence: 0.95,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-002',
        item: 'Kitchen Faucet',
        subdivisionCode: '22 41 39',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('kitchen_faucet', context.finishLevel),
        confidence: 0.95,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-003',
        item: 'Garbage Disposal',
        subdivisionCode: '22 41 00',
        quantity: 1,
        unit: 'each',
        specifications: '1/2 HP garbage disposal',
        confidence: 0.8,
        source: 'standard_allowance',
      });
    }

    if (context.projectType.includes('bathroom')) {
      items.div22_plumbing.push({
        id: 'plumb-010',
        item: 'Toilet',
        subdivisionCode: '22 41 13',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('toilet', context.finishLevel),
        confidence: 0.95,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-011',
        item: 'Bathroom Sink/Lavatory',
        subdivisionCode: '22 41 13',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('bathroom_sink', context.finishLevel),
        confidence: 0.95,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-012',
        item: 'Bathroom Faucet',
        subdivisionCode: '22 41 39',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('bathroom_faucet', context.finishLevel),
        confidence: 0.95,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-013',
        item: 'Shower/Tub Valve',
        subdivisionCode: '22 41 00',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('shower_valve', context.finishLevel),
        confidence: 0.85,
        source: 'standard_allowance',
      });

      items.div22_plumbing.push({
        id: 'plumb-014',
        item: 'Showerhead',
        subdivisionCode: '22 41 00',
        quantity: 1,
        unit: 'each',
        specifications: getFinishSpec('showerhead', context.finishLevel),
        confidence: 0.85,
        source: 'standard_allowance',
      });
    }
  } else {
    console.log('[CSI MAPPER] Plumbing work excluded per clarification context');
  }

  // ===================
  // DIVISION 23 - HVAC
  // ===================
  
  // Skip HVAC if explicitly excluded in clarification context
  if (!isExcluded('hvac')) {
    if (context.projectType.includes('bathroom')) {
      items.div23_hvac.push({
        id: 'hvac-001',
        item: 'Bathroom Exhaust Fan',
        subdivisionCode: '23 34 00',
        quantity: 1,
        unit: 'each',
        specifications: '80 CFM exhaust fan with duct',
        confidence: 0.9,
        source: 'standard_allowance',
      });
    }
  } else {
    console.log('[CSI MAPPER] HVAC work excluded per clarification context');
  }

  // ===================
  // DIVISION 26 - ELECTRICAL
  // ===================
  
  // Skip electrical if explicitly excluded in clarification context
  if (!isExcluded('electrical')) {
    // Electrical outlets based on room count and type
    if (quantities.totalRoomCount > 0) {
      const outletCount = estimateOutletCount(quantities, context.projectType);
      
      items.div26_electrical.push({
        id: 'elec-001',
        item: 'Duplex Receptacles',
        subdivisionCode: '26 27 26',
        quantity: outletCount,
        unit: 'each',
        specifications: 'Standard 15A duplex receptacle with cover plate',
        confidence: 0.8,
        source: 'inferred',
        notes: 'Estimated based on room count and type',
      });
    }

    // GFCI outlets for wet areas
    if (context.projectType.includes('kitchen') || context.projectType.includes('bathroom')) {
      const gfciCount = context.projectType.includes('kitchen') ? 2 : 1;
      items.div26_electrical.push({
        id: 'elec-002',
        item: 'GFCI Receptacles',
        subdivisionCode: '26 27 26',
        quantity: gfciCount,
        unit: 'each',
        specifications: '15A GFCI receptacle',
        confidence: 0.9,
        source: 'standard_allowance',
      });
    }

    // Light switches
    if (quantities.totalRoomCount > 0) {
      items.div26_electrical.push({
        id: 'elec-003',
        item: 'Light Switches',
        subdivisionCode: '26 27 26',
        quantity: Math.ceil(quantities.totalRoomCount * 1.5), // ~1.5 switches per room
        unit: 'each',
        specifications: 'Single pole switch with cover plate',
        confidence: 0.75,
        source: 'inferred',
      });
    }

    // Light fixtures
    if (quantities.totalFloorArea > 0) {
      const lightCount = Math.ceil(quantities.totalFloorArea / 50); // ~1 light per 50 sf
      items.div26_electrical.push({
        id: 'elec-004',
        item: 'Recessed Light Fixtures',
        subdivisionCode: '26 51 00',
        quantity: lightCount,
        unit: 'each',
        specifications: getFinishSpec('recessed_light', context.finishLevel),
        confidence: 0.75,
        source: 'inferred',
      });
    }

    // Under cabinet lighting for kitchen
    if (context.projectType.includes('kitchen')) {
      items.div26_electrical.push({
        id: 'elec-005',
        item: 'Under Cabinet Lighting',
        subdivisionCode: '26 51 00',
        quantity: quantities.totalWallLength * 0.4, // Same as upper cabinets
        unit: 'lf',
        specifications: 'LED under cabinet lighting strip',
        confidence: 0.7,
        source: 'standard_allowance',
      });
    }
  } else {
    console.log('[CSI MAPPER] Electrical work excluded per clarification context');
  }

  return items;
}

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Estimate outlet count based on room type and size
 */
function estimateOutletCount(quantities: ComputedQuantities, projectType: string): number {
  // NEC code requires outlet every 12 feet of wall, and within 6 feet of any point
  // Plus code requirements for specific areas
  
  let baseCount = Math.ceil(quantities.totalWallLength / 12);
  
  if (projectType.includes('kitchen')) {
    baseCount += 4; // Additional counter outlets
  }
  
  return Math.max(2, baseCount); // Minimum 2 outlets
}

/**
 * Get specification based on finish level
 */
function getFinishSpec(itemType: string, finishLevel: string): string {
  const specs: Record<string, Record<string, string>> = {
    cabinets: {
      budget: 'Stock thermofoil cabinets',
      mid_range: 'Semi-custom wood cabinets with soft-close',
      high_end: 'Custom hardwood cabinets, dovetail drawers',
      luxury: 'Custom inset cabinets, premium hardwood, custom finishes',
    },
    vanity: {
      budget: '24" stock vanity with laminate top',
      mid_range: '36" furniture-style vanity with stone top',
      high_end: '48" custom vanity with natural stone',
      luxury: 'Custom floating vanity with designer fixtures',
    },
    interior_door: {
      budget: 'Hollow core door with basic hardware',
      mid_range: 'Solid core door with brushed nickel hardware',
      high_end: 'Solid wood door with premium hardware',
      luxury: 'Custom solid wood door with designer hardware',
    },
    door_hardware: {
      budget: 'Basic passage set, chrome finish',
      mid_range: 'Lever handle set, brushed nickel',
      high_end: 'Premium lever set, oil-rubbed bronze or brass',
      luxury: 'Designer hardware, custom finish',
    },
    window: {
      budget: 'Vinyl single-hung window',
      mid_range: 'Vinyl double-hung, Low-E glass',
      high_end: 'Wood-clad double-hung, triple pane',
      luxury: 'Custom wood window, premium glazing',
    },
    wall_paint: {
      budget: 'Flat finish, 2 coats, contractor grade',
      mid_range: 'Eggshell finish, 2 coats, premium paint',
      high_end: 'Satin finish, 2 coats, designer color',
      luxury: 'Specialty finish, imported paint, 3 coats',
    },
    flooring: {
      budget: 'Luxury vinyl plank (LVP)',
      mid_range: 'Engineered hardwood or quality LVP',
      high_end: 'Solid hardwood or premium tile',
      luxury: 'Wide plank hardwood or natural stone',
    },
    backsplash: {
      budget: 'Ceramic subway tile 3x6',
      mid_range: 'Glass or porcelain subway tile',
      high_end: 'Natural stone or designer glass tile',
      luxury: 'Artisan tile, natural stone slab, or custom mosaic',
    },
    floor_tile: {
      budget: 'Ceramic tile 12x12',
      mid_range: 'Porcelain tile 12x24',
      high_end: 'Large format porcelain or natural stone',
      luxury: 'Natural marble or premium porcelain',
    },
    wall_tile: {
      budget: 'Ceramic subway tile',
      mid_range: 'Large format porcelain',
      high_end: 'Natural stone or premium porcelain',
      luxury: 'Book-matched marble or artisan tile',
    },
    countertop: {
      budget: 'Laminate countertop',
      mid_range: 'Quartz or granite countertop',
      high_end: 'Premium quartz or natural stone',
      luxury: 'Exotic stone, quartzite, or custom material',
    },
    baseboard: {
      budget: '3" MDF baseboard, painted',
      mid_range: '5" solid wood baseboard, painted',
      high_end: '6" solid wood baseboard, stained',
      luxury: 'Custom millwork baseboard',
    },
    range: {
      budget: 'Standard 30" electric range',
      mid_range: 'Stainless steel gas range',
      high_end: 'Professional-style 36" range',
      luxury: 'High-end professional range (Wolf, Viking)',
    },
    refrigerator: {
      budget: 'Standard top-freezer refrigerator',
      mid_range: 'French door stainless refrigerator',
      high_end: 'Counter-depth French door refrigerator',
      luxury: 'Built-in or panel-ready refrigerator',
    },
    dishwasher: {
      budget: 'Standard built-in dishwasher',
      mid_range: 'Stainless steel quiet dishwasher',
      high_end: 'Premium quiet dishwasher with 3rd rack',
      luxury: 'Panel-ready premium dishwasher',
    },
    range_hood: {
      budget: 'Standard over-range microwave/hood',
      mid_range: 'Stainless steel wall-mount hood',
      high_end: 'Professional-style canopy hood',
      luxury: 'Custom designer hood or ventilation system',
    },
    kitchen_sink: {
      budget: 'Stainless steel drop-in single bowl',
      mid_range: 'Stainless steel undermount double bowl',
      high_end: 'Farmhouse apron sink',
      luxury: 'Custom farmhouse or integrated sink',
    },
    kitchen_faucet: {
      budget: 'Chrome single-handle faucet',
      mid_range: 'Stainless pull-down faucet',
      high_end: 'Touch-activated or pot-filler faucet',
      luxury: 'Designer faucet with custom finish',
    },
    toilet: {
      budget: 'Standard round-front toilet',
      mid_range: 'Elongated comfort-height toilet',
      high_end: 'Wall-hung or one-piece toilet',
      luxury: 'Smart toilet or designer fixture',
    },
    bathroom_sink: {
      budget: 'Porcelain drop-in sink',
      mid_range: 'Undermount sink with overflow',
      high_end: 'Vessel sink or integrated top',
      luxury: 'Designer vessel or custom sink',
    },
    bathroom_faucet: {
      budget: 'Chrome single-handle faucet',
      mid_range: 'Widespread faucet, brushed nickel',
      high_end: 'Wall-mount or vessel faucet',
      luxury: 'Designer faucet, custom finish',
    },
    shower_valve: {
      budget: 'Standard pressure-balance valve',
      mid_range: 'Thermostatic valve with diverter',
      high_end: 'Digital or luxury thermostatic',
      luxury: 'Custom shower system',
    },
    showerhead: {
      budget: 'Standard fixed showerhead',
      mid_range: 'Rain showerhead with handheld',
      high_end: 'Dual showerhead system',
      luxury: 'Multi-function spa system',
    },
    mirror: {
      budget: 'Frameless plate mirror',
      mid_range: 'Framed vanity mirror',
      high_end: 'Lighted mirror or medicine cabinet',
      luxury: 'Custom designer mirror',
    },
    recessed_light: {
      budget: '4" LED recessed can',
      mid_range: '6" LED recessed, dimmable',
      high_end: 'Adjustable LED with trim options',
      luxury: 'Decorative recessed or designer fixture',
    },
  };

  return specs[itemType]?.[finishLevel] || specs[itemType]?.mid_range || 'Per specifications';
}

/**
 * Get door specification with standard USA sizes
 * Standard USA interior door sizes:
 * - Width: 24", 28", 30", 32", 36" (most common: 32" and 36")
 * - Height: 80" (6'8") standard, 96" (8') for tall ceilings
 */
function getDoorSpecWithSize(finishLevel: string): { spec: string; size: string; trimLf: number } {
  const baseSpec = getFinishSpec('interior_door', finishLevel);
  
  // Standard USA door size: 32" x 80" (most common residential)
  const standardSize = '32" x 80"';
  const alternateSize = '36" x 80"'; // For main entries/ADA
  
  // Trim linear feet per door (both sides): 
  // 2 sides x (80" height x 2 + 32" width) = ~32 LF, round to 17 LF typical
  const trimLf = 17;
  
  const specs: Record<string, { spec: string; size: string }> = {
    budget: {
      spec: `${standardSize} hollow core, 1-3/8" thick, primed, ${baseSpec}`,
      size: standardSize,
    },
    mid_range: {
      spec: `${standardSize} solid core, 1-3/8" thick, primed, ${baseSpec}`,
      size: standardSize,
    },
    high_end: {
      spec: `${alternateSize} solid wood, 1-3/4" thick, stain-grade, ${baseSpec}`,
      size: alternateSize,
    },
    luxury: {
      spec: `${alternateSize} custom solid wood, 1-3/4" thick, premium species, ${baseSpec}`,
      size: alternateSize,
    },
  };
  
  const selected = specs[finishLevel] || specs.mid_range;
  return { ...selected, trimLf };
}

/**
 * Get window specification with standard USA sizes
 * Standard USA window sizes (double-hung):
 * - Common widths: 24", 28", 30", 32", 36", 48"
 * - Common heights: 36", 48", 52", 60", 72"
 * - Most common residential: 36" x 48" or 36" x 60"
 */
function getWindowSpecWithSize(finishLevel: string): { spec: string; size: string; trimLf: number; sillWidth: number } {
  const baseSpec = getFinishSpec('window', finishLevel);
  
  // Standard USA window size: 36" x 48" (most common residential)
  const standardSize = '36" x 48"';
  const largeSize = '36" x 60"';
  
  // Trim linear feet per window (interior): 
  // 2 sides x 48" + top 36" + sill = ~11 LF typical
  const trimLf = 11;
  const sillWidth = 36;
  
  const specs: Record<string, { spec: string; size: string }> = {
    budget: {
      spec: `${standardSize} vinyl single-hung, clear glass, ${baseSpec}`,
      size: standardSize,
    },
    mid_range: {
      spec: `${standardSize} vinyl double-hung, Low-E glass, argon filled, ${baseSpec}`,
      size: standardSize,
    },
    high_end: {
      spec: `${largeSize} wood-clad double-hung, Low-E, triple pane, ${baseSpec}`,
      size: largeSize,
    },
    luxury: {
      spec: `${largeSize} custom wood, premium glazing, historic profile, ${baseSpec}`,
      size: largeSize,
    },
  };
  
  const selected = specs[finishLevel] || specs.mid_range;
  return { ...selected, trimLf, sillWidth };
}

