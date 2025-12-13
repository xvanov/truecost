# Global Materials Database - Product Requirements Document

**Author:** xvanov
**Date:** 2025-12-12
**Version:** 1.0
**Parent PRD:** TrueCost PRD v1.1

---

## Executive Summary

The Global Materials Database is a feature enhancement to TrueCost's price comparison system that transforms the architecture from API-first to cache-first. By introducing a Firestore-backed global materials collection that stores construction product pricing from multiple retailers (Home Depot, Lowe's), the system will dramatically reduce external API calls and associated costs while improving response times for repeat queries.

The current `priceComparison.ts` implementation makes external API calls (Unwrangle for Home Depot, SerpAPI for Lowe's) for every product comparison. This enhancement introduces a **unified global materials database** that:
1. Pre-populates with seed data from known construction materials (37 products)
2. Validates cache matches using LLM intelligence (not just string matching)
3. Auto-populates with new products discovered via API calls
4. Supports location-based pricing via zipCode filtering

### What Makes This Special

**Self-improving intelligence**: Unlike traditional caches that only store exact matches, this system uses LLM validation to confidently match queries like "2x4 studs" to cached entries like "2x4 SPF Stud, 92-5/8 in (8 ft wall)". The database gets smarter with every query - successful API results are saved with their search terms as aliases, so future variations automatically hit the cache.

**API cost reduction at scale**: Projects an 80-90% reduction in API calls for mature deployments by leveraging a shared global cache across all users and projects. Each new product discovered enriches the database for all future users.

---

## Project Classification

**Technical Type:** api_backend (Cloud Functions enhancement)
**Domain:** general (retail/e-commerce pricing)
**Complexity:** low

This is a backend feature enhancement to the existing Firebase Cloud Functions deployment. It adds:
- New Firestore collection (`globalMaterials`)
- New TypeScript modules for CRUD and validation
- Modifications to existing `priceComparison.ts` function

---

## Success Criteria

Success for this feature means:

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Cache Hit Rate** | >80% for repeat queries | Track hits vs misses in logs |
| **Response Time (Cache)** | <500ms | vs 3-5s for API calls |
| **Match Accuracy** | >95% | LLM validation prevents false positives |
| **Auto-Population** | 100% of new products saved | Every API success adds to cache |
| **Zero Regression** | Existing functionality unchanged | All existing tests pass |

### Business Metrics

| Metric | Target | Impact |
|--------|--------|--------|
| **API Cost Reduction** | 80%+ after seeding | Direct cost savings |
| **Time Savings** | 5-10x faster for cached products | Improved UX |
| **Database Growth** | +100 products/month via auto-population | Increasing ROI over time |

---

## Product Scope

### MVP - Minimum Viable Product

The MVP delivers a functional cache-first price comparison system:

**1. Global Materials Collection (Firestore Schema)**
- Document ID format: `{normalizedName}_{zipCode}`
- Fields: name, normalizedName, description, aliases[], zipCode, retailers{}, metadata
- Support for Home Depot and Lowe's retailer data

**2. Seed Data Import**
- Script to populate database from `material_normalized.xlsx`
- Initial seed: 37 products across categories (Framing, Drywall, Trim, Electrical, etc.)
- Default zipCode: 78745 (Austin, TX)

**3. Cache-First Lookup**
- Modify `compareOneProduct()` to check global cache before API calls
- Query by zipCode + aliases array-contains
- Return cached pricing when match found

**4. LLM Validation**
- Confidence scoring for cache matches using GPT-4o-mini
- Threshold: 0.8 confidence required to use cached data
- Low confidence falls back to API

**5. Auto-Population**
- Save successful API results to global cache
- Add search query to aliases array for future matches
- Increment matchCount for analytics

**6. ZipCode Support**
- Location-aware pricing lookup
- Default zipCode constant (78745)
- Future support for multiple locations per product

**7. Firestore Configuration**
- Security rules for globalMaterials collection
- Composite indexes for efficient queries

### Growth Features (Post-MVP)

1. **Price Refresh Job**: Scheduled Cloud Function to update stale prices (>7 days old)
2. **Fuzzy Search**: Implement fuzzy matching for typos and variations
3. **Category Filtering**: Add category field for narrower, more accurate searches
4. **Price History Tracking**: Store price changes over time for trend analysis
5. **Admin Dashboard**: UI for viewing/managing the global materials database
6. **Bulk Import Tools**: Allow users to contribute materials via CSV/Excel upload

### Vision (Future)

1. **Multi-Retailer Expansion**: Support additional retailers (Ace Hardware, Menards, etc.)
2. **Predictive Pricing**: Use historical data to predict price fluctuations
3. **Regional Price Intelligence**: Analytics on pricing differences across zip codes
4. **Material Recommendations**: Suggest alternative products based on price/availability
5. **Contractor Network Pricing**: Access to contractor-specific pricing tiers

---

## Functional Requirements

### Global Materials Database

- **FR1:** System stores materials in Firestore collection `globalMaterials` with structured schema
- **FR2:** Each material document contains identification (id, name, normalizedName, description, aliases)
- **FR3:** Each material document contains location data (zipCode)
- **FR4:** Each material document contains retailer-specific data (productUrl, productId, price, priceUpdatedAt)
- **FR5:** Each material document contains metadata (createdAt, updatedAt, matchCount, source)
- **FR6:** Document IDs follow format `{normalizedName}_{zipCode}` for uniqueness

### Cache Lookup

- **FR7:** System searches global materials by zipCode and aliases array-contains
- **FR8:** System uses effective zipCode (provided or default 78745) for all queries
- **FR9:** System returns candidate matches (0 to N) from cache lookup
- **FR10:** System limits cache queries to 5 results for efficiency

### LLM Validation

- **FR11:** System validates cache matches using LLM confidence scoring
- **FR12:** LLM receives search query, candidate name, description, and aliases for validation
- **FR13:** LLM returns confidence score (0-1) and reasoning
- **FR14:** System uses cached data only when confidence >= 0.8
- **FR15:** System falls back to API when confidence < 0.8 or no candidates found

### Cache-First Flow

- **FR16:** System checks global materials cache BEFORE making any API calls
- **FR17:** System returns cached pricing immediately when high-confidence match found
- **FR18:** System increments matchCount on cache hits (fire-and-forget)
- **FR19:** System logs cache hits/misses for analytics

### API Fallback

- **FR20:** System calls Unwrangle API (Home Depot) when cache miss or low confidence
- **FR21:** System calls SerpAPI (Lowe's) when cache miss or low confidence
- **FR22:** System uses existing LLM product selection for API results

### Auto-Population

- **FR23:** System saves successful API matches to global materials collection
- **FR24:** System adds search query to aliases array for future matching
- **FR25:** System handles upsert: creates new or updates existing with merged aliases
- **FR26:** System marks source as 'seed' or 'scraped' based on origin

### Seed Data Import

- **FR27:** System provides seed script to import from Excel file
- **FR28:** Seed script extracts product URLs, prices, and generates product IDs
- **FR29:** Seed script parses comma-separated aliases into array
- **FR30:** Seed script uses batch writes for efficient Firestore operations

### Normalization

- **FR31:** System normalizes product names to URL-safe keys (lowercase, alphanumeric, hyphens)
- **FR32:** System generates document IDs from normalized name + zipCode
- **FR33:** System stores both original name and normalized name for display vs lookup

### Response Building

- **FR34:** System converts GlobalMaterial to ComparisonResult format for cache hits
- **FR35:** System includes "[GLOBAL_DB]" prefix in reasoning for cache-sourced results
- **FR36:** System sets searchResultsCount to 0 for cache hits (no API call made)

---

## Non-Functional Requirements

### Performance

| Metric | Requirement | Rationale |
|--------|-------------|-----------|
| **Cache Lookup** | <100ms | Firestore indexed query |
| **LLM Validation** | <500ms | GPT-4o-mini is fast |
| **Total Cache Hit** | <600ms | vs 3-5s for API |
| **Seed Import** | <30s for 37 products | Batch writes |

### Security

- **NFR1:** Authenticated users can read from globalMaterials
- **NFR2:** Authenticated users can write to globalMaterials (for auto-population)
- **NFR3:** Production may restrict writes to Cloud Functions only
- **NFR4:** No sensitive data stored (public pricing only)

### Scalability

| Metric | Target |
|--------|--------|
| **Initial Seed** | 37 products |
| **Growth Rate** | ~100 products/month via auto-population |
| **Max Collection Size** | 100,000+ documents (Firestore handles this) |
| **Concurrent Queries** | 1000+/second (Firestore limit) |

### Reliability

- **NFR5:** Cache failures do not break price comparison (fallback to API)
- **NFR6:** Auto-population failures are logged but non-blocking
- **NFR7:** LLM validation failures default to moderate confidence (0.5)

---

## Technical Specification

### Files to Create

| File | Description |
|------|-------------|
| `functions/src/types/globalMaterials.ts` | TypeScript interfaces and constants |
| `functions/src/globalMaterials.ts` | CRUD operations, search, LLM validation |
| `functions/src/seedGlobalMaterials.ts` | One-time seed script for Excel data |

### Files to Modify

| File | Changes |
|------|---------|
| `functions/src/priceComparison.ts` | Integrate global DB lookup before API calls |
| `firestore.rules` | Add rules for globalMaterials collection |
| `firestore.indexes.json` | Add composite indexes for efficient queries |

### Data Schema

```typescript
interface GlobalMaterial {
  id: string;                      // Document ID (normalizedName_zipCode)
  name: string;                    // Original item name
  normalizedName: string;          // URL-safe normalized name
  description: string;             // Rich description for LLM matching
  aliases: string[];               // Array of search terms
  zipCode: string;                 // Location for price data
  retailers: {
    lowes?: RetailerInfo;
    homeDepot?: RetailerInfo;
  };
  createdAt: number;
  updatedAt: number;
  matchCount: number;
  source: 'seed' | 'scraped';
}

interface RetailerInfo {
  productUrl: string;
  productId: string;
  price: number;
  priceUpdatedAt: number;
  imageUrl?: string;
  brand?: string;
}
```

### Required Indexes

```json
{
  "indexes": [
    {
      "collectionGroup": "globalMaterials",
      "fields": [
        { "fieldPath": "zipCode", "order": "ASCENDING" },
        { "fieldPath": "aliases", "arrayConfig": "CONTAINS" }
      ]
    }
  ]
}
```

---

## API Cost Savings Projection

| Scenario | Current (API-first) | New (Cache-first) | Savings |
|----------|--------------------|--------------------|---------|
| 10 products, first run | 20 API calls | 20 API calls | 0% |
| 10 products, repeat (same zipCode) | 20 API calls | ~4 API calls | 80% |
| 100 products, mature database | 200 API calls | ~20-40 API calls | 80-90% |

**Note**: Savings improve over time as more products and zipCodes are populated.

---

## Rollout Plan

### Phase 1: Infrastructure
- Create type definitions
- Implement CRUD operations
- Add Firestore rules and indexes

### Phase 2: Seed Database
- Run seed script with Excel data
- Verify 37 products created with zipCode 78745

### Phase 3: Integration
- Add global DB lookup as first step in compareOneProduct()
- Implement fallback to existing scraping
- Add auto-population after successful scrapes

### Phase 4: Deploy & Monitor
- Deploy to Firebase
- Monitor cache hit rates via logs
- Track API cost reduction

---

## Testing Strategy

1. **Unit Tests**: Test normalization, ID generation, query building
2. **Integration Tests**: Test full flow with Firestore emulator
3. **Manual Testing**:
   - Seed database with Excel data
   - Run price comparison for known products (should hit cache)
   - Run price comparison for unknown products (should scrape and save)
   - Verify new products appear in globalMaterials

---

## PRD Summary

The **Global Materials Database** transforms TrueCost's price comparison from an expensive API-first approach to an intelligent cache-first system.

**Scope Summary:**
- 36 Functional Requirements covering cache lookup, validation, and auto-population
- New Firestore collection with structured schema
- LLM-powered match validation (0.8 confidence threshold)
- Auto-populating cache that grows with usage
- 80-90% projected API cost reduction

**Key Technical Decisions:**
- Firestore for global materials storage
- GPT-4o-mini for match validation
- Document ID format: `{normalizedName}_{zipCode}`
- Fire-and-forget cache updates (non-blocking)

**Files Impacted:**
- 3 new TypeScript files
- 3 modified configuration files

**Next Steps:**
1. Create TypeScript types and interfaces
2. Implement CRUD operations
3. Create seed script and import data
4. Modify priceComparison.ts for cache-first lookup
5. Deploy and monitor

---

_This PRD captures the Global Materials Database feature - a self-improving cache system that reduces API costs while maintaining match accuracy through LLM validation._

_Created through collaborative discovery between xvanov and AI facilitator._
