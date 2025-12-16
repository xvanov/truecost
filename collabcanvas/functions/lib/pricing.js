"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHomeDepotPrice = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
// Lazy initialization to avoid timeout during module load
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
// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// SerpAPI timeout: 60 seconds (they can be very slow, especially for complex searches)
const SERPAPI_TIMEOUT_MS = 60000;
function normalizeKey(name, unit) {
    const base = name.trim().toLowerCase();
    const unitPart = unit ? `__${unit.trim().toLowerCase()}` : '';
    // Place '-' at end of character class to avoid needing an escape
    return `${base}${unitPart}`.replace(/[^a-z0-9_-]+/g, '_');
}
/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Fetch price from SerpAPI with retry logic and exponential backoff
 */
async function fetchFromSerpApi(query, storeId, deliveryZip, attempt = 1) {
    var _a;
    console.log(`[PRICING] fetchFromSerpApi called: query="${query}", store_id="${storeId || 'none'}", delivery_zip="${deliveryZip || 'none'}", attempt=${attempt}`);
    const apiKey = (process.env.SERP_API_KEY || '').trim();
    if (!apiKey) {
        const error = 'SERP_API_KEY not configured';
        console.error(`[PRICING] ${error}`);
        return { priceUSD: null, link: null, error };
    }
    const params = new URLSearchParams({
        engine: 'home_depot',
        q: query,
        api_key: apiKey,
        ps: '24',
        nao: '0',
        country: 'us',
        device: 'desktop',
    });
    // Add store_id and delivery_zip if provided (these help SerpAPI return faster, more accurate results)
    if (storeId) {
        params.append('store_id', storeId);
    }
    if (deliveryZip) {
        params.append('delivery_zip', deliveryZip);
    }
    const url = `https://serpapi.com/search.json?${params.toString()}`;
    console.log(`[PRICING] Making request to SerpAPI (attempt ${attempt})...`);
    try {
        // Add timeout to fetch call (60 seconds - SerpAPI can be slow, especially for complex searches)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SERPAPI_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log(`[PRICING] SerpAPI response status: ${res.status}`);
        if (!res.ok) {
            const errorText = await res.text();
            const error = `SerpAPI non-OK response: ${res.status} - ${errorText}`;
            console.warn(`[PRICING] ${error} (attempt ${attempt}/${MAX_RETRIES})`);
            // Retry on server errors (5xx) or rate limits (429)
            if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[PRICING] Retrying in ${delay}ms...`);
                await sleep(delay);
                return fetchFromSerpApi(query, storeId, deliveryZip, attempt + 1);
            }
            return { priceUSD: null, link: null, error };
        }
        console.log(`[PRICING] Parsing SerpAPI response...`);
        const data = await res.json();
        // Check for SerpAPI errors in response
        if (data.error) {
            const error = `Unable to find price - ${data.error}`;
            console.warn(`[PRICING] ${error} for query: ${query}`);
            return { priceUSD: null, link: null, error };
        }
        // Home Depot API returns products array, not organic_results
        const results = (data === null || data === void 0 ? void 0 : data.products) || (data === null || data === void 0 ? void 0 : data.organic_results) || [];
        if (!Array.isArray(results) || results.length === 0) {
            const error = 'Unable to find price - no products found';
            console.warn(`[PRICING] ${error} for query: ${query}`);
            console.log(`[PRICING] Response structure: products=${!!(data === null || data === void 0 ? void 0 : data.products)}, organic_results=${!!(data === null || data === void 0 ? void 0 : data.organic_results)}, total_results=${((_a = data === null || data === void 0 ? void 0 : data.search_information) === null || _a === void 0 ? void 0 : _a.total_results) || 'N/A'}`);
            return { priceUSD: null, link: null, error };
        }
        const first = results[0];
        const link = (first === null || first === void 0 ? void 0 : first.link) || null;
        // price could be in price or extracted_price fields; handle string like "$3.58"
        const priceStr = (first === null || first === void 0 ? void 0 : first.price) || (first === null || first === void 0 ? void 0 : first.primary_price) || (first === null || first === void 0 ? void 0 : first.extracted_price);
        let priceUSD = null;
        if (typeof priceStr === 'number') {
            priceUSD = priceStr;
        }
        else if (typeof priceStr === 'string') {
            const cleaned = priceStr.replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleaned);
            priceUSD = Number.isFinite(parsed) ? parseFloat(parsed.toFixed(2)) : null;
        }
        if (priceUSD === null) {
            const error = 'Unable to find price - price not available in product listing';
            console.warn(`[PRICING] ${error} for query: ${query}`);
            return { priceUSD: null, link, error };
        }
        console.log(`[PRICING] Successfully fetched price $${priceUSD} for: ${query}`);
        return { priceUSD, link };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        const isAbortError = err instanceof Error && err.name === 'AbortError';
        if (isAbortError) {
            console.error(`[PRICING] SerpAPI request timeout (attempt ${attempt}/${MAX_RETRIES})`);
            // Retry on timeout
            if (attempt < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[PRICING] Retrying in ${delay}ms...`);
                await sleep(delay);
                return fetchFromSerpApi(query, storeId, deliveryZip, attempt + 1);
            }
            return { priceUSD: null, link: null, error: 'Unable to find price - service timed out after 60 seconds' };
        }
        console.error(`[PRICING] SerpAPI fetch error (attempt ${attempt}/${MAX_RETRIES}):`, error);
        // Retry on network errors
        if (attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`[PRICING] Retrying in ${delay}ms...`);
            await sleep(delay);
            return fetchFromSerpApi(query, storeId, deliveryZip, attempt + 1);
        }
        return { priceUSD: null, link: null, error: 'Unable to find price - service unavailable' };
    }
}
exports.getHomeDepotPrice = (0, https_1.onCall)({
    cors: true,
    maxInstances: 20,
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: ['SERP_API_KEY'], // Required for SerpAPI calls
}, async (req) => {
    var _a;
    console.log('[PRICING] Function invoked');
    console.log('[PRICING] Request data:', JSON.stringify(req.data));
    try {
        // Log API key status (without exposing the key)
        const apiKeySet = !!process.env.SERP_API_KEY;
        console.log(`[PRICING] SERP_API_KEY configured: ${apiKeySet ? 'YES' : 'NO'}`);
        if (!apiKeySet) {
            console.error('[PRICING] SERP_API_KEY not found in environment variables');
            console.error('[PRICING] Make sure .env file exists in functions/ directory with SERP_API_KEY=...');
            return {
                success: false,
                priceUSD: null,
                link: null,
                error: 'SERP_API_KEY not configured. Check emulator logs for details.'
            };
        }
        const { materialName, unit, storeNumber, deliveryZip } = ((_a = req.data) === null || _a === void 0 ? void 0 : _a.request) || {};
        if (!materialName) {
            console.error('[PRICING] materialName is required');
            throw new https_1.HttpsError('invalid-argument', 'materialName is required');
        }
        console.log(`[PRICING] Processing request for: ${materialName}${unit ? ` (${unit})` : ''}`);
        const store = (storeNumber || '3620').toString();
        const key = normalizeKey(materialName, unit);
        console.log(`[PRICING] Cache key: ${key}, Store: ${store}, Delivery Zip: ${deliveryZip || 'none'}`);
        // Map storeNumber to store_id (for now, use storeNumber directly - may need mapping table later)
        // Based on user's successful calls: store_id 2414 corresponds to zip 04401
        // For now, we'll use storeNumber as store_id if no explicit mapping exists
        const storeId = storeNumber; // TODO: Create proper mapping from storeNumber to store_id
        const db = getDb();
        const docRef = db.collection('pricing').doc(store).collection('items').doc(key);
        console.log(`[PRICING] Checking cache in Firestore...`);
        // Cache lookup with TTL check
        const cached = await docRef.get();
        console.log(`[PRICING] Cache lookup complete. Exists: ${cached.exists}`);
        if (cached.exists) {
            const d = cached.data();
            const updatedAt = d === null || d === void 0 ? void 0 : d.updatedAt;
            // Check if cache is still valid (within 24 hours)
            if (updatedAt) {
                const updatedAtMs = updatedAt.toMillis();
                const nowMs = Date.now();
                const ageMs = nowMs - updatedAtMs;
                if (ageMs < CACHE_TTL_MS) {
                    const ageMinutes = Math.round(ageMs / 1000 / 60);
                    console.log(`[PRICING] Cache hit for: ${materialName} (age: ${ageMinutes} minutes)`);
                    // Return cached result - check if it's a successful cache or error cache
                    const hasValidPrice = d && typeof d.priceUSD === 'number' && d.priceUSD !== null;
                    const cachedError = (d === null || d === void 0 ? void 0 : d.lastError) || null;
                    console.log(`[PRICING] Cache data:`, {
                        hasValidPrice,
                        priceUSD: d === null || d === void 0 ? void 0 : d.priceUSD,
                        cachedError,
                        lastFetchTime: d === null || d === void 0 ? void 0 : d.lastFetchTime
                    });
                    return {
                        success: hasValidPrice,
                        priceUSD: hasValidPrice ? d.priceUSD : null,
                        link: d && d.link ? d.link : null,
                        error: cachedError || (hasValidPrice ? undefined : 'Unable to find price - cached result'),
                    };
                }
                else {
                    console.log(`[PRICING] Cache expired for: ${materialName} (age: ${Math.round(ageMs / 1000 / 60 / 60)} hours)`);
                }
            }
        }
        // Fetch from SerpAPI with retry logic
        const query = unit ? `${materialName} ${unit}` : materialName;
        console.log(`[PRICING] Fetching from SerpAPI: ${query} (store_id: ${storeId}, delivery_zip: ${deliveryZip || 'none'})`);
        const startTime = Date.now();
        const { priceUSD, link, error } = await fetchFromSerpApi(query, storeId, deliveryZip);
        const fetchTime = Date.now() - startTime;
        console.log(`[PRICING] SerpAPI fetch complete. Price: ${priceUSD}, Error: ${error || 'none'}, Time: ${fetchTime}ms`);
        const success = priceUSD !== null;
        // Log success rate metrics
        console.log(`[PRICING] Fetch result for "${materialName}": success=${success}, price=${priceUSD}, fetchTime=${fetchTime}ms${error ? `, error=${error}` : ''}`);
        // Store in cache (even if price is null, to avoid repeated failed requests)
        await docRef.set({
            key,
            materialName,
            unit: unit || null,
            priceUSD: typeof priceUSD === 'number' ? priceUSD : null,
            link: link || null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            lastFetchTime: fetchTime,
            lastError: error || null,
        }, { merge: true });
        return { success, priceUSD, link, error };
    }
    catch (e) {
        console.error('[PRICING] getHomeDepotPrice error:', e);
        console.error('[PRICING] Error stack:', e instanceof Error ? e.stack : 'No stack trace');
        // Return error response instead of throwing to ensure CORS headers are sent
        if (e instanceof https_1.HttpsError) {
            // For HttpsError, we still need to throw it, but log first
            console.error('[PRICING] Throwing HttpsError:', e.code, e.message);
            throw e;
        }
        // For other errors, return a proper error response
        const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
        console.error('[PRICING] Returning error response:', errorMessage);
        return {
            success: false,
            priceUSD: null,
            link: null,
            error: `Internal error: ${errorMessage}`
        };
    }
});
//# sourceMappingURL=pricing.js.map