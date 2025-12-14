/**
 * Layer Template Service
 * Generates annotation layers ONLY based on scope text analysis
 * 
 * No default layers - only creates what the user explicitly mentions in their scope
 * All layers are optional - users can annotate what they want
 */

// ===================
// TYPES
// ===================

export interface LayerTemplate {
  id: string;
  name: string;
  description: string;        // Guidance for user
  color: string;              // Layer color for visual distinction
  shapeType: 'polyline' | 'polygon' | 'rect' | 'any';  // Suggested annotation type
  examples: string[];         // Example items to annotate
  csiDivision?: string;       // Maps to CSI division for estimation
  priority: number;           // Order of display (lower = higher)
  matchedKeywords: string[];  // Keywords that triggered this layer
}

// ===================
// LAYER COLOR PALETTE
// ===================

const LAYER_COLORS = {
  walls: '#EF4444',           // Red - structural
  floors: '#3B82F6',          // Blue - area
  rooms: '#10B981',           // Green - spaces
  doors: '#F59E0B',           // Amber - openings
  windows: '#8B5CF6',         // Purple - openings
  cabinets: '#6366F1',        // Indigo - fixtures
  appliances: '#EC4899',      // Pink - equipment
  plumbing: '#06B6D4',        // Cyan - MEP
  electrical: '#FBBF24',      // Yellow - MEP
  hvac: '#84CC16',            // Lime - MEP
  countertops: '#F97316',     // Orange - surfaces
  fixtures: '#14B8A6',        // Teal - fixtures
  closets: '#A855F7',         // Violet - storage
  demo: '#DC2626',            // Dark red - demolition
  tile: '#0EA5E9',            // Sky blue - finishes
  fireplace: '#B91C1C',       // Deep red
  island: '#4F46E5',          // Darker indigo
  shower: '#0891B2',          // Cyan-600
  tub: '#0E7490',             // Cyan-700
  vanity: '#7C3AED',          // Violet
  toilet: '#0D9488',          // Teal-600
  sink: '#0284C7',            // Sky-600
  flooring: '#059669',        // Emerald-600
  ceiling: '#64748B',         // Slate-500
  stairs: '#78716C',          // Stone-500
  deck: '#A3A3A3',            // Neutral-400
  garage: '#737373',          // Neutral-500
  default: '#6B7280',         // Gray - generic
};

// ===================
// SCOPE KEYWORD MAPPINGS
// Each entry defines keywords to look for and the layer to create
// ===================

interface KeywordMapping {
  keywords: string[];
  layer: Omit<LayerTemplate, 'matchedKeywords'>;
}

const KEYWORD_MAPPINGS: KeywordMapping[] = [
  // === STRUCTURAL / SPATIAL ===
  {
    keywords: ['wall', 'walls', 'partition', 'framing', 'drywall'],
    layer: {
      id: 'walls',
      name: 'Walls',
      description: 'Draw polylines along walls to measure total wall length',
      color: LAYER_COLORS.walls,
      shapeType: 'polyline',
      examples: ['Interior walls', 'Partition walls', 'New walls'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 1,
    },
  },
  {
    keywords: ['room', 'rooms', 'floor', 'floors', 'area', 'space', 'sqft', 'square feet', 'sf'],
    layer: {
      id: 'rooms',
      name: 'Rooms / Floor Areas',
      description: 'Draw polygons around rooms to calculate floor area',
      color: LAYER_COLORS.rooms,
      shapeType: 'polygon',
      examples: ['Room boundaries', 'Floor areas'],
      csiDivision: 'div09_finishes',
      priority: 2,
    },
  },
  
  // === OPENINGS ===
  {
    keywords: ['door', 'doors', 'entry', 'entrance', 'exit'],
    layer: {
      id: 'doors',
      name: 'Doors',
      description: 'Draw rectangles over door locations',
      color: LAYER_COLORS.doors,
      shapeType: 'rect',
      examples: ['Interior doors', 'Entry door', 'Closet doors'],
      csiDivision: 'div08_openings',
      priority: 3,
    },
  },
  {
    keywords: ['window', 'windows', 'skylight', 'skylights', 'glazing'],
    layer: {
      id: 'windows',
      name: 'Windows',
      description: 'Draw rectangles over window locations',
      color: LAYER_COLORS.windows,
      shapeType: 'rect',
      examples: ['Windows', 'Skylights'],
      csiDivision: 'div08_openings',
      priority: 4,
    },
  },
  
  // === KITCHEN ===
  {
    keywords: ['cabinet', 'cabinets', 'cabinetry'],
    layer: {
      id: 'cabinets',
      name: 'Cabinets',
      description: 'Draw polylines along cabinet runs',
      color: LAYER_COLORS.cabinets,
      shapeType: 'polyline',
      examples: ['Base cabinets', 'Upper cabinets', 'Pantry cabinets'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 5,
    },
  },
  {
    keywords: ['base cabinet', 'base cabinets', 'lower cabinet', 'lower cabinets'],
    layer: {
      id: 'base-cabinets',
      name: 'Base Cabinets',
      description: 'Draw polylines along base cabinet runs',
      color: LAYER_COLORS.cabinets,
      shapeType: 'polyline',
      examples: ['Standard base', 'Sink base', 'Corner base'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 5,
    },
  },
  {
    keywords: ['upper cabinet', 'upper cabinets', 'wall cabinet', 'wall cabinets'],
    layer: {
      id: 'upper-cabinets',
      name: 'Upper Cabinets',
      description: 'Draw polylines along upper cabinet runs',
      color: '#818CF8',
      shapeType: 'polyline',
      examples: ['Wall cabinets', 'Glass-front cabinets'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 6,
    },
  },
  {
    keywords: ['countertop', 'countertops', 'counter', 'counters', 'granite', 'quartz', 'marble'],
    layer: {
      id: 'countertops',
      name: 'Countertops',
      description: 'Draw polygons over countertop areas',
      color: LAYER_COLORS.countertops,
      shapeType: 'polygon',
      examples: ['Kitchen countertop', 'Island countertop'],
      csiDivision: 'div12_furnishings',
      priority: 7,
    },
  },
  {
    keywords: ['island', 'kitchen island'],
    layer: {
      id: 'island',
      name: 'Kitchen Island',
      description: 'Draw polygon around kitchen island',
      color: LAYER_COLORS.island,
      shapeType: 'polygon',
      examples: ['Kitchen island', 'Island with seating'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 8,
    },
  },
  {
    keywords: ['pantry', 'walk-in pantry', 'walkin pantry'],
    layer: {
      id: 'pantry',
      name: 'Pantry',
      description: 'Draw polygon around pantry area',
      color: LAYER_COLORS.closets,
      shapeType: 'polygon',
      examples: ['Walk-in pantry', 'Reach-in pantry'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 9,
    },
  },
  {
    keywords: ['backsplash', 'back splash', 'tile backsplash'],
    layer: {
      id: 'backsplash',
      name: 'Backsplash',
      description: 'Draw polylines along backsplash areas',
      color: LAYER_COLORS.tile,
      shapeType: 'polyline',
      examples: ['Counter backsplash', 'Range backsplash'],
      csiDivision: 'div09_finishes',
      priority: 10,
    },
  },
  {
    keywords: ['appliance', 'appliances', 'refrigerator', 'fridge', 'stove', 'range', 'oven', 'dishwasher', 'microwave'],
    layer: {
      id: 'appliances',
      name: 'Appliances',
      description: 'Draw rectangles over appliance locations',
      color: LAYER_COLORS.appliances,
      shapeType: 'rect',
      examples: ['Refrigerator', 'Range', 'Dishwasher', 'Microwave'],
      csiDivision: 'div11_equipment',
      priority: 11,
    },
  },
  
  // === BATHROOM ===
  {
    keywords: ['vanity', 'vanities', 'bathroom vanity'],
    layer: {
      id: 'vanity',
      name: 'Vanity',
      description: 'Draw rectangle over vanity location',
      color: LAYER_COLORS.vanity,
      shapeType: 'rect',
      examples: ['Single vanity', 'Double vanity', 'Floating vanity'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 12,
    },
  },
  {
    keywords: ['toilet', 'toilets', 'commode', 'water closet', 'wc'],
    layer: {
      id: 'toilet',
      name: 'Toilet',
      description: 'Draw rectangle over toilet location',
      color: LAYER_COLORS.toilet,
      shapeType: 'rect',
      examples: ['Toilet', 'Wall-hung toilet'],
      csiDivision: 'div22_plumbing',
      priority: 13,
    },
  },
  {
    keywords: ['shower', 'showers', 'walk-in shower', 'walkin shower', 'shower stall'],
    layer: {
      id: 'shower',
      name: 'Shower',
      description: 'Draw polygon around shower area',
      color: LAYER_COLORS.shower,
      shapeType: 'polygon',
      examples: ['Walk-in shower', 'Shower stall', 'Curbless shower'],
      csiDivision: 'div09_finishes',
      priority: 14,
    },
  },
  {
    keywords: ['tub', 'bathtub', 'bath tub', 'soaking tub', 'freestanding tub'],
    layer: {
      id: 'tub',
      name: 'Bathtub',
      description: 'Draw rectangle over bathtub location',
      color: LAYER_COLORS.tub,
      shapeType: 'rect',
      examples: ['Alcove tub', 'Freestanding tub', 'Drop-in tub'],
      csiDivision: 'div22_plumbing',
      priority: 15,
    },
  },
  {
    keywords: ['sink', 'sinks', 'lavatory', 'basin'],
    layer: {
      id: 'sink',
      name: 'Sink',
      description: 'Draw rectangle over sink location',
      color: LAYER_COLORS.sink,
      shapeType: 'rect',
      examples: ['Kitchen sink', 'Bathroom sink', 'Utility sink'],
      csiDivision: 'div22_plumbing',
      priority: 16,
    },
  },
  {
    keywords: ['mirror', 'mirrors', 'medicine cabinet'],
    layer: {
      id: 'mirror',
      name: 'Mirror',
      description: 'Draw rectangle over mirror location',
      color: LAYER_COLORS.fixtures,
      shapeType: 'rect',
      examples: ['Vanity mirror', 'Medicine cabinet'],
      csiDivision: 'div10_specialties',
      priority: 17,
    },
  },
  
  // === FLOORING / FINISHES ===
  {
    keywords: ['tile', 'tiles', 'tiling', 'ceramic', 'porcelain'],
    layer: {
      id: 'tile',
      name: 'Tile Areas',
      description: 'Draw polygons around tile areas',
      color: LAYER_COLORS.tile,
      shapeType: 'polygon',
      examples: ['Floor tile', 'Wall tile', 'Shower tile'],
      csiDivision: 'div09_finishes',
      priority: 18,
    },
  },
  {
    keywords: ['flooring', 'floor', 'hardwood', 'lvp', 'vinyl', 'laminate', 'carpet'],
    layer: {
      id: 'flooring',
      name: 'Flooring',
      description: 'Draw polygons around flooring areas',
      color: LAYER_COLORS.flooring,
      shapeType: 'polygon',
      examples: ['Hardwood area', 'Tile area', 'Carpet area'],
      csiDivision: 'div09_finishes',
      priority: 19,
    },
  },
  {
    keywords: ['ceiling', 'ceilings', 'tray ceiling', 'coffered', 'vaulted'],
    layer: {
      id: 'ceiling',
      name: 'Ceiling Features',
      description: 'Draw polygons around ceiling feature areas',
      color: LAYER_COLORS.ceiling,
      shapeType: 'polygon',
      examples: ['Tray ceiling', 'Coffered ceiling', 'Vaulted area'],
      csiDivision: 'div09_finishes',
      priority: 20,
    },
  },
  
  // === CLOSETS / STORAGE ===
  {
    keywords: ['closet', 'closets', 'walk-in closet', 'walkin closet', 'reach-in closet'],
    layer: {
      id: 'closet',
      name: 'Closet',
      description: 'Draw polygon around closet area',
      color: LAYER_COLORS.closets,
      shapeType: 'polygon',
      examples: ['Walk-in closet', 'Reach-in closet'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 21,
    },
  },
  {
    keywords: ['shelving', 'shelves', 'shelf', 'built-in', 'builtin', 'bookshelf', 'bookshelves'],
    layer: {
      id: 'built-ins',
      name: 'Built-in Shelving',
      description: 'Draw polylines for built-in shelving',
      color: LAYER_COLORS.cabinets,
      shapeType: 'polyline',
      examples: ['Bookshelves', 'Closet organizers', 'Entertainment center'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 22,
    },
  },
  
  // === SPECIAL FEATURES ===
  {
    keywords: ['fireplace', 'fireplaces', 'mantle', 'hearth'],
    layer: {
      id: 'fireplace',
      name: 'Fireplace',
      description: 'Draw rectangle over fireplace location',
      color: LAYER_COLORS.fireplace,
      shapeType: 'rect',
      examples: ['Gas fireplace', 'Wood fireplace', 'Electric fireplace'],
      csiDivision: 'div10_specialties',
      priority: 23,
    },
  },
  {
    keywords: ['stairs', 'staircase', 'stairway', 'steps'],
    layer: {
      id: 'stairs',
      name: 'Stairs',
      description: 'Draw polygon around staircase area',
      color: LAYER_COLORS.stairs,
      shapeType: 'polygon',
      examples: ['Staircase', 'Landing', 'Steps'],
      csiDivision: 'div06_wood_plastics_composites',
      priority: 24,
    },
  },
  {
    keywords: ['deck', 'patio', 'outdoor', 'porch'],
    layer: {
      id: 'deck',
      name: 'Deck / Patio',
      description: 'Draw polygon around deck or patio area',
      color: LAYER_COLORS.deck,
      shapeType: 'polygon',
      examples: ['Deck', 'Patio', 'Porch'],
      csiDivision: 'div32_exterior_improvements',
      priority: 25,
    },
  },
  
  // === DEMOLITION ===
  {
    keywords: ['demo', 'demolition', 'remove', 'tear out', 'gut', 'rip out', 'take out'],
    layer: {
      id: 'demo',
      name: 'Demolition Areas',
      description: 'Draw polygons around areas to be demolished',
      color: LAYER_COLORS.demo,
      shapeType: 'polygon',
      examples: ['Walls to remove', 'Cabinets to remove', 'Flooring to remove'],
      csiDivision: 'div02_existing_conditions',
      priority: 0,  // Highest priority for demo
    },
  },
  
  // === MEP ===
  {
    keywords: ['electrical', 'outlet', 'outlets', 'switch', 'switches', 'wiring', 'panel'],
    layer: {
      id: 'electrical',
      name: 'Electrical',
      description: 'Draw rectangles for electrical locations',
      color: LAYER_COLORS.electrical,
      shapeType: 'rect',
      examples: ['Outlets', 'Switches', 'Panel location'],
      csiDivision: 'div26_electrical',
      priority: 26,
    },
  },
  {
    keywords: ['plumbing', 'pipe', 'pipes', 'drain', 'water line', 'supply line'],
    layer: {
      id: 'plumbing',
      name: 'Plumbing',
      description: 'Draw polylines for plumbing runs',
      color: LAYER_COLORS.plumbing,
      shapeType: 'polyline',
      examples: ['Water supply', 'Drain lines', 'Vent stack'],
      csiDivision: 'div22_plumbing',
      priority: 27,
    },
  },
  {
    keywords: ['hvac', 'duct', 'ducts', 'vent', 'vents', 'heating', 'cooling', 'ac', 'air conditioning'],
    layer: {
      id: 'hvac',
      name: 'HVAC',
      description: 'Draw polylines or rectangles for HVAC',
      color: LAYER_COLORS.hvac,
      shapeType: 'any',
      examples: ['Ductwork', 'Vents', 'Returns'],
      csiDivision: 'div23_hvac',
      priority: 28,
    },
  },
  {
    keywords: ['heated floor', 'radiant floor', 'radiant heat', 'floor heat'],
    layer: {
      id: 'heated-floor',
      name: 'Heated Floor Zone',
      description: 'Draw polygon for radiant floor heating area',
      color: '#F97316',
      shapeType: 'polygon',
      examples: ['Bathroom heated floor', 'Kitchen heated floor'],
      csiDivision: 'div23_hvac',
      priority: 29,
    },
  },
  
  // === EXTERIOR ===
  {
    keywords: ['garage', 'carport'],
    layer: {
      id: 'garage',
      name: 'Garage',
      description: 'Draw polygon around garage area',
      color: LAYER_COLORS.garage,
      shapeType: 'polygon',
      examples: ['Garage', 'Carport'],
      csiDivision: 'div32_exterior_improvements',
      priority: 30,
    },
  },
  {
    keywords: ['egress', 'egress window', 'basement window'],
    layer: {
      id: 'egress',
      name: 'Egress Windows',
      description: 'Draw rectangles for egress window locations',
      color: LAYER_COLORS.windows,
      shapeType: 'rect',
      examples: ['Egress window', 'Window well'],
      csiDivision: 'div08_openings',
      priority: 31,
    },
  },
];

// ===================
// MAIN FUNCTIONS
// ===================

/**
 * Generate layers ONLY from scope text analysis
 * No default layers - only creates what matches keywords in the scope
 */
export function generateLayersForProject(
  _projectType: string,  // Ignored - we only use scope text
  scopeText: string
): LayerTemplate[] {
  if (!scopeText || scopeText.trim().length === 0) {
    return [];
  }
  
  const scopeLower = scopeText.toLowerCase();
  const matchedLayers: LayerTemplate[] = [];
  const usedIds = new Set<string>();
  
  // Check each keyword mapping
  for (const mapping of KEYWORD_MAPPINGS) {
    // Skip if we already have this layer
    if (usedIds.has(mapping.layer.id)) continue;
    
    // Check if any keyword matches
    const matchedKeywords: string[] = [];
    for (const keyword of mapping.keywords) {
      // Use word boundary matching for better accuracy
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(scopeLower)) {
        matchedKeywords.push(keyword);
      }
    }
    
    // If we found matches, add the layer
    if (matchedKeywords.length > 0) {
      matchedLayers.push({
        ...mapping.layer,
        matchedKeywords,
      });
      usedIds.add(mapping.layer.id);
    }
  }
  
  // Sort by priority
  matchedLayers.sort((a, b) => a.priority - b.priority);
  
  console.log(`[LayerTemplates] Generated ${matchedLayers.length} layers from scope:`, 
    matchedLayers.map(l => l.name));
  
  return matchedLayers;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get layer templates - simplified version that only uses scope
 */
export function getLayerTemplates(projectType: string): LayerTemplate[] {
  // Return empty - we only generate from scope text now
  return [];
}

/**
 * Get additional layers from scope - now the main function
 */
export function getAdditionalLayersFromScope(scopeText: string): LayerTemplate[] {
  return generateLayersForProject('', scopeText);
}

/**
 * Get layer guidance text for tooltip/help
 */
export function getLayerGuidance(layerTemplate: LayerTemplate): string {
  const shapeGuide: Record<string, string> = {
    polyline: 'Draw connected line segments',
    polygon: 'Draw a closed shape (area)',
    rect: 'Draw a rectangle/box',
    any: 'Use any shape type',
  };
  
  return `${layerTemplate.description}\n\n` +
    `Shape: ${shapeGuide[layerTemplate.shapeType]}\n` +
    `Examples: ${layerTemplate.examples.join(', ')}`;
}

/**
 * Check annotation coverage - now just returns counts, no "required" concept
 */
export function checkLayerCoverage(
  templates: LayerTemplate[],
  annotatedLayerIds: string[]
): { total: number; annotated: number; unannotated: LayerTemplate[] } {
  const annotatedSet = new Set(annotatedLayerIds);
  const unannotated = templates.filter(t => !annotatedSet.has(t.id));
  
  return {
    total: templates.length,
    annotated: annotatedSet.size,
    unannotated,
  };
}

/**
 * Get layer completion status for UI - simplified without "required"
 */
export function getLayerCompletionStatus(
  templates: LayerTemplate[],
  layerShapeCounts: Record<string, number>
): Array<{ template: LayerTemplate; status: 'empty' | 'complete'; count: number }> {
  return templates.map(template => {
    const count = layerShapeCounts[template.id] || 0;
    return {
      template,
      status: count > 0 ? 'complete' : 'empty',
      count,
    };
  });
}

/**
 * Legacy function for backwards compatibility
 */
export function checkRequiredLayerCoverage(
  templates: LayerTemplate[],
  annotatedLayerIds: string[]
): { complete: boolean; missing: LayerTemplate[] } {
  // No layers are required anymore - always complete
  return {
    complete: true,
    missing: [],
  };
}
