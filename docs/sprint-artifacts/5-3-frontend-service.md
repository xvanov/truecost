# Story PC-3: Frontend Service Layer

**Epic:** Price Intelligence Module
**Story ID:** PC-3
**Status:** done
**Complexity:** Medium
**Dependencies:** PC-2 (Cloud Function)

---

## User Story

**As a** UI component
**I want** a service layer to call the price comparison Cloud Function
**So that** I can display comparison results with progress updates

---

## Description

Create a frontend service that:
1. Calls the `comparePrices` Cloud Function to start comparison
2. Subscribes to Firestore document for real-time progress updates
3. Handles errors gracefully
4. Returns unsubscribe function for cleanup

---

## Acceptance Criteria

- [x] **AC1:** `priceComparisonService.ts` exports `startComparison()` function
- [x] **AC2:** `priceComparisonService.ts` exports `subscribeToComparison()` function
- [x] **AC3:** `startComparison()` accepts `projectId` and `forceRefresh` parameters
- [x] **AC4:** `startComparison()` returns `Promise<{ cached: boolean }>`
- [x] **AC5:** `subscribeToComparison()` accepts callback for `ComparisonProgress` updates
- [x] **AC6:** `subscribeToComparison()` returns unsubscribe function for cleanup
- [x] **AC7:** Real-time updates fire as each product completes in Firestore
- [x] **AC8:** Network errors are caught and passed to error callback
- [x] **AC9:** Unit tests pass with mocked Firestore and Cloud Function

---

## Technical Details

### File to Create

**`src/services/priceComparisonService.ts`**

```typescript
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, db } from './firebase'
import type {
  ComparisonProgress,
  CompareRequest,
} from '../types/priceComparison'
import { MOCK_PRODUCTS } from '../data/mockProducts'

const compareProductsFn = httpsCallable(functions, 'comparePrices')

/**
 * Start a price comparison for products
 * This triggers the Cloud Function which writes progress to Firestore
 * Use subscribeToComparison() to get real-time updates
 */
export async function startComparison(
  projectId: string,
  productNames: string[],
  forceRefresh: boolean = false,
  zipCode?: string
): Promise<{ cached: boolean }> {
  try {
    const response = await compareProductsFn({
      request: {
        projectId,
        productNames,
        forceRefresh,
        zipCode,
      } as CompareRequest,
    })

    return response.data as { cached: boolean }
  } catch (error) {
    console.error('[COMPARE] Error starting comparison:', error)
    throw error
  }
}

/**
 * Subscribe to real-time comparison progress updates
 * Returns an unsubscribe function for cleanup
 */
export function subscribeToComparison(
  projectId: string,
  onUpdate: (progress: ComparisonProgress) => void,
  onError: (error: Error) => void
): () => void {
  const docRef = doc(db, 'projects', projectId, 'priceComparison', 'latest')

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as ComparisonProgress)
      }
    },
    (error) => {
      console.error('[COMPARE] Subscription error:', error)
      onError(error)
    }
  )
}

/**
 * Start comparison with mock products (for development/testing)
 */
export async function startMockComparison(
  projectId: string,
  forceRefresh: boolean = false
): Promise<{ cached: boolean }> {
  return startComparison(projectId, MOCK_PRODUCTS, forceRefresh)
}
```

### Test File

**`src/services/priceComparisonService.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startComparison, subscribeToComparison } from './priceComparisonService'

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn((ref, onNext, onError) => {
    // Return mock unsubscribe function
    return vi.fn()
  }),
}))

vi.mock('./firebase', () => ({
  functions: {},
  db: {},
}))

describe('priceComparisonService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('startComparison', () => {
    it('calls Cloud Function with correct parameters', async () => {
      // Mock implementation...
    })

    it('returns { cached: true } when results exist', async () => {
      // Mock implementation...
    })

    it('returns { cached: false } for fresh comparison', async () => {
      // Mock implementation...
    })
  })

  describe('subscribeToComparison', () => {
    it('returns unsubscribe function', () => {
      const unsubscribe = subscribeToComparison(
        'test-project',
        vi.fn(),
        vi.fn()
      )
      expect(typeof unsubscribe).toBe('function')
    })

    it('calls onUpdate when document changes', () => {
      // Mock implementation...
    })

    it('calls onError on subscription error', () => {
      // Mock implementation...
    })
  })
})
```

---

## Testing

1. `startComparison()` calls Cloud Function with projectId, productNames, forceRefresh
2. `startComparison()` returns `{ cached: true }` when existing results found
3. `startComparison()` returns `{ cached: false }` for fresh comparison
4. `subscribeToComparison()` returns unsubscribe function
5. `subscribeToComparison()` fires onUpdate when Firestore document updates
6. `subscribeToComparison()` fires onError on subscription failure
7. `startMockComparison()` uses MOCK_PRODUCTS array

---

## Dev Notes

### Architecture Patterns and Constraints

- Follow existing service pattern from `src/services/pricingService.ts` (Lines 57-130)
- Use `httpsCallable` from Firebase for Cloud Function calls
- Use `onSnapshot` for Firestore real-time subscriptions
- Return unsubscribe function for cleanup in React useEffect
- Import types from `src/types/priceComparison.ts` (created in PC-1)
- Don't modify existing services
- [Source: docs/price-comparison-tech-spec.md, "Frontend Service Pattern"]

### References

- [Source: docs/price-comparison-tech-spec.md, "Frontend Service Pattern (Subscription-based)"]
- [Source: docs/price-comparison-tech-spec.md, "Integration Points"]
- [Source: docs/sprint-artifacts/story-pc-1-types-mock-data.md, "Types"]
- [Source: docs/sprint-artifacts/story-pc-2-cloud-function.md, "Firestore Structure"]

### Implementation Notes

- `startComparison()` triggers Cloud Function, returns `{ cached: boolean }`
- `subscribeToComparison()` sets up Firestore listener for real-time progress
- `startMockComparison()` convenience function uses MOCK_PRODUCTS from PC-1
- Firestore path: `projects/{projectId}/priceComparison/latest`
- Error handling: catch and pass to error callback, log to console

### Learnings from Previous Story

- PC-2 Cloud Function writes to `projects/{projectId}/priceComparison/latest`
- PC-2 returns `{ cached: true }` when results exist, `{ cached: false }` for fresh comparison
- PC-2 updates Firestore incrementally after each product completes

---

## Tasks

- [x] **Task 1 (AC: #1, #3, #4):** Implement `startComparison()` function
  - [x] Create `src/services/priceComparisonService.ts`
  - [x] Use `httpsCallable` to call `comparePrices` Cloud Function
  - [x] Accept `projectId`, `productNames`, `forceRefresh`, `zipCode` parameters
  - [x] Return `Promise<{ cached: boolean }>`
- [x] **Task 2 (AC: #2, #5, #6, #7):** Implement `subscribeToComparison()` function
  - [x] Use `onSnapshot` for Firestore real-time listener
  - [x] Accept callback for `ComparisonProgress` updates
  - [x] Return unsubscribe function for cleanup
- [x] **Task 3 (AC: #8):** Implement error handling
  - [x] Catch network errors
  - [x] Pass errors to error callback
  - [x] Log errors to console
- [x] **Task 4:** Implement `startMockComparison()` convenience function
  - [x] Use `MOCK_PRODUCTS` from PC-1
  - [x] Wrap `startComparison()` with mock data
- [x] **Task 5 (AC: #9):** Write unit tests
  - [x] Mock `httpsCallable` and `onSnapshot`
  - [x] Test `startComparison()` parameters and return values
  - [x] Test `subscribeToComparison()` returns unsubscribe function
  - [x] Test error callback invocation

---

## Dev Agent Record

### Context Reference
- **Context File:** `docs/sprint-artifacts/pc-3-frontend-service.context.xml`
- Depends on PC-1 for types (`ComparisonProgress`, `CompareRequest`)
- Depends on PC-2 for Cloud Function (`comparePrices`) and Firestore structure
- [Source: docs/sprint-artifacts/story-pc-1-types-mock-data.md]
- [Source: docs/sprint-artifacts/story-pc-2-cloud-function.md]

### Agent Model Used
- Claude Opus 4.5

### Debug Log References
- All 21 unit tests pass
- All 679 regression tests pass
- TypeScript type check passes

### Completion Notes List
- [x] Created `src/services/priceComparisonService.ts` with all 3 exported functions
- [x] `startComparison()` - calls Cloud Function via `httpsCallable`, returns `{ cached: boolean }`
- [x] `subscribeToComparison()` - sets up Firestore real-time listener via `onSnapshot`, returns unsubscribe function
- [x] `startMockComparison()` - convenience wrapper using MOCK_PRODUCTS array
- [x] Comprehensive error handling with console logging
- [x] 21 unit tests covering all acceptance criteria
- [x] Fixed module-level callable issue by deferring `httpsCallable` call inside function

### File List
- NEW: `src/services/priceComparisonService.ts`
- NEW: `src/services/priceComparisonService.test.ts`

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-10 | Initial draft | SM |
| 2025-12-10 | Added Dev Notes, Dev Agent Record, Tasks | SM (auto-improve) |
| 2025-12-10 | Implementation complete - all tasks done, 21 tests pass, ready for review | Dev Agent |
| 2025-12-10 | Senior Developer Review notes appended | Code Review Agent |

---

## Senior Developer Review (AI)

### Review Metadata
- **Reviewer:** Code Review Agent
- **Date:** 2025-12-10
- **Outcome:** ✅ **APPROVE**

### Summary
Excellent implementation of the frontend service layer. All 9 acceptance criteria are fully implemented with strong evidence. All 5 tasks and 17 subtasks are verified complete. The code follows established patterns, has comprehensive test coverage (21 tests), and adheres to project conventions. No blocking issues found.

### Key Findings

**No HIGH severity issues found.**

**LOW severity observations (informational only):**
1. [Low] The story template in Technical Details shows `db` import but actual implementation correctly uses `firestore` - documentation is slightly out of sync but implementation is correct.

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | `priceComparisonService.ts` exports `startComparison()` function | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:15` - `export async function startComparison` |
| AC2 | `priceComparisonService.ts` exports `subscribeToComparison()` function | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:43` - `export function subscribeToComparison` |
| AC3 | `startComparison()` accepts `projectId` and `forceRefresh` parameters | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:16-19` - function signature with `projectId: string`, `forceRefresh: boolean = false` |
| AC4 | `startComparison()` returns `Promise<{ cached: boolean }>` | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:20` - `: Promise<{ cached: boolean }>` return type, line 32 returns `response.data as { cached: boolean }` |
| AC5 | `subscribeToComparison()` accepts callback for `ComparisonProgress` updates | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:45` - `onUpdate: (progress: ComparisonProgress) => void` parameter |
| AC6 | `subscribeToComparison()` returns unsubscribe function for cleanup | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:47` - return type `() => void`, line 50 returns `onSnapshot(...)` which returns unsubscribe function |
| AC7 | Real-time updates fire as each product completes in Firestore | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:50-61` - uses `onSnapshot` which fires on every document change; test `priceComparisonService.test.ts:164-188` verifies callback behavior |
| AC8 | Network errors are caught and passed to error callback | ✅ IMPLEMENTED | `src/services/priceComparisonService.ts:33-36` for startComparison (catch, log, re-throw); `src/services/priceComparisonService.ts:57-60` for subscribeToComparison (error handler passed to onSnapshot) |
| AC9 | Unit tests pass with mocked Firestore and Cloud Function | ✅ IMPLEMENTED | 21/21 tests pass in `src/services/priceComparisonService.test.ts`; mocks at lines 6-22 |

**Summary: 9 of 9 acceptance criteria fully implemented** ✅

### Task Completion Validation

| Task | Marked As | Verified As | Evidence |
|------|-----------|-------------|----------|
| Task 1: Implement `startComparison()` function | [x] Complete | ✅ VERIFIED | Lines 15-37 |
| - Create `src/services/priceComparisonService.ts` | [x] Complete | ✅ VERIFIED | File exists at `src/services/priceComparisonService.ts` |
| - Use `httpsCallable` to call Cloud Function | [x] Complete | ✅ VERIFIED | Line 22: `httpsCallable(functions, 'comparePrices')` |
| - Accept projectId, productNames, forceRefresh, zipCode | [x] Complete | ✅ VERIFIED | Lines 16-19 function parameters |
| - Return `Promise<{ cached: boolean }>` | [x] Complete | ✅ VERIFIED | Line 20 return type, line 32 returns data |
| Task 2: Implement `subscribeToComparison()` function | [x] Complete | ✅ VERIFIED | Lines 43-62 |
| - Use `onSnapshot` for Firestore listener | [x] Complete | ✅ VERIFIED | Line 50: `return onSnapshot(docRef, ...)` |
| - Accept callback for `ComparisonProgress` updates | [x] Complete | ✅ VERIFIED | Line 45: `onUpdate: (progress: ComparisonProgress) => void` |
| - Return unsubscribe function for cleanup | [x] Complete | ✅ VERIFIED | Line 47: `(): () => void` return type; `onSnapshot` returns unsubscribe |
| Task 3: Implement error handling | [x] Complete | ✅ VERIFIED | Lines 33-36 and 57-60 |
| - Catch network errors | [x] Complete | ✅ VERIFIED | Lines 33-36 try/catch in startComparison |
| - Pass errors to error callback | [x] Complete | ✅ VERIFIED | Line 59: `onError(error)` |
| - Log errors to console | [x] Complete | ✅ VERIFIED | Lines 34, 58: `console.error('[COMPARE]...` |
| Task 4: Implement `startMockComparison()` function | [x] Complete | ✅ VERIFIED | Lines 67-72 |
| - Use `MOCK_PRODUCTS` from PC-1 | [x] Complete | ✅ VERIFIED | Line 8 import, line 71 usage |
| - Wrap `startComparison()` with mock data | [x] Complete | ✅ VERIFIED | Line 71: `return startComparison(projectId, MOCK_PRODUCTS, forceRefresh)` |
| Task 5: Write unit tests | [x] Complete | ✅ VERIFIED | 21 tests in test file |
| - Mock `httpsCallable` and `onSnapshot` | [x] Complete | ✅ VERIFIED | Lines 6-13 vi.mock() |
| - Test `startComparison()` parameters and return values | [x] Complete | ✅ VERIFIED | Tests lines 42-141 (9 tests) |
| - Test `subscribeToComparison()` returns unsubscribe | [x] Complete | ✅ VERIFIED | Test lines 145-149 |
| - Test error callback invocation | [x] Complete | ✅ VERIFIED | Tests lines 208-222, 224-238 |

**Summary: 5 of 5 completed tasks verified, 0 questionable, 0 falsely marked complete** ✅

### Test Coverage and Gaps

**Coverage Summary:**
- 21 unit tests covering all functions and edge cases
- All ACs have corresponding tests:
  - AC1/AC2: Implicit (functions exist and are exported)
  - AC3: Tests at lines 42-59, 77-98
  - AC4: Tests at lines 61-75
  - AC5: Tests at lines 241-267
  - AC6: Tests at lines 145-149
  - AC7: Tests at lines 164-188
  - AC8: Tests at lines 125-141 (startComparison errors), lines 208-238 (subscribeToComparison errors)
  - AC9: All 21 tests pass

**No test gaps identified.**

### Architectural Alignment

✅ **Follows established patterns:**
- Uses `httpsCallable` from firebase/functions (matches pricingService.ts pattern)
- Uses `onSnapshot` from firebase/firestore for real-time subscriptions
- Returns unsubscribe function for React useEffect cleanup
- Imports correctly from `./firebase` (functions, firestore)
- Types imported from `../types/priceComparison`
- Test file co-located with source

✅ **Tech-spec compliance:**
- Firestore path matches spec: `projects/{projectId}/priceComparison/latest`
- Function signatures match spec interfaces
- Error handling pattern matches spec requirements

### Security Notes

✅ **No security concerns identified:**
- No secrets or credentials in code
- Uses Firebase SDK authentication implicitly
- No user input validation needed (projectId from authenticated context)
- Error messages don't leak sensitive information

### Best-Practices and References

- [Firebase Callable Functions](https://firebase.google.com/docs/functions/callable) - correctly using httpsCallable pattern
- [Firestore Real-time Updates](https://firebase.google.com/docs/firestore/query-data/listen) - correctly using onSnapshot with error handler
- [Vitest Mocking](https://vitest.dev/guide/mocking.html) - proper use of vi.mock() for Firebase modules
- Implementation defers httpsCallable creation to function scope (best practice for testability)

### Action Items

**Code Changes Required:**
- None required

**Advisory Notes:**
- Note: The story Technical Details section shows `db` import but implementation uses `firestore` - this is correct (story template was slightly different from final implementation)
