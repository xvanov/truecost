# Global Materials Database Implementation Plan

## Overview

This document outlines the implementation plan for a **Global Materials Database** that will serve as a cache-first lookup system for price comparison. The goal is to reduce external API calls by maintaining a curated database of construction materials with pre-fetched pricing information.

### Problem Statement

The current price comparison system makes external API calls (Unwrangle for Home Depot, SerpAPI for Lowe's) for every product comparison. This is:
- **Expensive**: Each API call costs money
- **Slow**: Network latency for each request
- **Redundant**: Same products are looked up repeatedly

### Solution

Implement a Global Materials Database that:
1. **Stores known products** with pricing from multiple retailers
2. **Searches locally first** before making API calls
3. **Uses LLM validation** to ensure search matches are accurate
4. **Auto-populates** with new products discovered via web scraping
5. **Supports location-based pricing** via zipCode filtering

---

## Data Source

### Seed Data: `material_normalized.xlsx`

| Column | Description |
|--------|-------------|
| `item_name` | Normalized product name |
| `description` | Rich description for LLM matching |
| `lowes link` | Direct Lowe's product URL |
| `lowes price` | Current Lowe's price |
| `home depot link` | Direct Home Depot product URL |
| `home depot price` | Current Home Depot price |
| `alias` | Comma-separated search aliases |

**Initial seed**: 37 products across categories (Framing, Drywall, Trim, Painting, Waterproofing, Electrical, etc.)

**Seed zipCode**: All initial data uses `78745` (Austin, TX)

---

## Firestore Schema

### Collection: `/globalMaterials/{materialId}`

Document ID format: `{normalizedName}_{zipCode}`

Example: `2x4-spf-stud-92-5-8-in-8-ft-wall_78745`

```typescript
interface GlobalMaterial {
  // ============ IDENTIFICATION ============
  id: string;                      // Document ID (normalizedName_zipCode)
  name: string;                    // Original item name from seed data
  normalizedName: string;          // URL-safe normalized name (for grouping across zipCodes)
  description: string;             // Rich description for LLM matching
  aliases: string[];               // Array of search terms that match this product

  // ============ LOCATION ============
  zipCode: string;                 // Location for price data (e.g., "78745")

  // ============ RETAILER DATA ============
  retailers: {
    lowes?: RetailerInfo;
    homeDepot?: RetailerInfo;
  };

  // ============ METADATA ============
  createdAt: number;               // Timestamp of creation
  updatedAt: number;               // Timestamp of last update
  matchCount: number;              // Number of times this was matched in comparisons
  source: 'seed' | 'scraped';      // Origin of the data
}

interface RetailerInfo {
  productUrl: string;              // Direct product URL
  productId: string;               // Extracted from URL
  price: number;                   // Price in USD
  priceUpdatedAt: number;          // When price was last fetched
  imageUrl?: string;               // Product image (optional)
  brand?: string;                  // Brand name (optional)
}
```

### Example Document

```json
{
  "id": "2x4-spf-stud-92-5-8-in-8-ft-wall_78745",
  "name": "2x4 SPF Stud, 92-5/8 in (8 ft wall)",
  "normalizedName": "2x4-spf-stud-92-5-8-in-8-ft-wall",
  "description": "Spruce-pine-fir framing stud for standard 8-foot wall construction. Lightweight, easy to cut and nail. Accepts paint or stain.",
  "aliases": [
    "2x4",
    "framing stud",
    "wall stud",
    "dimensional lumber",
    "wood stud",
    "precut stud",
    "8 foot stud",
    "spf stud"
  ],
  "zipCode": "78745",
  "retailers": {
    "lowes": {
      "productUrl": "https://www.lowes.com/pd/Common-2-in-x-4-in-x-10-Ft-Actual-1-5-in-x-3-5-in-x-10-Ft-Stud/5014027045",
      "productId": "5014027045",
      "price": 6.48,
      "priceUpdatedAt": 1734012345678
    },
    "homeDepot": {
      "productUrl": "https://www.homedepot.com/p/2-in-x-4-in-x-8-ft-2-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-106147/206970948",
      "productId": "206970948",
      "price": 3.48,
      "priceUpdatedAt": 1734012345678
    }
  },
  "createdAt": 1734012345678,
  "updatedAt": 1734012345678,
  "matchCount": 0,
  "source": "seed"
}
```

---

## Price Comparison Flow

### Updated Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  User requests price comparison                                  │
│  Product: "2x4 studs"                                           │
│  ZipCode: "78745" (or undefined → defaults to "78745")          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Search Global Materials Database                        │
│                                                                  │
│  Query:                                                          │
│    - WHERE zipCode == "78745"                                    │
│    - AND aliases array-contains "2x4 studs" (lowercase)         │
│                                                                  │
│  Returns: Candidate matches (0 to N)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
    Candidates found        No candidates
          │                       │
          ▼                       │
┌──────────────────────┐          │
│  STEP 2: LLM         │          │
│  Validation          │          │
│                      │          │
│  "Is '2x4 SPF Stud'  │          │
│   the same as        │          │
│   '2x4 studs'?"      │          │
│                      │          │
│  Returns:            │          │
│  - confidence (0-1)  │          │
│  - reasoning         │          │
└──────────┬───────────┘          │
           │                      │
    ┌──────┴──────┐               │
    │             │               │
confidence    confidence          │
  >= 0.8        < 0.8             │
    │             │               │
    ▼             └───────┬───────┘
┌──────────────┐          │
│  STEP 3a:    │          ▼
│  USE CACHE   │  ┌────────────────────────────────────────┐
│              │  │  STEP 3b: Web Scraping Fallback        │
│  Return      │  │                                        │
│  cached      │  │  - Call Unwrangle API (Home Depot)     │
│  prices      │  │  - Call SerpAPI (Lowe's)               │
│              │  │  - LLM selects best match              │
│  No API      │  │                                        │
│  calls!      │  │  STEP 4: Auto-populate Database        │
└──────────────┘  │                                        │
                  │  - Save successful match to            │
                  │    globalMaterials collection          │
                  │  - Add search term to aliases          │
                  │  - Future searches will find it        │
                  └────────────────────────────────────────┘
```

### ZipCode Handling

| User Input | Effective ZipCode | Behavior |
|------------|-------------------|----------|
| `zipCode: "90210"` | `90210` | Search for 90210-specific prices |
| `zipCode: undefined` | `78745` | Use default (seed data location) |
| `zipCode: ""` | `78745` | Use default |
| `zipCode: null` | `78745` | Use default |

**Default ZipCode Constant:**
```typescript
const DEFAULT_ZIPCODE = '78745';
```

---

## Implementation Details

### Phase 1: Types & Schema

**File: `collabcanvas/functions/src/types/globalMaterials.ts`**

```typescript
export const DEFAULT_ZIPCODE = '78745';

export interface RetailerInfo {
  productUrl: string;
  productId: string;
  price: number;
  priceUpdatedAt: number;
  imageUrl?: string;
  brand?: string;
}

export interface GlobalMaterial {
  id: string;
  name: string;
  normalizedName: string;
  description: string;
  aliases: string[];
  zipCode: string;
  retailers: {
    lowes?: RetailerInfo;
    homeDepot?: RetailerInfo;
  };
  createdAt: number;
  updatedAt: number;
  matchCount: number;
  source: 'seed' | 'scraped';
}
```

### Phase 2: CRUD Operations

**File: `collabcanvas/functions/src/globalMaterials.ts`**

```typescript
/**
 * Normalize a product name into a URL-safe key
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars except hyphens
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .substring(0, 100);            // Max length for Firestore doc ID
}

/**
 * Generate document ID from name and zipCode
 */
export function generateMaterialId(name: string, zipCode: string): string {
  return `${normalizeProductName(name)}_${zipCode}`;
}

/**
 * Search global materials database
 * Returns candidates matching the search query for the given zipCode
 */
export async function findInGlobalMaterials(
  db: FirebaseFirestore.Firestore,
  searchQuery: string,
  zipCode?: string
): Promise<GlobalMaterial[]> {
  const effectiveZipCode = zipCode || DEFAULT_ZIPCODE;
  const normalizedQuery = searchQuery.toLowerCase().trim();

  // Query by zipCode and aliases
  const snapshot = await db.collection('globalMaterials')
    .where('zipCode', '==', effectiveZipCode)
    .where('aliases', 'array-contains', normalizedQuery)
    .limit(5)
    .get();

  return snapshot.docs.map(doc => doc.data() as GlobalMaterial);
}

/**
 * Save a new material or update existing
 */
export async function saveToGlobalMaterials(
  db: FirebaseFirestore.Firestore,
  material: Omit<GlobalMaterial, 'id' | 'createdAt' | 'updatedAt' | 'matchCount'>,
  searchQuery: string
): Promise<void> {
  const id = generateMaterialId(material.name, material.zipCode);
  const docRef = db.collection('globalMaterials').doc(id);

  const existingDoc = await docRef.get();
  const now = Date.now();

  if (existingDoc.exists) {
    // Update existing: merge aliases, increment matchCount
    const existing = existingDoc.data() as GlobalMaterial;
    const updatedAliases = Array.from(new Set([
      ...existing.aliases,
      searchQuery.toLowerCase()
    ]));

    await docRef.update({
      aliases: updatedAliases,
      retailers: material.retailers,
      updatedAt: now,
      matchCount: (existing.matchCount || 0) + 1
    });
  } else {
    // Create new document
    const newMaterial: GlobalMaterial = {
      ...material,
      id,
      aliases: [...material.aliases, searchQuery.toLowerCase()],
      createdAt: now,
      updatedAt: now,
      matchCount: 1
    };

    await docRef.set(newMaterial);
  }
}
```

### Phase 3: LLM Validation

**File: `collabcanvas/functions/src/globalMaterials.ts` (continued)**

```typescript
/**
 * Use LLM to validate if a global material matches the search query
 */
export async function validateGlobalMatch(
  searchQuery: string,
  candidate: GlobalMaterial
): Promise<{ confidence: number; reasoning: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { confidence: 0.5, reasoning: 'OpenAI not configured' };
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Is this product a good match for the search query?

Search Query: "${searchQuery}"

Product from Database:
- Name: ${candidate.name}
- Description: ${candidate.description}
- Aliases: ${candidate.aliases.join(', ')}

Consider:
1. Is this the same type of product?
2. Would someone searching for "${searchQuery}" want this product?
3. Are the specifications compatible?

Return ONLY JSON: { "confidence": number (0-1), "reasoning": "brief explanation" }`
    }],
    temperature: 0.1,
  });

  // Parse response...
  return { confidence, reasoning };
}
```

### Phase 4: Seed Script

**File: `collabcanvas/functions/src/seedGlobalMaterials.ts`**

```typescript
import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';
import { GlobalMaterial, DEFAULT_ZIPCODE } from './types/globalMaterials';
import { normalizeProductName, generateMaterialId } from './globalMaterials';

interface SeedRow {
  item_name: string;
  description: string;
  'lowes link': string;
  'lowes price': number;
  'home depot link': string;
  'home depot price': number;
  alias: string;
}

function extractProductId(url: string, retailer: 'lowes' | 'homeDepot'): string {
  if (retailer === 'lowes') {
    // https://www.lowes.com/pd/.../.../5014027045 -> 5014027045
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : '';
  } else {
    // https://www.homedepot.com/p/.../206970948 -> 206970948
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : '';
  }
}

export async function seedGlobalMaterials(xlsxPath: string): Promise<void> {
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: SeedRow[] = XLSX.utils.sheet_to_json(sheet);

  const db = admin.firestore();
  const batch = db.batch();
  const now = Date.now();

  for (const row of rows) {
    const id = generateMaterialId(row.item_name, DEFAULT_ZIPCODE);
    const docRef = db.collection('globalMaterials').doc(id);

    const material: GlobalMaterial = {
      id,
      name: row.item_name,
      normalizedName: normalizeProductName(row.item_name),
      description: row.description,
      aliases: row.alias.split(',').map(a => a.trim().toLowerCase()),
      zipCode: DEFAULT_ZIPCODE,
      retailers: {
        lowes: {
          productUrl: row['lowes link'],
          productId: extractProductId(row['lowes link'], 'lowes'),
          price: row['lowes price'],
          priceUpdatedAt: now
        },
        homeDepot: {
          productUrl: row['home depot link'],
          productId: extractProductId(row['home depot link'], 'homeDepot'),
          price: row['home depot price'],
          priceUpdatedAt: now
        }
      },
      createdAt: now,
      updatedAt: now,
      matchCount: 0,
      source: 'seed'
    };

    batch.set(docRef, material);
  }

  await batch.commit();
  console.log(`Seeded ${rows.length} materials to globalMaterials collection`);
}
```

### Phase 5: Update Price Comparison

**File: `collabcanvas/functions/src/priceComparison.ts` (modifications)**

```typescript
import {
  findInGlobalMaterials,
  validateGlobalMatch,
  saveToGlobalMaterials,
  DEFAULT_ZIPCODE
} from './globalMaterials';

const GLOBAL_MATCH_CONFIDENCE_THRESHOLD = 0.8;

async function compareOneProduct(
  productName: string,
  zipCode?: string,
  db?: FirebaseFirestore.Firestore
): Promise<ComparisonResult> {
  const firestoreDb = db || getFirestore();
  const effectiveZipCode = zipCode || DEFAULT_ZIPCODE;

  console.log(`[PRICE_COMPARISON] Comparing "${productName}" for zipCode: ${effectiveZipCode}`);

  // ========== STEP 1: Search Global Materials ==========
  const globalCandidates = await findInGlobalMaterials(
    firestoreDb,
    productName,
    effectiveZipCode
  );

  if (globalCandidates.length > 0) {
    // ========== STEP 2: LLM Validation ==========
    const bestCandidate = globalCandidates[0];
    const { confidence, reasoning } = await validateGlobalMatch(productName, bestCandidate);

    if (confidence >= GLOBAL_MATCH_CONFIDENCE_THRESHOLD) {
      // ========== STEP 3a: Use Cached Data ==========
      console.log(`[PRICE_COMPARISON] Global DB HIT for "${productName}" (confidence: ${confidence})`);

      // Increment match count (fire-and-forget)
      firestoreDb.collection('globalMaterials').doc(bestCandidate.id).update({
        matchCount: admin.firestore.FieldValue.increment(1),
        updatedAt: Date.now()
      }).catch(() => {});

      return buildResultFromGlobalMaterial(bestCandidate, productName, confidence, reasoning);
    }

    console.log(`[PRICE_COMPARISON] Global DB confidence too low (${confidence}), falling back to API`);
  }

  // ========== STEP 3b: Fallback to Web Scraping ==========
  const matches: Record<Retailer, MatchResult> = {} as Record<Retailer, MatchResult>;

  // ... existing API scraping logic ...

  // ========== STEP 4: Auto-populate Global Materials ==========
  // After successful scrape, save to globalMaterials for future use
  await autoPopulateGlobalMaterials(firestoreDb, productName, effectiveZipCode, matches);

  return {
    originalProductName: productName,
    matches,
    bestPrice: determineBestPrice(matches),
    comparedAt: Date.now(),
  };
}

/**
 * Convert a GlobalMaterial document to a ComparisonResult
 */
function buildResultFromGlobalMaterial(
  material: GlobalMaterial,
  originalQuery: string,
  confidence: number,
  reasoning: string
): ComparisonResult {
  const matches: Record<Retailer, MatchResult> = {
    homeDepot: {
      selectedProduct: material.retailers.homeDepot ? {
        id: material.retailers.homeDepot.productId,
        name: material.name,
        brand: material.retailers.homeDepot.brand || null,
        price: material.retailers.homeDepot.price,
        currency: 'USD',
        url: material.retailers.homeDepot.productUrl,
        imageUrl: material.retailers.homeDepot.imageUrl || null,
        retailer: 'homeDepot'
      } : null,
      confidence,
      reasoning: `[GLOBAL_DB] ${reasoning}`,
      searchResultsCount: 0
    },
    lowes: {
      selectedProduct: material.retailers.lowes ? {
        id: material.retailers.lowes.productId,
        name: material.name,
        brand: material.retailers.lowes.brand || null,
        price: material.retailers.lowes.price,
        currency: 'USD',
        url: material.retailers.lowes.productUrl,
        imageUrl: material.retailers.lowes.imageUrl || null,
        retailer: 'lowes'
      } : null,
      confidence,
      reasoning: `[GLOBAL_DB] ${reasoning}`,
      searchResultsCount: 0
    }
  };

  return {
    originalProductName: originalQuery,
    matches,
    bestPrice: determineBestPrice(matches),
    comparedAt: Date.now()
  };
}
```

---

## Firestore Security Rules

**Add to `collabcanvas/firestore.rules`:**

```javascript
// Global Materials Database - shared cache across all users
match /globalMaterials/{materialId} {
  // Any authenticated user can read
  allow read: if request.auth != null;

  // Any authenticated user can write (for auto-population)
  // In production, consider restricting writes to Cloud Functions only
  allow write: if request.auth != null;
}
```

---

## Firestore Indexes

**Add to `collabcanvas/firestore.indexes.json`:**

```json
{
  "indexes": [
    {
      "collectionGroup": "globalMaterials",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "zipCode", "order": "ASCENDING" },
        { "fieldPath": "aliases", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "globalMaterials",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "zipCode", "order": "ASCENDING" },
        { "fieldPath": "normalizedName", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `functions/src/types/globalMaterials.ts` | **CREATE** | TypeScript interfaces and constants |
| `functions/src/globalMaterials.ts` | **CREATE** | CRUD operations, search, LLM validation |
| `functions/src/seedGlobalMaterials.ts` | **CREATE** | One-time seed script for Excel data |
| `functions/src/priceComparison.ts` | **MODIFY** | Integrate global DB lookup before API calls |
| `firestore.rules` | **MODIFY** | Add rules for globalMaterials collection |
| `firestore.indexes.json` | **MODIFY** | Add composite indexes for efficient queries |

---

## API Cost Savings Projection

| Scenario | Current (API-first) | New (Cache-first) | Savings |
|----------|--------------------|--------------------|---------|
| 10 products, first run | 20 API calls | 20 API calls | 0% |
| 10 products, repeat (same zipCode) | 20 API calls | ~4 API calls | 80% |
| 100 products, mature database | 200 API calls | ~20-40 API calls | 80-90% |

**Note**: Savings improve over time as more products and zipCodes are populated.

---

## Testing Strategy

1. **Unit Tests**: Test normalization, ID generation, query building
2. **Integration Tests**: Test full flow with Firestore emulator
3. **Manual Testing**:
   - Seed database with Excel data
   - Run price comparison for known products (should hit cache)
   - Run price comparison for unknown products (should scrape and save)
   - Verify new products appear in globalMaterials

---

## Rollout Plan

### Step 1: Create Infrastructure
- Create type definitions
- Implement CRUD operations
- Add Firestore rules and indexes

### Step 2: Seed Database
- Run seed script with Excel data
- Verify 37 products created with zipCode 78745

### Step 3: Update Price Comparison
- Add global DB lookup as first step
- Implement fallback to existing scraping
- Add auto-population after successful scrapes

### Step 4: Deploy & Monitor
- Deploy to Firebase
- Monitor cache hit rates
- Track API cost reduction

---

## Future Enhancements

1. **Price Refresh Job**: Scheduled function to update stale prices (>7 days)
2. **Fuzzy Search**: Implement fuzzy matching for typos/variations
3. **Category Filtering**: Add category field for narrower searches
4. **Price History**: Track price changes over time
5. **Admin UI**: Dashboard to manage global materials

---

## Appendix: Seed Data Summary

**Total Products**: 37

**Categories**:
- Framing (2)
- Drywall (4)
- Trim (1)
- Painting (1)
- Waterproofing (4)
- Shower components (3)
- Tile products (6)
- Electrical (5)
- Plumbing (4)
- Cabinet Painting (3)
- Safety (1)
- Sealants (2)

**Price Range**: $0.58 (tile) to $149.87 (shower tray)

**Default ZipCode**: 78745 (Austin, TX)
