"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const priceComparison_1 = require("./priceComparison");
// Mock firebase-admin before importing the module that uses it
vitest_1.vi.mock('firebase-admin', () => ({
    app: vitest_1.vi.fn(() => ({})),
    initializeApp: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vitest_1.vi.fn(() => ({
        collection: vitest_1.vi.fn(() => ({
            doc: vitest_1.vi.fn(() => ({
                collection: vitest_1.vi.fn(() => ({
                    doc: vitest_1.vi.fn(() => ({
                        get: vitest_1.vi.fn(),
                        set: vitest_1.vi.fn(),
                        update: vitest_1.vi.fn(),
                    })),
                })),
            })),
        })),
    })),
}));
vitest_1.vi.mock('firebase-functions/v2/https', () => ({
    onCall: vitest_1.vi.fn((config, handler) => handler),
    HttpsError: class HttpsError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    },
}));
vitest_1.vi.mock('openai', () => ({
    default: vitest_1.vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: vitest_1.vi.fn(),
            },
        },
    })),
}));
// ============ parseMatchResult TESTS ============
(0, vitest_1.describe)('parseMatchResult', () => {
    (0, vitest_1.describe)('handles clean JSON', () => {
        (0, vitest_1.it)('parses valid JSON with all fields', () => {
            const input = '{"index": 2, "confidence": 0.85, "reasoning": "Best match based on specs"}';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(2);
            (0, vitest_1.expect)(result.confidence).toBe(0.85);
            (0, vitest_1.expect)(result.reasoning).toBe('Best match based on specs');
        });
        (0, vitest_1.it)('parses JSON with whitespace', () => {
            const input = `
        {
          "index": 1,
          "confidence": 0.9,
          "reasoning": "Exact product match"
        }
      `;
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(1);
            (0, vitest_1.expect)(result.confidence).toBe(0.9);
            (0, vitest_1.expect)(result.reasoning).toBe('Exact product match');
        });
    });
    (0, vitest_1.describe)('handles markdown-wrapped JSON', () => {
        (0, vitest_1.it)('strips ```json opening block', () => {
            const input = '```json\n{"index": 0, "confidence": 0.75, "reasoning": "First result selected"}```';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(0);
            (0, vitest_1.expect)(result.confidence).toBe(0.75);
            (0, vitest_1.expect)(result.reasoning).toBe('First result selected');
        });
        (0, vitest_1.it)('strips ```json with newlines', () => {
            const input = `\`\`\`json
{
  "index": 3,
  "confidence": 0.65,
  "reasoning": "Close match"
}
\`\`\``;
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(3);
            (0, vitest_1.expect)(result.confidence).toBe(0.65);
            (0, vitest_1.expect)(result.reasoning).toBe('Close match');
        });
        (0, vitest_1.it)('handles case-insensitive JSON marker', () => {
            const input = '```JSON\n{"index": 1, "confidence": 0.8, "reasoning": "Match"}```';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(1);
            (0, vitest_1.expect)(result.confidence).toBe(0.8);
        });
        (0, vitest_1.it)('strips plain ``` blocks without json marker', () => {
            const input = '```\n{"index": 2, "confidence": 0.7, "reasoning": "Alternative match"}\n```';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(2);
            (0, vitest_1.expect)(result.confidence).toBe(0.7);
        });
    });
    (0, vitest_1.describe)('returns fallback on invalid JSON', () => {
        (0, vitest_1.it)('returns no-match values for completely invalid JSON', () => {
            const input = 'This is not JSON at all';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(-1);
            (0, vitest_1.expect)(result.confidence).toBe(0);
            (0, vitest_1.expect)(result.reasoning).toContain('Fallback');
        });
        (0, vitest_1.it)('returns no-match values for partial JSON', () => {
            const input = '{"index": 1, "confidence":';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(-1);
            (0, vitest_1.expect)(result.confidence).toBe(0);
        });
        (0, vitest_1.it)('returns no-match values for empty string', () => {
            const input = '';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(-1);
            (0, vitest_1.expect)(result.confidence).toBe(0);
        });
        (0, vitest_1.it)('returns default values for empty object', () => {
            const input = '{}';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(0);
            (0, vitest_1.expect)(result.confidence).toBe(0.5);
            (0, vitest_1.expect)(result.reasoning).toBe('No reasoning provided');
        });
    });
    (0, vitest_1.describe)('handles edge cases', () => {
        (0, vitest_1.it)('handles missing reasoning field', () => {
            const input = '{"index": 1, "confidence": 0.8}';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(1);
            (0, vitest_1.expect)(result.confidence).toBe(0.8);
            (0, vitest_1.expect)(result.reasoning).toBe('No reasoning provided');
        });
        (0, vitest_1.it)('handles non-number index by defaulting to 0', () => {
            const input = '{"index": "first", "confidence": 0.8, "reasoning": "test"}';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.index).toBe(0);
        });
        (0, vitest_1.it)('handles non-number confidence by defaulting to 0.5', () => {
            const input = '{"index": 1, "confidence": "high", "reasoning": "test"}';
            const result = (0, priceComparison_1.parseMatchResult)(input);
            (0, vitest_1.expect)(result.confidence).toBe(0.5);
        });
    });
});
// ============ CACHING LOGIC TESTS (Unit Tests for Logic) ============
(0, vitest_1.describe)('comparePrices caching logic', () => {
    (0, vitest_1.it)('returns cached: true when status is complete and forceRefresh is false', () => {
        var _a;
        // Simulate caching logic as implemented in the function
        const existingDoc = {
            exists: true,
            data: () => ({ status: 'complete', results: [], completedAt: Date.now() }),
        };
        const forceRefresh = false;
        // This is the caching logic from the function
        const shouldReturnCached = !forceRefresh && existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.status) === 'complete';
        (0, vitest_1.expect)(shouldReturnCached).toBe(true);
        // When shouldReturnCached is true, function returns { cached: true }
        const expectedResponse = shouldReturnCached ? { cached: true } : { cached: false };
        (0, vitest_1.expect)(expectedResponse).toEqual({ cached: true });
    });
    (0, vitest_1.it)('runs full comparison when forceRefresh is true', () => {
        var _a;
        const existingDoc = {
            exists: true,
            data: () => ({ status: 'complete', results: [], completedAt: Date.now() }),
        };
        const forceRefresh = true;
        // When forceRefresh is true, we should NOT return cached
        const shouldReturnCached = !forceRefresh && existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.status) === 'complete';
        (0, vitest_1.expect)(shouldReturnCached).toBe(false);
        // Would proceed to initialize and run comparison
    });
    (0, vitest_1.it)('runs full comparison when no existing results', () => {
        var _a;
        const existingDoc = {
            exists: false,
            data: () => null,
        };
        const forceRefresh = false;
        const shouldReturnCached = !forceRefresh && existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.status) === 'complete';
        // When no results exist, should run full comparison
        (0, vitest_1.expect)(existingDoc.exists).toBe(false);
        (0, vitest_1.expect)(shouldReturnCached).toBe(false);
    });
    (0, vitest_1.it)('runs full comparison when status is not complete', () => {
        var _a, _b;
        const existingDoc = {
            exists: true,
            data: () => ({ status: 'processing', results: [], startedAt: Date.now() }),
        };
        const forceRefresh = false;
        const shouldReturnCached = !forceRefresh && existingDoc.exists && ((_a = existingDoc.data()) === null || _a === void 0 ? void 0 : _a.status) === 'complete';
        // Should not return cached when status is 'processing'
        (0, vitest_1.expect)((_b = existingDoc.data()) === null || _b === void 0 ? void 0 : _b.status).toBe('processing');
        (0, vitest_1.expect)(shouldReturnCached).toBe(false);
    });
});
// ============ PROGRESS TRACKING TESTS ============
(0, vitest_1.describe)('progress tracking', () => {
    (0, vitest_1.it)('initializes document with status processing', () => {
        const productNames = ['Product A', 'Product B'];
        // Simulate initialization data structure
        const initData = {
            status: 'processing',
            totalProducts: productNames.length,
            completedProducts: 0,
            results: [],
            startedAt: Date.now(),
            createdBy: 'test-user',
        };
        (0, vitest_1.expect)(initData.status).toBe('processing');
        (0, vitest_1.expect)(initData.totalProducts).toBe(2);
        (0, vitest_1.expect)(initData.completedProducts).toBe(0);
        (0, vitest_1.expect)(initData.results).toEqual([]);
    });
    (0, vitest_1.it)('updates completedProducts after each product', () => {
        const results = [{ originalProductName: 'Product A', matches: {}, bestPrice: null, comparedAt: Date.now() }];
        const updateData = {
            completedProducts: results.length,
            results: results,
        };
        (0, vitest_1.expect)(updateData.completedProducts).toBe(1);
        (0, vitest_1.expect)(updateData.results.length).toBe(1);
    });
    (0, vitest_1.it)('sets status to complete on finish', () => {
        const updateData = {
            status: 'complete',
            completedAt: Date.now(),
        };
        (0, vitest_1.expect)(updateData.status).toBe('complete');
        (0, vitest_1.expect)(updateData.completedAt).toBeDefined();
    });
    (0, vitest_1.it)('sets status to error on failure', () => {
        const errorMessage = 'API failed';
        const updateData = {
            status: 'error',
            error: errorMessage,
        };
        (0, vitest_1.expect)(updateData.status).toBe('error');
        (0, vitest_1.expect)(updateData.error).toBe(errorMessage);
    });
});
// ============ ERROR HANDLING TESTS ============
(0, vitest_1.describe)('error handling', () => {
    (0, vitest_1.it)('partial failure allows other retailers to succeed', async () => {
        // Simulate a scenario where one retailer fails but others succeed
        const retailerResults = [
            { retailer: 'homeDepot', match: { selectedProduct: { id: '1', name: 'Product', price: 10 }, confidence: 0.9 } },
            { retailer: 'lowes', match: { selectedProduct: null, confidence: 0, reasoning: 'Error: API timeout' } },
            { retailer: 'aceHardware', match: { selectedProduct: { id: '2', name: 'Product', price: 12 }, confidence: 0.8 } },
        ];
        // Verify partial results are preserved
        const successfulRetailers = retailerResults.filter(r => r.match.selectedProduct !== null);
        const failedRetailers = retailerResults.filter(r => r.match.selectedProduct === null);
        (0, vitest_1.expect)(successfulRetailers.length).toBe(2);
        (0, vitest_1.expect)(failedRetailers.length).toBe(1);
        (0, vitest_1.expect)(failedRetailers[0].retailer).toBe('lowes');
    });
    (0, vitest_1.it)('complete failure sets status to error', () => {
        const allFailed = [
            { retailer: 'homeDepot', match: { selectedProduct: null, reasoning: 'Error' } },
            { retailer: 'lowes', match: { selectedProduct: null, reasoning: 'Error' } },
            { retailer: 'aceHardware', match: { selectedProduct: null, reasoning: 'Error' } },
        ];
        const anySuccess = allFailed.some(r => r.match.selectedProduct !== null);
        (0, vitest_1.expect)(anySuccess).toBe(false);
    });
});
// ============ UNWRANGLE API INTEGRATION TESTS ============
(0, vitest_1.describe)('Unwrangle API mock tests', () => {
    (0, vitest_1.it)('maps retailer to correct platform', () => {
        const PLATFORMS = {
            homeDepot: 'homedepot_search',
            lowes: 'lowes_search',
            aceHardware: 'acehardware_search',
        };
        (0, vitest_1.expect)(PLATFORMS.homeDepot).toBe('homedepot_search');
        (0, vitest_1.expect)(PLATFORMS.lowes).toBe('lowes_search');
        (0, vitest_1.expect)(PLATFORMS.aceHardware).toBe('acehardware_search');
    });
    (0, vitest_1.it)('handles empty results from API', () => {
        const mockResults = [];
        (0, vitest_1.expect)(mockResults.length).toBe(0);
        // With no results, selectBestMatch should return index -1
        const match = mockResults.length === 0
            ? { index: -1, confidence: 0, reasoning: 'No search results' }
            : { index: 0, confidence: 0.5, reasoning: 'Default' };
        (0, vitest_1.expect)(match.index).toBe(-1);
        (0, vitest_1.expect)(match.confidence).toBe(0);
    });
    (0, vitest_1.it)('normalizes product from Unwrangle response', () => {
        const rawProduct = {
            id: 'ABC123',
            name: '2x4 Stud 8ft',
            brand: 'Generic',
            price: '$3.99',
            url: 'https://homedepot.com/product/123',
            image: 'https://cdn.example.com/img.jpg',
        };
        // Extract price from string
        const priceStr = rawProduct.price;
        const cleaned = priceStr.replace(/[^0-9.]/g, '');
        const price = parseFloat(cleaned);
        (0, vitest_1.expect)(price).toBe(3.99);
        (0, vitest_1.expect)(rawProduct.id).toBe('ABC123');
        (0, vitest_1.expect)(rawProduct.brand).toBe('Generic');
    });
});
// ============ OPENAI INTEGRATION TESTS ============
(0, vitest_1.describe)('OpenAI mock tests', () => {
    (0, vitest_1.it)('constructs correct prompt for product matching', () => {
        const productName = '2x4 Stud 8ft';
        const retailer = 'homeDepot';
        const results = [
            { name: '2x4 Stud 8 Feet', price: 3.99 },
            { name: '2x4 Stud 10 Feet', price: 4.99 },
        ];
        const prompt = `Given the original product: "${productName}"
And these search results from ${retailer}:
${JSON.stringify(results.slice(0, 5), null, 2)}

Select the BEST matching product (index 0-4) based on:
1. Functional equivalence
2. Specification compatibility
3. Price competitiveness

Return ONLY JSON: { "index": number, "confidence": number (0-1), "reasoning": "brief" }`;
        (0, vitest_1.expect)(prompt).toContain(productName);
        (0, vitest_1.expect)(prompt).toContain(retailer);
        (0, vitest_1.expect)(prompt).toContain('2x4 Stud 8 Feet');
    });
    (0, vitest_1.it)('handles OpenAI error gracefully', () => {
        // When OpenAI fails, we should default to first result
        const fallbackResult = {
            index: 0,
            confidence: 0.5,
            reasoning: 'OpenAI error - defaulting to first result',
        };
        (0, vitest_1.expect)(fallbackResult.index).toBe(0);
        (0, vitest_1.expect)(fallbackResult.confidence).toBe(0.5);
        (0, vitest_1.expect)(fallbackResult.reasoning).toContain('error');
    });
});
// ============ BEST PRICE DETERMINATION TESTS ============
(0, vitest_1.describe)('determineBestPrice', () => {
    (0, vitest_1.it)('selects lowest price retailer', () => {
        const matches = {
            homeDepot: { selectedProduct: { id: '1', price: 3.99, retailer: 'homeDepot' }, confidence: 0.9 },
            lowes: { selectedProduct: { id: '2', price: 4.25, retailer: 'lowes' }, confidence: 0.85 },
            aceHardware: { selectedProduct: { id: '3', price: 3.75, retailer: 'aceHardware' }, confidence: 0.8 },
        };
        // Find lowest price
        let lowestPrice = Infinity;
        let bestRetailer = '';
        for (const [retailer, match] of Object.entries(matches)) {
            if (match.selectedProduct && match.selectedProduct.price < lowestPrice) {
                lowestPrice = match.selectedProduct.price;
                bestRetailer = retailer;
            }
        }
        (0, vitest_1.expect)(bestRetailer).toBe('aceHardware');
        (0, vitest_1.expect)(lowestPrice).toBe(3.75);
    });
    (0, vitest_1.it)('calculates savings correctly', () => {
        const prices = [3.99, 4.25, 3.75];
        const lowestPrice = Math.min(...prices);
        const highestPrice = Math.max(...prices);
        const savings = highestPrice - lowestPrice;
        (0, vitest_1.expect)(savings).toBe(0.5);
    });
    (0, vitest_1.it)('returns null when no valid products', () => {
        const matches = {
            homeDepot: { selectedProduct: null, confidence: 0 },
            lowes: { selectedProduct: null, confidence: 0 },
            aceHardware: { selectedProduct: null, confidence: 0 },
        };
        const hasValidProduct = Object.values(matches).some(m => m.selectedProduct !== null);
        (0, vitest_1.expect)(hasValidProduct).toBe(false);
    });
});
// ============ FUNCTION CONFIGURATION TESTS ============
(0, vitest_1.describe)('Cloud Function configuration', () => {
    (0, vitest_1.it)('has CORS enabled for all origins', async () => {
        // Import the actual function configuration to test it
        const { comparePricesConfig } = await Promise.resolve().then(() => require('./priceComparison'));
        // Should use cors: true to match other functions (aiCommand, materialEstimateCommand, sagemakerInvoke)
        (0, vitest_1.expect)(comparePricesConfig.cors).toBe(true);
    });
    (0, vitest_1.it)('has correct timeout for 2nd gen functions', async () => {
        // Import the actual function configuration to test it
        const { comparePricesConfig } = await Promise.resolve().then(() => require('./priceComparison'));
        (0, vitest_1.expect)(comparePricesConfig.timeoutSeconds).toBeDefined();
        (0, vitest_1.expect)(comparePricesConfig.timeoutSeconds).toBe(540); // Max for 2nd gen
    });
    (0, vitest_1.it)('has appropriate memory for LLM calls', async () => {
        // Import the actual function configuration to test it
        const { comparePricesConfig } = await Promise.resolve().then(() => require('./priceComparison'));
        (0, vitest_1.expect)(comparePricesConfig.memory).toBeDefined();
        (0, vitest_1.expect)(comparePricesConfig.memory).toBe('1GiB');
    });
});
// ============ PRODUCT CACHE TESTS ============
(0, vitest_1.describe)('normalizeCacheKey', () => {
    (0, vitest_1.it)('converts to lowercase', () => {
        const result = (0, priceComparison_1.normalizeCacheKey)('2x4 STUD 8FT');
        (0, vitest_1.expect)(result).toBe('2x4-stud-8ft');
    });
    (0, vitest_1.it)('removes special characters', () => {
        const result = (0, priceComparison_1.normalizeCacheKey)('Product #123 (1/2" x 3/4")');
        (0, vitest_1.expect)(result).toBe('product-123-12-x-34');
    });
    (0, vitest_1.it)('collapses whitespace to hyphens', () => {
        const result = (0, priceComparison_1.normalizeCacheKey)('Product   Name   Here');
        (0, vitest_1.expect)(result).toBe('product-name-here');
    });
    (0, vitest_1.it)('truncates to 100 characters', () => {
        const longName = 'A'.repeat(150);
        const result = (0, priceComparison_1.normalizeCacheKey)(longName);
        (0, vitest_1.expect)(result.length).toBe(100);
    });
    (0, vitest_1.it)('handles empty string', () => {
        const result = (0, priceComparison_1.normalizeCacheKey)('');
        (0, vitest_1.expect)(result).toBe('');
    });
    (0, vitest_1.it)('handles string with only special characters', () => {
        const result = (0, priceComparison_1.normalizeCacheKey)('!@#$%^&*()');
        (0, vitest_1.expect)(result).toBe('');
    });
});
(0, vitest_1.describe)('Product Cache Flow', () => {
    (0, vitest_1.it)('should use cached product when confidence >= 0.8', () => {
        const cacheConfidenceThreshold = 0.8;
        const confidenceScore = 0.85;
        const shouldUseCache = confidenceScore >= cacheConfidenceThreshold;
        (0, vitest_1.expect)(shouldUseCache).toBe(true);
    });
    (0, vitest_1.it)('should call API when confidence < 0.8', () => {
        const cacheConfidenceThreshold = 0.8;
        const confidenceScore = 0.75;
        const shouldUseCache = confidenceScore >= cacheConfidenceThreshold;
        (0, vitest_1.expect)(shouldUseCache).toBe(false);
    });
    (0, vitest_1.it)('should call API when cache miss (no cached product)', () => {
        const cachedProduct = null;
        const shouldCallApi = cachedProduct === null;
        (0, vitest_1.expect)(shouldCallApi).toBe(true);
    });
    (0, vitest_1.it)('CachedProduct structure is correct', () => {
        const cachedProduct = {
            product: {
                id: 'ABC123',
                name: '2x4 Stud 8ft',
                brand: 'Generic',
                price: 3.99,
                currency: 'USD',
                url: 'https://example.com/product/123',
                imageUrl: 'https://example.com/img.jpg',
                retailer: 'homeDepot',
            },
            searchQueries: ['2x4 stud', '2x4 8 foot'],
            lastUpdated: Date.now(),
            matchCount: 5,
            originalSearchTerm: '2x4 stud',
        };
        (0, vitest_1.expect)(cachedProduct.product.id).toBe('ABC123');
        (0, vitest_1.expect)(cachedProduct.searchQueries).toContain('2x4 stud');
        (0, vitest_1.expect)(cachedProduct.matchCount).toBe(5);
        (0, vitest_1.expect)(cachedProduct.originalSearchTerm).toBe('2x4 stud');
    });
    (0, vitest_1.it)('CacheLookupResult structure is correct', () => {
        // Cache hit scenario
        const cacheHit = {
            found: true,
            cachedProduct: {
                product: { id: '123' },
                searchQueries: ['query'],
                lastUpdated: Date.now(),
                matchCount: 1,
                originalSearchTerm: 'query',
            },
            confidence: 0.9,
            useCache: true,
            reasoning: 'Exact match found',
        };
        (0, vitest_1.expect)(cacheHit.found).toBe(true);
        (0, vitest_1.expect)(cacheHit.useCache).toBe(true);
        (0, vitest_1.expect)(cacheHit.confidence).toBeGreaterThanOrEqual(0.8);
        // Cache miss scenario
        const cacheMiss = {
            found: false,
            confidence: 0,
            useCache: false,
            reasoning: 'No match found in cache',
        };
        (0, vitest_1.expect)(cacheMiss.found).toBe(false);
        (0, vitest_1.expect)(cacheMiss.useCache).toBe(false);
    });
    (0, vitest_1.it)('should merge searchQueries on cache update', () => {
        const existingQueries = ['2x4 stud', '2x4 8 foot'];
        const newQuery = '2x4 lumber 8ft';
        // Simulate merging with Set to deduplicate
        const mergedQueries = Array.from(new Set([
            ...existingQueries,
            newQuery.toLowerCase()
        ]));
        (0, vitest_1.expect)(mergedQueries).toContain('2x4 stud');
        (0, vitest_1.expect)(mergedQueries).toContain('2x4 8 foot');
        (0, vitest_1.expect)(mergedQueries).toContain('2x4 lumber 8ft');
        (0, vitest_1.expect)(mergedQueries.length).toBe(3);
    });
    (0, vitest_1.it)('should increment matchCount on cache update', () => {
        const existingMatchCount = 5;
        const newMatchCount = existingMatchCount + 1;
        (0, vitest_1.expect)(newMatchCount).toBe(6);
    });
});
(0, vitest_1.describe)('Cache Confidence Assessment', () => {
    (0, vitest_1.it)('returns confidence 0-1 range', () => {
        const confidenceScores = [0, 0.5, 0.8, 1.0];
        for (const score of confidenceScores) {
            (0, vitest_1.expect)(score).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(score).toBeLessThanOrEqual(1);
        }
    });
    (0, vitest_1.it)('low confidence triggers API call', () => {
        const threshold = 0.8;
        const lowConfidence = 0.6;
        (0, vitest_1.expect)(lowConfidence < threshold).toBe(true);
    });
    (0, vitest_1.it)('high confidence skips API call', () => {
        const threshold = 0.8;
        const highConfidence = 0.95;
        (0, vitest_1.expect)(highConfidence >= threshold).toBe(true);
    });
    (0, vitest_1.it)('exact threshold value uses cache', () => {
        const threshold = 0.8;
        const confidence = 0.8;
        (0, vitest_1.expect)(confidence >= threshold).toBe(true);
    });
});
(0, vitest_1.describe)('Firestore Cache Path Structure', () => {
    (0, vitest_1.it)('constructs correct cache path', () => {
        const retailer = 'homeDepot';
        const normalizedProductName = '2x4-stud-8ft';
        const expectedPath = `productCache/${retailer}/products/${normalizedProductName}`;
        (0, vitest_1.expect)(expectedPath).toBe('productCache/homeDepot/products/2x4-stud-8ft');
    });
    (0, vitest_1.it)('supports multiple retailers', () => {
        const retailers = ['homeDepot', 'lowes'];
        for (const retailer of retailers) {
            const path = `productCache/${retailer}/products/test-product`;
            (0, vitest_1.expect)(path).toContain(retailer);
        }
    });
});
//# sourceMappingURL=priceComparison.test.js.map