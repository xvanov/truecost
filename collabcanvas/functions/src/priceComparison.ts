import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import OpenAI from 'openai';
// Global Materials Database imports
import {
  findInGlobalMaterials,
  selectBestGlobalMatch,
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
// Load .env.local first (higher priority), then .env as fallback
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Log environment variable loading status
if (process.env.NODE_ENV !== 'production') {
  console.log('[PRICE_COMPARISON] Environment check:');
  console.log('[PRICE_COMPARISON] - SERP_API_KEY:', process.env.SERP_API_KEY ? 'SET' : 'NOT SET');
  console.log('[PRICE_COMPARISON] - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
}

function initFirebaseAdmin(): void {
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
}

function getDb(): Firestore {
  if (!_db) {
    initializeEnv();
    initFirebaseAdmin();
    _db = getFirestore();
  }
  return _db;
}

// ============ TYPES (duplicated - can't import from src/) ============

type Retailer = 'homeDepot' | 'lowes';
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

// ============ CONSTANTS ============

// SerpApi merchant filters for Google Shopping
const SERPAPI_MERCHANTS: Record<Retailer, RegExp> = {
  homeDepot: /home\s*depot/i,
  lowes: /lowe'?s/i,
};

const RETAILERS: Retailer[] = ['homeDepot', 'lowes'];

const SERPAPI_TIMEOUT_MS = 30000;

// ============ SERPAPI GOOGLE SHOPPING ============

/**
 * Fetch products from SerpApi Google Shopping for a specific retailer
 * Filters results by merchant name pattern
 */
async function fetchFromSerpApi(
  productName: string,
  retailer: Retailer
): Promise<unknown[]> {
  initializeEnv();
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.error('[PRICE_COMPARISON] SERP_API_KEY not configured');
    throw new Error('SERP_API_KEY not configured');
  }

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: productName,
    api_key: apiKey,
    gl: 'us',
    hl: 'en',
    num: '40',
  });

  const url = `https://serpapi.com/search?${params}`;
  console.log(`[PRICE_COMPARISON] SerpApi: "${productName}" for ${retailer}`);

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

    // Log raw response for debugging
    console.log(`[PRICE_COMPARISON] SerpApi raw response keys:`, Object.keys(data));
    if (allResults.length > 0) {
      console.log(`[PRICE_COMPARISON] SerpApi first result sample:`, JSON.stringify(allResults[0]).substring(0, 500));
    } else {
      console.log(`[PRICE_COMPARISON] SerpApi NO shopping_results found. Full response:`, JSON.stringify(data).substring(0, 1000));
    }

    // Filter results by merchant pattern
    const merchantPattern = SERPAPI_MERCHANTS[retailer];
    const filteredResults = allResults.filter((result: Record<string, unknown>) => {
      const source = String(result.source || '');
      const matches = merchantPattern.test(source);
      if (!matches && allResults.length > 0) {
        console.log(`[PRICE_COMPARISON] Filtering out "${source}" (not matching ${retailer})`);
      }
      return matches;
    });

    console.log(`[PRICE_COMPARISON] SerpApi: ${allResults.length} total -> ${filteredResults.length} from ${retailer}`);
    return filteredResults;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[PRICE_COMPARISON] SerpApi timeout for ${retailer}`);
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

  initializeEnv();
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
 * Normalize SerpApi Google Shopping product data
 * SerpApi returns: { title, link, source, price, extracted_price, thumbnail, product_id }
 */
function normalizeSerpApiProduct(rawProduct: unknown, retailer: Retailer): RetailerProduct | null {
  if (!rawProduct || typeof rawProduct !== 'object') {
    console.log(`[PRICE_COMPARISON] normalizeSerpApiProduct: invalid rawProduct`);
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

  console.log(`[PRICE_COMPARISON] normalizeSerpApiProduct: id=${id}, name=${name.substring(0, 50)}, price=${price}, url=${url ? 'yes' : 'no'}`);

  if (!id || !name || price <= 0) {
    console.log(`[PRICE_COMPARISON] normalizeSerpApiProduct: REJECTED - missing id=${!id}, name=${!name}, price=${price <= 0}`);
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
 * Fetch products from SerpApi Google Shopping for a retailer
 */
async function fetchForRetailer(
  productName: string,
  retailer: Retailer
): Promise<{ results: unknown[]; normalizer: (p: unknown, r: Retailer) => RetailerProduct | null }> {
  const results = await fetchFromSerpApi(productName, retailer);
  return { results, normalizer: normalizeSerpApiProduct };
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
 * Generate aliases and description for a product using LLM
 * This helps improve future matching by creating multiple search terms
 */
async function generateProductMetadata(
  productName: string,
  originalQuery: string,
  brand?: string | null
): Promise<{ aliases: string[]; description: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[PRICE_COMPARISON] No OPENAI_API_KEY - using basic aliases');
    return {
      aliases: [originalQuery.toLowerCase().trim()],
      description: productName,
    };
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `For this construction/home improvement product, generate search aliases and a brief description.

Product Name: "${productName}"
${brand ? `Brand: ${brand}` : ''}
Original Search Query: "${originalQuery}"

Generate:
1. 5-10 common search terms/aliases people might use to find this product (lowercase, no special chars)
   - Include abbreviations, common misspellings, generic terms, size variations
   - Include the original query words
2. A brief 1-sentence description of what this product is and its common use

Return ONLY JSON: { "aliases": ["alias1", "alias2", ...], "description": "brief description" }`
      }],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const aliases = Array.isArray(parsed.aliases)
      ? parsed.aliases.map((a: string) => a.toLowerCase().trim()).filter((a: string) => a.length > 1)
      : [originalQuery.toLowerCase().trim()];

    // Always include the original query
    if (!aliases.includes(originalQuery.toLowerCase().trim())) {
      aliases.push(originalQuery.toLowerCase().trim());
    }

    console.log(`[PRICE_COMPARISON] Generated ${aliases.length} aliases for "${productName}"`);

    return {
      aliases,
      description: parsed.description || productName,
    };
  } catch (err) {
    console.warn('[PRICE_COMPARISON] Failed to generate product metadata:', err);
    return {
      aliases: [originalQuery.toLowerCase().trim()],
      description: productName,
    };
  }
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
  const brand = hdMatch?.brand || lowesMatch?.brand;

  try {
    // Generate LLM-powered aliases and description for better future matching
    const { aliases, description } = await generateProductMetadata(
      canonicalName,
      productName,
      brand
    );

    await saveToGlobalMaterials(
      db,
      {
        name: canonicalName,
        normalizedName: normalizeProductName(canonicalName),
        description,
        aliases,
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
    console.log(`[PRICE_COMPARISON] Auto-populated global materials for "${productName}" with ${aliases.length} aliases`);
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
  const firestoreDb = db || getDb();

  // ========== STEP 1: Check Global Materials Database (FR16) ==========
  try {
    const globalCandidates = await findInGlobalMaterials(firestoreDb, productName, effectiveZipCode);
    console.log(`[PRICE_COMPARISON] Global materials search returned ${globalCandidates.length} candidates`);

    if (globalCandidates.length > 0) {
      // ========== STEP 2: LLM Selection from candidates (FR11-FR15) ==========
      const { candidate: bestCandidate, confidence, reasoning } = await selectBestGlobalMatch(productName, globalCandidates);

      if (bestCandidate) {
        console.log(`[PRICE_COMPARISON] Global DB validation: "${productName}" vs "${bestCandidate.name}" -> confidence: ${confidence.toFixed(2)}`);

        if (confidence >= GLOBAL_MATCH_CONFIDENCE_THRESHOLD) {
          // Check if the cached material actually has retailer pricing data
          const hasRetailerData = bestCandidate.retailers &&
            (bestCandidate.retailers.homeDepot?.price || bestCandidate.retailers.lowes?.price);

          if (hasRetailerData) {
            // ========== STEP 3a: Use Global Cache (FR17-FR19) ==========
            console.log(`[PRICE_COMPARISON] GLOBAL_DB HIT for "${productName}" (confidence: ${confidence.toFixed(2)})`);

            // FR18: Increment match count (fire-and-forget)
            incrementMatchCount(firestoreDb, bestCandidate.id);

            // FR17, FR34-FR35: Return cached pricing immediately
            return buildResultFromGlobalMaterial(bestCandidate, productName, confidence, reasoning);
          } else {
            console.log(`[PRICE_COMPARISON] Global DB match found but no retailer pricing data cached, falling back to API`);
          }
        }

        console.log(`[PRICE_COMPARISON] Global DB confidence too low (${confidence.toFixed(2)} < ${GLOBAL_MATCH_CONFIDENCE_THRESHOLD}), falling back to API`);
      } else {
        console.log(`[PRICE_COMPARISON] LLM found no good match among ${globalCandidates.length} candidates`);
      }
    } else {
      console.log(`[PRICE_COMPARISON] No global materials found for "${productName}" in zipCode ${effectiveZipCode}`);
    }
  } catch (err) {
    console.warn(`[PRICE_COMPARISON] Global materials lookup error:`, err);
    // Continue to API fallback
  }

  // ========== STEP 2: API Fallback ==========
  // Process each retailer via external APIs
  const retailerResults = await Promise.all(
    RETAILERS.map(async (retailer) => {
      try {
        const { results, normalizer } = await fetchForRetailer(productName, retailer);
        const match = await selectBestMatch(productName, results, retailer);

        let selectedProduct: RetailerProduct | null = null;
        if (match.index >= 0 && results[match.index]) {
          selectedProduct = normalizer(results[match.index], retailer);
        }

        return {
          retailer,
          match: {
            selectedProduct,
            confidence: match.confidence,
            reasoning: match.reasoning,
            searchResultsCount: results.length,
          },
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

  console.log(`[PRICE_COMPARISON] Completed comparison for "${productName}". Best price: ${bestPrice ? `$${bestPrice.product.price} at ${bestPrice.retailer}` : 'none'}`);

  // ========== STEP 3: Auto-populate Global Materials ==========
  // Save successful API results to global materials for future cache hits
  // Fire-and-forget: don't block on auto-population
  autoPopulateGlobalMaterials(firestoreDb, productName, effectiveZipCode, matches)
    .catch(err => console.warn(`[PRICE_COMPARISON] Auto-populate error:`, err));

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
  secrets: ['OPENAI_API_KEY', 'SERP_API_KEY'], // Grant access to secrets for LLM matching and SerpApi
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

  const db = getDb();
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
