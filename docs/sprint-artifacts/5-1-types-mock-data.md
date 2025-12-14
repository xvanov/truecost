# Story PC-1: Types and Mock Data Setup

**Epic:** Price Intelligence Module
**Story ID:** PC-1
**Status:** Done
**Complexity:** Small
**Dependencies:** None

---

## User Story

**As a** developer working on price comparison
**I want** type definitions and mock data in place
**So that** I can build the feature with proper typing and test data

---

## Description

Create the foundational TypeScript types for the price comparison feature and a mock product array that simulates BOM output. This enables parallel development of other stories.

---

## Acceptance Criteria

- [x] **AC1:** `src/types/priceComparison.ts` exists with all interfaces:
  - `Retailer` type union
  - `RetailerProduct` interface
  - `MatchResult` interface
  - `ComparisonResult` interface
  - `CompareRequest` interface (with `projectId` and `forceRefresh`)
  - `ComparisonProgress` interface (for real-time Firestore updates)
  - `ComparisonStatus` type union

- [x] **AC2:** `src/data/mockProducts.ts` exists with:
  - `MOCK_PRODUCTS` array of 10-15 construction material names
  - Realistic product names that match what Unwrangle can find

- [x] **AC3:** Types compile without errors (`npm run typecheck`)

- [x] **AC4:** Mock data is exportable and usable in other files

---

## Technical Details

### Files to Create

**1. `src/types/priceComparison.ts`**
```typescript
export type Retailer = 'homeDepot' | 'lowes' | 'aceHardware'

export interface RetailerProduct {
  id: string
  name: string
  brand: string | null
  price: number
  priceReduced?: number | null
  currency: string
  url: string
  imageUrl?: string
  rating?: number | null
  totalReviews?: number | null
  inStock?: boolean
  retailer: Retailer
}

export interface MatchResult {
  selectedProduct: RetailerProduct | null
  confidence: number
  reasoning: string
  searchResultsCount: number
}

export interface ComparisonResult {
  originalProductName: string
  matches: Record<Retailer, MatchResult>
  bestPrice: {
    retailer: Retailer
    product: RetailerProduct
    savings: number
  } | null
  comparedAt: number
  cached: boolean
}

export interface CompareRequest {
  projectId: string              // Required - which project to save results to
  productNames: string[]
  forceRefresh?: boolean         // If true, skip saved results and re-fetch
  storeNumber?: string
  zipCode?: string
}

/**
 * Status of the comparison process
 */
export type ComparisonStatus = 'idle' | 'processing' | 'complete' | 'error'

/**
 * Real-time progress tracked in Firestore
 * Frontend subscribes to this document for live updates
 */
export interface ComparisonProgress {
  status: ComparisonStatus
  totalProducts: number
  completedProducts: number
  results: ComparisonResult[]
  startedAt: number
  completedAt?: number
  error?: string
}
```

**2. `src/data/mockProducts.ts`**
```typescript
export const MOCK_PRODUCTS: string[] = [
  '2x4 lumber 8ft',
  'drywall 4x8 1/2 inch',
  'interior latex paint gallon white',
  'R-13 fiberglass insulation roll',
  'construction screws 3 inch 1lb',
  'joint compound 5 gallon',
  'drywall tape 500ft',
  'wood stud 2x4x96',
  'primer sealer gallon',
  'electrical outlet 15amp',
  'romex wire 12-2 250ft',
  'pvc pipe 2 inch 10ft',
]
```

---

## Testing

- TypeScript compilation check
- Import test in another file

---

## Dev Notes

### Architecture Patterns and Constraints

- Follow existing naming conventions: no semicolons, single quotes, 2-space indentation
- Types file follows pattern of existing `src/types/material.ts`
- Mock data follows pattern of constants in the codebase (UPPER_SNAKE_CASE)
- These types should NOT modify existing `MaterialSpec` or `BillOfMaterials`
- [Source: docs/price-comparison-tech-spec.md, "Existing Conventions (Brownfield)"]

### References

- [Source: docs/price-comparison-tech-spec.md, "New Type Definitions"]
- [Source: docs/price-comparison-tech-spec.md, "Mock Data"]
- [Source: docs/sprint-artifacts/epic-price-comparison.md, "Exclusive Files"]

### Implementation Notes

- Mock products chosen to be realistic construction materials that Unwrangle API can find
- Types must align exactly with what Cloud Function (PC-2) will use
- `ComparisonProgress` interface enables real-time Firestore subscription pattern

---

## Tasks

- [x] **Task 1 (AC: #1):** Create `src/types/priceComparison.ts` with all interfaces
  - [x] Define `Retailer` type union
  - [x] Define `RetailerProduct` interface
  - [x] Define `MatchResult` interface
  - [x] Define `ComparisonResult` interface
  - [x] Define `CompareRequest` interface
  - [x] Define `ComparisonProgress` interface
  - [x] Define `ComparisonStatus` type union
- [x] **Task 2 (AC: #2):** Create `src/data/mockProducts.ts`
  - [x] Export `MOCK_PRODUCTS` array with 10-15 items
  - [x] Ensure product names are realistic and searchable
- [x] **Task 3 (AC: #3, #4):** Verify compilation and exports
  - [x] Run `npm run typecheck`
  - [x] Test import in another file

---

## Dev Agent Record

### Context Reference
- First story in epic, no previous story context

### Agent Model Used
- Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References
- N/A

### Completion Notes List
- [x] Created `collabcanvas/src/types/priceComparison.ts` with 7 type definitions
- [x] Created `collabcanvas/src/data/mockProducts.ts` with 12 mock product names
- [x] TypeScript compilation verified (tsc --noEmit passes)
- [x] Import test verified exports are usable

### File List
- NEW: `src/types/priceComparison.ts`
- NEW: `src/data/mockProducts.ts`

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-10 | Initial draft | SM |
| 2025-12-10 | Added Dev Notes, Dev Agent Record, Tasks | SM (auto-improve) |
| 2025-12-10 | Senior Developer Review notes appended | AI Review |

---

## Senior Developer Review (AI)

### Reviewer
xvanov (AI-assisted)

### Date
2025-12-10

### Outcome
**Approve** - All acceptance criteria verified, all tasks completed, implementation aligns with tech spec.

### Summary
Story PC-1 implementation is complete and correct. Both required files (`src/types/priceComparison.ts` and `src/data/mockProducts.ts`) were created with all specified types and data. TypeScript compilation passes without errors. The implementation follows existing codebase conventions and aligns with the technical specification.

### Key Findings

**No HIGH or MEDIUM severity issues found.**

**LOW severity observations:**
- Note: Implementation uses semicolons (e.g., `export type Retailer = 'homeDepot' | 'lowes' | 'aceHardware';`) while the Dev Notes mention "no semicolons" convention. However, examining `src/types/material.ts`, the existing codebase also uses semicolons, so this is consistent with actual project patterns.

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | `src/types/priceComparison.ts` exists with all interfaces | **IMPLEMENTED** | File exists at `collabcanvas/src/types/priceComparison.ts:1-84` |
| AC1.1 | `Retailer` type union | **IMPLEMENTED** | `priceComparison.ts:10` - `export type Retailer = 'homeDepot' \| 'lowes' \| 'aceHardware'` |
| AC1.2 | `RetailerProduct` interface | **IMPLEMENTED** | `priceComparison.ts:15-28` - All fields match spec |
| AC1.3 | `MatchResult` interface | **IMPLEMENTED** | `priceComparison.ts:33-38` - All fields match spec |
| AC1.4 | `ComparisonResult` interface | **IMPLEMENTED** | `priceComparison.ts:43-53` - All fields match spec |
| AC1.5 | `CompareRequest` interface | **IMPLEMENTED** | `priceComparison.ts:58-64` - Has `projectId`, `forceRefresh`, and optional fields |
| AC1.6 | `ComparisonProgress` interface | **IMPLEMENTED** | `priceComparison.ts:75-83` - All fields match spec |
| AC1.7 | `ComparisonStatus` type union | **IMPLEMENTED** | `priceComparison.ts:69` - `'idle' \| 'processing' \| 'complete' \| 'error'` |
| AC2 | `src/data/mockProducts.ts` exists with MOCK_PRODUCTS array | **IMPLEMENTED** | File exists at `collabcanvas/src/data/mockProducts.ts:1-22` |
| AC2.1 | Array has 10-15 construction materials | **IMPLEMENTED** | `mockProducts.ts:9-22` - 12 items in array |
| AC2.2 | Realistic product names for Unwrangle | **IMPLEMENTED** | Products like '2x4 lumber 8ft', 'drywall 4x8 1/2 inch' are searchable |
| AC3 | Types compile without errors | **IMPLEMENTED** | `npx tsc --noEmit` passes with no output |
| AC4 | Mock data is exportable and usable | **IMPLEMENTED** | `export const MOCK_PRODUCTS` at line 9, typed as `string[]` |

**Summary: 4 of 4 acceptance criteria fully implemented (including all sub-criteria).**

### Task Completion Validation

| Task | Marked As | Verified As | Evidence |
|------|-----------|-------------|----------|
| Task 1: Create priceComparison.ts | Complete [x] | **VERIFIED COMPLETE** | File exists with all 7 type definitions |
| Task 1.1: Define Retailer type | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:10` |
| Task 1.2: Define RetailerProduct interface | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:15-28` |
| Task 1.3: Define MatchResult interface | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:33-38` |
| Task 1.4: Define ComparisonResult interface | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:43-53` |
| Task 1.5: Define CompareRequest interface | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:58-64` |
| Task 1.6: Define ComparisonProgress interface | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:75-83` |
| Task 1.7: Define ComparisonStatus type | Complete [x] | **VERIFIED COMPLETE** | `priceComparison.ts:69` |
| Task 2: Create mockProducts.ts | Complete [x] | **VERIFIED COMPLETE** | File exists at `src/data/mockProducts.ts` |
| Task 2.1: Export MOCK_PRODUCTS array | Complete [x] | **VERIFIED COMPLETE** | `mockProducts.ts:9-22` with 12 items |
| Task 2.2: Realistic product names | Complete [x] | **VERIFIED COMPLETE** | Construction materials match Unwrangle search patterns |
| Task 3: Verify compilation and exports | Complete [x] | **VERIFIED COMPLETE** | `npx tsc --noEmit` passes |
| Task 3.1: Run typecheck | Complete [x] | **VERIFIED COMPLETE** | No TypeScript errors |
| Task 3.2: Test import in another file | Complete [x] | **VERIFIED COMPLETE** | Exports are properly typed and accessible |

**Summary: 14 of 14 completed tasks verified, 0 questionable, 0 falsely marked complete.**

### Test Coverage and Gaps

- **Unit Tests:** No dedicated test file created for types/mock data. This is acceptable for a types-only story as TypeScript compilation serves as validation.
- **Integration Tests:** N/A - types will be tested through consuming stories (PC-2, PC-3, PC-4).
- **Recommendation:** No additional tests needed for this story.

### Architectural Alignment

- **Tech-Spec Compliance:** ✅ Types match exactly with `docs/price-comparison-tech-spec.md` "New Type Definitions" section
- **Existing Patterns:** ✅ File structure follows `src/types/` and `src/data/` conventions
- **Naming Conventions:** ✅ PascalCase for types/interfaces, UPPER_SNAKE_CASE for constants
- **No Existing Code Modified:** ✅ No changes to `MaterialSpec`, `BillOfMaterials`, or other existing types
- **Exclusive Files:** ✅ Both files are in the epic's "Exclusive Files" list

### Security Notes

- No security concerns for this story (types-only, no runtime code)
- No sensitive data in mock products array

### Best-Practices and References

- TypeScript type definitions follow idiomatic patterns
- Union types used appropriately for constrained string values
- Interfaces use optional fields (`?`) correctly for nullable/optional properties
- JSDoc comments provide context for complex types

**References:**
- [TypeScript Handbook - Type Aliases](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases)
- [TypeScript Handbook - Interfaces](https://www.typescriptlang.org/docs/handbook/2/objects.html)

### Action Items

**Code Changes Required:**
- None

**Advisory Notes:**
- Note: The `storeNumber` field in `CompareRequest` may need validation in PC-2 to ensure it's a valid Home Depot store number format
- Note: Consider adding a `productNames.length` validation in PC-2 to prevent empty array submissions
