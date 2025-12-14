/**
 * Annotation Quantifier
 * Computes accurate measurements from user annotations using scale
 * Primary source of truth for quantities - LLM is only used for inference/gap-filling
 */

// ===================
// TYPES
// ===================

interface Point {
  x: number;
  y: number;
}

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
  capturedAt?: number;
}

// Computed measurement results
interface WallMeasurement {
  id: string;
  label?: string;
  lengthPixels: number;
  lengthReal: number;
  unit: string;
  layerName: string;
  confidence: number;
  source: 'cad_extraction' | 'user_input' | 'inferred' | 'standard_allowance';
}

interface RoomMeasurement {
  id: string;
  name: string;
  areaPixels: number;
  areaReal: number;
  perimeterPixels: number;
  perimeterReal: number;
  unit: string;
  layerName: string;
  confidence: number;
  source: 'cad_extraction' | 'user_input' | 'inferred' | 'standard_allowance';
}

interface OpeningMeasurement {
  id: string;
  type: 'door' | 'window' | 'archway' | 'other';
  widthPixels: number;
  widthReal: number;
  heightPixels: number;
  heightReal: number;
  unit: string;
  layerName: string;
  confidence: number;
  source: 'cad_extraction' | 'user_input' | 'inferred' | 'standard_allowance';
}

interface FixtureMeasurement {
  id: string;
  type: string;
  label?: string;
  widthPixels: number;
  widthReal: number;
  heightPixels: number;
  heightReal: number;
  unit: string;
  layerName: string;
  confidence: number;
  source: 'cad_extraction' | 'user_input' | 'inferred' | 'standard_allowance';
}

export interface ComputedQuantities {
  // Scale info
  hasScale: boolean;
  scaleUnit: string;
  pixelsPerUnit: number;

  // Computed totals (real-world units - only valid when hasScale=true)
  totalWallLength: number;
  totalFloorArea: number;
  totalRoomCount: number;
  totalDoorCount: number;
  totalWindowCount: number;

  // Pixel totals (always populated regardless of scale)
  totalWallLengthPixels: number;
  totalFloorAreaPixels: number;

  // Detailed measurements
  walls: WallMeasurement[];
  rooms: RoomMeasurement[];
  doors: OpeningMeasurement[];
  windows: OpeningMeasurement[];
  fixtures: FixtureMeasurement[];

  // Layer summary
  layerSummary: Record<string, {
    shapeCount: number;
    totalLength?: number;
    totalArea?: number;
    itemType: string;
  }>;

  // Warnings for items that couldn't be measured
  warnings: string[];
}

// ===================
// GEOMETRY CALCULATIONS
// ===================

/**
 * Convert flat points array [x1, y1, x2, y2, ...] to Point[]
 */
function flatPointsToPoints(flatPoints: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < flatPoints.length; i += 2) {
    points.push({ x: flatPoints[i], y: flatPoints[i + 1] });
  }
  return points;
}

/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate total length of a polyline
 */
function calculatePolylineLength(points: Point[]): number {
  if (points.length < 2) return 0;

  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLength += calculateDistance(points[i], points[i + 1]);
  }

  return totalLength;
}

/**
 * Calculate perimeter of a polygon (closed shape)
 */
function calculatePolygonPerimeter(points: Point[]): number {
  if (points.length < 3) return 0;

  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const nextIndex = (i + 1) % points.length;
    perimeter += calculateDistance(points[i], points[nextIndex]);
  }

  return perimeter;
}

/**
 * Calculate area of a polygon using Shoelace formula
 */
function calculatePolygonArea(points: Point[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}

/**
 * Convert pixel measurement to real-world units
 */
function pixelsToReal(pixelValue: number, pixelsPerUnit: number): number {
  if (pixelsPerUnit <= 0) return 0;
  return pixelValue / pixelsPerUnit;
}

/**
 * Convert pixel area to real-world area
 */
function pixelAreaToReal(pixelArea: number, pixelsPerUnit: number): number {
  if (pixelsPerUnit <= 0) return 0;
  return pixelArea / (pixelsPerUnit * pixelsPerUnit);
}

// ===================
// LAYER CLASSIFICATION
// ===================

/**
 * Determine element type from layer name
 */
function classifyLayerType(layerName: string): string {
  const name = layerName.toLowerCase().trim();

  // Walls / Linear measurements
  if (name.includes('wall') || name.includes('partition') || name.includes('framing')) {
    return 'wall';
  }

  // Rooms / Floor areas
  if (name.includes('room') || name.includes('floor') || name.includes('area') || name.includes('space')) {
    return 'room';
  }

  // Doors
  if (name.includes('door') || name.includes('entry') || name.includes('exit')) {
    return 'door';
  }

  // Windows
  if (name.includes('window') || name.includes('glazing') || name.includes('glass')) {
    return 'window';
  }

  // Fixtures/Equipment
  if (name.includes('fixture') || name.includes('appliance') || name.includes('equipment') ||
      name.includes('sink') || name.includes('toilet') || name.includes('shower') ||
      name.includes('tub') || name.includes('vanity') || name.includes('stove') ||
      name.includes('refrigerator') || name.includes('dishwasher') || name.includes('cabinet')) {
    return 'fixture';
  }

  // Electrical
  if (name.includes('electrical') || name.includes('outlet') || name.includes('switch') || name.includes('light')) {
    return 'electrical';
  }

  // Plumbing
  if (name.includes('plumbing') || name.includes('pipe') || name.includes('drain')) {
    return 'plumbing';
  }

  // HVAC
  if (name.includes('hvac') || name.includes('duct') || name.includes('vent')) {
    return 'hvac';
  }

  // Default - check shape types within to determine
  return 'unknown';
}

/**
 * Determine opening type from layer name or itemType
 */
function classifyOpeningType(layerName: string, itemType?: string): 'door' | 'window' | 'archway' | 'other' {
  const name = (layerName + ' ' + (itemType || '')).toLowerCase();

  if (name.includes('door')) return 'door';
  if (name.includes('window')) return 'window';
  if (name.includes('arch')) return 'archway';

  return 'other';
}

// ===================
// MAIN QUANTIFICATION
// ===================

/**
 * Compute all quantities from annotation snapshot
 * This is the PRIMARY source of quantities - uses actual user annotations with scale
 */
export function computeQuantitiesFromAnnotations(annotations: AnnotationSnapshot): ComputedQuantities {
  const result: ComputedQuantities = {
    hasScale: false,
    scaleUnit: 'feet', // Default to 'feet' - schema requires valid unit (feet/inches/meters)
    pixelsPerUnit: 1,
    totalWallLength: 0,
    totalFloorArea: 0,
    totalRoomCount: 0,
    totalDoorCount: 0,
    totalWindowCount: 0,
    totalWallLengthPixels: 0,
    totalFloorAreaPixels: 0,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    fixtures: [],
    layerSummary: {},
    warnings: [],
  };

  // Check if scale is available
  if (!annotations.scale || annotations.scale.pixelsPerUnit <= 0) {
    result.warnings.push('No scale set - measurements will be in pixels only');
    // Keep defaults: hasScale=false, scaleUnit='feet' (valid schema value), pixelsPerUnit=1
  } else {
    result.hasScale = true;
    result.scaleUnit = annotations.scale.unit;
    result.pixelsPerUnit = annotations.scale.pixelsPerUnit;
  }

  const { shapes, layers, scale } = annotations;
  const pixelsPerUnit = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'feet'; // Default to 'feet' - schema requires valid unit

  // Create layer lookup
  const layerMap = new Map<string, AnnotatedLayer>();
  for (const layer of layers) {
    layerMap.set(layer.id, layer);
  }

  // Process each shape
  for (const shape of shapes) {
    const layer = layerMap.get(shape.layerId || '') || { id: 'default', name: 'Default', visible: true, shapeCount: 0 };
    const layerType = classifyLayerType(layer.name);

    // Initialize layer summary if not exists
    if (!result.layerSummary[layer.name]) {
      result.layerSummary[layer.name] = {
        shapeCount: 0,
        itemType: layerType,
      };
    }
    result.layerSummary[layer.name].shapeCount++;

    // Process based on shape type
    if (shape.type === 'polyline' && shape.points && shape.points.length >= 4) {
      // Polylines are typically walls or linear measurements
      const points = flatPointsToPoints(shape.points);
      const lengthPixels = calculatePolylineLength(points);
      // Only compute real length when scale is available
      const lengthReal = result.hasScale ? pixelsToReal(lengthPixels, pixelsPerUnit) : 0;

      const wall: WallMeasurement = {
        id: shape.id,
        label: shape.label,
        lengthPixels,
        lengthReal,
        unit: result.hasScale ? unit : 'feet', // Default to 'feet' for schema compliance
        layerName: layer.name,
        confidence: 1.0, // User-drawn = high confidence
        source: 'cad_extraction',
      };

      result.walls.push(wall);
      // Always accumulate pixel totals
      result.totalWallLengthPixels += lengthPixels;
      // Only accumulate real-world totals when scale is available
      if (result.hasScale) {
        result.totalWallLength += lengthReal;
      }

      // Update layer summary (use real units when available, pixels otherwise)
      const lengthForSummary = result.hasScale ? lengthReal : lengthPixels;
      result.layerSummary[layer.name].totalLength = (result.layerSummary[layer.name].totalLength || 0) + lengthForSummary;

    } else if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
      // Polygons are typically rooms/floor areas
      const points = flatPointsToPoints(shape.points);
      const areaPixels = calculatePolygonArea(points);
      const perimeterPixels = calculatePolygonPerimeter(points);
      // Only compute real values when scale is available
      const areaReal = result.hasScale ? pixelAreaToReal(areaPixels, pixelsPerUnit) : 0;
      const perimeterReal = result.hasScale ? pixelsToReal(perimeterPixels, pixelsPerUnit) : 0;

      const room: RoomMeasurement = {
        id: shape.id,
        name: shape.label || layer.name || 'Room',
        areaPixels,
        areaReal,
        perimeterPixels,
        perimeterReal,
        unit: result.hasScale ? unit : 'feet', // Default to 'feet' for schema compliance
        layerName: layer.name,
        confidence: 1.0,
        source: 'cad_extraction',
      };

      result.rooms.push(room);
      // Always accumulate pixel totals
      result.totalFloorAreaPixels += areaPixels;
      // Only accumulate real-world totals when scale is available
      if (result.hasScale) {
        result.totalFloorArea += areaReal;
      }
      result.totalRoomCount++;

      // Update layer summary (use real units when available, pixels otherwise)
      const areaForSummary = result.hasScale ? areaReal : areaPixels;
      result.layerSummary[layer.name].totalArea = (result.layerSummary[layer.name].totalArea || 0) + areaForSummary;

    } else if (shape.type === 'rect' || shape.type === 'boundingbox') {
      // Rectangles/bounding boxes - could be doors, windows, or fixtures
      const widthPixels = Math.abs(shape.w);
      const heightPixels = Math.abs(shape.h);
      const widthReal = result.hasScale ? pixelsToReal(widthPixels, pixelsPerUnit) : widthPixels;
      const heightReal = result.hasScale ? pixelsToReal(heightPixels, pixelsPerUnit) : heightPixels;

      const openingType = classifyOpeningType(layer.name, shape.itemType);

      if (layerType === 'door' || openingType === 'door' || shape.itemType?.toLowerCase().includes('door')) {
        const door: OpeningMeasurement = {
          id: shape.id,
          type: 'door',
          widthPixels,
          widthReal,
          heightPixels,
          heightReal,
          unit: result.hasScale ? unit : 'feet', // Default to 'feet' for schema compliance
          layerName: layer.name,
          confidence: 1.0,
          source: 'cad_extraction',
        };
        result.doors.push(door);
        result.totalDoorCount++;

      } else if (layerType === 'window' || openingType === 'window' || shape.itemType?.toLowerCase().includes('window')) {
        const window: OpeningMeasurement = {
          id: shape.id,
          type: 'window',
          widthPixels,
          widthReal,
          heightPixels,
          heightReal,
          unit: result.hasScale ? unit : 'feet', // Default to 'feet' for schema compliance
          layerName: layer.name,
          confidence: 1.0,
          source: 'cad_extraction',
        };
        result.windows.push(window);
        result.totalWindowCount++;

      } else {
        // Treat as fixture/equipment
        const fixture: FixtureMeasurement = {
          id: shape.id,
          type: shape.itemType || layerType || 'unknown',
          label: shape.label,
          widthPixels,
          widthReal,
          heightPixels,
          heightReal,
          unit: result.hasScale ? unit : 'feet', // Default to 'feet' for schema compliance
          layerName: layer.name,
          confidence: 1.0,
          source: 'cad_extraction',
        };
        result.fixtures.push(fixture);
      }
    }
  }

  // Add warnings for missing data (check pixel totals since real totals are 0 when no scale)
  if (result.totalWallLengthPixels === 0 && shapes.length > 0) {
    result.warnings.push('No wall measurements found - add polylines in a "Walls" layer');
  }
  if (result.totalFloorAreaPixels === 0 && shapes.length > 0) {
    result.warnings.push('No floor area measurements found - add polygons in a "Floor" or "Rooms" layer');
  }

  console.log('[QUANTIFIER] Computed from annotations:', {
    hasScale: result.hasScale,
    scaleUnit: result.scaleUnit,
    walls: result.walls.length,
    rooms: result.rooms.length,
    doors: result.doors.length,
    windows: result.windows.length,
    totalWallLength: result.totalWallLength,
    totalWallLengthPixels: result.totalWallLengthPixels,
    totalFloorArea: result.totalFloorArea,
    totalFloorAreaPixels: result.totalFloorAreaPixels,
  });

  return result;
}

/**
 * Build SpaceModel from computed quantities
 */
export function buildSpaceModelFromQuantities(quantities: ComputedQuantities): Record<string, unknown> {
  // Build rooms array - use real values when scale available, otherwise use pixel-based estimates
  // Note: Schema requires length/width fields with valid units (feet/inches/meters)
  const rooms = quantities.rooms.map((room, index) => ({
    id: room.id,
    name: room.name || `Room ${index + 1}`,
    type: room.layerName.toLowerCase().includes('kitchen') ? 'kitchen' :
          room.layerName.toLowerCase().includes('bath') ? 'bathroom' :
          room.layerName.toLowerCase().includes('bed') ? 'bedroom' :
          room.layerName.toLowerCase().includes('living') ? 'living_room' :
          'room',
    // Only provide sqft when we have a valid scale
    sqft: quantities.hasScale
      ? (quantities.scaleUnit === 'feet' ? room.areaReal :
         quantities.scaleUnit === 'meters' ? room.areaReal * 10.764 : // convert sq m to sq ft
         room.areaReal)
      : 0, // No valid sqft when no scale
    sqftPixels: room.areaPixels, // Always provide pixel value for reference
    // Always use length/width field names (required by schema)
    // When no scale, use pixel values as placeholders and flag for verification
    dimensions: {
      length: quantities.hasScale ? Math.sqrt(room.areaReal) : Math.sqrt(room.areaPixels),
      width: quantities.hasScale ? Math.sqrt(room.areaReal) : Math.sqrt(room.areaPixels),
    },
    confidence: quantities.hasScale ? room.confidence : 0.1, // Low confidence when no scale
    needsVerification: !quantities.hasScale, // Flag for verification when no scale
  }));

  // Build walls array - use real values when scale available
  const walls = quantities.walls.map((wall, _index) => ({
    id: wall.id,
    length: quantities.hasScale
      ? (quantities.scaleUnit === 'feet' ? wall.lengthReal :
         quantities.scaleUnit === 'meters' ? wall.lengthReal * 3.281 : // convert m to ft
         wall.lengthReal)
      : 0, // No valid length when no scale
    lengthPixels: wall.lengthPixels, // Always provide pixel value for reference
    type: 'interior' as const,
    confidence: wall.confidence,
  }));

  // Build openings array using COUNTS with standard USA sizes
  // Door and window quantities are COUNTS, not areas from bounding boxes
  const openings = [
    // Standard USA interior door: 32" x 80" (2.67' x 6.67')
    ...quantities.doors.map((door, index) => ({
      id: door.id,
      type: 'door' as const,
      width: 2.67,  // Standard 32" door width in feet
      height: 6.67, // Standard 80" door height in feet
      standardSize: '32" x 80"',
      confidence: door.confidence,
      note: `Door ${index + 1} of ${quantities.doors.length} (standard USA size applied)`,
    })),
    // Standard USA window: 36" x 48" (3' x 4')
    ...quantities.windows.map((window, index) => ({
      id: window.id,
      type: 'window' as const,
      width: 3.0,   // Standard 36" window width in feet
      height: 4.0,  // Standard 48" window height in feet
      standardSize: '36" x 48"',
      confidence: window.confidence,
      note: `Window ${index + 1} of ${quantities.windows.length} (standard USA size applied)`,
    })),
  ];

  // Determine the output unit - default to 'feet' when no scale is available
  // Schema requires units to be 'feet', 'inches', or 'meters' (not 'pixels')
  const outputUnit = quantities.hasScale ? quantities.scaleUnit : 'feet';

  return {
    totalSqft: quantities.hasScale ? quantities.totalFloorArea : 0,
    totalSqftPixels: quantities.totalFloorAreaPixels,
    // Always use length/width/height field names (required by schema)
    // When no scale, use pixel values as placeholders with 'feet' unit
    boundingBox: {
      length: quantities.hasScale
        ? Math.sqrt(quantities.totalFloorArea) * 1.2
        : Math.sqrt(quantities.totalFloorAreaPixels) * 1.2,
      width: quantities.hasScale
        ? Math.sqrt(quantities.totalFloorArea) * 1.2
        : Math.sqrt(quantities.totalFloorAreaPixels) * 1.2,
      height: 8, // Standard ceiling height
      units: outputUnit,
    },
    scale: {
      detected: quantities.hasScale,
      ratio: quantities.pixelsPerUnit,
      units: outputUnit, // Use valid unit (not 'pixels')
    },
    rooms,
    walls,
    openings,
    // Add flag to indicate data needs scale calibration
    needsScaleCalibration: !quantities.hasScale,
  };
}

// Unit conversion constants
const METERS_TO_FEET = 3.28084;
const SQ_METERS_TO_SQ_FEET = 10.7639;

/**
 * Build CSI line items from computed quantities
 * Note: Measurement-based items (linear feet, sqft) are only generated when scale is available.
 * Count-based items (doors, windows) are always generated.
 * All CSI items are output in US customary units (feet, sqft).
 */
export function buildCSIItemsFromQuantities(quantities: ComputedQuantities): Record<string, unknown[]> {
  const items: Record<string, unknown[]> = {
    div06_wood_plastics_composites: [], // Framing
    div08_openings: [], // Doors and windows
    div09_finishes: [], // Drywall, paint, flooring
  };

  // Convert to feet/sqft based on source unit
  const toLinearFeet = (value: number): number => {
    if (quantities.scaleUnit === 'meters') return value * METERS_TO_FEET;
    if (quantities.scaleUnit === 'inches') return value / 12;
    return value; // already in feet
  };

  const toSquareFeet = (value: number): number => {
    if (quantities.scaleUnit === 'meters') return value * SQ_METERS_TO_SQ_FEET;
    if (quantities.scaleUnit === 'inches') return value / 144;
    return value; // already in sqft
  };

  // Wall framing items (Div 06) - only when scale is available
  if (quantities.hasScale && quantities.totalWallLength > 0) {
    const wallLengthFeet = toLinearFeet(quantities.totalWallLength);
    items.div06_wood_plastics_composites.push({
      id: 'wall-framing-001',
      item: 'Wall Framing - Studs',
      quantity: wallLengthFeet,
      unit: 'linear_feet',
      unitDescription: 'linear feet of wall',
      specifications: '2x4 studs @ 16" OC',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: `Calculated from ${quantities.walls.length} annotated wall segments` +
        (quantities.scaleUnit !== 'feet' ? ` (converted from ${quantities.scaleUnit})` : ''),
    });
  } else if (!quantities.hasScale && quantities.totalWallLengthPixels > 0) {
    // Add placeholder when no scale but walls exist
    items.div06_wood_plastics_composites.push({
      id: 'wall-framing-001',
      item: 'Wall Framing - Studs',
      quantity: 0,
      quantityPixels: quantities.totalWallLengthPixels,
      unit: 'linear_feet',
      unitDescription: 'linear feet of wall (SCALE REQUIRED)',
      specifications: '2x4 studs @ 16" OC',
      confidence: 0,
      source: 'cad_extraction',
      notes: `${quantities.walls.length} wall segments detected but scale not set - set scale to calculate quantities`,
      requiresScale: true,
    });
  }

  // Door items (Div 08) - counts are always valid
  if (quantities.doors.length > 0) {
    items.div08_openings.push({
      id: 'doors-001',
      item: 'Interior Doors',
      quantity: quantities.doors.length,
      unit: 'each',
      specifications: 'Standard interior door with frame and hardware',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: 'Count from annotated door locations',
    });
  }

  // Window items (Div 08) - counts are always valid
  if (quantities.windows.length > 0) {
    items.div08_openings.push({
      id: 'windows-001',
      item: 'Windows',
      quantity: quantities.windows.length,
      unit: 'each',
      specifications: 'Standard window with frame',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: 'Count from annotated window locations',
    });
  }

  // Drywall from wall length (Div 09) - only when scale is available
  if (quantities.hasScale && quantities.totalWallLength > 0) {
    // Convert wall length to feet, then calculate sqft (8ft ceiling height, both sides)
    const wallLengthFeet = toLinearFeet(quantities.totalWallLength);
    const wallSqft = wallLengthFeet * 8 * 2;
    items.div09_finishes.push({
      id: 'drywall-001',
      item: 'Drywall - Walls',
      quantity: wallSqft,
      unit: 'square_feet',
      unitDescription: 'square feet of drywall',
      specifications: '1/2" gypsum board',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: 'Calculated from wall lengths x 8ft height x 2 sides',
    });
  } else if (!quantities.hasScale && quantities.totalWallLengthPixels > 0) {
    items.div09_finishes.push({
      id: 'drywall-001',
      item: 'Drywall - Walls',
      quantity: 0,
      quantityPixels: quantities.totalWallLengthPixels,
      unit: 'square_feet',
      unitDescription: 'square feet of drywall (SCALE REQUIRED)',
      specifications: '1/2" gypsum board',
      confidence: 0,
      source: 'cad_extraction',
      notes: 'Wall segments detected but scale not set - set scale to calculate quantities',
      requiresScale: true,
    });
  }

  // Flooring from room areas (Div 09) - only when scale is available
  if (quantities.hasScale && quantities.totalFloorArea > 0) {
    const floorAreaSqft = toSquareFeet(quantities.totalFloorArea);
    items.div09_finishes.push({
      id: 'flooring-001',
      item: 'Flooring',
      quantity: floorAreaSqft,
      unit: 'square_feet',
      unitDescription: 'square feet of flooring',
      specifications: 'To be specified',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: `Calculated from ${quantities.rooms.length} annotated room areas` +
        (quantities.scaleUnit !== 'feet' ? ` (converted from ${quantities.scaleUnit})` : ''),
    });

    // Paint for ceiling
    items.div09_finishes.push({
      id: 'paint-ceiling-001',
      item: 'Ceiling Paint',
      quantity: floorAreaSqft,
      unit: 'square_feet',
      specifications: 'Ceiling paint, 2 coats',
      confidence: 1.0,
      source: 'cad_extraction',
      notes: 'Ceiling area equals floor area',
    });
  } else if (!quantities.hasScale && quantities.totalFloorAreaPixels > 0) {
    items.div09_finishes.push({
      id: 'flooring-001',
      item: 'Flooring',
      quantity: 0,
      quantityPixels: quantities.totalFloorAreaPixels,
      unit: 'square_feet',
      unitDescription: 'square feet of flooring (SCALE REQUIRED)',
      specifications: 'To be specified',
      confidence: 0,
      source: 'cad_extraction',
      notes: `${quantities.rooms.length} room areas detected but scale not set - set scale to calculate quantities`,
      requiresScale: true,
    });

    items.div09_finishes.push({
      id: 'paint-ceiling-001',
      item: 'Ceiling Paint',
      quantity: 0,
      quantityPixels: quantities.totalFloorAreaPixels,
      unit: 'square_feet',
      specifications: 'Ceiling paint, 2 coats',
      confidence: 0,
      source: 'cad_extraction',
      notes: 'Room areas detected but scale not set - set scale to calculate quantities',
      requiresScale: true,
    });
  }

  return items;
}

