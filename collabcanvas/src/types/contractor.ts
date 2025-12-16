/**
 * Contractor Settings Types
 *
 * These types define contractor-specific data that persists across projects:
 * - Custom labor rates and crew configurations
 * - Pre-negotiated material pricing
 * - Supplier relationships
 */

// =============================================================================
// TRADE TYPES (aligned with backend cost_data_service.py)
// =============================================================================

export type TradeType =
  | 'electrician'
  | 'plumber'
  | 'carpenter'
  | 'hvac'
  | 'general_labor'
  | 'painter'
  | 'tile_setter'
  | 'roofer'
  | 'concrete_finisher'
  | 'drywall_installer'
  | 'cabinet_installer'
  | 'countertop_installer'
  | 'flooring_installer'
  | 'appliance_installer'
  | 'demolition'
  | 'mason'
  | 'welder';

export const TRADE_LABELS: Record<TradeType, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  carpenter: 'Carpenter',
  hvac: 'HVAC Technician',
  general_labor: 'General Labor',
  painter: 'Painter',
  tile_setter: 'Tile Setter',
  roofer: 'Roofer',
  concrete_finisher: 'Concrete Finisher',
  drywall_installer: 'Drywall Installer',
  cabinet_installer: 'Cabinet Installer',
  countertop_installer: 'Countertop Installer',
  flooring_installer: 'Flooring Installer',
  appliance_installer: 'Appliance Installer',
  demolition: 'Demolition',
  mason: 'Mason',
  welder: 'Welder',
};

// =============================================================================
// CREW TYPES
// =============================================================================

/**
 * Individual worker in a crew
 */
export interface CrewMember {
  trade: TradeType;
  count: number;
  hourlyRate?: number; // Override rate for this specific crew member
}

/**
 * Crew template - reusable team configuration
 */
export interface CrewTemplate {
  id: string;
  name: string; // e.g., "Kitchen Remodel Crew", "Bathroom Crew"
  description?: string;
  members: CrewMember[];
  productivityFactor: number; // 1.0 = normal, 1.2 = 20% faster
  isDefault?: boolean; // Apply to new projects by default
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// LABOR RATE TYPES
// =============================================================================

/**
 * Custom labor rate override for a specific trade
 */
export interface LaborRateOverride {
  trade: TradeType;
  baseRate: number; // Hourly rate in USD
  benefitsBurden: number; // As decimal (0.35 = 35%)
  totalRate: number; // Calculated: baseRate * (1 + benefitsBurden)
  isUnion: boolean;
  notes?: string;
}

// =============================================================================
// MATERIAL CATALOG TYPES
// =============================================================================

/**
 * Material category for organization
 */
export type MaterialCatalogCategory =
  | 'lumber'
  | 'drywall'
  | 'flooring'
  | 'tile'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'paint'
  | 'hardware'
  | 'appliances'
  | 'cabinets'
  | 'countertops'
  | 'insulation'
  | 'roofing'
  | 'windows_doors'
  | 'other';

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCatalogCategory, string> = {
  lumber: 'Lumber & Framing',
  drywall: 'Drywall & Sheetrock',
  flooring: 'Flooring',
  tile: 'Tile & Stone',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  paint: 'Paint & Finishes',
  hardware: 'Hardware & Fasteners',
  appliances: 'Appliances',
  cabinets: 'Cabinets',
  countertops: 'Countertops',
  insulation: 'Insulation',
  roofing: 'Roofing',
  windows_doors: 'Windows & Doors',
  other: 'Other',
};

/**
 * Unit types for materials
 */
export type MaterialUnitType =
  | 'each'
  | 'sqft'
  | 'lf' // linear feet
  | 'bf' // board feet
  | 'gallon'
  | 'bag'
  | 'box'
  | 'roll'
  | 'bundle'
  | 'sheet'
  | 'ton'
  | 'yard'; // cubic yard

/**
 * Contractor's custom material with pre-negotiated pricing
 */
export interface ContractorMaterial {
  id: string;
  name: string;
  description?: string;
  category: MaterialCatalogCategory;

  // Pricing
  unitCost: number; // Contractor's price per unit
  unit: MaterialUnitType;
  regionalAverage?: number; // For comparison (optional)
  savingsPercent?: number; // Calculated: (regional - unitCost) / regional * 100

  // Supplier info
  supplierId?: string; // Reference to supplier
  supplierSku?: string;
  supplierProductUrl?: string;

  // Availability
  leadTimeDays?: number;
  inStock?: boolean;
  minimumOrder?: number;

  // Metadata
  notes?: string;
  tags?: string[]; // For search/filter
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// SUPPLIER TYPES
// =============================================================================

/**
 * Supplier relationship
 */
export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;

  // Account info
  accountNumber?: string;
  discountPercent?: number; // Contractor discount
  paymentTerms?: string; // e.g., "Net 30"

  // Delivery
  deliveryZipCodes?: string[]; // ZIP codes they deliver to
  deliveryFee?: number;
  freeDeliveryMinimum?: number;

  // Categories they supply
  categories?: MaterialCatalogCategory[];

  // Metadata
  notes?: string;
  isPrimary?: boolean; // Primary supplier flag
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// CONTRACTOR PROFILE (Root Document)
// =============================================================================

/**
 * Main contractor profile - stored at contractors/{userId}
 */
export interface ContractorProfile {
  userId: string;

  // Company info
  companyName?: string;
  licenseNumber?: string;
  licenseState?: string;
  insuranceExpiry?: number; // Timestamp

  // Contact
  businessPhone?: string;
  businessEmail?: string;
  businessAddress?: string;

  // Default settings for new projects
  defaults: {
    overheadPercent: number; // Default: 10
    profitPercent: number; // Default: 10
    contingencyPercent: number; // Default: 5
    wasteFactorPercent: number; // Default: 10
    useUnionLabor: boolean;
  };

  // Operating regions (for labor rate lookups)
  operatingZipCodes?: string[];
  primaryRegion?: 'northeast' | 'midwest' | 'south' | 'west';

  // Metadata
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// FIRESTORE COLLECTION STRUCTURE
// =============================================================================

/**
 * Firestore structure:
 *
 * contractors/{userId}
 *   - ContractorProfile document
 *
 * contractors/{userId}/crews/{crewId}
 *   - CrewTemplate documents
 *
 * contractors/{userId}/laborRates/{trade}
 *   - LaborRateOverride documents (keyed by trade)
 *
 * contractors/{userId}/materials/{materialId}
 *   - ContractorMaterial documents
 *
 * contractors/{userId}/suppliers/{supplierId}
 *   - Supplier documents
 */

// =============================================================================
// FORM/UI TYPES
// =============================================================================

/**
 * Form state for creating/editing a crew
 */
export interface CrewFormData {
  name: string;
  description: string;
  members: CrewMember[];
  productivityFactor: number;
  isDefault: boolean;
}

/**
 * Form state for creating/editing a material
 */
export interface MaterialFormData {
  name: string;
  description: string;
  category: MaterialCatalogCategory;
  unitCost: number;
  unit: MaterialUnitType;
  supplierId?: string;
  supplierSku?: string;
  leadTimeDays?: number;
  notes?: string;
  tags: string[];
}

/**
 * Form state for creating/editing a supplier
 */
export interface SupplierFormData {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  accountNumber: string;
  discountPercent: number;
  paymentTerms: string;
  deliveryZipCodes: string[];
  deliveryFee: number;
  freeDeliveryMinimum: number;
  categories: MaterialCatalogCategory[];
  notes: string;
  isPrimary: boolean;
}

/**
 * Form state for labor rate override
 */
export interface LaborRateFormData {
  trade: TradeType;
  baseRate: number;
  benefitsBurden: number;
  isUnion: boolean;
  notes: string;
}

// =============================================================================
// AGGREGATE TYPES (for UI display)
// =============================================================================

/**
 * Complete contractor settings state (loaded from Firestore)
 */
export interface ContractorSettings {
  profile: ContractorProfile | null;
  crews: CrewTemplate[];
  laborRates: LaborRateOverride[];
  materials: ContractorMaterial[];
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Summary stats for dashboard display
 */
export interface ContractorSettingsSummary {
  crewCount: number;
  materialCount: number;
  supplierCount: number;
  customLaborRatesCount: number;
  estimatedSavings?: number; // Total savings from custom pricing
}
