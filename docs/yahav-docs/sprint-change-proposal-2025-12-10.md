# Sprint Change Proposal: Global Product Cache

**Date:** 2025-12-10
**Author:** Correct Course Workflow
**Epic:** price-comparison
**Change Type:** Enhancement (New Story)
**Scope Classification:** Minor

---

## Section 1: Issue Summary

### Problem Statement

The completed Price Intelligence Module (epic: price-comparison) successfully compares prices across Home Depot and Lowe's. However, the current implementation calls external APIs (Unwrangle, SerpApi) for **every product on every comparison**, which is:

1. **Costly** - Each API call consumes credits
2. **Slow** - Network latency for each product lookup
3. **Inefficient** - Common construction materials are re-searched repeatedly

### Discovery Context

- **Triggering Story:** PC-4 (UI Components and Integration) - Epic completed
- **Issue Type:** New requirement emerged (post-completion enhancement)
- **Discovered By:** User request after successful epic delivery

### Evidence

Current implementation (`functions/src/priceComparison.ts:446-506`):
- `compareOneProduct()` always calls `fetchForRetailer()` for every product
- No lookup of previously-found products
- Results only saved to project-specific location

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| price-comparison | Done → In Progress | Add story PC-5 |
| Epic 5: Multi-Retailer Price Optimization | Backlog | Potential synergy (can leverage cache) |
| Epics 1-4 | Various | No impact |

### Story Impact

| Story | Change |
|-------|--------|
| PC-1 through PC-4 | No change (complete) |
| PC-5 (NEW) | Global Product Cache - Medium complexity |

### Artifact Conflicts

| Artifact | Conflict? | Action |
|----------|-----------|--------|
| PRD | No | Enhancement aligns with cost optimization goals |
| Architecture | Addition | New `productCache` Firestore collection |
| UI/UX | No | Backend-only change |
| Tech Spec | Update | Add caching strategy section |

### Technical Impact

| Component | Change Type | Details |
|-----------|-------------|---------|
| `functions/src/priceComparison.ts` | MODIFY | Add cache lookup/save functions |
| `src/types/priceComparison.ts` | ADD | New `CachedProduct`, `CacheLookupResult` types |
| `firestore.rules` | MODIFY | Add productCache collection permissions |
| Tests | ADD | Cache hit/miss/low-confidence scenarios |

---

## Section 3: Recommended Approach

### Selected Path: Direct Adjustment

**Add new story PC-5 to existing epic**

| Factor | Assessment |
|--------|------------|
| Effort | Medium |
| Risk | Low |
| Timeline Impact | None (additive) |
| Business Value | High (API cost reduction) |

### Rationale

1. **Clean Enhancement** - Adds value without breaking existing functionality
2. **Single Story** - Self-contained unit of work (PC-5)
3. **Cost Savings** - Reduces ongoing API costs as cache grows
4. **Future Value** - Product database benefits Epic 5 and beyond
5. **Low Risk** - Existing flow remains as fallback

### Alternatives Considered

| Option | Verdict |
|--------|---------|
| Rollback | Not viable - no issue to fix |
| MVP Review | Not applicable - MVP complete |

---

## Section 4: Detailed Change Proposals

### 4.1 New Story: PC-5 Global Product Cache

**File:** `docs/sprint-artifacts/story-pc-5-product-cache.md` (CREATE)

**Acceptance Criteria:**
- AC1: Save matched products to `productCache/{retailer}/products/`
- AC2: Home Depot products with full metadata
- AC3: Lowe's products with same structure
- AC4: Query cache before API calls
- AC5: LLM confidence scoring for matches
- AC6: Use cached if confidence >= 0.8
- AC7: Call API if confidence < 0.8
- AC8: Cache lookup < 500ms
- AC9: Firestore rules updated
- AC10: Unit tests for all scenarios

### 4.2 Epic File Update

**File:** `docs/sprint-artifacts/epic-price-comparison.md` (MODIFY)

- Add PC-5 to Stories table
- Update "All 4 stories" → "All 5 stories"

### 4.3 Sprint Status Update

**File:** `docs/sprint-artifacts/sprint-status.yaml` (MODIFY)

- Add `pc-5-product-cache: backlog`
- Change `epic-price-comparison: done` → `in-progress`
- Reset retrospective to optional

### 4.4 New Type Definitions

**File:** `src/types/priceComparison.ts` (MODIFY)

```typescript
interface CachedProduct {
  product: RetailerProduct
  searchQueries: string[]
  lastUpdated: number
  matchCount: number
  originalSearchTerm: string
}

interface CacheLookupResult {
  found: boolean
  cachedProduct?: CachedProduct
  confidence: number
  useCache: boolean
  reasoning: string
}

const CACHE_CONFIDENCE_THRESHOLD = 0.8
```

### 4.5 Cloud Function Modifications

**File:** `functions/src/priceComparison.ts` (MODIFY)

**New Functions:**
- `normalizeCacheKey(productName)` - Standardize cache keys
- `findInProductCache(db, retailer, query)` - Check cache
- `assessCacheMatchConfidence(query, cached)` - LLM validation
- `saveToProductCache(db, retailer, product, query)` - Save to cache

**Modified Flow:**
```
OLD: fetchForRetailer() → selectBestMatch() → return
NEW: findInCache() → assessConfidence() → [use cache OR fetch API] → saveToCache()
```

---

## Section 5: Implementation Handoff

### Scope Classification: Minor

This change can be **implemented directly by the development team** without requiring backlog reorganization or strategic review.

### Handoff Recipients

| Role | Responsibility |
|------|----------------|
| **Dev Team** | Implement PC-5 story |
| **QA** | Test cache scenarios |

### Implementation Steps

1. Create story file `story-pc-5-product-cache.md`
2. Update epic file to include PC-5
3. Update sprint-status.yaml
4. Add types to `priceComparison.ts`
5. Implement cache functions in Cloud Function
6. Update Firestore rules
7. Write unit tests
8. Manual testing with repeated comparisons

### Success Criteria

- [ ] Cache reduces API calls for repeated products
- [ ] Comparison time unchanged or improved
- [ ] No regression in existing functionality
- [ ] All acceptance criteria met

### Files Changed Summary

| File | Action |
|------|--------|
| `docs/sprint-artifacts/story-pc-5-product-cache.md` | CREATE |
| `docs/sprint-artifacts/epic-price-comparison.md` | MODIFY |
| `docs/sprint-artifacts/sprint-status.yaml` | MODIFY |
| `src/types/priceComparison.ts` | MODIFY |
| `functions/src/priceComparison.ts` | MODIFY |
| `firestore.rules` | MODIFY |
| `functions/src/priceComparison.test.ts` | MODIFY |

---

## Approval

**Status:** Pending User Approval

- [ ] User approves this Sprint Change Proposal
- [ ] Ready for implementation

---

*Generated by Correct Course Workflow on 2025-12-10*
