# Story PC-2: Unwrangle + LLM Cloud Function

**Epic:** Price Intelligence Module
**Story ID:** PC-2
**Status:** done
**Complexity:** Large
**Dependencies:** PC-1 (Types)

---

## User Story

**As a** frontend application
**I want** a Cloud Function that fetches and matches products from multiple retailers
**So that** I can display price comparisons to users

---

## Description

Create a Firebase Cloud Function that:
1. Accepts a product name
2. Queries Unwrangle API for Home Depot, Lowe's, and Ace Hardware
3. Uses OpenAI to select the best matching product from each retailer
4. Caches results in Firestore
5. Returns normalized comparison results

---

## Acceptance Criteria

- [x] **AC1:** Cloud Function `comparePrices` is callable from frontend
- [x] **AC2:** Function accepts `projectId` as required parameter
- [x] **AC3:** Function checks for existing `status: 'complete'` results in Firestore
- [x] **AC4:** If complete results exist AND `forceRefresh` is false → return `{ cached: true }` immediately
- [x] **AC5:** If no results OR `forceRefresh` is true → run full comparison with incremental writes
- [x] **AC6:** Function writes progress to Firestore after EACH product completes (real-time updates)
- [x] **AC7:** Function queries all 3 retailers via Unwrangle API in parallel (per product)
- [x] **AC8:** OpenAI GPT-4o-mini selects best match per retailer with JSON sanitization
- [x] **AC9:** LLM response parser handles markdown-wrapped JSON (strips ```json blocks)
- [x] **AC10:** Function handles partial failures gracefully (1-2 retailers fail for a product)
- [x] **AC11:** Firestore document includes `status` field: 'processing' | 'complete' | 'error'
- [x] **AC12:** Timeout is set to 540 seconds (max for 2nd gen functions)
- [x] **AC13:** CORS configured for localhost dev servers
- [x] **AC14:** Unit tests with mocked API responses pass

---

## Technical Details

### File to Create

**`functions/src/priceComparison.ts`**

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import OpenAI from 'openai'

// Types (duplicate for Cloud Functions - can't import from src/)
type Retailer = 'homeDepot' | 'lowes' | 'aceHardware'
type ComparisonStatus = 'processing' | 'complete' | 'error'

interface CompareRequest {
  projectId: string
  productNames: string[]
  forceRefresh?: boolean
  zipCode?: string
}

interface RetailerProduct {
  id: string
  name: string
  brand: string | null
  price: number
  currency: string
  url: string
  imageUrl?: string
  retailer: Retailer
}

interface MatchResult {
  selectedProduct: RetailerProduct | null
  confidence: number
  reasoning: string
  searchResultsCount: number
}

interface ComparisonResult {
  originalProductName: string
  matches: Record<Retailer, MatchResult>
  bestPrice: { retailer: Retailer; product: RetailerProduct; savings: number } | null
  comparedAt: number
}

const PLATFORMS = {
  homeDepot: 'homedepot_search',
  lowes: 'lowes_search',
  aceHardware: 'acehardware_search',
} as const

const RETAILERS: Retailer[] = ['homeDepot', 'lowes', 'aceHardware']

// ============ UNWRANGLE API ============

async function fetchFromUnwrangle(
  productName: string,
  platform: string,
  zipCode?: string
): Promise<unknown[]> {
  const apiKey = process.env.UNWRANGLE_API_KEY
  const params = new URLSearchParams({
    platform,
    search: productName,
    api_key: apiKey!,
  })
  if (zipCode) params.append('zipcode', zipCode)

  const url = `https://data.unwrangle.com/api/getter/?${params}`
  const res = await fetch(url)
  const data = await res.json()
  return data.results || []
}

// ============ JSON SANITIZATION ============

/**
 * Parse LLM response, handling markdown-wrapped JSON
 * GPT-4o-mini sometimes returns: ```json\n{...}\n```
 */
function parseMatchResult(content: string): { index: number; confidence: number; reasoning: string } {
  const cleaned = content
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      index: typeof parsed.index === 'number' ? parsed.index : 0,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || 'No reasoning provided',
    }
  } catch {
    // Fallback if JSON parsing fails
    return { index: 0, confidence: 0.5, reasoning: 'Fallback to first result (JSON parse failed)' }
  }
}

// ============ LLM MATCHING ============

async function selectBestMatch(
  productName: string,
  results: unknown[],
  retailer: Retailer
): Promise<{ index: number; confidence: number; reasoning: string }> {
  if (results.length === 0) {
    return { index: -1, confidence: 0, reasoning: 'No search results' }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
  })

  const content = response.choices[0]?.message?.content || '{}'
  return parseMatchResult(content)
}

// ============ SINGLE PRODUCT COMPARISON ============

async function compareOneProduct(
  productName: string,
  zipCode?: string
): Promise<ComparisonResult> {
  const matches: Record<Retailer, MatchResult> = {} as Record<Retailer, MatchResult>

  // Fetch from all retailers in parallel
  const retailerResults = await Promise.all(
    RETAILERS.map(async (retailer) => {
      try {
        const results = await fetchFromUnwrangle(productName, PLATFORMS[retailer], zipCode)
        const match = await selectBestMatch(productName, results, retailer)

        let selectedProduct: RetailerProduct | null = null
        if (match.index >= 0 && results[match.index]) {
          selectedProduct = normalizeProduct(results[match.index], retailer)
        }

        return {
          retailer,
          match: {
            selectedProduct,
            confidence: match.confidence,
            reasoning: match.reasoning,
            searchResultsCount: results.length,
          },
        }
      } catch (error) {
        return {
          retailer,
          match: {
            selectedProduct: null,
            confidence: 0,
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
            searchResultsCount: 0,
          },
        }
      }
    })
  )

  // Build matches record
  for (const { retailer, match } of retailerResults) {
    matches[retailer] = match
  }

  // Determine best price
  const bestPrice = determineBestPrice(matches)

  return {
    originalProductName: productName,
    matches,
    bestPrice,
    comparedAt: Date.now(),
  }
}

// ============ MAIN CLOUD FUNCTION ============

export const comparePrices = onCall<{ request: CompareRequest }>({
  cors: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  maxInstances: 10,
  memory: '1GiB',
  timeoutSeconds: 540,  // Max for 2nd gen - handles large product lists
}, async (req) => {
  const { projectId, productNames, forceRefresh, zipCode } = req.data.request
  const db = getFirestore()
  const docRef = db.collection('projects').doc(projectId)
    .collection('priceComparison').doc('latest')

  // 1. Check for existing complete results (unless forceRefresh)
  if (!forceRefresh) {
    const existingDoc = await docRef.get()
    if (existingDoc.exists && existingDoc.data()?.status === 'complete') {
      return { cached: true }
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
  })

  const results: ComparisonResult[] = []

  try {
    // 3. Process each product and update Firestore incrementally
    for (const productName of productNames) {
      const result = await compareOneProduct(productName, zipCode)
      results.push(result)

      // Update progress - frontend sees this via onSnapshot
      await docRef.update({
        completedProducts: results.length,
        results: results,
      })
    }

    // 4. Mark complete
    await docRef.update({
      status: 'complete' as ComparisonStatus,
      completedAt: Date.now(),
    })

    return { cached: false }

  } catch (error) {
    // Handle errors gracefully
    await docRef.update({
      status: 'error' as ComparisonStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new HttpsError('internal', 'Price comparison failed')
  }
})
```

### Unwrangle API Details

| Retailer | Platform | Endpoint |
|----------|----------|----------|
| Home Depot | `homedepot_search` | `https://data.unwrangle.com/api/getter/` |
| Lowe's | `lowes_search` | `https://data.unwrangle.com/api/getter/` |
| Ace Hardware | `acehardware_search` | `https://data.unwrangle.com/api/getter/` |

### Firestore Structure (Project-Scoped, Real-time)

```
Firestore: projects/{projectId}/priceComparison/latest
{
  status: 'processing' | 'complete' | 'error',  // Real-time status
  totalProducts: number,              // Total products to compare
  completedProducts: number,          // Products completed so far
  results: ComparisonResult[],        // Results array (grows incrementally)
  startedAt: number,                  // Timestamp when started
  completedAt?: number,               // Timestamp when finished
  createdBy: string,                  // User ID
  error?: string,                     // Error message if status='error'
}
```

**Key Behavior:**
- Results saved PER PROJECT, not globally
- Document updated after EACH product completes
- Frontend subscribes via `onSnapshot` for real-time updates
- `status` field drives UI state (loading/complete/error)
- Overwritten on "Refresh Prices" (forceRefresh=true)

### Error Handling

| Scenario | Response |
|----------|----------|
| Unwrangle timeout | Return null for that retailer |
| No results | Return empty match for that retailer |
| LLM invalid JSON | Fallback to first result |
| All retailers fail | Return error response |

---

## Testing

**Unit Tests (`functions/src/priceComparison.test.ts`):**

1. Complete results exist (status='complete'), forceRefresh=false → returns `{ cached: true }` immediately
2. Complete results exist, forceRefresh=true → runs full comparison, overwrites
3. No existing results → initializes with status='processing', processes all products
4. `parseMatchResult()` handles clean JSON
5. `parseMatchResult()` handles markdown-wrapped JSON (```json blocks)
6. `parseMatchResult()` returns fallback on invalid JSON
7. Mock Unwrangle responses for all 3 retailers
8. Mock OpenAI response
9. Test partial failure (1-2 retailers fail for a product) → other retailers still work
10. Test complete failure → status set to 'error' with message
11. Verify Firestore document updated after each product (incremental writes)
12. Verify final status is 'complete' with completedAt timestamp

---

## Environment Variables

Add to `functions/.env`:
```
UNWRANGLE_API_KEY=your_key_here
# OPENAI_API_KEY already exists
```

---

## Dev Notes

### Architecture Patterns and Constraints

- Follow existing Cloud Function pattern from `functions/src/pricing.ts` (Lines 226-365)
- Use `onCall` pattern with CORS configuration for localhost dev servers
- Use `Promise.all` for parallel API calls to all 3 retailers
- Incremental Firestore writes after each product (real-time updates pattern)
- Types duplicated in Cloud Function (can't import from `src/`)
- [Source: docs/price-comparison-tech-spec.md, "Existing Patterns to Follow"]

### References

- [Source: docs/price-comparison-tech-spec.md, "Cloud Function Structure"]
- [Source: docs/price-comparison-tech-spec.md, "Technical Approach"]
- [Source: docs/price-comparison-tech-spec.md, "Unwrangle API Integration"]
- [Source: docs/sprint-artifacts/epic-price-comparison.md, "Technical Dependencies"]

### Implementation Notes

- Timeout set to 540s (max for 2nd gen functions) to handle large product lists
- LLM response parser must handle markdown-wrapped JSON (`\`\`\`json` blocks)
- `normalizeProduct()` helper needed to convert Unwrangle response to `RetailerProduct`
- `determineBestPrice()` helper needed to find lowest price across retailers
- Log all API calls for debugging
- Don't forget to export from `functions/src/index.ts`

### Learnings from Previous Story

- PC-1 provides types that must be duplicated in Cloud Function
- Ensure type definitions match exactly between `src/types/priceComparison.ts` and function

---

## Tasks

- [x] **Task 1 (AC: #1, #12, #13):** Set up Cloud Function scaffold
  - [x] Create `functions/src/priceComparison.ts`
  - [x] Configure `onCall` with CORS, memory, timeout
  - [x] Export from `functions/src/index.ts`
- [x] **Task 2 (AC: #2, #3, #4, #5):** Implement caching logic
  - [x] Check for existing `status: 'complete'` results
  - [x] Handle `forceRefresh` parameter
  - [x] Return `{ cached: true }` when appropriate
- [x] **Task 3 (AC: #6, #11):** Implement progress tracking
  - [x] Initialize Firestore document with `status: 'processing'`
  - [x] Update after each product completes
  - [x] Set `status: 'complete'` or `status: 'error'` on finish
- [x] **Task 4 (AC: #7):** Implement Unwrangle API integration
  - [x] Create `fetchFromUnwrangle()` function
  - [x] Query all 3 retailers in parallel per product
  - [x] Handle API errors gracefully
- [x] **Task 5 (AC: #8, #9):** Implement LLM matching
  - [x] Create `selectBestMatch()` with OpenAI
  - [x] Create `parseMatchResult()` with JSON sanitization
  - [x] Handle markdown-wrapped JSON responses
- [x] **Task 6 (AC: #10):** Implement error handling
  - [x] Handle partial failures (1-2 retailers fail)
  - [x] Ensure other retailers still return results
- [x] **Task 7 (AC: #14):** Write unit tests
  - [x] Test caching logic
  - [x] Test `parseMatchResult()` with various inputs
  - [x] Mock Unwrangle and OpenAI responses
  - [x] Test partial and complete failures

---

## Dev Agent Record

### Context Reference
- Depends on PC-1 for type definitions (duplicate in function)
- [Source: docs/sprint-artifacts/story-pc-1-types-mock-data.md]
- [Context: docs/sprint-artifacts/pc-2-cloud-function.context.xml]

### Agent Model Used
- Claude Opus 4.5

### Debug Log References
- TypeScript compilation: OK
- Unit tests: 34/34 passed

### Completion Notes List
- [x] Created `comparePrices` Cloud Function with all 14 acceptance criteria implemented
- [x] Followed existing `pricing.ts` patterns for onCall, CORS, error handling
- [x] Implemented parallel Unwrangle API calls to 3 retailers (Home Depot, Lowe's, Ace Hardware)
- [x] Implemented LLM product matching with GPT-4o-mini
- [x] Added `parseMatchResult()` with markdown JSON sanitization
- [x] Implemented incremental Firestore progress updates for real-time frontend subscription
- [x] Added comprehensive unit test suite (34 tests)
- [x] Added vitest to functions package.json

### File List
- NEW: `functions/src/priceComparison.ts` (main Cloud Function implementation)
- NEW: `functions/src/priceComparison.test.ts` (34 unit tests)
- MODIFIED: `functions/src/index.ts` (added comparePrices export)
- MODIFIED: `functions/package.json` (added vitest, test scripts)
- TODO: `functions/.env` (add UNWRANGLE_API_KEY - user must configure)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-10 | Initial draft | SM |
| 2025-12-10 | Added Dev Notes, Dev Agent Record, Tasks | SM (auto-improve) |
| 2025-12-10 | Implementation complete - all tasks done, 34 tests pass | Dev Agent |
| 2025-12-10 | Senior Developer Review notes appended | xvanov (AI Review) |

---

## Senior Developer Review (AI)

### Reviewer
xvanov

### Date
2025-12-10

### Outcome
**APPROVE** ✓

**Justification:** All 14 acceptance criteria are fully implemented with file:line evidence. All 7 tasks (with all subtasks) are verified complete. No falsely marked complete tasks found. All tests pass (34/34). Code follows existing patterns from `pricing.ts`. Tech-spec requirements are met. Security practices are appropriate.

---

### Summary

The PC-2 Cloud Function implementation is complete and production-ready. The `comparePrices` function successfully:
- Queries Unwrangle API for Home Depot, Lowe's, and Ace Hardware in parallel
- Uses GPT-4o-mini to select best matching products with JSON sanitization
- Implements proper caching with forceRefresh support
- Provides real-time progress updates via Firestore incremental writes
- Handles partial failures gracefully (1-2 retailers can fail without breaking entire comparison)

The implementation closely follows the existing `pricing.ts` patterns and meets all tech-spec requirements.

---

### Key Findings

**No HIGH or MEDIUM severity issues found.**

#### LOW Severity

| Finding | File:Line | Details |
|---------|-----------|---------|
| Code style uses semicolons | Throughout | Tech-spec says "no semicolons" but existing `pricing.ts` uses semicolons. Follows actual codebase convention. |
| `normalizeProduct`/`determineBestPrice` not directly tested | `priceComparison.ts:210-286` | These helpers are tested indirectly through integration tests. Acceptable for MVP scope. |
| Integration tests mock Firestore | `priceComparison.test.ts:10-24` | Tests verify logic but not actual database operations. Acceptable for unit test scope. |
| Authentication not required | `priceComparison.ts:401` | Uses `req.auth?.uid || 'anonymous'`. Acceptable for MVP scope. |

---

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Cloud Function `comparePrices` is callable from frontend | ✅ IMPLEMENTED | `priceComparison.ts:354` |
| AC2 | Function accepts `projectId` as required parameter | ✅ IMPLEMENTED | `priceComparison.ts:368-374` |
| AC3 | Function checks for existing `status: 'complete'` results | ✅ IMPLEMENTED | `priceComparison.ts:385-392` |
| AC4 | If complete results exist AND forceRefresh=false → return cached | ✅ IMPLEMENTED | `priceComparison.ts:386-391` |
| AC5 | If no results OR forceRefresh=true → run full comparison | ✅ IMPLEMENTED | `priceComparison.ts:386-430` |
| AC6 | Function writes progress after EACH product completes | ✅ IMPLEMENTED | `priceComparison.ts:415-418` |
| AC7 | Function queries all 3 retailers in parallel | ✅ IMPLEMENTED | `priceComparison.ts:298-332` |
| AC8 | OpenAI GPT-4o-mini selects best match per retailer | ✅ IMPLEMENTED | `priceComparison.ts:180-206` |
| AC9 | LLM parser handles markdown-wrapped JSON | ✅ IMPLEMENTED | `priceComparison.ts:141-159` |
| AC10 | Function handles partial failures gracefully | ✅ IMPLEMENTED | `priceComparison.ts:319-330` |
| AC11 | Firestore document includes status field | ✅ IMPLEMENTED | `priceComparison.ts:38,396,425,436` |
| AC12 | Timeout is set to 540 seconds | ✅ IMPLEMENTED | `priceComparison.ts:363` |
| AC13 | CORS configured for localhost dev servers | ✅ IMPLEMENTED | `priceComparison.ts:355-360` |
| AC14 | Unit tests with mocked API responses pass | ✅ IMPLEMENTED | 34/34 tests pass |

**Summary: 14 of 14 acceptance criteria fully implemented**

---

### Task Completion Validation

| Task | Marked As | Verified As | Evidence |
|------|-----------|-------------|----------|
| Task 1: Set up Cloud Function scaffold | ✅ Complete | ✅ VERIFIED | File created, onCall configured, exported in index.ts |
| Task 2: Implement caching logic | ✅ Complete | ✅ VERIFIED | `priceComparison.ts:385-392` |
| Task 3: Implement progress tracking | ✅ Complete | ✅ VERIFIED | `priceComparison.ts:395-402,415-418,424-427,435-438` |
| Task 4: Implement Unwrangle API integration | ✅ Complete | ✅ VERIFIED | `priceComparison.ts:86-133,298-332` |
| Task 5: Implement LLM matching | ✅ Complete | ✅ VERIFIED | `priceComparison.ts:141-206` |
| Task 6: Implement error handling | ✅ Complete | ✅ VERIFIED | `priceComparison.ts:319-330` |
| Task 7: Write unit tests | ✅ Complete | ✅ VERIFIED | 34 tests in `priceComparison.test.ts` |

**Summary: 7 of 7 completed tasks verified, 0 questionable, 0 false completions**

---

### Test Coverage and Gaps

| Category | Status | Details |
|----------|--------|---------|
| parseMatchResult tests | ✅ 13 tests | Clean JSON, markdown-wrapped, invalid JSON, edge cases |
| Caching logic tests | ✅ 4 tests | forceRefresh scenarios, status checks |
| Progress tracking tests | ✅ 4 tests | Initialization, incremental updates, completion states |
| Error handling tests | ✅ 2 tests | Partial failure, complete failure |
| Unwrangle API tests | ✅ 4 tests | Platform mapping, empty results, normalization |
| OpenAI integration tests | ✅ 3 tests | Prompt construction, error handling |
| Best price tests | ✅ 3 tests | Lowest price selection, savings calculation, null handling |
| Config tests | ✅ 3 tests | CORS, timeout, memory settings |

**Total: 34 tests passing**

**Gaps:** Integration tests mock Firestore (acceptable for unit test scope)

---

### Architectural Alignment

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Follows `pricing.ts` onCall pattern | ✅ | Same structure, CORS, error handling |
| Firebase 2nd gen function | ✅ | `timeoutSeconds: 540` (max for 2nd gen) |
| Firestore path: `projects/{projectId}/priceComparison/latest` | ✅ | `priceComparison.ts:382-383` |
| Types duplicated in Cloud Function | ✅ | `priceComparison.ts:35-70` |
| Real-time updates pattern | ✅ | Incremental writes per product |

---

### Security Notes

| Area | Status | Details |
|------|--------|---------|
| API key handling | ✅ Secure | Loaded from env vars, not logged |
| Input validation | ✅ Secure | projectId and productNames validated |
| CORS configuration | ✅ Appropriate | Localhost dev servers only |
| No injection vectors | ✅ Secure | User input safely used in Firestore paths |
| Authentication | ⚠️ Note | Optional auth (stores uid or 'anonymous') - acceptable for MVP |

---

### Best-Practices and References

| Topic | Source |
|-------|--------|
| Firebase Cloud Functions 2nd Gen | [Firebase Docs](https://firebase.google.com/docs/functions) |
| OpenAI Chat Completions | [OpenAI API](https://platform.openai.com/docs/api-reference/chat) |
| Unwrangle API | [Unwrangle Docs](https://docs.unwrangle.com) |
| Firestore Real-time Updates | [Firestore Docs](https://firebase.google.com/docs/firestore/query-data/listen) |

---

### Action Items

**Code Changes Required:**
_None - implementation meets all requirements_

**Advisory Notes:**
- Note: Add production domain to CORS configuration before deployment
- Note: Configure `UNWRANGLE_API_KEY` in `functions/.env` before testing with real API
- Note: Consider adding direct unit tests for `normalizeProduct()` and `determineBestPrice()` helpers for enhanced coverage
