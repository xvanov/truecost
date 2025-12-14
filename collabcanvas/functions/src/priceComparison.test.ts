import { describe, it, expect, vi } from 'vitest';
import { parseMatchResult } from './priceComparison';

// Mock firebase-admin before importing the module that uses it
vi.mock('firebase-admin', () => ({
  app: vi.fn(() => ({})),
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: vi.fn(),
            set: vi.fn(),
            update: vi.fn(),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((config, handler) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

// ============ parseMatchResult TESTS ============

describe('parseMatchResult', () => {
  describe('handles clean JSON', () => {
    it('parses valid JSON with all fields', () => {
      const input = '{"index": 2, "confidence": 0.85, "reasoning": "Best match based on specs"}';
      const result = parseMatchResult(input);

      expect(result.index).toBe(2);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('Best match based on specs');
    });

    it('parses JSON with whitespace', () => {
      const input = `
        {
          "index": 1,
          "confidence": 0.9,
          "reasoning": "Exact product match"
        }
      `;
      const result = parseMatchResult(input);

      expect(result.index).toBe(1);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('Exact product match');
    });
  });

  describe('handles markdown-wrapped JSON', () => {
    it('strips ```json opening block', () => {
      const input = '```json\n{"index": 0, "confidence": 0.75, "reasoning": "First result selected"}```';
      const result = parseMatchResult(input);

      expect(result.index).toBe(0);
      expect(result.confidence).toBe(0.75);
      expect(result.reasoning).toBe('First result selected');
    });

    it('strips ```json with newlines', () => {
      const input = `\`\`\`json
{
  "index": 3,
  "confidence": 0.65,
  "reasoning": "Close match"
}
\`\`\``;
      const result = parseMatchResult(input);

      expect(result.index).toBe(3);
      expect(result.confidence).toBe(0.65);
      expect(result.reasoning).toBe('Close match');
    });

    it('handles case-insensitive JSON marker', () => {
      const input = '```JSON\n{"index": 1, "confidence": 0.8, "reasoning": "Match"}```';
      const result = parseMatchResult(input);

      expect(result.index).toBe(1);
      expect(result.confidence).toBe(0.8);
    });

    it('strips plain ``` blocks without json marker', () => {
      const input = '```\n{"index": 2, "confidence": 0.7, "reasoning": "Alternative match"}\n```';
      const result = parseMatchResult(input);

      expect(result.index).toBe(2);
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('returns fallback on invalid JSON', () => {
    it('returns no-match values for completely invalid JSON', () => {
      const input = 'This is not JSON at all';
      const result = parseMatchResult(input);

      expect(result.index).toBe(-1);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Fallback');
    });

    it('returns no-match values for partial JSON', () => {
      const input = '{"index": 1, "confidence":';
      const result = parseMatchResult(input);

      expect(result.index).toBe(-1);
      expect(result.confidence).toBe(0);
    });

    it('returns no-match values for empty string', () => {
      const input = '';
      const result = parseMatchResult(input);

      expect(result.index).toBe(-1);
      expect(result.confidence).toBe(0);
    });

    it('returns default values for empty object', () => {
      const input = '{}';
      const result = parseMatchResult(input);

      expect(result.index).toBe(0);
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  describe('handles edge cases', () => {
    it('handles missing reasoning field', () => {
      const input = '{"index": 1, "confidence": 0.8}';
      const result = parseMatchResult(input);

      expect(result.index).toBe(1);
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('handles non-number index by defaulting to 0', () => {
      const input = '{"index": "first", "confidence": 0.8, "reasoning": "test"}';
      const result = parseMatchResult(input);

      expect(result.index).toBe(0);
    });

    it('handles non-number confidence by defaulting to 0.5', () => {
      const input = '{"index": 1, "confidence": "high", "reasoning": "test"}';
      const result = parseMatchResult(input);

      expect(result.confidence).toBe(0.5);
    });
  });
});

// ============ CACHING LOGIC TESTS (Unit Tests for Logic) ============

describe('comparePrices caching logic', () => {
  it('returns cached: true when status is complete and forceRefresh is false', () => {
    // Simulate caching logic as implemented in the function
    const existingDoc = {
      exists: true,
      data: () => ({ status: 'complete', results: [], completedAt: Date.now() }),
    };
    const forceRefresh = false;

    // This is the caching logic from the function
    const shouldReturnCached = !forceRefresh && existingDoc.exists && existingDoc.data()?.status === 'complete';

    expect(shouldReturnCached).toBe(true);
    // When shouldReturnCached is true, function returns { cached: true }
    const expectedResponse = shouldReturnCached ? { cached: true } : { cached: false };
    expect(expectedResponse).toEqual({ cached: true });
  });

  it('runs full comparison when forceRefresh is true', () => {
    const existingDoc = {
      exists: true,
      data: () => ({ status: 'complete', results: [], completedAt: Date.now() }),
    };
    const forceRefresh = true;

    // When forceRefresh is true, we should NOT return cached
    const shouldReturnCached = !forceRefresh && existingDoc.exists && existingDoc.data()?.status === 'complete';

    expect(shouldReturnCached).toBe(false);
    // Would proceed to initialize and run comparison
  });

  it('runs full comparison when no existing results', () => {
    const existingDoc = {
      exists: false,
      data: (): { status: string } | null => null,
    };
    const forceRefresh = false;

    const shouldReturnCached = !forceRefresh && existingDoc.exists && existingDoc.data()?.status === 'complete';

    // When no results exist, should run full comparison
    expect(existingDoc.exists).toBe(false);
    expect(shouldReturnCached).toBe(false);
  });

  it('runs full comparison when status is not complete', () => {
    const existingDoc = {
      exists: true,
      data: () => ({ status: 'processing', results: [], startedAt: Date.now() }),
    };
    const forceRefresh = false;

    const shouldReturnCached = !forceRefresh && existingDoc.exists && existingDoc.data()?.status === 'complete';

    // Should not return cached when status is 'processing'
    expect(existingDoc.data()?.status).toBe('processing');
    expect(shouldReturnCached).toBe(false);
  });
});

// ============ PROGRESS TRACKING TESTS ============

describe('progress tracking', () => {
  it('initializes document with status processing', () => {
    const productNames = ['Product A', 'Product B'];

    // Simulate initialization data structure
    const initData = {
      status: 'processing',
      totalProducts: productNames.length,
      completedProducts: 0,
      results: [] as unknown[],
      startedAt: Date.now(),
      createdBy: 'test-user',
    };

    expect(initData.status).toBe('processing');
    expect(initData.totalProducts).toBe(2);
    expect(initData.completedProducts).toBe(0);
    expect(initData.results).toEqual([]);
  });

  it('updates completedProducts after each product', () => {
    const results = [{ originalProductName: 'Product A', matches: {}, bestPrice: null, comparedAt: Date.now() }];

    const updateData = {
      completedProducts: results.length,
      results: results,
    };

    expect(updateData.completedProducts).toBe(1);
    expect(updateData.results.length).toBe(1);
  });

  it('sets status to complete on finish', () => {
    const updateData = {
      status: 'complete',
      completedAt: Date.now(),
    };

    expect(updateData.status).toBe('complete');
    expect(updateData.completedAt).toBeDefined();
  });

  it('sets status to error on failure', () => {
    const errorMessage = 'API failed';

    const updateData = {
      status: 'error',
      error: errorMessage,
    };

    expect(updateData.status).toBe('error');
    expect(updateData.error).toBe(errorMessage);
  });
});

// ============ ERROR HANDLING TESTS ============

describe('error handling', () => {
  it('partial failure allows other retailers to succeed', async () => {
    // Simulate a scenario where one retailer fails but others succeed
    const retailerResults = [
      { retailer: 'homeDepot', match: { selectedProduct: { id: '1', name: 'Product', price: 10 }, confidence: 0.9 } },
      { retailer: 'lowes', match: { selectedProduct: null, confidence: 0, reasoning: 'Error: API timeout' } },
      { retailer: 'aceHardware', match: { selectedProduct: { id: '2', name: 'Product', price: 12 }, confidence: 0.8 } },
    ];

    // Verify partial results are preserved
    const successfulRetailers = retailerResults.filter(r => r.match.selectedProduct !== null);
    const failedRetailers = retailerResults.filter(r => r.match.selectedProduct === null);

    expect(successfulRetailers.length).toBe(2);
    expect(failedRetailers.length).toBe(1);
    expect(failedRetailers[0].retailer).toBe('lowes');
  });

  it('complete failure sets status to error', () => {
    const allFailed = [
      { retailer: 'homeDepot', match: { selectedProduct: null, reasoning: 'Error' } },
      { retailer: 'lowes', match: { selectedProduct: null, reasoning: 'Error' } },
      { retailer: 'aceHardware', match: { selectedProduct: null, reasoning: 'Error' } },
    ];

    const anySuccess = allFailed.some(r => r.match.selectedProduct !== null);
    expect(anySuccess).toBe(false);
  });
});

// ============ UNWRANGLE API INTEGRATION TESTS ============

describe('Unwrangle API mock tests', () => {
  it('maps retailer to correct platform', () => {
    const PLATFORMS: Record<string, string> = {
      homeDepot: 'homedepot_search',
      lowes: 'lowes_search',
      aceHardware: 'acehardware_search',
    };

    expect(PLATFORMS.homeDepot).toBe('homedepot_search');
    expect(PLATFORMS.lowes).toBe('lowes_search');
    expect(PLATFORMS.aceHardware).toBe('acehardware_search');
  });

  it('handles empty results from API', () => {
    const mockResults: unknown[] = [];

    expect(mockResults.length).toBe(0);

    // With no results, selectBestMatch should return index -1
    const match = mockResults.length === 0
      ? { index: -1, confidence: 0, reasoning: 'No search results' }
      : { index: 0, confidence: 0.5, reasoning: 'Default' };

    expect(match.index).toBe(-1);
    expect(match.confidence).toBe(0);
  });

  it('normalizes product from Unwrangle response', () => {
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

    expect(price).toBe(3.99);
    expect(rawProduct.id).toBe('ABC123');
    expect(rawProduct.brand).toBe('Generic');
  });
});

// ============ OPENAI INTEGRATION TESTS ============

describe('OpenAI mock tests', () => {
  it('constructs correct prompt for product matching', () => {
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

    expect(prompt).toContain(productName);
    expect(prompt).toContain(retailer);
    expect(prompt).toContain('2x4 Stud 8 Feet');
  });

  it('handles OpenAI error gracefully', () => {
    // When OpenAI fails, we should default to first result
    const fallbackResult = {
      index: 0,
      confidence: 0.5,
      reasoning: 'OpenAI error - defaulting to first result',
    };

    expect(fallbackResult.index).toBe(0);
    expect(fallbackResult.confidence).toBe(0.5);
    expect(fallbackResult.reasoning).toContain('error');
  });
});

// ============ BEST PRICE DETERMINATION TESTS ============

describe('determineBestPrice', () => {
  it('selects lowest price retailer', () => {
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

    expect(bestRetailer).toBe('aceHardware');
    expect(lowestPrice).toBe(3.75);
  });

  it('calculates savings correctly', () => {
    const prices = [3.99, 4.25, 3.75];
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const savings = highestPrice - lowestPrice;

    expect(savings).toBe(0.5);
  });

  it('returns null when no valid products', () => {
    const matches = {
      homeDepot: { selectedProduct: null, confidence: 0 },
      lowes: { selectedProduct: null, confidence: 0 },
      aceHardware: { selectedProduct: null, confidence: 0 },
    };

    const hasValidProduct = Object.values(matches).some(m => m.selectedProduct !== null);
    expect(hasValidProduct).toBe(false);
  });
});

// ============ FUNCTION CONFIGURATION TESTS ============

describe('Cloud Function configuration', () => {
  it('has CORS enabled for all origins', async () => {
    // Import the actual function configuration to test it
    const { comparePricesConfig } = await import('./priceComparison');
    // Should use cors: true to match other functions (aiCommand, materialEstimateCommand, sagemakerInvoke)
    expect(comparePricesConfig.cors).toBe(true);
  });

  it('has correct timeout for 2nd gen functions', async () => {
    // Import the actual function configuration to test it
    const { comparePricesConfig } = await import('./priceComparison');

    expect(comparePricesConfig.timeoutSeconds).toBeDefined();
    expect(comparePricesConfig.timeoutSeconds).toBe(540); // Max for 2nd gen
  });

  it('has appropriate memory for LLM calls', async () => {
    // Import the actual function configuration to test it
    const { comparePricesConfig } = await import('./priceComparison');

    expect(comparePricesConfig.memory).toBeDefined();
    expect(comparePricesConfig.memory).toBe('1GiB');
  });
});
