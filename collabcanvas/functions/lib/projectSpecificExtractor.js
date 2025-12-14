"use strict";
/**
 * Project-Type-Specific Data Extractor
 * Extracts kitchen, bathroom, bedroom, and living area specific data
 * for enhanced estimation accuracy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateLayoutNarrative = exports.extractProjectSpecificData = void 0;
// ===================
// EXTRACTION FUNCTIONS
// ===================
/**
 * Extract project-type-specific data from quantities and context
 */
function extractProjectSpecificData(quantities, projectType, clarificationData, scopeText) {
    const result = {};
    const scopeLower = scopeText.toLowerCase();
    const projectLower = projectType.toLowerCase();
    // Extract based on project type
    if (projectLower.includes('kitchen')) {
        result.kitchenSpecific = extractKitchenData(quantities, clarificationData, scopeLower);
    }
    if (projectLower.includes('bathroom')) {
        result.bathroomSpecific = extractBathroomData(quantities, clarificationData, scopeLower);
    }
    if (projectLower.includes('bedroom')) {
        result.bedroomSpecific = extractBedroomData(quantities, clarificationData, scopeLower);
    }
    if (projectLower.includes('living') || projectLower.includes('family') ||
        projectLower.includes('great_room')) {
        result.livingAreaSpecific = extractLivingAreaData(quantities, clarificationData, scopeLower);
    }
    // For whole house remodel, extract all that apply
    if (projectLower.includes('whole_house') || projectLower.includes('full_remodel')) {
        if (!result.kitchenSpecific && scopeLower.includes('kitchen')) {
            result.kitchenSpecific = extractKitchenData(quantities, clarificationData, scopeLower);
        }
        if (!result.bathroomSpecific && scopeLower.includes('bath')) {
            result.bathroomSpecific = extractBathroomData(quantities, clarificationData, scopeLower);
        }
        if (!result.bedroomSpecific && scopeLower.includes('bedroom')) {
            result.bedroomSpecific = extractBedroomData(quantities, clarificationData, scopeLower);
        }
        if (!result.livingAreaSpecific && (scopeLower.includes('living') || scopeLower.includes('family'))) {
            result.livingAreaSpecific = extractLivingAreaData(quantities, clarificationData, scopeLower);
        }
    }
    return result;
}
exports.extractProjectSpecificData = extractProjectSpecificData;
/**
 * Extract kitchen-specific data
 */
function extractKitchenData(quantities, clarificationData, scopeText) {
    // Estimate dimensions from room area
    const kitchenRoom = quantities.rooms.find(r => r.name.toLowerCase().includes('kitchen') ||
        r.layerName.toLowerCase().includes('kitchen'));
    const roomArea = (kitchenRoom === null || kitchenRoom === void 0 ? void 0 : kitchenRoom.areaReal) || quantities.totalFloorArea;
    const roomWidth = Math.sqrt(roomArea); // Approximate as square
    // Calculate cabinet linear feet (estimate ~60% of perimeter)
    const estimatedPerimeter = roomWidth * 4;
    const cabinetLf = estimatedPerimeter * 0.6;
    // Estimate countertop area (2 ft depth × cabinet length)
    const countertopSf = cabinetLf * 2;
    // Check scope for specific features
    const hasIsland = scopeText.includes('island');
    const isGas = scopeText.includes('gas');
    const hasPantry = scopeText.includes('pantry');
    // Infer sink type from finish level or scope
    const sinkType = scopeText.includes('farmhouse') ? 'farmhouse' :
        scopeText.includes('undermount') ? 'undermount' :
            scopeText.includes('double') ? 'double' : 'double'; // Default double
    // Calculate work triangle (estimate based on typical layouts)
    const sinkToStove = roomWidth * 0.4; // ~40% of room width
    const stoveToFridge = roomWidth * 0.35;
    const fridgeToSink = roomWidth * 0.45;
    const triangleSum = sinkToStove + stoveToFridge + fridgeToSink;
    const triangleValid = triangleSum >= 13 && triangleSum <= 26;
    return {
        workTriangle: {
            sinkToStove: Math.round(sinkToStove * 10) / 10,
            stoveToFridge: Math.round(stoveToFridge * 10) / 10,
            fridgeToSink: Math.round(fridgeToSink * 10) / 10,
            triangleValid,
        },
        fixtures: {
            sink: {
                type: sinkType,
                location: 'window wall',
                width: sinkType === 'farmhouse' ? 33 : 30,
                adjacentTo: ['dishwasher', 'base_cabinet'],
            },
            stove: {
                type: 'range',
                fuel: isGas ? 'gas' : 'electric',
                location: 'cooking wall',
                width: 30,
                ventilation: scopeText.includes('hood') ? 'hood' : 'microwave_hood',
                adjacentTo: ['base_cabinet', 'counter'],
            },
            refrigerator: {
                type: scopeText.includes('counter-depth') || scopeText.includes('counter depth') ?
                    'counter_depth' : 'french_door',
                location: 'appliance wall',
                width: 36,
                adjacentTo: ['pantry', 'counter'],
            },
            dishwasher: {
                present: true,
                location: 'adjacent to sink',
                adjacentTo: ['sink', 'base_cabinet'],
            },
        },
        cabinets: {
            upperCabinets: {
                linearFeet: Math.round(cabinetLf * 0.85),
                walls: ['window wall', 'cooking wall'],
                height: scopeText.includes('42') ? 42 : 36,
            },
            lowerCabinets: {
                linearFeet: Math.round(cabinetLf),
                walls: ['window wall', 'cooking wall', 'appliance wall'],
            },
            island: hasIsland ? {
                present: true,
                dimensions: { length: 6, width: 4 },
                hasSink: scopeText.includes('island sink'),
                hasCooktop: scopeText.includes('island cooktop'),
                seatingCount: 3,
            } : undefined,
            pantry: hasPantry ? {
                type: scopeText.includes('walk-in') || scopeText.includes('walk in') ?
                    'walk_in' : 'reach_in',
                sqft: scopeText.includes('walk-in') ? 25 : 6,
            } : {
                type: 'none',
            },
        },
        countertops: {
            totalSqft: Math.round(countertopSf + (hasIsland ? 24 : 0)),
            backsplashLinearFeet: Math.round(cabinetLf),
            backsplashHeight: 18,
        },
    };
}
/**
 * Extract bathroom-specific data
 */
function extractBathroomData(quantities, clarificationData, scopeText) {
    // Determine bathroom size/type
    const isMasterBath = scopeText.includes('master') || scopeText.includes('primary') ||
        scopeText.includes('en-suite') || scopeText.includes('ensuite');
    const isHalfBath = scopeText.includes('half bath') || scopeText.includes('powder');
    const isFullBath = !isHalfBath;
    // Find bathroom room
    const bathRoom = quantities.rooms.find(r => r.name.toLowerCase().includes('bath') ||
        r.layerName.toLowerCase().includes('bath'));
    const roomArea = (bathRoom === null || bathRoom === void 0 ? void 0 : bathRoom.areaReal) || (isMasterBath ? 100 : isHalfBath ? 25 : 50);
    // Determine shower/tub configuration
    const hasShower = isFullBath && !scopeText.includes('tub only');
    const hasTub = scopeText.includes('tub') || (isMasterBath && !scopeText.includes('no tub'));
    const hasSeparateShower = isMasterBath && hasShower && hasTub;
    // Vanity type
    const vanityType = isHalfBath ? 'pedestal' :
        isMasterBath && scopeText.includes('double') ? 'double' :
            scopeText.includes('floating') ? 'floating' : 'single';
    const vanityWidth = vanityType === 'double' ? 60 :
        vanityType === 'pedestal' ? 24 :
            isMasterBath ? 48 : 36;
    return {
        fixtures: {
            toilet: {
                present: true,
                location: 'beside vanity',
                type: scopeText.includes('wall-hung') || scopeText.includes('wall hung') ?
                    'wall_hung' : 'elongated',
                adjacentTo: ['vanity', 'wall'],
                clearanceToWall: 15,
                clearanceToVanity: isHalfBath ? 12 : 18,
            },
            vanity: {
                type: vanityType,
                width: vanityWidth,
                location: 'entry wall',
                sinkCount: vanityType === 'double' ? 2 : 1,
                adjacentTo: ['wall', 'toilet'],
            },
            shower: hasShower ? {
                present: true,
                type: hasSeparateShower ? 'walk_in' :
                    scopeText.includes('curbless') ? 'curbless' :
                        hasTub ? 'tub_shower' : 'stall',
                dimensions: hasSeparateShower ?
                    { width: 48, depth: 36 } :
                    { width: 32, depth: 32 },
                location: 'wet wall',
                doorType: scopeText.includes('frameless') ? 'frameless' :
                    scopeText.includes('sliding') ? 'sliding' : 'hinged',
                showerhead: scopeText.includes('rain') ? 'rain' : 'standard',
                hasNiche: true,
                hasBench: isMasterBath && hasSeparateShower,
            } : undefined,
            tub: hasTub ? {
                present: true,
                type: scopeText.includes('freestanding') ? 'freestanding' :
                    scopeText.includes('drop-in') ? 'drop_in' :
                        scopeText.includes('corner') ? 'corner' : 'alcove',
                dimensions: { length: 60, width: 32 },
                location: 'wet wall',
                hasJets: scopeText.includes('jet') || scopeText.includes('whirlpool'),
            } : undefined,
            mirror: {
                present: true,
                type: scopeText.includes('medicine cabinet') ? 'medicine_cabinet' :
                    scopeText.includes('full wall') ? 'full_wall' :
                        isMasterBath ? 'framed' : 'frameless',
                width: vanityWidth,
                height: 36,
                location: 'above vanity',
                aboveVanity: true,
            },
        },
        ventilation: {
            type: 'exhaust_fan',
            cfm: roomArea > 50 ? 80 : 50,
        },
        floorDrain: hasSeparateShower && scopeText.includes('curbless'),
        heatedFloor: scopeText.includes('heated floor') ||
            (isMasterBath && scopeText.includes('luxury')),
    };
}
/**
 * Extract bedroom-specific data
 */
function extractBedroomData(quantities, clarificationData, scopeText) {
    const isMasterBedroom = scopeText.includes('master') || scopeText.includes('primary');
    // Find bedroom room
    const bedroomRoom = quantities.rooms.find(r => r.name.toLowerCase().includes('bed') ||
        r.layerName.toLowerCase().includes('bed'));
    const roomArea = (bedroomRoom === null || bedroomRoom === void 0 ? void 0 : bedroomRoom.areaReal) || quantities.totalFloorArea;
    // Closet configuration
    const hasWalkIn = scopeText.includes('walk-in') || scopeText.includes('walk in') ||
        (isMasterBedroom && roomArea > 150);
    // Window estimation based on room area
    const windowCount = Math.max(1, Math.floor(roomArea / 80));
    return {
        closets: [
            {
                type: hasWalkIn ? 'walk_in' : 'reach_in',
                sqft: hasWalkIn ? 50 : 16,
                location: 'interior wall',
                hasBuiltIns: hasWalkIn || scopeText.includes('built-in'),
            },
        ],
        windows: Array.from({ length: windowCount }, (_, i) => ({
            wall: i === 0 ? 'exterior wall' : 'side wall',
            width: 36,
            height: 48,
            type: 'double_hung',
        })),
        ceilingType: scopeText.includes('tray') ? 'tray' :
            scopeText.includes('vaulted') ? 'vaulted' :
                scopeText.includes('coffered') ? 'coffered' : 'flat',
        ceilingHeight: scopeText.includes('9') ? 9 :
            scopeText.includes('10') ? 10 :
                scopeText.includes('vaulted') ? 12 : 8,
    };
}
/**
 * Extract living area-specific data
 */
function extractLivingAreaData(quantities, clarificationData, scopeText) {
    const hasFireplace = scopeText.includes('fireplace');
    const hasBuiltIns = scopeText.includes('built-in') || scopeText.includes('bookshelf') ||
        scopeText.includes('entertainment');
    return {
        fireplace: hasFireplace ? {
            present: true,
            type: scopeText.includes('gas') ? 'gas' :
                scopeText.includes('wood') ? 'wood' :
                    scopeText.includes('electric') ? 'electric' : 'gas',
            location: 'focal wall',
            mantle: true,
        } : undefined,
        builtIns: hasBuiltIns ? [{
                type: scopeText.includes('entertainment') ? 'entertainment_center' : 'bookshelf',
                location: 'adjacent to fireplace',
                dimensions: { width: 48, height: 84, depth: 16 },
            }] : undefined,
        ceilingType: scopeText.includes('vaulted') ? 'vaulted' :
            scopeText.includes('tray') ? 'tray' :
                scopeText.includes('coffered') ? 'coffered' :
                    scopeText.includes('beamed') ? 'beamed' : 'flat',
        ceilingHeight: scopeText.includes('vaulted') ? 14 :
            scopeText.includes('10') ? 10 :
                scopeText.includes('12') ? 12 : 9,
    };
}
/**
 * Generate a detailed layout narrative based on extracted data
 */
function generateLayoutNarrative(quantities, projectType, projectSpecific) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const parts = [];
    // General space description
    parts.push(`The project space encompasses ${quantities.totalFloorArea.toFixed(1)} square feet`);
    if (quantities.rooms.length > 0) {
        const roomNames = quantities.rooms.map(r => r.name).join(', ');
        parts.push(`across ${quantities.rooms.length} distinct areas: ${roomNames}.`);
    }
    else {
        parts.push('in an open layout configuration.');
    }
    parts.push(`Total wall length measured at ${quantities.totalWallLength.toFixed(1)} ${quantities.scaleUnit}.`);
    if (quantities.doors.length > 0) {
        parts.push(`The space features ${quantities.doors.length} door opening(s)`);
    }
    if (quantities.windows.length > 0) {
        parts.push(`and ${quantities.windows.length} window(s) providing natural light.`);
    }
    // Kitchen-specific narrative
    if (projectSpecific.kitchenSpecific) {
        const k = projectSpecific.kitchenSpecific;
        parts.push(`\n\nKitchen Layout: The work triangle measures ${k.workTriangle.sinkToStove + k.workTriangle.stoveToFridge + k.workTriangle.fridgeToSink} feet total (${k.workTriangle.triangleValid ? 'within optimal range' : 'may need optimization'}).`);
        parts.push(`Cabinet configuration includes ${k.cabinets.lowerCabinets.linearFeet} linear feet of base cabinets and ${k.cabinets.upperCabinets.linearFeet} linear feet of ${k.cabinets.upperCabinets.height}-inch uppers.`);
        parts.push(`Countertop coverage totals ${k.countertops.totalSqft} square feet with ${k.countertops.backsplashLinearFeet} linear feet of backsplash.`);
        if ((_a = k.cabinets.island) === null || _a === void 0 ? void 0 : _a.present) {
            parts.push(`A ${(_b = k.cabinets.island.dimensions) === null || _b === void 0 ? void 0 : _b.length}x${(_c = k.cabinets.island.dimensions) === null || _c === void 0 ? void 0 : _c.width} foot island provides additional workspace and seating for ${k.cabinets.island.seatingCount}.`);
        }
    }
    // Bathroom-specific narrative
    if (projectSpecific.bathroomSpecific) {
        const b = projectSpecific.bathroomSpecific;
        parts.push(`\n\nBathroom Layout: Features a ${b.fixtures.vanity.width}-inch ${b.fixtures.vanity.type} vanity with ${b.fixtures.vanity.sinkCount} sink(s).`);
        if ((_d = b.fixtures.shower) === null || _d === void 0 ? void 0 : _d.present) {
            parts.push(`${b.fixtures.shower.type === 'walk_in' ? 'Walk-in' : b.fixtures.shower.type === 'tub_shower' ? 'Tub/shower combo' : 'Shower'} with ${b.fixtures.shower.doorType} door.`);
        }
        if ((_e = b.fixtures.tub) === null || _e === void 0 ? void 0 : _e.present) {
            parts.push(`${b.fixtures.tub.type} tub (${(_f = b.fixtures.tub.dimensions) === null || _f === void 0 ? void 0 : _f.length}x${(_g = b.fixtures.tub.dimensions) === null || _g === void 0 ? void 0 : _g.width}).`);
        }
        parts.push(`Ventilation: ${b.ventilation.cfm} CFM exhaust fan.`);
    }
    // Bedroom-specific narrative
    if (projectSpecific.bedroomSpecific) {
        const br = projectSpecific.bedroomSpecific;
        parts.push(`\n\nBedroom Layout: ${br.ceilingType} ceiling at ${br.ceilingHeight} feet.`);
        if (br.closets.length > 0) {
            const closet = br.closets[0];
            parts.push(`${closet.type === 'walk_in' ? 'Walk-in' : 'Reach-in'} closet (${closet.sqft} sq ft)${closet.hasBuiltIns ? ' with built-in organizers' : ''}.`);
        }
        parts.push(`${br.windows.length} window(s) for natural lighting.`);
    }
    // Living area narrative
    if (projectSpecific.livingAreaSpecific) {
        const lv = projectSpecific.livingAreaSpecific;
        parts.push(`\n\nLiving Area Layout: ${lv.ceilingType} ceiling at ${lv.ceilingHeight} feet.`);
        if ((_h = lv.fireplace) === null || _h === void 0 ? void 0 : _h.present) {
            parts.push(`${lv.fireplace.type} fireplace on ${lv.fireplace.location}${lv.fireplace.mantle ? ' with mantle' : ''}.`);
        }
        if (lv.builtIns && lv.builtIns.length > 0) {
            parts.push(`Custom built-ins: ${lv.builtIns.map(b => b.type).join(', ')}.`);
        }
    }
    return parts.join(' ');
}
exports.generateLayoutNarrative = generateLayoutNarrative;
//# sourceMappingURL=projectSpecificExtractor.js.map