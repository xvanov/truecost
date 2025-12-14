/**
 * Global Materials Database Types
 * FR1-FR6: Firestore schema for unified materials cache
 */

// ============ CONSTANTS ============

/** Default zipCode for seed data and fallback queries */
export const DEFAULT_ZIPCODE = '78745';

/** Confidence threshold for using cached data (FR14) */
export const GLOBAL_MATCH_CONFIDENCE_THRESHOLD = 0.8;

// ============ INTERFACES ============

/**
 * Retailer-specific product information
 * FR4: Each material document contains retailer-specific data
 */
export interface RetailerInfo {
  productUrl: string;
  productId: string;
  price: number;
  priceUpdatedAt: number;
  imageUrl?: string;
  brand?: string;
}

/**
 * Global Material document structure
 * FR1-FR6: Complete schema for globalMaterials collection
 * Document ID format: {normalizedName}_{zipCode}
 */
export interface GlobalMaterial {
  // ============ IDENTIFICATION (FR2) ============
  id: string;                      // Document ID (normalizedName_zipCode)
  name: string;                    // Original item name
  normalizedName: string;          // URL-safe normalized name
  description: string;             // Rich description for LLM matching
  aliases: string[];               // Array of search terms that match this product

  // ============ LOCATION (FR3) ============
  zipCode: string;                 // Location for price data (e.g., "78745")

  // ============ RETAILER DATA (FR4) ============
  retailers: {
    lowes?: RetailerInfo;
    homeDepot?: RetailerInfo;
  };

  // ============ METADATA (FR5) ============
  createdAt: number;               // Timestamp of creation
  updatedAt: number;               // Timestamp of last update
  matchCount: number;              // Number of times this was matched
  source: 'seed' | 'scraped';      // Origin of the data
}

/**
 * LLM validation result for cache matches
 * FR11-FR15: Confidence scoring for match validation
 */
export interface GlobalMatchValidation {
  confidence: number;
  reasoning: string;
}

/**
 * Seed data row structure from Excel file
 * FR27-FR30: Seed script for Excel data import
 */
export interface SeedRow {
  item_name: string;
  description: string;
  'lowes link': string;
  'lowes price': number;
  'home depot link': string;
  'home depot price': number;
  alias: string;
}
