/**
 * Estimation types for TrueCost
 * Based on ClarificationOutput Schema v3.0
 */

// ===================
// METADATA TYPES
// ===================

export type ClarificationStatus = 'pending' | 'in_progress' | 'complete' | 'needs_review';

export type ProjectType =
  | 'kitchen_remodel'
  | 'bathroom_remodel'
  | 'bedroom_remodel'
  | 'living_room_remodel'
  | 'basement_finish'
  | 'attic_conversion'
  | 'whole_house_remodel'
  | 'addition'
  | 'deck_patio'
  | 'garage'
  | 'other';

// ===================
// LOCATION TYPES
// ===================

export interface Location {
  fullAddress: string;
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

// ===================
// SCOPE SUMMARY
// ===================

export type FinishLevel = 'budget' | 'mid_range' | 'high_end' | 'luxury';
export type ProjectComplexity = 'simple' | 'moderate' | 'complex';
export type TimelineFlexibility = 'strict' | 'flexible' | 'open';

export interface ScopeSummary {
  description: string;
  totalSqft: number;
  rooms: string[];
  finishLevel: FinishLevel;
  projectComplexity: ProjectComplexity;
  includedDivisions: string[];
  excludedDivisions: string[];
  byOwnerDivisions: string[];
  notApplicableDivisions: string[];
  totalIncluded: number;
  totalExcluded: number;
}

export interface Timeline {
  desiredStart?: string;
  deadline?: string;
  flexibility: TimelineFlexibility;
}

export interface ProjectBrief {
  projectType: ProjectType;
  location: Location;
  scopeSummary: ScopeSummary;
  specialRequirements: string[];
  exclusions: string[];
  timeline: Timeline;
}

// ===================
// CSI SCOPE TYPES
// ===================

export type CSIDivisionStatus = 'included' | 'excluded' | 'by_owner' | 'not_applicable';

export type CSIUnit =
  | 'each' | 'ea'
  | 'linear_feet' | 'lf'
  | 'square_feet' | 'sf'
  | 'cubic_feet' | 'cf'
  | 'cubic_yards' | 'cy'
  | 'pounds' | 'lbs'
  | 'gallons' | 'gal'
  | 'hours' | 'hr'
  | 'days'
  | 'allowance' | 'ls'
  | 'per_opening'
  | 'per_fixture';

export type LineItemSource =
  | 'cad_extraction'
  | 'user_input'
  | 'inferred'
  | 'annotation'
  | 'standard_allowance';

export interface CSILineItem {
  id: string;
  item: string;
  subdivisionCode?: string;
  quantity: number;
  unit: CSIUnit;
  unitDescription?: string;
  specifications?: string;
  notes?: string;
  confidence: number;
  source: LineItemSource;
}

export interface CSIDivision {
  code: string;
  name: string;
  status: CSIDivisionStatus;
  exclusionReason?: string;
  description: string;
  items: CSILineItem[];
}

export interface CSIScope {
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

// ===================
// CAD DATA TYPES
// ===================

export type CADFileType = 'dwg' | 'dxf' | 'pdf' | 'png' | 'jpg' | 'jpeg';
export type ExtractionMethod = 'ezdxf' | 'vision' | 'annotation';
export type WallType = 'interior' | 'exterior' | 'load_bearing' | 'partition';
export type OpeningType = 'door' | 'window' | 'archway' | 'pass_through';
export type SwingType = 'in' | 'out' | 'left' | 'right' | 'sliding' | 'pocket';

export interface Room {
  id: string;
  name: string;
  type: string;
  sqft: number;
  dimensions: {
    length: number;
    width: number;
    height?: number;
  };
  confidence: number;
  needsVerification: boolean;
}

export interface Wall {
  id: string;
  length: number;
  height?: number;
  thickness?: number;
  type: WallType;
  material?: string;
  connectsRooms: string[];
  adjacentWalls: string[];
  confidence: number;
}

export interface Opening {
  id: string;
  type: OpeningType;
  width: number;
  height: number;
  inWall: string;
  connectsRooms: string[];
  position: {
    distanceFromCorner: number;
    side: 'left' | 'right' | 'center';
  };
  swing?: SwingType;
  confidence: number;
}

export interface SpaceModel {
  totalSqft: number;
  boundingBox: {
    length: number;
    width: number;
    height: number;
    units: 'feet' | 'inches' | 'meters';
  };
  scale: {
    detected: boolean;
    ratio?: number;
    units: 'feet' | 'inches' | 'meters';
  };
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
}

export interface RoomAdjacency {
  room1: string;
  room2: string;
  connection: 'door' | 'archway' | 'open' | 'window';
  openingId?: string;
}

export interface EntryPoint {
  openingId: string;
  fromSpace: string;
  isPrimary: boolean;
}

export interface SpatialRelationships {
  layoutNarrative: string;
  roomAdjacencies: RoomAdjacency[];
  entryPoints: EntryPoint[];
}

// Project-Type-Specific Data

export interface KitchenSpecificData {
  workTriangle: {
    sinkToStove: number;
    stoveToFridge: number;
    fridgeToSink: number;
    triangleValid: boolean;
  };
  fixtures: {
    sink: {
      type: 'single' | 'double' | 'farmhouse' | 'undermount';
      location: string;
      width: number;
      adjacentTo: string[];
    };
    stove: {
      type: 'range' | 'cooktop' | 'wall_oven';
      fuel: 'gas' | 'electric' | 'induction' | 'unknown';
      location: string;
      width: number;
      ventilation: 'hood' | 'downdraft' | 'microwave_hood' | 'none' | 'unknown';
      adjacentTo: string[];
    };
    refrigerator: {
      type: 'standard' | 'french_door' | 'side_by_side' | 'counter_depth' | 'built_in';
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
      height: number;
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
      type: 'walk_in' | 'reach_in' | 'cabinet' | 'none';
      sqft?: number;
    };
  };
  countertops: {
    totalSqft: number;
    backsplashLinearFeet: number;
    backsplashHeight: number;
  };
}

export interface BathroomSpecificData {
  fixtures: {
    toilet: {
      present: boolean;
      location: string;
      type: 'standard' | 'elongated' | 'wall_hung' | 'bidet_combo';
      adjacentTo: string[];
      clearanceToWall: number;
      clearanceToVanity?: number;
    };
    vanity: {
      type: 'single' | 'double' | 'floating' | 'pedestal';
      width: number;
      location: string;
      sinkCount: number;
      adjacentTo: string[];
    };
    shower?: {
      present: boolean;
      type: 'stall' | 'tub_shower' | 'walk_in' | 'curbless';
      dimensions?: { width: number; depth: number };
      location?: string;
      doorType?: 'hinged' | 'sliding' | 'curtain' | 'frameless';
      showerhead?: 'standard' | 'rain' | 'handheld' | 'multi';
      hasNiche?: boolean;
      hasBench?: boolean;
    };
    tub?: {
      present: boolean;
      type: 'alcove' | 'freestanding' | 'drop_in' | 'corner';
      dimensions?: { length: number; width: number };
      location?: string;
      hasJets?: boolean;
    };
    mirror: {
      present: boolean;
      type: 'framed' | 'frameless' | 'medicine_cabinet' | 'full_wall';
      width?: number;
      height?: number;
      location: string;
      aboveVanity: boolean;
    };
  };
  ventilation: {
    type: 'exhaust_fan' | 'window' | 'both' | 'none';
    cfm?: number;
  };
  floorDrain?: boolean;
  heatedFloor?: boolean;
}

export interface BedroomSpecificData {
  closets: Array<{
    type: 'walk_in' | 'reach_in' | 'wardrobe';
    sqft: number;
    location: string;
    hasBuiltIns: boolean;
  }>;
  windows: Array<{
    wall: string;
    width: number;
    height: number;
    type: 'double_hung' | 'casement' | 'sliding' | 'fixed';
  }>;
  ceilingType: 'flat' | 'vaulted' | 'tray' | 'coffered';
  ceilingHeight: number;
}

export interface LivingAreaSpecificData {
  fireplace?: {
    present: boolean;
    type: 'wood' | 'gas' | 'electric' | 'none';
    location: string;
    mantle: boolean;
  };
  builtIns?: Array<{
    type: 'bookshelf' | 'entertainment_center' | 'window_seat' | 'other';
    location: string;
    dimensions: { width: number; height: number; depth: number };
  }>;
  ceilingType: 'flat' | 'vaulted' | 'tray' | 'coffered' | 'beamed';
  ceilingHeight: number;
}

export interface CADData {
  fileUrl: string;
  fileType: CADFileType;
  extractionMethod: ExtractionMethod;
  extractionConfidence: number;
  spaceModel: SpaceModel;
  spatialRelationships: SpatialRelationships;
  kitchenSpecific?: KitchenSpecificData;
  bathroomSpecific?: BathroomSpecificData;
  bedroomSpecific?: BedroomSpecificData;
  livingAreaSpecific?: LivingAreaSpecificData;
  rawExtraction?: object;
}

// ===================
// CONVERSATION TYPES
// ===================

export type InputMethod = 'text' | 'voice' | 'mixed';

export interface ClarificationQuestion {
  question: string;
  answer: string;
  inputMethod: 'text' | 'voice';
  extractedData: Record<string, unknown>;
}

export interface ConversationHistory {
  inputMethod: InputMethod;
  messageCount: number;
  clarificationQuestions: ClarificationQuestion[];
  confidenceScore: number;
}

// ===================
// FLAGS & VALIDATION
// ===================

export interface LowConfidenceItem {
  field: string;
  confidence: number;
  reason: string;
}

export interface ValidationFlags {
  lowConfidenceItems: LowConfidenceItem[];
  missingData: string[];
  userVerificationRequired: boolean;
  verificationItems: string[];
}

// ===================
// MAIN OUTPUT TYPE
// ===================

export interface ClarificationOutput {
  estimateId: string;
  schemaVersion: string;
  timestamp: string;
  clarificationStatus: ClarificationStatus;
  projectBrief: ProjectBrief;
  csiScope: CSIScope;
  cadData: CADData;
  conversation: ConversationHistory;
  flags: ValidationFlags;
}

// ===================
// ESTIMATION SESSION
// ===================

export type EstimationStatus = 
  | 'draft'
  | 'clarifying'
  | 'annotating'
  | 'analyzing'
  | 'complete'
  | 'error';

export interface EstimationSession {
  id: string;
  projectId: string;
  status: EstimationStatus;
  
  // Inputs
  scopeText: string;
  planImageUrl: string;
  planImageFileName: string;
  
  // Clarification phase
  clarificationMessages: ClarificationMessage[];
  clarificationComplete: boolean;
  
  // Annotation snapshot (from Space tab)
  annotationSnapshot?: AnnotationSnapshot;
  
  // Generated output
  clarificationOutput?: ClarificationOutput;
  
  // Multi-pass analysis info
  analysisPassCount: number;
  lastAnalysisAt?: number;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
}

export interface ClarificationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  extractedData?: Record<string, unknown>;
}

export interface AnnotationSnapshot {
  shapes: AnnotatedShape[];
  layers: AnnotatedLayer[];
  scale?: {
    pixelsPerUnit: number;
    unit: 'feet' | 'inches' | 'meters';
  };
  capturedAt: number;
}

export interface AnnotatedShape {
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

export interface AnnotatedLayer {
  id: string;
  name: string;
  visible: boolean;
  shapeCount: number;
}

// ===================
// VALIDATION RESULT
// ===================

export interface ValidationError {
  code: string;
  field: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  severity: 'warning';
  suggestion?: string;
}

export interface ValidationResult {
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

