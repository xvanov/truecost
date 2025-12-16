"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comparePrices = exports.comparePricesConfig = exports.parseMatchResult = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const dotenv = require("dotenv");
const path = require("path");
const openai_1 = require("openai");
// Global Materials Database imports
const globalMaterials_1 = require("./globalMaterials");
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
// Lazy-initialized Firestore instance
let _db = null;
function initFirebaseAdmin() {
    try {
        admin.app();
    }
    catch (_a) {
        admin.initializeApp();
    }
}
function getDb() {
    if (!_db) {
        initFirebaseAdmin();
        _db = (0, firestore_1.getFirestore)();
    }
    return _db;
}
// ============ CONSTANTS ============
// SerpApi merchant filters for Google Shopping
const SERPAPI_MERCHANTS = {
    homeDepot: /home\s*depot/i,
    lowes: /lowe'?s/i,
};
const RETAILERS = ['homeDepot', 'lowes'];
const SERPAPI_TIMEOUT_MS = 30000;
// ============ SERPAPI CIRCUIT BREAKER ============
// Track if SerpAPI quota is exhausted to avoid redundant calls
let serpApiQuotaExhausted = false;
let serpApiQuotaExhaustedAt = null;
const SERPAPI_QUOTA_RESET_MS = 60 * 60 * 1000; // Reset after 1 hour
function isSerpApiAvailable() {
    if (!serpApiQuotaExhausted)
        return true;
    // Reset circuit breaker after timeout
    if (serpApiQuotaExhaustedAt && Date.now() - serpApiQuotaExhaustedAt > SERPAPI_QUOTA_RESET_MS) {
        console.log('[PRICE_COMPARISON] SerpApi circuit breaker reset');
        serpApiQuotaExhausted = false;
        serpApiQuotaExhaustedAt = null;
        return true;
    }
    return false;
}
function markSerpApiQuotaExhausted() {
    serpApiQuotaExhausted = true;
    serpApiQuotaExhaustedAt = Date.now();
    console.log('[PRICE_COMPARISON] SerpApi circuit breaker TRIPPED - quota exhausted');
}
// ============ SERPAPI GOOGLE SHOPPING ============
/**
 * Fetch products from SerpApi Google Shopping for a specific retailer
 * Filters results by merchant name pattern
 */
async function fetchFromSerpApi(productName, retailer) {
    // Check circuit breaker first
    if (!isSerpApiAvailable()) {
        console.log(`[PRICE_COMPARISON] SerpApi circuit breaker OPEN - skipping API call for "${productName}"`);
        return [];
    }
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
            // Check for quota exhaustion (429) and trip circuit breaker
            if (res.status === 429 || errorText.includes('run out of searches')) {
                markSerpApiQuotaExhausted();
            }
            return [];
        }
        const data = await res.json();
        const allResults = data.shopping_results || [];
        // Log raw response for debugging
        console.log(`[PRICE_COMPARISON] SerpApi raw response keys:`, Object.keys(data));
        if (allResults.length > 0) {
            console.log(`[PRICE_COMPARISON] SerpApi first result sample:`, JSON.stringify(allResults[0]).substring(0, 500));
        }
        else {
            console.log(`[PRICE_COMPARISON] SerpApi NO shopping_results found. Full response:`, JSON.stringify(data).substring(0, 1000));
        }
        // Filter results by merchant pattern
        const merchantPattern = SERPAPI_MERCHANTS[retailer];
        const filteredResults = allResults.filter((result) => {
            const source = String(result.source || '');
            const matches = merchantPattern.test(source);
            if (!matches && allResults.length > 0) {
                console.log(`[PRICE_COMPARISON] Filtering out "${source}" (not matching ${retailer})`);
            }
            return matches;
        });
        console.log(`[PRICE_COMPARISON] SerpApi: ${allResults.length} total -> ${filteredResults.length} from ${retailer}`);
        return filteredResults;
    }
    catch (err) {
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
function parseMatchResult(content) {
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
    }
    catch (err) {
        // Fallback if JSON parsing fails - return no match rather than guessing
        console.warn('[PRICE_COMPARISON] JSON parse failed for content:', cleaned.substring(0, 100), 'Error:', err);
        return { index: -1, confidence: 0, reasoning: 'Fallback - no match (JSON parse failed)' };
    }
}
exports.parseMatchResult = parseMatchResult;
// ============ LLM MATCHING ============
async function selectBestMatch(productName, results, retailer) {
    var _a, _b;
    if (results.length === 0) {
        return { index: -1, confidence: 0, reasoning: 'No search results' };
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('[PRICE_COMPARISON] OPENAI_API_KEY not configured');
        return { index: 0, confidence: 0.5, reasoning: 'OpenAI not configured - defaulting to first result' };
    }
    const openai = new openai_1.default({ apiKey });
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
        const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
        console.log(`[PRICE_COMPARISON] LLM response for ${retailer}: ${content.substring(0, 100)}...`);
        return parseMatchResult(content);
    }
    catch (err) {
        console.error(`[PRICE_COMPARISON] OpenAI error for ${retailer}:`, err);
        return { index: 0, confidence: 0.5, reasoning: 'OpenAI error - defaulting to first result' };
    }
}
// ============ PRODUCT NORMALIZATION ============
/**
 * Normalize SerpApi Google Shopping product data
 * SerpApi returns: { title, link, source, price, extracted_price, thumbnail, product_id }
 */
function normalizeSerpApiProduct(rawProduct, retailer) {
    if (!rawProduct || typeof rawProduct !== 'object') {
        console.log(`[PRICE_COMPARISON] normalizeSerpApiProduct: invalid rawProduct`);
        return null;
    }
    const product = rawProduct;
    // SerpApi provides extracted_price as a number, or price as string like "$29.99"
    let price = 0;
    if (typeof product.extracted_price === 'number') {
        price = product.extracted_price;
    }
    else if (typeof product.price === 'string') {
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
        brand: product.source ? String(product.source) : null,
        price,
        currency: 'USD',
        url,
        imageUrl: product.thumbnail ? String(product.thumbnail) : null,
        retailer,
    };
}
// ============ BEST PRICE DETERMINATION ============
function determineBestPrice(matches) {
    let bestRetailer = null;
    let bestProduct = null;
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
async function fetchForRetailer(productName, retailer) {
    const results = await fetchFromSerpApi(productName, retailer);
    return { results, normalizer: normalizeSerpApiProduct };
}
/**
 * Build ComparisonResult from GlobalMaterial cache hit
 * FR34-FR36: Convert GlobalMaterial to ComparisonResult format
 */
function buildResultFromGlobalMaterial(material, originalQuery, confidence, reasoning) {
    const matches = {
        homeDepot: {
            selectedProduct: material.retailers.homeDepot ? {
                id: material.retailers.homeDepot.productId,
                name: material.name,
                brand: material.retailers.homeDepot.brand || null,
                price: material.retailers.homeDepot.price,
                currency: 'USD',
                url: material.retailers.homeDepot.productUrl,
                imageUrl: material.retailers.homeDepot.imageUrl || null,
                retailer: 'homeDepot',
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
                retailer: 'lowes',
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
async function generateProductMetadata(productName, originalQuery, brand) {
    var _a, _b;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.log('[PRICE_COMPARISON] No OPENAI_API_KEY - using basic aliases');
        return {
            aliases: [originalQuery.toLowerCase().trim()],
            description: productName,
        };
    }
    const openai = new openai_1.default({ apiKey });
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
        const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '{}';
        const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const aliases = Array.isArray(parsed.aliases)
            ? parsed.aliases.map((a) => a.toLowerCase().trim()).filter((a) => a.length > 1)
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
    }
    catch (err) {
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
async function autoPopulateGlobalMaterials(db, productName, zipCode, matches) {
    var _a, _b;
    // Find the best match to use as the canonical name
    const hdMatch = (_a = matches.homeDepot) === null || _a === void 0 ? void 0 : _a.selectedProduct;
    const lowesMatch = (_b = matches.lowes) === null || _b === void 0 ? void 0 : _b.selectedProduct;
    // Skip if no successful matches
    if (!hdMatch && !lowesMatch) {
        console.log(`[PRICE_COMPARISON] No successful matches to auto-populate for "${productName}"`);
        return;
    }
    // Use the first available product name as canonical
    const canonicalName = (hdMatch === null || hdMatch === void 0 ? void 0 : hdMatch.name) || (lowesMatch === null || lowesMatch === void 0 ? void 0 : lowesMatch.name) || productName;
    const brand = (hdMatch === null || hdMatch === void 0 ? void 0 : hdMatch.brand) || (lowesMatch === null || lowesMatch === void 0 ? void 0 : lowesMatch.brand);
    try {
        // Generate LLM-powered aliases and description for better future matching
        const { aliases, description } = await generateProductMetadata(canonicalName, productName, brand);
        await (0, globalMaterials_1.saveToGlobalMaterials)(db, {
            name: canonicalName,
            normalizedName: (0, globalMaterials_1.normalizeProductName)(canonicalName),
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
        }, productName);
        console.log(`[PRICE_COMPARISON] Auto-populated global materials for "${productName}" with ${aliases.length} aliases`);
    }
    catch (err) {
        console.warn(`[PRICE_COMPARISON] Auto-population failed for "${productName}":`, err);
        // Non-blocking - don't throw
    }
}
async function compareOneProduct(productName, zipCode, db) {
    var _a, _b;
    const matches = {};
    const effectiveZipCode = zipCode || globalMaterials_1.DEFAULT_ZIPCODE;
    console.log(`[PRICE_COMPARISON] Comparing product: "${productName}" (zipCode: ${effectiveZipCode})`);
    // Get Firestore instance if not provided (for cache operations)
    const firestoreDb = db || getDb();
    // ========== STEP 1: Check Global Materials Database (FR16) ==========
    try {
        const globalCandidates = await (0, globalMaterials_1.findInGlobalMaterials)(firestoreDb, productName, effectiveZipCode);
        console.log(`[PRICE_COMPARISON] Global materials search returned ${globalCandidates.length} candidates`);
        if (globalCandidates.length > 0) {
            // ========== STEP 2: LLM Selection from candidates (FR11-FR15) ==========
            const { candidate: bestCandidate, confidence, reasoning } = await (0, globalMaterials_1.selectBestGlobalMatch)(productName, globalCandidates);
            if (bestCandidate) {
                console.log(`[PRICE_COMPARISON] Global DB validation: "${productName}" vs "${bestCandidate.name}" -> confidence: ${confidence.toFixed(2)}`);
                if (confidence >= globalMaterials_1.GLOBAL_MATCH_CONFIDENCE_THRESHOLD) {
                    // Check if the cached material actually has retailer pricing data
                    const hasRetailerData = bestCandidate.retailers &&
                        (((_a = bestCandidate.retailers.homeDepot) === null || _a === void 0 ? void 0 : _a.price) || ((_b = bestCandidate.retailers.lowes) === null || _b === void 0 ? void 0 : _b.price));
                    if (hasRetailerData) {
                        // ========== STEP 3a: Use Global Cache (FR17-FR19) ==========
                        console.log(`[PRICE_COMPARISON] GLOBAL_DB HIT for "${productName}" (confidence: ${confidence.toFixed(2)})`);
                        // FR18: Increment match count (fire-and-forget)
                        (0, globalMaterials_1.incrementMatchCount)(firestoreDb, bestCandidate.id);
                        // FR17, FR34-FR35: Return cached pricing immediately
                        return buildResultFromGlobalMaterial(bestCandidate, productName, confidence, reasoning);
                    }
                    else {
                        console.log(`[PRICE_COMPARISON] Global DB match found but no retailer pricing data cached, falling back to API`);
                    }
                }
                console.log(`[PRICE_COMPARISON] Global DB confidence too low (${confidence.toFixed(2)} < ${globalMaterials_1.GLOBAL_MATCH_CONFIDENCE_THRESHOLD}), falling back to API`);
            }
            else {
                console.log(`[PRICE_COMPARISON] LLM found no good match among ${globalCandidates.length} candidates`);
            }
        }
        else {
            console.log(`[PRICE_COMPARISON] No global materials found for "${productName}" in zipCode ${effectiveZipCode}`);
        }
    }
    catch (err) {
        console.warn(`[PRICE_COMPARISON] Global materials lookup error:`, err);
        // Continue to API fallback
    }
    // ========== STEP 2: API Fallback ==========
    // Process each retailer via external APIs
    const retailerResults = await Promise.all(RETAILERS.map(async (retailer) => {
        try {
            const { results, normalizer } = await fetchForRetailer(productName, retailer);
            const match = await selectBestMatch(productName, results, retailer);
            let selectedProduct = null;
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
        }
        catch (error) {
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
    }));
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
exports.comparePricesConfig = {
    cors: true,
    maxInstances: 10,
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: ['OPENAI_API_KEY', 'SERP_API_KEY'], // Grant access to secrets for LLM matching and SerpApi
};
exports.comparePrices = (0, https_1.onCall)(exports.comparePricesConfig, async (req) => {
    var _a, _b, _c;
    console.log('[PRICE_COMPARISON] Function invoked');
    console.log('[PRICE_COMPARISON] Request data:', JSON.stringify(req.data));
    const { projectId, productNames, forceRefresh, zipCode } = ((_a = req.data) === null || _a === void 0 ? void 0 : _a.request) || {};
    // Validate required parameters
    if (!projectId) {
        console.error('[PRICE_COMPARISON] projectId is required');
        throw new https_1.HttpsError('invalid-argument', 'projectId is required');
    }
    if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
        console.error('[PRICE_COMPARISON] productNames array is required');
        throw new https_1.HttpsError('invalid-argument', 'productNames array is required');
    }
    const db = getDb();
    const docRef = db.collection('projects').doc(projectId)
        .collection('priceComparison').doc('latest');
    // 1. Check for existing complete results (unless forceRefresh)
    if (!forceRefresh) {
        const existingDoc = await docRef.get();
        if (existingDoc.exists && ((_b = existingDoc.data()) === null || _b === void 0 ? void 0 : _b.status) === 'complete') {
            console.log('[PRICE_COMPARISON] Returning cached results');
            return { cached: true };
        }
    }
    // 2. Initialize progress document
    await docRef.set({
        status: 'processing',
        totalProducts: productNames.length,
        completedProducts: 0,
        results: [],
        startedAt: Date.now(),
        createdBy: ((_c = req.auth) === null || _c === void 0 ? void 0 : _c.uid) || 'anonymous',
    });
    console.log(`[PRICE_COMPARISON] Starting comparison for ${productNames.length} products`);
    const results = [];
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
            status: 'complete',
            completedAt: Date.now(),
        });
        console.log('[PRICE_COMPARISON] Comparison complete');
        return { cached: false };
    }
    catch (error) {
        // Handle errors gracefully - preserve partial results
        console.error('[PRICE_COMPARISON] Error during comparison:', error);
        await docRef.update({
            status: 'error',
            results: results,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new https_1.HttpsError('internal', 'Price comparison failed');
    }
});
//# sourceMappingURL=priceComparison.js.map