"use strict";
/**
 * Annotation Quantifier
 * Computes accurate measurements from user annotations using scale
 * Primary source of truth for quantities - LLM is only used for inference/gap-filling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCSIItemsFromQuantities = exports.buildSpaceModelFromQuantities = exports.computeQuantitiesFromAnnotations = void 0;
// ===================
// GEOMETRY CALCULATIONS
// ===================
/**
 * Convert flat points array [x1, y1, x2, y2, ...] to Point[]
 */
function flatPointsToPoints(flatPoints) {
    const points = [];
    for (let i = 0; i < flatPoints.length; i += 2) {
        points.push({ x: flatPoints[i], y: flatPoints[i + 1] });
    }
    return points;
}
/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/**
 * Calculate total length of a polyline
 */
function calculatePolylineLength(points) {
    if (points.length < 2)
        return 0;
    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalLength += calculateDistance(points[i], points[i + 1]);
    }
    return totalLength;
}
/**
 * Calculate perimeter of a polygon (closed shape)
 */
function calculatePolygonPerimeter(points) {
    if (points.length < 3)
        return 0;
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
function calculatePolygonArea(points) {
    if (points.length < 3)
        return 0;
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
function pixelsToReal(pixelValue, pixelsPerUnit) {
    if (pixelsPerUnit <= 0)
        return 0;
    return pixelValue / pixelsPerUnit;
}
/**
 * Convert pixel area to real-world area
 */
function pixelAreaToReal(pixelArea, pixelsPerUnit) {
    if (pixelsPerUnit <= 0)
        return 0;
    return pixelArea / (pixelsPerUnit * pixelsPerUnit);
}
// ===================
// LAYER CLASSIFICATION
// ===================
/**
 * Determine element type from layer name
 */
function classifyLayerType(layerName) {
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
function classifyOpeningType(layerName, itemType) {
    const name = (layerName + ' ' + (itemType || '')).toLowerCase();
    if (name.includes('door'))
        return 'door';
    if (name.includes('window'))
        return 'window';
    if (name.includes('arch'))
        return 'archway';
    return 'other';
}
// ===================
// MAIN QUANTIFICATION
// ===================
/**
 * Compute all quantities from annotation snapshot
 * This is the PRIMARY source of quantities - uses actual user annotations with scale
 */
function computeQuantitiesFromAnnotations(annotations) {
    var _a, _b;
    const result = {
        hasScale: false,
        scaleUnit: 'feet',
        pixelsPerUnit: 0,
        totalWallLength: 0,
        totalFloorArea: 0,
        totalRoomCount: 0,
        totalDoorCount: 0,
        totalWindowCount: 0,
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
    }
    else {
        result.hasScale = true;
        result.scaleUnit = annotations.scale.unit;
        result.pixelsPerUnit = annotations.scale.pixelsPerUnit;
    }
    const { shapes, layers, scale } = annotations;
    const pixelsPerUnit = (scale === null || scale === void 0 ? void 0 : scale.pixelsPerUnit) || 1;
    const unit = (scale === null || scale === void 0 ? void 0 : scale.unit) || 'pixels';
    // Create layer lookup
    const layerMap = new Map();
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
            const lengthReal = result.hasScale ? pixelsToReal(lengthPixels, pixelsPerUnit) : lengthPixels;
            const wall = {
                id: shape.id,
                label: shape.label,
                lengthPixels,
                lengthReal,
                unit: result.hasScale ? unit : 'pixels',
                layerName: layer.name,
                confidence: 1.0,
                source: 'cad_extraction',
            };
            result.walls.push(wall);
            result.totalWallLength += lengthReal;
            // Update layer summary
            result.layerSummary[layer.name].totalLength = (result.layerSummary[layer.name].totalLength || 0) + lengthReal;
        }
        else if (shape.type === 'polygon' && shape.points && shape.points.length >= 6) {
            // Polygons are typically rooms/floor areas
            const points = flatPointsToPoints(shape.points);
            const areaPixels = calculatePolygonArea(points);
            const perimeterPixels = calculatePolygonPerimeter(points);
            const areaReal = result.hasScale ? pixelAreaToReal(areaPixels, pixelsPerUnit) : areaPixels;
            const perimeterReal = result.hasScale ? pixelsToReal(perimeterPixels, pixelsPerUnit) : perimeterPixels;
            const room = {
                id: shape.id,
                name: shape.label || layer.name || 'Room',
                areaPixels,
                areaReal,
                perimeterPixels,
                perimeterReal,
                unit: result.hasScale ? unit : 'pixels',
                layerName: layer.name,
                confidence: 1.0,
                source: 'cad_extraction',
            };
            result.rooms.push(room);
            result.totalFloorArea += areaReal;
            result.totalRoomCount++;
            // Update layer summary
            result.layerSummary[layer.name].totalArea = (result.layerSummary[layer.name].totalArea || 0) + areaReal;
        }
        else if (shape.type === 'rect' || shape.type === 'boundingbox') {
            // Rectangles/bounding boxes - could be doors, windows, or fixtures
            const widthPixels = Math.abs(shape.w);
            const heightPixels = Math.abs(shape.h);
            const widthReal = result.hasScale ? pixelsToReal(widthPixels, pixelsPerUnit) : widthPixels;
            const heightReal = result.hasScale ? pixelsToReal(heightPixels, pixelsPerUnit) : heightPixels;
            const openingType = classifyOpeningType(layer.name, shape.itemType);
            if (layerType === 'door' || openingType === 'door' || ((_a = shape.itemType) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('door'))) {
                const door = {
                    id: shape.id,
                    type: 'door',
                    widthPixels,
                    widthReal,
                    heightPixels,
                    heightReal,
                    unit: result.hasScale ? unit : 'pixels',
                    layerName: layer.name,
                    confidence: 1.0,
                    source: 'cad_extraction',
                };
                result.doors.push(door);
                result.totalDoorCount++;
            }
            else if (layerType === 'window' || openingType === 'window' || ((_b = shape.itemType) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('window'))) {
                const window = {
                    id: shape.id,
                    type: 'window',
                    widthPixels,
                    widthReal,
                    heightPixels,
                    heightReal,
                    unit: result.hasScale ? unit : 'pixels',
                    layerName: layer.name,
                    confidence: 1.0,
                    source: 'cad_extraction',
                };
                result.windows.push(window);
                result.totalWindowCount++;
            }
            else {
                // Treat as fixture/equipment
                const fixture = {
                    id: shape.id,
                    type: shape.itemType || layerType || 'unknown',
                    label: shape.label,
                    widthPixels,
                    widthReal,
                    heightPixels,
                    heightReal,
                    unit: result.hasScale ? unit : 'pixels',
                    layerName: layer.name,
                    confidence: 1.0,
                    source: 'cad_extraction',
                };
                result.fixtures.push(fixture);
            }
        }
    }
    // Add warnings for missing data
    if (result.totalWallLength === 0 && shapes.length > 0) {
        result.warnings.push('No wall measurements found - add polylines in a "Walls" layer');
    }
    if (result.totalFloorArea === 0 && shapes.length > 0) {
        result.warnings.push('No floor area measurements found - add polygons in a "Floor" or "Rooms" layer');
    }
    console.log('[QUANTIFIER] Computed from annotations:', {
        hasScale: result.hasScale,
        walls: result.walls.length,
        rooms: result.rooms.length,
        doors: result.doors.length,
        windows: result.windows.length,
        totalWallLength: result.totalWallLength,
        totalFloorArea: result.totalFloorArea,
    });
    return result;
}
exports.computeQuantitiesFromAnnotations = computeQuantitiesFromAnnotations;
/**
 * Build SpaceModel from computed quantities
 */
function buildSpaceModelFromQuantities(quantities) {
    // Build rooms array
    const rooms = quantities.rooms.map((room, index) => ({
        id: room.id,
        name: room.name || `Room ${index + 1}`,
        type: room.layerName.toLowerCase().includes('kitchen') ? 'kitchen' :
            room.layerName.toLowerCase().includes('bath') ? 'bathroom' :
                room.layerName.toLowerCase().includes('bed') ? 'bedroom' :
                    room.layerName.toLowerCase().includes('living') ? 'living_room' :
                        'room',
        sqft: quantities.scaleUnit === 'feet' ? room.areaReal :
            quantities.scaleUnit === 'meters' ? room.areaReal * 10.764 : // convert sq m to sq ft
                room.areaReal,
        dimensions: {
            // Approximate dimensions from area (assuming roughly square)
            length: Math.sqrt(room.areaReal),
            width: Math.sqrt(room.areaReal),
        },
        confidence: room.confidence,
        needsVerification: false,
    }));
    // Build walls array
    const walls = quantities.walls.map((wall, _index) => ({
        id: wall.id,
        length: quantities.scaleUnit === 'feet' ? wall.lengthReal :
            quantities.scaleUnit === 'meters' ? wall.lengthReal * 3.281 : // convert m to ft
                wall.lengthReal,
        type: 'interior',
        confidence: wall.confidence,
    }));
    // Build openings array
    const openings = [
        ...quantities.doors.map(door => ({
            id: door.id,
            type: 'door',
            width: door.widthReal,
            height: door.heightReal || 6.67,
            confidence: door.confidence,
        })),
        ...quantities.windows.map(window => ({
            id: window.id,
            type: 'window',
            width: window.widthReal,
            height: window.heightReal,
            confidence: window.confidence,
        })),
    ];
    return {
        totalSqft: quantities.totalFloorArea,
        boundingBox: {
            length: Math.sqrt(quantities.totalFloorArea) * 1.2,
            width: Math.sqrt(quantities.totalFloorArea) * 1.2,
            height: 8,
            units: quantities.scaleUnit,
        },
        scale: {
            detected: quantities.hasScale,
            ratio: quantities.pixelsPerUnit,
            units: quantities.scaleUnit,
        },
        rooms,
        walls,
        openings,
    };
}
exports.buildSpaceModelFromQuantities = buildSpaceModelFromQuantities;
/**
 * Build CSI line items from computed quantities
 */
function buildCSIItemsFromQuantities(quantities) {
    const items = {
        div06_wood_plastics_composites: [],
        div08_openings: [],
        div09_finishes: [], // Drywall, paint, flooring
    };
    // Wall framing items (Div 06)
    if (quantities.totalWallLength > 0) {
        items.div06_wood_plastics_composites.push({
            id: 'wall-framing-001',
            item: 'Wall Framing - Studs',
            quantity: quantities.totalWallLength,
            unit: 'linear_feet',
            unitDescription: 'linear feet of wall',
            specifications: '2x4 studs @ 16" OC',
            confidence: 1.0,
            source: 'cad_extraction',
            notes: `Calculated from ${quantities.walls.length} annotated wall segments`,
        });
    }
    // Door items (Div 08)
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
    // Window items (Div 08)
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
    // Drywall from wall length (Div 09)
    if (quantities.totalWallLength > 0) {
        // Assume 8ft ceiling height, both sides of wall
        const wallSqft = quantities.totalWallLength * 8 * 2;
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
    }
    // Flooring from room areas (Div 09)
    if (quantities.totalFloorArea > 0) {
        items.div09_finishes.push({
            id: 'flooring-001',
            item: 'Flooring',
            quantity: quantities.totalFloorArea,
            unit: 'square_feet',
            unitDescription: 'square feet of flooring',
            specifications: 'To be specified',
            confidence: 1.0,
            source: 'cad_extraction',
            notes: `Calculated from ${quantities.rooms.length} annotated room areas`,
        });
        // Paint for ceiling
        items.div09_finishes.push({
            id: 'paint-ceiling-001',
            item: 'Ceiling Paint',
            quantity: quantities.totalFloorArea,
            unit: 'square_feet',
            specifications: 'Ceiling paint, 2 coats',
            confidence: 1.0,
            source: 'cad_extraction',
            notes: 'Ceiling area equals floor area',
        });
    }
    return items;
}
exports.buildCSIItemsFromQuantities = buildCSIItemsFromQuantities;
//# sourceMappingURL=annotationQuantifier.js.map