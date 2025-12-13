import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import OpenAI from 'openai';
// Global Materials Database imports
import {
  findInGlobalMaterials,
  validateGlobalMatch,
  saveToGlobalMaterials,
  incrementMatchCount,
  normalizeProductName,
  DEFAULT_ZIPCODE,
  GLOBAL_MATCH_CONFIDENCE_THRESHOLD,
} from './globalMaterials';
import { GlobalMaterial } from './types/globalMaterials';
// Using cors: true to match other functions (aiCommand, materialEstimateCommand, sagemakerInvoke)
// This supports Firebase preview channel URLs which have dynamic hostnames

// Load environment variables - try multiple locations
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Log environment variable loading status
if (process.env.NODE_ENV !== 'production') {
  console.log('[PRICE_COMPARISON] Environment check:');
  console.log('[PRICE_COMPARISON] - UNWRANGLE_API_KEY:', process.env.UNWRANGLE_API_KEY ? 'SET' : 'NOT SET');
  console.log('[PRICE_COMPARISON] - SERP_API_KEY:', process.env.SERP_API_KEY ? 'SET' : 'NOT SET');
  console.log('[PRICE_COMPARISON] - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
}

// Initialize admin if not already
try {
  admin.app();
} catch {
  admin.initializeApp();
}

// Configure Firestore to use emulator if running locally
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('[PRICE_COMPARISON] Using Firestore emulator:', process.env.FIRESTORE_EMULATOR_HOST);
} else if (process.env.NODE_ENV === 'development' && !process.env.FUNCTIONS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
  console.log('[PRICE_COMPARISON] Local development detected - setting FIRESTORE_EMULATOR_HOST to 127.0.0.1:8081');
}

// ============ TYPES (duplicated - can't import from src/) ============

type Retailer = 'homeDepot' | 'lowes' | 'aceHardware';
type ComparisonStatus = 'processing' | 'complete' | 'error';

interface CompareRequest {
  projectId: string;
  productNames: string[];
  forceRefresh?: boolean;
  zipCode?: string;
}

interface RetailerProduct {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  retailer: Retailer;
}

interface MatchResult {
  selectedProduct: RetailerProduct | null;
  confidence: number;
  reasoning: string;
  searchResultsCount: number;
}

interface ComparisonResult {
  originalProductName: string;
  matches: Record<Retailer, MatchResult>;
  bestPrice: { retailer: Retailer; product: RetailerProduct; savings: number } | null;
  comparedAt: number;
}

// ============ CACHE TYPES ============

/**
 * Cached product data stored globally by retailer
 */
interface CachedProduct {
  product: RetailerProduct;
  searchQueries: string[];
  lastUpdated: number;
  matchCount: number;
  originalSearchTerm: string;
}

// CacheLookupResult interface reserved for future use (tracking cache hits/misses)

// ============ CONSTANTS ============

// Unwrangle platforms (for Home Depot)
const UNWRANGLE_PLATFORMS: Partial<Record<Retailer, string>> = {
  homeDepot: 'homedepot_search',
};

// SerpApi site filters for Google Shopping (for Lowe's)
const SERPAPI_SITES: Partial<Record<Retailer, string>> = {
  lowes: 'lowes.com',
};

// Active retailers - Home Depot via Unwrangle, Lowe's via SerpApi Google Shopping
// aceHardware removed - no reliable API available
const RETAILERS: Retailer[] = ['homeDepot', 'lowes'];

const UNWRANGLE_TIMEOUT_MS = 30000;
const SERPAPI_TIMEOUT_MS = 30000;

// Cache configuration
const CACHE_CONFIDENCE_THRESHOLD = 0.8;

// ============ CACHE UTILITIES ============

/**
 * Normalize product name for cache key
 * Lowercase, remove special chars, collapse whitespace, max 100 chars
 */
export function normalizeCacheKey(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-')        // Replace whitespace with hyphens
    .substring(0, 100);          // Max 100 chars for Firestore doc ID
}

/**
 * Check product cache for a potential match
 * First tries exact normalized key match, then searches by searchQueries array
 */
async function findInProductCache(
  db: FirebaseFirestore.Firestore,
  retailer: Retailer,
  searchQuery: string
): Promise<{ cachedProduct: CachedProduct | null; docId: string | null }> {
  const normalizedKey = normalizeCacheKey(searchQuery);
  const cacheRef = db.collection('productCache').doc(retailer).collection('products');

  console.log(`[PRICE_COMPARISON] Cache lookup for "${searchQuery}" (key: ${normalizedKey}) in ${retailer}`);

  // Try 1: Exact match by normalized key
  const exactDoc = await cacheRef.doc(normalizedKey).get();
  if (exactDoc.exists) {
    const data = exactDoc.data() as CachedProduct;
    console.log(`[PRICE_COMPARISON] Cache HIT (exact key match) for "${searchQuery}" in ${retailer}`);
    return { cachedProduct: data, docId: exactDoc.id };
  }

  // Try 2: Search by searchQueries array-contains
  const querySnapshot = await cacheRef
    .where('searchQueries', 'array-contains', searchQuery.toLowerCase())
    .limit(1)
    .get();

  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    const data = doc.data() as CachedProduct;
    console.log(`[PRICE_COMPARISON] Cache HIT (searchQueries match) for "${searchQuery}" in ${retailer}`);
    return { cachedProduct: data, docId: doc.id };
  }

  console.log(`[PRICE_COMPARISON] Cache MISS for "${searchQuery}" in ${retailer}`);
  return { cachedProduct: null, docId: null };
}

/**
 * Use LLM to assess if cached product matches search query
 */
async function assessCacheMatchConfidence(
  searchQuery: string,
  cachedProduct: CachedProduct
): Promise<{ confidence: number; reasoning: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[PRICE_COMPARISON] OPENAI_API_KEY not configured for cache confidence');
    return { confidence: 0.5, reasoning: 'OpenAI not configured - using moderate confidence' };
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Is this cached product a good match for the search query?

Search Query: "${searchQuery}"

Cached Product:
- Name: ${cachedProduct.product.name}
- Brand: ${cachedProduct.product.brand || 'N/A'}
- Price: $${cachedProduct.product.price}
- Original Search Term: "${cachedProduct.originalSearchTerm}"

Consider:
1. Is this the same type of product?
2. Are specifications likely compatible?
3. Would a user searching for "${searchQuery}" want this product?

Return ONLY JSON: { "confidence": number (0-1), "reasoning": "brief explanation" }`
      }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '{}';
    console.log(`[PRICE_COMPARISON] Cache confidence response: ${content.substring(0, 100)}...`);

    // Parse response (reuse existing parsing logic pattern)
    const cleaned = content
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch {
      console.warn('[PRICE_COMPARISON] Cache confidence JSON parse failed');
      return { confidence: 0.5, reasoning: 'JSON parse failed - using moderate confidence' };
    }
  } catch (err) {
    console.error('[PRICE_COMPARISON] OpenAI error for cache confidence:', err);
    return { confidence: 0.5, reasoning: 'OpenAI error - using moderate confidence' };
  }
}

/**
 * Save product to cache after successful API match
 * Handles upsert: creates new entry or updates existing with merged searchQueries
 */
async function saveToProductCache(
  db: FirebaseFirestore.Firestore,
  retailer: Retailer,
  product: RetailerProduct,
  searchQuery: string
): Promise<void> {
  const normalizedKey = normalizeCacheKey(product.name);
  const docRef = db.collection('productCache').doc(retailer).collection('products').doc(normalizedKey);

  console.log(`[PRICE_COMPARISON] Saving to cache: ${retailer}/${normalizedKey}`);

  try {
    const existingDoc = await docRef.get();

    if (existingDoc.exists) {
      // Update existing entry
      const existingData = existingDoc.data() as CachedProduct;
      const updatedSearchQueries = Array.from(new Set([
        ...existingData.searchQueries,
        searchQuery.toLowerCase()
      ]));

      await docRef.update({
        product,
        searchQueries: updatedSearchQueries,
        lastUpdated: Date.now(),
        matchCount: (existingData.matchCount || 0) + 1,
      });
      console.log(`[PRICE_COMPARISON] Cache UPDATED: ${retailer}/${normalizedKey} (matchCount: ${(existingData.matchCount || 0) + 1})`);
    } else {
      // Create new entry
      const newCacheEntry: CachedProduct = {
        product,
        searchQueries: [searchQuery.toLowerCase()],
        lastUpdated: Date.now(),
        matchCount: 1,
        originalSearchTerm: searchQuery,
      };

      await docRef.set(newCacheEntry);
      console.log(`[PRICE_COMPARISON] Cache CREATED: ${retailer}/${normalizedKey}`);
    }
  } catch (err) {
    console.error(`[PRICE_COMPARISON] Cache save error for ${retailer}/${normalizedKey}:`, err);
    // Don't throw - cache failures shouldn't break the comparison
  }
}

// ============ UNWRANGLE API ============

async function fetchFromUnwrangle(
  productName: string,
  platform: string,
  zipCode?: string
): Promise<unknown[]> {
  const apiKey = process.env.UNWRANGLE_API_KEY;
  if (!apiKey) {
    console.error('[PRICE_COMPARISON] UNWRANGLE_API_KEY not configured');
    throw new Error('UNWRANGLE_API_KEY not configured');
  }

  const params = new URLSearchParams({
    platform,
    search: productName,
    api_key: apiKey,
  });
  if (zipCode) params.append('zipcode', zipCode);

  const url = `https://data.unwrangle.com/api/getter/?${params}`;
  console.log(`[PRICE_COMPARISON] Fetching from Unwrangle: platform=${platform}, search="${productName}"`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UNWRANGLE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[PRICE_COMPARISON] Unwrangle error: ${res.status} - ${errorText}`);
      return [];
    }

    const data = await res.json();
    const results = data.results || [];
    console.log(`[PRICE_COMPARISON] Unwrangle returned ${results.length} results for "${productName}" on ${platform}`);
    return results;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[PRICE_COMPARISON] Unwrangle timeout for ${platform}`);
      return [];
    }
    console.error(`[PRICE_COMPARISON] Unwrangle fetch error:`, err);
    return [];
  }
}

// ============ SERPAPI GOOGLE SHOPPING ============

// Merchant name patterns for filtering Google Shopping results
const MERCHANT_PATTERNS: Record<string, RegExp> = {
  'lowes.com': /lowe'?s/i,
};

async function fetchFromSerpApi(
  productName: string,
  merchantKey: string
): Promise<unknown[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.error('[PRICE_COMPARISON] SERP_API_KEY not configured');
    throw new Error('SERP_API_KEY not configured');
  }

  // Search Google Shopping without site filter (doesn't work for shopping)
  // We'll filter by merchant name after getting results
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: productName,
    api_key: apiKey,
    gl: 'us',
    hl: 'en',
    num: '40', // Get more results to find Lowe's products
  });

  const url = `https://serpapi.com/search?${params}`;
  console.log(`[PRICE_COMPARISON] Fetching from SerpApi Google Shopping: search="${productName}"`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERPAPI_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[PRICE_COMPARISON] SerpApi error: ${res.status} - ${errorText}`);
      return [];
    }

    const data = await res.json();
    const allResults = data.shopping_results || [];
    console.log(`[PRICE_COMPARISON] SerpApi returned ${allResults.length} total results for "${productName}"`);

    // Filter results by merchant name
    const merchantPattern = MERCHANT_PATTERNS[merchantKey];
    if (!merchantPattern) {
      console.warn(`[PRICE_COMPARISON] No merchant pattern for ${merchantKey}`);
      return [];
    }

    const filteredResults = allResults.filter((result: Record<string, unknown>) => {
      const source = String(result.source || '');
      return merchantPattern.test(source);
    });

    console.log(`[PRICE_COMPARISON] Filtered to ${filteredResults.length} results from ${merchantKey}`);
    return filteredResults;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[PRICE_COMPARISON] SerpApi timeout`);
      return [];
    }
    console.error(`[PRICE_COMPARISON] SerpApi fetch error:`, err);
    return [];
  }
}

// ============ JSON SANITIZATION ============

/**
 * Parse LLM response, handling markdown-wrapped JSON
 * GPT-4o-mini sometimes returns: ```json\n{...}\n```
 */
export function parseMatchResult(content: string): { index: number; confidence: number; reasoning: string } {
  const cleaned = content
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      index: typeof parsed.index === 'number' ? parsed.index : 0,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || 'No reasoning provided',
    };
  } catch (err) {
    // Fallback if JSON parsing fails - return no match rather than guessing
    console.warn('[PRICE_COMPARISON] JSON parse failed for content:', cleaned.substring(0, 100), 'Error:', err);
    return { index: -1, confidence: 0, reasoning: 'Fallback - no match (JSON parse failed)' };
  }
}

// ============ LLM MATCHING ============

async function selectBestMatch(
  productName: string,
  results: unknown[],
  retailer: Retailer
): Promise<{ index: number; confidence: number; reasoning: string }> {
  if (results.length === 0) {
    return { index: -1, confidence: 0, reasoning: 'No search results' };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[PRICE_COMPARISON] OPENAI_API_KEY not configured');
    return { index: 0, confidence: 0.5, reasoning: 'OpenAI not configured - defaulting to first result' };
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Given the original product: "${productName}"
And these search results from ${retailer}:
${JSON.stringify(results.slice(0, 5), null, 2)}

Select the BEST matching product (index 0-4) based on:
1. Functional equivalence
2. Specification compatibility
3. Price competitiveness

Return ONLY JSON: { "index": number, "confidence": number (0-1), "reasoning": "brief" }`
      }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '{}';
    console.log(`[PRICE_COMPARISON] LLM response for ${retailer}: ${content.substring(0, 100)}...`);
    return parseMatchResult(content);
  } catch (err) {
    console.error(`[PRICE_COMPARISON] OpenAI error for ${retailer}:`, err);
    return { index: 0, confidence: 0.5, reasoning: 'OpenAI error - defaulting to first result' };
  }
}

// ============ PRODUCT NORMALIZATION ============

/**
 * Normalize Unwrangle product data (Home Depot)
 */
function normalizeUnwrangleProduct(rawProduct: unknown, retailer: Retailer): RetailerProduct | null {
  if (!rawProduct || typeof rawProduct !== 'object') {
    return null;
  }

  const product = rawProduct as Record<string, unknown>;

  // Extract price - handle various formats
  let price = 0;
  if (typeof product.price === 'number') {
    price = product.price;
  } else if (typeof product.price === 'string') {
    const cleaned = product.price.replace(/[^0-9.]/g, '');
    price = parseFloat(cleaned) || 0;
  } else if (typeof product.sale_price === 'number') {
    price = product.sale_price;
  } else if (typeof product.sale_price === 'string') {
    const cleaned = product.sale_price.replace(/[^0-9.]/g, '');
    price = parseFloat(cleaned) || 0;
  }

  // Extract ID - various field names
  const id = String(product.id || product.product_id || product.sku || product.item_id || '');

  // Extract URL
  const url = String(product.url || product.link || product.product_url || '');

  // Extract name
  const name = String(product.name || product.title || product.product_name || '');

  if (!id || !name || price <= 0) {
    return null;
  }

  return {
    id,
    name,
    brand: product.brand ? String(product.brand) : null,
    price,
    currency: 'USD',
    url,
    imageUrl: product.image ? String(product.image) : null,
    retailer,
  };
}

/**
 * Normalize SerpApi Google Shopping product data (Lowe's)
 * SerpApi returns: { title, link, source, price, extracted_price, thumbnail, product_id }
 */
function normalizeSerpApiProduct(rawProduct: unknown, retailer: Retailer): RetailerProduct | null {
  if (!rawProduct || typeof rawProduct !== 'object') {
    return null;
  }

  const product = rawProduct as Record<string, unknown>;

  // SerpApi provides extracted_price as a number, or price as string like "$29.99"
  let price = 0;
  if (typeof product.extracted_price === 'number') {
    price = product.extracted_price;
  } else if (typeof product.price === 'string') {
    const cleaned = product.price.replace(/[^0-9.]/g, '');
    price = parseFloat(cleaned) || 0;
  }

  // SerpApi uses product_id or position as ID
  const id = String(product.product_id || product.position || '');

  // SerpApi uses link for URL
  const url = String(product.link || product.product_link || '');

  // SerpApi uses title for name
  const name = String(product.title || '');

  if (!id || !name || price <= 0) {
    return null;
  }

  return {
    id,
    name,
    brand: product.source ? String(product.source) : null, // source is usually the retailer
    price,
    currency: 'USD',
    url,
    imageUrl: product.thumbnail ? String(product.thumbnail) : null,
    retailer,
  };
}

// ============ BEST PRICE DETERMINATION ============

function determineBestPrice(
  matches: Record<Retailer, MatchResult>
): { retailer: Retailer; product: RetailerProduct; savings: number } | null {
  let bestRetailer: Retailer | null = null;
  let bestProduct: RetailerProduct | null = null;
  let lowestPrice = Infinity;
  let highestPrice = 0;

  for (const retailer of RETAILERS) {
    const match = matches[retailer];
    if (match.selectedProduct && match.selectedProduct.price > 0) {
      if (match.selectedProduct.price < lowestPrice) {
        lowestPrice = match.selectedProduct.price;
        bestRetailer = retailer;
        bestProduct = match.selectedProduct;
      }
      if (match.selectedProduct.price > highestPrice) {
        highestPrice = match.selectedProduct.price;
      }
    }
  }

  if (!bestRetailer || !bestProduct) {
    return null;
  }

  const savings = highestPrice - lowestPrice;
  return { retailer: bestRetailer, product: bestProduct, savings };
}

// ============ SINGLE PRODUCT COMPARISON ============

/**
 * Fetch products from the appropriate API based on retailer
 * - Home Depot: Unwrangle API
 * - Lowe's: SerpApi Google Shopping
 */
async function fetchForRetailer(
  productName: string,
  retailer: Retailer,
  zipCode?: string
): Promise<{ results: unknown[]; normalizer: (p: unknown, r: Retailer) => RetailerProduct | null }> {
  // Home Depot uses Unwrangle
  if (UNWRANGLE_PLATFORMS[retailer]) {
    const results = await fetchFromUnwrangle(productName, UNWRANGLE_PLATFORMS[retailer]!, zipCode);
    return { results, normalizer: normalizeUnwrangleProduct };
  }

  // Lowe's uses SerpApi Google Shopping
  if (SERPAPI_SITES[retailer]) {
    const results = await fetchFromSerpApi(productName, SERPAPI_SITES[retailer]!);
    return { results, normalizer: normalizeSerpApiProduct };
  }

  // Fallback - no API configured for this retailer
  console.warn(`[PRICE_COMPARISON] No API configured for ${retailer}`);
  return { results: [], normalizer: normalizeUnwrangleProduct };
}

/**
 * Build ComparisonResult from GlobalMaterial cache hit
 * FR34-FR36: Convert GlobalMaterial to ComparisonResult format
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
        retailer: 'homeDepot' as Retailer,
      } : null,
      confidence,
      reasoning: `[GLOBAL_DB] ${reasoning}`,
      searchResultsCount: 0, // FR36: No API call made
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
        retailer: 'lowes' as Retailer,
      } : null,
      confidence,
      reasoning: `[GLOBAL_DB] ${reasoning}`,
      searchResultsCount: 0, // FR36: No API call made
    },
    aceHardware: {
      selectedProduct: null,
      confidence: 0,
      reasoning: 'Ace Hardware not available in global materials cache',
      searchResultsCount: 0,
    },
  };

  return {
    originalProductName: originalQuery,
    matches,
    bestPrice: determineBestPrice(matches),
    comparedAt: Date.now(),
  };
}

/**
 * Auto-populate global materials after successful API scrape
 * FR23-FR26: Save successful API matches to global materials collection
 */
async function autoPopulateGlobalMaterials(
  db: FirebaseFirestore.Firestore,
  productName: string,
  zipCode: string,
  matches: Record<Retailer, MatchResult>
): Promise<void> {
  // Find the best match to use as the canonical name
  const hdMatch = matches.homeDepot?.selectedProduct;
  const lowesMatch = matches.lowes?.selectedProduct;

  // Skip if no successful matches
  if (!hdMatch && !lowesMatch) {
    console.log(`[PRICE_COMPARISON] No successful matches to auto-populate for "${productName}"`);
    return;
  }

  // Use the first available product name as canonical
  const canonicalName = hdMatch?.name || lowesMatch?.name || productName;

  try {
    await saveToGlobalMaterials(
      db,
      {
        name: canonicalName,
        normalizedName: normalizeProductName(canonicalName),
        description: '', // No description from API results
        aliases: [productName.toLowerCase().trim()],
        zipCode,
        retailers: {
          homeDepot: hdMatch ? {
            productUrl: hdMatch.url,
            productId: hdMatch.id,
            price: hdMatch.price,
            priceUpdatedAt: Date.now(),
            imageUrl: hdMatch.imageUrl || undefined,
            brand: hdMatch.brand || undefined,
          } : undefined,
          lowes: lowesMatch ? {
            productUrl: lowesMatch.url,
            productId: lowesMatch.id,
            price: lowesMatch.price,
            priceUpdatedAt: Date.now(),
            imageUrl: lowesMatch.imageUrl || undefined,
            brand: lowesMatch.brand || undefined,
          } : undefined,
        },
        source: 'scraped',
      },
      productName
    );
    console.log(`[PRICE_COMPARISON] Auto-populated global materials for "${productName}"`);
  } catch (err) {
    console.warn(`[PRICE_COMPARISON] Auto-population failed for "${productName}":`, err);
    // Non-blocking - don't throw
  }
}

async function compareOneProduct(
  productName: string,
  zipCode?: string,
  db?: FirebaseFirestore.Firestore
): Promise<ComparisonResult> {
  const matches: Record<Retailer, MatchResult> = {} as Record<Retailer, MatchResult>;
  const effectiveZipCode = zipCode || DEFAULT_ZIPCODE;

  console.log(`[PRICE_COMPARISON] Comparing product: "${productName}" (zipCode: ${effectiveZipCode})`);

  // Get Firestore instance if not provided (for cache operations)
  const firestoreDb = db || getFirestore();

  // ========== STEP 1: Check Global Materials Database (FR16) ==========
  try {
    const globalCandidates = await findInGlobalMaterials(firestoreDb, productName, effectiveZipCode);

    if (globalCandidates.length > 0) {
      // ========== STEP 2: LLM Validation (FR11-FR15) ==========
      const bestCandidate = globalCandidates[0];
      const { confidence, reasoning } = await validateGlobalMatch(productName, bestCandidate);

      console.log(`[PRICE_COMPARISON] Global DB validation: "${productName}" vs "${bestCandidate.name}" -> confidence: ${confidence.toFixed(2)}`);

      if (confidence >= GLOBAL_MATCH_CONFIDENCE_THRESHOLD) {
        // ========== STEP 3a: Use Global Cache (FR17-FR19) ==========
        console.log(`[PRICE_COMPARISON] GLOBAL_DB HIT for "${productName}" (confidence: ${confidence.toFixed(2)})`);

        // FR18: Increment match count (fire-and-forget)
        incrementMatchCount(firestoreDb, bestCandidate.id);

        // FR17, FR34-FR35: Return cached pricing immediately
        return buildResultFromGlobalMaterial(bestCandidate, productName, confidence, reasoning);
      }

      console.log(`[PRICE_COMPARISON] Global DB confidence too low (${confidence.toFixed(2)} < ${GLOBAL_MATCH_CONFIDENCE_THRESHOLD}), falling back to API/per-retailer cache`);
    } else {
      console.log(`[PRICE_COMPARISON] No global materials found for "${productName}" in zipCode ${effectiveZipCode}`);
    }
  } catch (err) {
    console.warn(`[PRICE_COMPARISON] Global materials lookup error:`, err);
    // Continue to per-retailer cache and API fallback
  }

  // ========== STEP 3b: Per-Retailer Cache + API Fallback (FR20-FR22) ==========
  // Process each retailer with cache-first strategy
  const retailerResults = await Promise.all(
    RETAILERS.map(async (retailer) => {
      try {
        // Step 1: Check cache first
        const { cachedProduct } = await findInProductCache(firestoreDb, retailer, productName);

        if (cachedProduct) {
          // Step 2: Assess cache match confidence
          const { confidence, reasoning } = await assessCacheMatchConfidence(productName, cachedProduct);

          // Step 3: If confidence >= threshold, use cached product
          if (confidence >= CACHE_CONFIDENCE_THRESHOLD) {
            console.log(`[PRICE_COMPARISON] Using CACHED product for "${productName}" from ${retailer} (confidence: ${confidence.toFixed(2)})`);
            return {
              retailer,
              match: {
                selectedProduct: cachedProduct.product,
                confidence,
                reasoning: `[CACHE HIT] ${reasoning}`,
                searchResultsCount: 0, // No API call made
              },
              fromCache: true,
            };
          } else {
            console.log(`[PRICE_COMPARISON] Cache confidence too low (${confidence.toFixed(2)} < ${CACHE_CONFIDENCE_THRESHOLD}) for "${productName}" from ${retailer}, calling API`);
          }
        }

        // Step 4: Cache miss or low confidence - call API
        const { results, normalizer } = await fetchForRetailer(productName, retailer, zipCode);
        const match = await selectBestMatch(productName, results, retailer);

        let selectedProduct: RetailerProduct | null = null;
        if (match.index >= 0 && results[match.index]) {
          selectedProduct = normalizer(results[match.index], retailer);

          // Step 5: Save to cache after successful API match
          if (selectedProduct) {
            await saveToProductCache(firestoreDb, retailer, selectedProduct, productName);
          }
        }

        return {
          retailer,
          match: {
            selectedProduct,
            confidence: match.confidence,
            reasoning: match.reasoning,
            searchResultsCount: results.length,
          },
          fromCache: false,
        };
      } catch (error) {
        console.error(`[PRICE_COMPARISON] Error for ${retailer}:`, error);
        return {
          retailer,
          match: {
            selectedProduct: null,
            confidence: 0,
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
            searchResultsCount: 0,
          },
          fromCache: false,
        };
      }
    })
  );

  // Build matches record
  for (const { retailer, match } of retailerResults) {
    matches[retailer] = match;
  }

  // Determine best price
  const bestPrice = determineBestPrice(matches);

  // Log cache usage summary
  const cacheHits = retailerResults.filter(r => r.fromCache).length;
  const apiCalls = retailerResults.filter(r => !r.fromCache).length;
  console.log(`[PRICE_COMPARISON] Completed comparison for "${productName}". Per-retailer cache hits: ${cacheHits}/${RETAILERS.length}. Best price: ${bestPrice ? `$${bestPrice.product.price} at ${bestPrice.retailer}` : 'none'}`);

  // ========== STEP 4: Auto-populate Global Materials (FR23-FR26) ==========
  // Save successful API results to global materials for future cache hits
  if (apiCalls > 0) {
    // Fire-and-forget: don't block on auto-population
    autoPopulateGlobalMaterials(firestoreDb, productName, effectiveZipCode, matches)
      .catch(err => console.warn(`[PRICE_COMPARISON] Auto-populate error:`, err));
  }

  return {
    originalProductName: productName,
    matches,
    bestPrice,
    comparedAt: Date.now(),
  };
}

// ============ MAIN CLOUD FUNCTION ============

// Export configuration for testing - changes here are detected by tests
export const comparePricesConfig = {
  cors: true,
  maxInstances: 10,
  memory: '1GiB' as const,
  timeoutSeconds: 540, // Max for 2nd gen - handles large product lists
  secrets: ['OPENAI_API_KEY'], // Grant access to OpenAI API key secret for product matching
};

export const comparePrices = onCall<{ request: CompareRequest }>(comparePricesConfig, async (req) => {
  console.log('[PRICE_COMPARISON] Function invoked');
  console.log('[PRICE_COMPARISON] Request data:', JSON.stringify(req.data));

  const { projectId, productNames, forceRefresh, zipCode } = req.data?.request || {} as CompareRequest;

  // Validate required parameters
  if (!projectId) {
    console.error('[PRICE_COMPARISON] projectId is required');
    throw new HttpsError('invalid-argument', 'projectId is required');
  }

  if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
    console.error('[PRICE_COMPARISON] productNames array is required');
    throw new HttpsError('invalid-argument', 'productNames array is required');
  }

  const db = getFirestore();
  const docRef = db.collection('projects').doc(projectId)
    .collection('priceComparison').doc('latest');

  // 1. Check for existing complete results (unless forceRefresh)
  if (!forceRefresh) {
    const existingDoc = await docRef.get();
    if (existingDoc.exists && existingDoc.data()?.status === 'complete') {
      console.log('[PRICE_COMPARISON] Returning cached results');
      return { cached: true };
    }
  }

  // 2. Initialize progress document
  await docRef.set({
    status: 'processing' as ComparisonStatus,
    totalProducts: productNames.length,
    completedProducts: 0,
    results: [],
    startedAt: Date.now(),
    createdBy: req.auth?.uid || 'anonymous',
  });

  console.log(`[PRICE_COMPARISON] Starting comparison for ${productNames.length} products`);

  const results: ComparisonResult[] = [];

  try {
    // 3. Process each product and update Firestore incrementally
    for (const productName of productNames) {
      const result = await compareOneProduct(productName, zipCode);
      results.push(result);

      // Update progress - frontend sees this via onSnapshot
      await docRef.update({
        completedProducts: results.length,
        results: results,
      });

      console.log(`[PRICE_COMPARISON] Progress: ${results.length}/${productNames.length} products completed`);
    }

    // 4. Mark complete
    await docRef.update({
      status: 'complete' as ComparisonStatus,
      completedAt: Date.now(),
    });

    console.log('[PRICE_COMPARISON] Comparison complete');
    return { cached: false };

  } catch (error) {
    // Handle errors gracefully - preserve partial results
    console.error('[PRICE_COMPARISON] Error during comparison:', error);
    await docRef.update({
      status: 'error' as ComparisonStatus,
      results: results, // Preserve any partial results completed before error
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new HttpsError('internal', 'Price comparison failed');
  }
});
