# ClarificationOutput Schema v3.0

**Document Type:** Interface Contract
**Owner:** Dev 3 (Producer) → Dev 2 (Consumer)
**Last Updated:** 2025-12-10
**Schema Version:** 3.0.0

---

## Overview

The `ClarificationOutput` is the **handoff artifact** between the Clarification Agent (Dev 3) and the Deep Agent Pipeline (Dev 2). It contains everything needed to generate an accurate construction estimate:

1. **Project Brief** - User intent, location, and requirements
2. **CSI Scope** - Complete breakdown by all 24 CSI MasterFormat divisions
3. **CAD Data** - Extracted measurements and spatial relationships
4. **Conversation History** - Audit trail of clarification Q&A

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dev 3 Produces                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ CAD Upload  │  │   Voice/    │  │    Clarification        │ │
│  │  & Parse    │→ │   Text      │→ │       Agent             │ │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘ │
└────────────────────────────────────────────────┼───────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  ClarificationOutput   │
                                    │      (This Schema)     │
                                    └────────────┬───────────┘
                                                 │
┌────────────────────────────────────────────────┼───────────────┐
│                        Dev 2 Consumes                          │
│                                                ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │  Location   │→ │   Scope     │→ │  Cost → Risk → Final    ││
│  │   Agent     │  │   Agent     │  │       Agents            ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

---

## Schema Definition

### Root Object

```typescript
interface ClarificationOutput {
  // ===================
  // METADATA
  // ===================
  estimateId: string;                    // Unique estimate identifier
  schemaVersion: "3.0.0";                // Must match this version
  timestamp: string;                     // ISO 8601 creation timestamp
  clarificationStatus: ClarificationStatus;

  // ===================
  // CORE DATA SECTIONS
  // ===================
  projectBrief: ProjectBrief;            // User intent and requirements
  csiScope: CSIScope;                    // All 24 divisions explicitly listed
  cadData: CADData;                      // Mandatory CAD extraction
  conversation: ConversationHistory;     // Clarification Q&A audit trail
  flags: ValidationFlags;                // Downstream processing flags
}

type ClarificationStatus = "complete" | "needs_review";
```

---

## ProjectBrief

User intent, location, and high-level scope summary.

```typescript
interface ProjectBrief {
  projectType: ProjectType;
  location: Location;
  scopeSummary: ScopeSummary;
  specialRequirements: string[];
  exclusions: string[];                  // Explicitly NOT included
  timeline: Timeline;
}

type ProjectType =
  | "kitchen_remodel"
  | "bathroom_remodel"
  | "bedroom_remodel"
  | "living_room_remodel"
  | "basement_finish"
  | "attic_conversion"
  | "whole_house_remodel"
  | "addition"
  | "deck_patio"
  | "garage"
  | "other";

interface Location {
  fullAddress: string;                   // "1234 Main St, Unit 5B, Denver, CO 80202"
  streetAddress: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  county?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface ScopeSummary {
  description: string;                   // Natural language summary
  totalSqft: number;
  rooms: string[];
  finishLevel: "budget" | "mid_range" | "high_end" | "luxury";
  projectComplexity: "simple" | "moderate" | "complex";

  // Quick reference counts (must match csiScope)
  includedDivisions: string[];           // ["01", "02", "06", ...]
  excludedDivisions: string[];
  byOwnerDivisions: string[];
  notApplicableDivisions: string[];
  totalIncluded: number;
  totalExcluded: number;
}

interface Timeline {
  desiredStart?: string;                 // ISO date
  deadline?: string;
  flexibility: "strict" | "flexible" | "open";
}
```

---

## CSI Scope (Complete 24-Division Template)

**CRITICAL:** Every division must be explicitly listed with a status. No division may be omitted.

```typescript
interface CSIScope {
  div01_general_requirements: CSIDivision;
  div02_existing_conditions: CSIDivision;
  div03_concrete: CSIDivision;
  div04_masonry: CSIDivision;
  div05_metals: CSIDivision;
  div06_wood_plastics_composites: CSIDivision;
  div07_thermal_moisture: CSIDivision;
  div08_openings: CSIDivision;
  div09_finishes: CSIDivision;
  div10_specialties: CSIDivision;
  div11_equipment: CSIDivision;
  div12_furnishings: CSIDivision;
  div13_special_construction: CSIDivision;
  div14_conveying_equipment: CSIDivision;
  div21_fire_suppression: CSIDivision;
  div22_plumbing: CSIDivision;
  div23_hvac: CSIDivision;
  div25_integrated_automation: CSIDivision;
  div26_electrical: CSIDivision;
  div27_communications: CSIDivision;
  div28_electronic_safety_security: CSIDivision;
  div31_earthwork: CSIDivision;
  div32_exterior_improvements: CSIDivision;
  div33_utilities: CSIDivision;
}

interface CSIDivision {
  code: string;                          // "01", "02", ..., "33"
  name: string;                          // Standard CSI division name
  status: CSIDivisionStatus;
  exclusionReason?: string;              // REQUIRED if status = "excluded"
  description: string;                   // Scope description for this division
  items: CSILineItem[];                  // Empty array if excluded/not applicable
}

type CSIDivisionStatus =
  | "included"                           // In contractor scope
  | "excluded"                           // Explicitly not in scope
  | "by_owner"                           // Owner is handling (permits, materials, etc.)
  | "not_applicable";                    // Doesn't apply to this project type

interface CSILineItem {
  id: string;                            // Unique within estimate (e.g., "06-001")
  item: string;                          // "base cabinets", "recessed LED lights"
  subdivisionCode?: string;              // "06 41 00" for Architectural Wood Casework
  quantity: number;
  unit: CSIUnit;
  unitDescription?: string;              // "linear feet of cabinet face"
  specifications?: string;               // Detailed specs
  notes?: string;                        // Additional notes
  confidence: number;                    // 0-1, extraction confidence
  source: LineItemSource;
}

type CSIUnit =
  | "each" | "ea"
  | "linear_feet" | "lf"
  | "square_feet" | "sf"
  | "cubic_feet" | "cf"
  | "cubic_yards" | "cy"
  | "pounds" | "lbs"
  | "gallons" | "gal"
  | "hours" | "hr"
  | "days"
  | "allowance" | "ls"                   // lump sum
  | "per_opening"
  | "per_fixture";

type LineItemSource =
  | "cad_extraction"                     // Derived from CAD analysis
  | "user_input"                         // Explicitly stated by user
  | "inferred"                           // Logically inferred from context
  | "standard_allowance";                // Industry standard inclusion
```

### CSI Division Reference

| Code | Key Name | Standard Name |
|------|----------|---------------|
| 01 | `div01_general_requirements` | General Requirements |
| 02 | `div02_existing_conditions` | Existing Conditions |
| 03 | `div03_concrete` | Concrete |
| 04 | `div04_masonry` | Masonry |
| 05 | `div05_metals` | Metals |
| 06 | `div06_wood_plastics_composites` | Wood, Plastics, and Composites |
| 07 | `div07_thermal_moisture` | Thermal and Moisture Protection |
| 08 | `div08_openings` | Openings |
| 09 | `div09_finishes` | Finishes |
| 10 | `div10_specialties` | Specialties |
| 11 | `div11_equipment` | Equipment |
| 12 | `div12_furnishings` | Furnishings |
| 13 | `div13_special_construction` | Special Construction |
| 14 | `div14_conveying_equipment` | Conveying Equipment |
| 21 | `div21_fire_suppression` | Fire Suppression |
| 22 | `div22_plumbing` | Plumbing |
| 23 | `div23_hvac` | Heating, Ventilating, and Air Conditioning |
| 25 | `div25_integrated_automation` | Integrated Automation |
| 26 | `div26_electrical` | Electrical |
| 27 | `div27_communications` | Communications |
| 28 | `div28_electronic_safety_security` | Electronic Safety and Security |
| 31 | `div31_earthwork` | Earthwork |
| 32 | `div32_exterior_improvements` | Exterior Improvements |
| 33 | `div33_utilities` | Utilities |

---

## CAD Data (Mandatory)

CAD file upload is **required** - not optional. The Clarification Agent must extract spatial data and create a mental model of the space.

```typescript
interface CADData {
  // File info
  fileUrl: string;                       // Firebase Storage URL (REQUIRED)
  fileType: "dwg" | "dxf" | "pdf" | "png" | "jpg";
  extractionMethod: "ezdxf" | "vision";
  extractionConfidence: number;          // 0-1 overall confidence

  // Physical space model
  spaceModel: SpaceModel;

  // Spatial relationships
  spatialRelationships: SpatialRelationships;

  // Project-type-specific extractions
  kitchenSpecific?: KitchenSpecificData;
  bathroomSpecific?: BathroomSpecificData;
  bedroomSpecific?: BedroomSpecificData;
  livingAreaSpecific?: LivingAreaSpecificData;

  // Raw extraction for debugging
  rawExtraction?: object;
}

interface SpaceModel {
  totalSqft: number;
  boundingBox: {
    length: number;
    width: number;
    height: number;
    units: "feet" | "inches" | "meters";
  };
  scale: {
    detected: boolean;
    ratio?: number;                      // e.g., 48 for 1/4"=1'
    units: "feet" | "inches" | "meters";
  };
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
}

interface Room {
  id: string;
  name: string;
  type: string;                          // "kitchen", "bathroom", etc.
  sqft: number;
  dimensions: {
    length: number;
    width: number;
    height?: number;
  };
  confidence: number;
  needsVerification: boolean;
}

interface Wall {
  id: string;
  length: number;
  height?: number;
  thickness?: number;
  type: "interior" | "exterior" | "load_bearing" | "partition";
  material?: string;
  connectsRooms: string[];               // Room IDs this wall borders
  adjacentWalls: string[];               // Wall IDs that connect to this wall
  confidence: number;
}

interface Opening {
  id: string;
  type: "door" | "window" | "archway" | "pass_through";
  width: number;
  height: number;
  inWall: string;                        // Wall ID
  connectsRooms: string[];               // Which rooms it connects
  position: {
    distanceFromCorner: number;
    side: "left" | "right" | "center";
  };
  swing?: "in" | "out" | "left" | "right" | "sliding" | "pocket";
  confidence: number;
}

interface SpatialRelationships {
  // CRITICAL: Full narrative description of the space
  layoutNarrative: string;               // Min 200 chars - describes what's next to what

  roomAdjacencies: Array<{
    room1: string;
    room2: string;
    connection: "door" | "archway" | "open" | "window";
    openingId?: string;
  }>;

  entryPoints: Array<{
    openingId: string;
    fromSpace: string;                   // "hallway", "exterior", "garage"
    isPrimary: boolean;
  }>;
}
```

### Project-Type-Specific Data

Different project types require different extracted data. Only the relevant section is populated.

#### Kitchen-Specific

```typescript
interface KitchenSpecificData {
  workTriangle: {
    sinkToStove: number;                 // feet
    stoveToFridge: number;
    fridgeToSink: number;
    triangleValid: boolean;              // sum between 13-26 feet
  };

  fixtures: {
    sink: {
      type: "single" | "double" | "farmhouse" | "undermount";
      location: string;
      width: number;
      adjacentTo: string[];
    };
    stove: {
      type: "range" | "cooktop" | "wall_oven";
      fuel: "gas" | "electric" | "induction" | "unknown";
      location: string;
      width: number;
      ventilation: "hood" | "downdraft" | "microwave_hood" | "none" | "unknown";
      adjacentTo: string[];
    };
    refrigerator: {
      type: "standard" | "french_door" | "side_by_side" | "counter_depth" | "built_in";
      location: string;
      width: number;
      adjacentTo: string[];
    };
    dishwasher: {
      present: boolean;
      location?: string;
      adjacentTo?: string[];
    };
  };

  cabinets: {
    upperCabinets: {
      linearFeet: number;
      walls: string[];
      height: number;                    // 30", 36", 42"
    };
    lowerCabinets: {
      linearFeet: number;
      walls: string[];
    };
    island?: {
      present: boolean;
      dimensions?: { length: number; width: number };
      hasSink?: boolean;
      hasCooktop?: boolean;
      seatingCount?: number;
    };
    pantry?: {
      type: "walk_in" | "reach_in" | "cabinet" | "none";
      sqft?: number;
    };
  };

  countertops: {
    totalSqft: number;
    backsplashLinearFeet: number;
    backsplashHeight: number;
  };
}
```

#### Bathroom-Specific

```typescript
interface BathroomSpecificData {
  fixtures: {
    toilet: {
      present: boolean;
      location: string;
      type: "standard" | "elongated" | "wall_hung" | "bidet_combo";
      adjacentTo: string[];
      clearanceToWall: number;           // inches
      clearanceToVanity?: number;
    };
    vanity: {
      type: "single" | "double" | "floating" | "pedestal";
      width: number;
      location: string;
      sinkCount: number;
      adjacentTo: string[];
    };
    shower?: {
      present: boolean;
      type: "stall" | "tub_shower" | "walk_in" | "curbless";
      dimensions?: { width: number; depth: number };
      location?: string;
      doorType?: "hinged" | "sliding" | "curtain" | "frameless";
      showerhead?: "standard" | "rain" | "handheld" | "multi";
      hasNiche?: boolean;
      hasBench?: boolean;
    };
    tub?: {
      present: boolean;
      type: "alcove" | "freestanding" | "drop_in" | "corner";
      dimensions?: { length: number; width: number };
      location?: string;
      hasJets?: boolean;
    };
    mirror: {
      present: boolean;
      type: "framed" | "frameless" | "medicine_cabinet" | "full_wall";
      width?: number;
      height?: number;
      location: string;
      aboveVanity: boolean;
    };
  };

  ventilation: {
    type: "exhaust_fan" | "window" | "both" | "none";
    cfm?: number;
  };

  floorDrain?: boolean;
  heatedFloor?: boolean;
}
```

#### Bedroom-Specific

```typescript
interface BedroomSpecificData {
  closets: Array<{
    type: "walk_in" | "reach_in" | "wardrobe";
    sqft: number;
    location: string;
    hasBuiltIns: boolean;
  }>;

  windows: Array<{
    wall: string;
    width: number;
    height: number;
    type: "double_hung" | "casement" | "sliding" | "fixed";
  }>;

  ceilingType: "flat" | "vaulted" | "tray" | "coffered";
  ceilingHeight: number;
}
```

#### Living Area-Specific

```typescript
interface LivingAreaSpecificData {
  fireplace?: {
    present: boolean;
    type: "wood" | "gas" | "electric" | "none";
    location: string;
    mantle: boolean;
  };

  builtIns?: Array<{
    type: "bookshelf" | "entertainment_center" | "window_seat" | "other";
    location: string;
    dimensions: { width: number; height: number; depth: number };
  }>;

  ceilingType: "flat" | "vaulted" | "tray" | "coffered" | "beamed";
  ceilingHeight: number;
}
```

---

## Conversation History

Audit trail of the clarification conversation.

```typescript
interface ConversationHistory {
  inputMethod: "text" | "voice" | "mixed";
  messageCount: number;
  clarificationQuestions: Array<{
    question: string;
    answer: string;
    inputMethod: "text" | "voice";
    extractedData: Record<string, any>;  // What was learned from this Q&A
  }>;
  confidenceScore: number;               // 0-1, overall understanding confidence
}
```

---

## Validation Flags

Flags for downstream processing.

```typescript
interface ValidationFlags {
  lowConfidenceItems: Array<{
    field: string;                       // JSON path to the field
    confidence: number;
    reason: string;
  }>;
  missingData: string[];                 // Data that couldn't be determined
  userVerificationRequired: boolean;
  verificationItems: string[];           // Specific things user should confirm
}
```

---

## Validation Rules

The `ClarificationOutput` must pass these validations before handoff to Dev 2:

| Check | Rule | Severity |
|-------|------|----------|
| **CSI Completeness** | All 24 divisions present in csiScope | ERROR |
| **CSI Status** | Every division has explicit status | ERROR |
| **Exclusion Reasons** | All `excluded` divisions have `exclusionReason` | ERROR |
| **Included Items** | `included` divisions have ≥1 line item | WARNING |
| **Location Complete** | All required address fields present | ERROR |
| **CAD Present** | `cadData.fileUrl` is not empty | ERROR |
| **Layout Narrative** | `spatialRelationships.layoutNarrative` ≥ 200 chars | WARNING |
| **Scope Summary Match** | Summary counts match actual division statuses | ERROR |
| **Project-Specific Data** | Relevant section populated for projectType | WARNING |
| **Schema Version** | `schemaVersion` equals "3.0.0" | ERROR |

### Validation Response

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];             // Must fix before proceeding
  warnings: ValidationWarning[];         // Should review but can proceed
  completenessScore: number;             // 0-100

  csiCoverage: {
    included: number;
    excluded: number;
    byOwner: number;
    notApplicable: number;
    missing: string[];                   // Division codes not found
  };
}

interface ValidationError {
  code: string;                          // "CSI_DIVISION_MISSING", etc.
  field: string;                         // JSON path
  message: string;
  severity: "error";
}

interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  severity: "warning";
  suggestion?: string;
}
```

---

## Example: Kitchen Remodel

See the full example in `/docs/examples/clarification-output-kitchen-example.json`.

Key highlights:

```json
{
  "estimateId": "est_abc123",
  "schemaVersion": "3.0.0",
  "clarificationStatus": "complete",

  "projectBrief": {
    "projectType": "kitchen_remodel",
    "location": {
      "fullAddress": "1847 Blake Street, Unit 302, Denver, CO 80202",
      "city": "Denver",
      "state": "CO",
      "zipCode": "80202"
    },
    "scopeSummary": {
      "includedDivisions": ["01", "02", "06", "08", "09", "10", "11", "12", "22", "26"],
      "excludedDivisions": ["03", "04", "05", "07", "13", "14", "21", "23", "25", "27", "28", "31", "32", "33"],
      "totalIncluded": 10,
      "totalExcluded": 14
    }
  },

  "csiScope": {
    "div01_general_requirements": {
      "code": "01",
      "name": "General Requirements",
      "status": "included",
      "description": "Project management, cleanup, and protection.",
      "items": [...]
    },
    "div03_concrete": {
      "code": "03",
      "name": "Concrete",
      "status": "excluded",
      "exclusionReason": "No concrete work required. Existing slab in good condition.",
      "description": "",
      "items": []
    }
    // ... all 24 divisions
  },

  "cadData": {
    "fileUrl": "gs://truecost-bucket/cad/est_abc123/kitchen_plan.pdf",
    "fileType": "pdf",
    "extractionMethod": "vision",
    "spatialRelationships": {
      "layoutNarrative": "The kitchen is a 14x14 foot square room with 9-foot ceilings..."
    },
    "kitchenSpecific": {
      "workTriangle": {
        "sinkToStove": 8,
        "stoveToFridge": 6,
        "fridgeToSink": 7,
        "triangleValid": true
      }
    }
  }
}
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | 2025-12-10 | Complete CSI coverage (all 24 divisions required), mandatory exclusion reasons, full address required, CAD mandatory |
| 2.0.0 | 2025-12-10 | Added CSI division scope, spatial relationships, project-specific data |
| 1.0.0 | 2025-12-10 | Initial schema |

---

## Related Documents

- [Epic Breakdown](/docs/epics.md) - Dev assignments and stories
- [PRD](/docs/prd.md) - Product requirements
- [Architecture](/docs/architecture.md) - Technical architecture

---

_This schema is the contract between Dev 3 (Clarification Agent) and Dev 2 (Deep Agent Pipeline). Any changes must be coordinated between both teams._
