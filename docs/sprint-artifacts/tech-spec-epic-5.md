# TrueCost Price Intelligence Module - Technical Specification

**Author:** xvanov
**Date:** 2025-12-10
**Project Level:** Quick-Flow (Brownfield)
**Change Type:** New Feature Module
**Development Context:** Stretch feature - parallel development with mock data

---

## Context

### Available Documents

| Document | Status | Key Insights |
|----------|--------|--------------|
| product-brief.md | ✅ Loaded | TrueCost: AI-powered construction estimation with 7-agent pipeline |
| price_comparison-brief.md | ✅ Loaded | Price Intelligence Module using Unwrangle API + LLM matching |
| architecture/data-models.md | ✅ Loaded | Firestore collections, MaterialSpec, BillOfMaterials types |
| setup/technology-stack.md | ✅ Loaded | React 19 + TypeScript + Firebase + Vite |
| Existing pricing code | ✅ Analyzed | SerpAPI pattern in pricing.ts, pricingService.ts |

### Project Stack

**Frontend:**
- React 19.2.0 with TypeScript 5.9.3
- Vite 7.1.7 build tool
- Zustand 5.0.8 state management
- Tailwind CSS 3.4.18 + shadcn/ui components
- Konva 10.0.2 for canvas rendering

**Backend:**
- Firebase 12.4.0 (Auth, Firestore, RTDB, Functions, Storage)
- Cloud Functions (firebase-functions 4.8.0, Node.js)
- Zod 3.22.0 for schema validation

**Testing:**
- Vitest 3.2.4 for unit/integration tests
- React Testing Library 16.3.0
- Playwright 1.50.0 for E2E

### Existing Codebase Structure

**Directory Organization:**
```
collabcanvas/
├── src/
│   ├── components/          # React components
│   │   └── MaterialEstimationPanel.tsx  # UI integration point
│   ├── services/            # Business logic
│   │   ├── pricingService.ts  # Home Depot pricing (reference pattern)
│   │   ├── bomService.ts      # BOM generation
│   │   └── materialService.ts # Material calculations
│   ├── store/               # Zustand stores
│   │   └── canvasStore.ts     # Main UI state
│   ├── types/               # TypeScript definitions
│   │   └── material.ts        # MaterialSpec, BillOfMaterials
│   └── test/                # Test utilities
│       └── mocks/firebase.ts
├── functions/
│   └── src/
│       ├── index.ts         # Function exports
│       └── pricing.ts       # SerpAPI Cloud Function (reference)
```

**Key Patterns:**
1. **Service Layer**: Abstracts Firebase and external API calls
2. **Cloud Functions**: TypeScript, onCall pattern, CORS config
3. **Progressive Updates**: Callback-based (`onProgress`) for real-time UI
4. **Caching**: Firestore with TTL, normalized keys
5. **Error Handling**: Retry with exponential backoff, user-friendly messages

---

## The Change

### Problem Statement

Contractors and homeowners spend hours manually checking prices across multiple retailers (Home Depot, Lowe's, Ace Hardware) to find cost-effective materials. The challenges include:

1. **No centralized comparison** - Must visit each retailer's website separately
2. **Inconsistent product naming** - "2x4 lumber" vs "2x4x8 stud" vs "dimensional lumber 2x4"
3. **Time-consuming verification** - Manual effort to match equivalent products across stores
4. **Price volatility** - Prices change frequently, cached comparisons become stale

The TrueCost estimation system currently fetches Home Depot prices via SerpAPI, but lacks multi-retailer comparison capabilities.

### Proposed Solution

Build a **Price Intelligence Module** that:

1. Takes product names from the BOM (mocked for now, real BOM integration later)
2. Queries Unwrangle API for each product across Home Depot, Lowe's, and Ace Hardware
3. Uses OpenAI LLM to intelligently match the best product from each retailer's search results
4. Presents a unified comparison table showing prices across all retailers
5. Highlights the best-price option for each material

**Architecture:**
```
Mock Product Names → Cloud Function → Unwrangle API (3 retailers)
                                   → OpenAI Matching Agent
                                   → Firestore (incremental writes)
                                            ↓
                              Frontend subscribes via onSnapshot
                                            ↓
                              New Tab UI (Real-time Progress + Table)
```

### Scope

**In Scope:**

1. **New Cloud Function** (`comparePrices`) - Fetches from Unwrangle, runs LLM matching
2. **New Types** - `PriceComparison`, `RetailerProduct`, `ComparisonResult`
3. **New Service** - `priceComparisonService.ts` for frontend orchestration
4. **New UI Component** - `PriceComparisonTable.tsx` (opens in new tab)
5. **Mock Data** - Static array of 10-15 construction materials
6. **Button Integration** - "Compare Prices" button in `MaterialEstimationPanel.tsx`
7. **Caching** - Firestore cache for comparison results (24-hour TTL)

**Out of Scope:**

1. Real BOM integration (will use mock product names)
2. Modifying existing `MaterialSpec` or `BillOfMaterials` types
3. Modifying existing `pricingService.ts` or `pricing.ts`
4. User authentication changes
5. Historical price tracking
6. Manual product override UI
7. Bulk purchase pricing

---

## Implementation Details

### Source Tree Changes

| File Path | Action | Description |
|-----------|--------|-------------|
| `src/types/priceComparison.ts` | **CREATE** | New types for price comparison feature |
| `src/data/mockProducts.ts` | **CREATE** | Mock product names array for testing |
| `src/services/priceComparisonService.ts` | **CREATE** | Frontend service for comparison orchestration |
| `src/components/PriceComparisonTable.tsx` | **CREATE** | Comparison table UI component |
| `src/components/PriceComparisonPage.tsx` | **CREATE** | Full-page wrapper for new tab |
| `src/components/MaterialEstimationPanel.tsx` | **MODIFY** | Add "Compare Prices" button (minor change) |
| `src/App.tsx` | **MODIFY** | Add route for `/compare-prices` (minor change) |
| `functions/src/priceComparison.ts` | **CREATE** | Cloud Function for Unwrangle + LLM |
| `functions/src/index.ts` | **MODIFY** | Export new `comparePrices` function |
| `functions/.env` | **MODIFY** | Add `UNWRANGLE_API_KEY` |

### Technical Approach

**1. Unwrangle API Integration (Cloud Function)**

```typescript
// Platform identifiers for Unwrangle
const PLATFORMS = {
  homeDepot: 'homedepot_search',
  lowes: 'lowes_search',
  aceHardware: 'acehardware_search',
} as const;

// Parallel API calls to all 3 retailers
const results = await Promise.all([
  fetchFromUnwrangle(productName, PLATFORMS.homeDepot),
  fetchFromUnwrangle(productName, PLATFORMS.lowes),
  fetchFromUnwrangle(productName, PLATFORMS.aceHardware),
]);
```

**2. LLM Product Matching (OpenAI)**

Use GPT-4o-mini for cost-effective matching. Prompt structure:

```
Given the original product: "${productName}"
And these search results from ${retailer}:
${JSON.stringify(top5Results)}

Select the BEST matching product based on:
1. Functional equivalence to the original
2. Specification compatibility (size, material, type)
3. Price competitiveness
4. Availability

Return JSON: { "selectedIndex": number, "confidence": number, "reasoning": string }
```

**3. Real-time Updates (Firestore onSnapshot)**

Use Firestore real-time listeners for progressive updates:
- Cloud Function writes progress to Firestore after each product completes
- Frontend subscribes via `onSnapshot` for live updates
- UI shows progress bar: "Comparing 8 of 12 products..."
- Results appear in table incrementally as they complete

**4. Project-Scoped Persistence Strategy**

Comparison results are saved per-project with real-time status tracking:

```
Firestore: projects/{projectId}/priceComparison/latest
{
  status: 'processing' | 'complete' | 'error',  // Real-time status
  totalProducts: number,              // Total to compare
  completedProducts: number,          // Completed so far
  results: ComparisonResult[],        // Grows incrementally
  startedAt: number,
  completedAt?: number,
  createdBy: string,
  error?: string,
}
```

**Flow:**
1. User clicks "Compare Prices" → Frontend subscribes to Firestore document
2. Cloud Function checks for existing `status: 'complete'` results
3. If complete results exist → Return `{ cached: true }`, frontend already has data via subscription
4. If no results → Initialize with `status: 'processing'`, process products one by one
5. After each product → Update Firestore, frontend sees update immediately
6. On completion → Set `status: 'complete'`
7. User clicks "Refresh Prices" → Call with `forceRefresh: true`, overwrites results

### Existing Patterns to Follow

**From `pricing.ts` (Cloud Function):**
```typescript
// Pattern: onCall with CORS, extended timeout for long operations
export const comparePrices = onCall<{ request: CompareRequest }>({
  cors: ['http://localhost:5173', ...],
  maxInstances: 10,
  memory: '1GiB',     // Higher for LLM calls
  timeoutSeconds: 540, // Max for 2nd gen - handles large product lists
}, async (req) => { ... });
```

**Frontend Service Pattern (Subscription-based):**
```typescript
// Pattern: Firestore real-time subscription
export function subscribeToComparison(
  projectId: string,
  onUpdate: (progress: ComparisonProgress) => void,
  onError: (error: Error) => void
): () => void  // Returns unsubscribe function

// Pattern: Trigger comparison
export async function startComparison(
  projectId: string,
  productNames: string[],
  forceRefresh: boolean
): Promise<{ cached: boolean }>
```

**From `MaterialEstimationPanel.tsx` (UI):**
```typescript
// Pattern: Button with loading state
<Button onClick={handleCompare} disabled={isComparing}>
  {isComparing ? 'Comparing...' : 'Compare Prices'}
</Button>
```

### Integration Points

**1. UI Trigger** (`MaterialEstimationPanel.tsx`)
- Add "Compare Prices" button next to existing "Refresh Prices"
- Button opens new tab: `window.open(\`/projects/\${projectId}/compare-prices\`, '_blank')`

**2. Routing** (`App.tsx`)
- New route: `/projects/:projectId/compare-prices`
- ProjectId passed via URL params

**3. Cloud Function** (`functions/src/index.ts`)
- Export: `comparePrices`
- Callable from frontend via `httpsCallable`
- Accepts `projectId` and `forceRefresh` parameters

**4. Firestore**
- Read/write to `projects/{projectId}/priceComparison/latest`
- Requires existing project document

**5. Environment Variables**
- `UNWRANGLE_API_KEY` in `functions/.env`
- `OPENAI_API_KEY` already exists

---

## Development Context

### Relevant Existing Code

| File | Lines | Reference Pattern |
|------|-------|-------------------|
| `functions/src/pricing.ts` | 1-365 | Cloud Function structure, SerpAPI pattern, caching |
| `src/services/pricingService.ts` | 57-295 | Progressive updates, `fetchPricesForBOM` pattern |
| `src/types/material.ts` | 54-70 | `MaterialSpec` structure (don't modify, reference only) |
| `src/components/MaterialEstimationPanel.tsx` | - | Button placement, UI patterns |

### Dependencies

**Framework/Libraries (from package.json):**

| Package | Version | Usage |
|---------|---------|-------|
| React | 19.2.0 | UI components |
| TypeScript | ~5.9.3 | Type definitions |
| firebase/functions | 12.4.0 | `httpsCallable` for Cloud Function calls |
| firebase-functions | 4.8.0 | `onCall` for Cloud Function definition |
| openai | 4.20.0 | LLM product matching |
| zod | 3.22.0 | Request/response validation |
| tailwindcss | 3.4.18 | Styling |

**New Dependency (Cloud Functions only):**
- None required - Unwrangle uses standard `fetch()`

**Internal Modules:**

```typescript
// Existing (import but don't modify)
import { functions } from './firebase';  // Firebase setup

// New (to be created)
import type { ComparisonResult, RetailerProduct } from '../types/priceComparison';
import { MOCK_PRODUCTS } from '../data/mockProducts';
import { compareProductPrices } from '../services/priceComparisonService';
```

### Configuration Changes

**1. Cloud Functions Environment (`functions/.env`):**
```bash
# Add new key
UNWRANGLE_API_KEY=your_unwrangle_api_key_here
# Existing (already present)
OPENAI_API_KEY=...
SERP_API_KEY=...
```

**2. Firebase Functions CORS (`functions/src/priceComparison.ts`):**
```typescript
cors: [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Add production domain when deployed
],
```

**3. Frontend Routing (`src/App.tsx`):**
```typescript
// Add new route with projectId parameter
<Route path="/projects/:projectId/compare-prices" element={<PriceComparisonPage />} />
```

### Existing Conventions (Brownfield)

**Code Style (from existing codebase):**
- Semicolons: No (following existing pattern)
- Quotes: Single quotes
- Indentation: 2 spaces
- Line length: ~100 chars
- Import organization: React first, then external, then internal

**Naming Conventions:**
- Components: PascalCase (`PriceComparisonTable.tsx`)
- Services: camelCase with `.ts` (`priceComparisonService.ts`)
- Types: PascalCase (`ComparisonResult`)
- Constants: UPPER_SNAKE_CASE (`MOCK_PRODUCTS`)

**Error Handling:**
- Return error objects, don't throw (from `pricing.ts` pattern)
- User-friendly error messages
- Log detailed errors to console

### Test Framework & Standards

**Framework:** Vitest 3.2.4 with React Testing Library 16.3.0

**Test File Pattern:** `*.test.ts` or `*.test.tsx`

**Test Organization:**
```
src/
├── services/
│   ├── priceComparisonService.ts
│   └── priceComparisonService.test.ts  # Co-located
functions/
└── src/
    ├── priceComparison.ts
    └── priceComparison.test.ts  # Co-located
```

**Mocking Pattern (from existing tests):**
```typescript
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}))
```

---

## Implementation Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend Framework | React | 19.2.0 | UI components |
| Language | TypeScript | 5.9.3 | Type safety |
| Build Tool | Vite | 7.1.7 | Dev server, bundling |
| State Management | Zustand | 5.0.8 | UI state (if needed) |
| Styling | Tailwind CSS | 3.4.18 | Component styling |
| Backend | Firebase Functions | 4.8.0 | Serverless functions |
| Database | Firestore | 12.4.0 | Caching comparison results |
| External API | Unwrangle | - | Retailer product search |
| LLM | OpenAI GPT-4o-mini | 4.20.0 | Product matching |
| Testing | Vitest | 3.2.4 | Unit/integration tests |

---

## Technical Details

### New Type Definitions (`src/types/priceComparison.ts`)

```typescript
/**
 * Supported retailers for price comparison
 */
export type Retailer = 'homeDepot' | 'lowes' | 'aceHardware'

/**
 * Product data from a single retailer (normalized from Unwrangle response)
 */
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

/**
 * LLM matching result for a single retailer
 */
export interface MatchResult {
  selectedProduct: RetailerProduct | null
  confidence: number  // 0-1 scale
  reasoning: string
  searchResultsCount: number
}

/**
 * Complete comparison result for a single product across all retailers
 */
export interface ComparisonResult {
  originalProductName: string
  matches: Record<Retailer, MatchResult>
  bestPrice: {
    retailer: Retailer
    product: RetailerProduct
    savings: number  // vs highest price
  } | null
  comparedAt: number
  cached: boolean
}

/**
 * Request to compare prices for multiple products
 */
export interface CompareRequest {
  projectId: string              // Required - which project to save results to
  productNames: string[]
  forceRefresh?: boolean         // If true, skip saved results and re-fetch
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

### Mock Data (`src/data/mockProducts.ts`)

```typescript
/**
 * Mock construction materials for testing price comparison
 * These simulate what would come from a real BOM
 */
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

### Cloud Function Structure (`functions/src/priceComparison.ts`)

**Key Functions:**

1. `fetchFromUnwrangle(productName, platform, zipCode?)` - Calls Unwrangle API
2. `selectBestMatch(productName, results, retailer)` - Calls OpenAI for matching
3. `normalizeProduct(rawProduct, retailer)` - Normalizes response to `RetailerProduct`
4. `comparePrices(request)` - Main Cloud Function entry point

**Error Scenarios:**
- Unwrangle API timeout (60s)
- Unwrangle API rate limit
- OpenAI API timeout (30s)
- No search results found
- LLM returns invalid JSON

---

## Development Setup

**Prerequisites:**
- Node.js 18+
- npm
- Firebase CLI (`npm install -g firebase-tools`)
- Unwrangle API key
- OpenAI API key (already configured)

**Setup Steps:**

```bash
# 1. Navigate to project
cd /Users/ankitrijal/Desktop/GauntletAI/truecost/collabcanvas

# 2. Install dependencies (if not already done)
npm install
cd functions && npm install && cd ..

# 3. Add Unwrangle API key to functions/.env
echo "UNWRANGLE_API_KEY=your_key_here" >> functions/.env

# 4. Start Firebase emulators
npm run emulators

# 5. In a separate terminal, start frontend
npm run dev

# 6. Access app at http://localhost:5173
```

---

## Implementation Guide

### Setup Steps

1. **Create feature branch:**
   ```bash
   git checkout -b feature/price-comparison
   ```

2. **Verify dev environment:**
   - Firebase emulators running
   - Frontend dev server running
   - Unwrangle API key in `functions/.env`

3. **Create new files (empty stubs):**
   - `src/types/priceComparison.ts`
   - `src/data/mockProducts.ts`
   - `src/services/priceComparisonService.ts`
   - `src/components/PriceComparisonTable.tsx`
   - `src/components/PriceComparisonPage.tsx`
   - `functions/src/priceComparison.ts`

### Implementation Steps

**Story 1: Types + Mock Data**
1. Create `src/types/priceComparison.ts` with all interfaces
2. Create `src/data/mockProducts.ts` with mock product array
3. Write unit tests for type guards (optional)

**Story 2: Cloud Function**
1. Create `functions/src/priceComparison.ts`
2. Implement `fetchFromUnwrangle()` for all 3 retailers
3. Implement `selectBestMatch()` with OpenAI
4. Implement `normalizeProduct()` for response normalization
5. Implement caching in Firestore
6. Export from `functions/src/index.ts`
7. Write unit tests with mocked API responses

**Story 3: Frontend Service**
1. Create `src/services/priceComparisonService.ts`
2. Implement `compareProductPrices()` with progress callbacks
3. Handle errors gracefully
4. Write unit tests with mocked Cloud Function

**Story 4: UI Components**
1. Create `PriceComparisonTable.tsx` component
2. Create `PriceComparisonPage.tsx` wrapper
3. Add route to `App.tsx`
4. Add "Compare Prices" button to `MaterialEstimationPanel.tsx`
5. Implement new tab opening logic
6. Style with Tailwind

### Testing Strategy

**Unit Tests:**
- Type guards for `RetailerProduct`, `ComparisonResult`
- `normalizeProduct()` with different retailer responses
- `priceComparisonService` with mocked callable

**Integration Tests:**
- Cloud Function with mocked Unwrangle + OpenAI responses
- End-to-end flow from button click to results display

**Manual Testing:**
- Click "Compare Prices" → new tab opens
- Verify all 3 retailers show results
- Verify "best price" highlighting
- Test with no results scenario
- Test with partial results (1-2 retailers fail)

### Acceptance Criteria

1. **AC1:** User can click "Compare Prices" button in Material Estimation Panel
2. **AC2:** New browser tab opens with `/compare-prices` route
3. **AC3:** Page subscribes to Firestore for real-time progress updates
4. **AC4:** Progress bar shows "Comparing X of Y products..." during processing
5. **AC5:** Results appear incrementally in table as products complete
6. **AC6:** Table shows product matches from Home Depot, Lowe's, and Ace Hardware
7. **AC7:** Best price option is highlighted for each product
8. **AC8:** Error states display user-friendly messages with retry option
9. **AC9:** Complete results persist in Firestore (no re-fetch on page reload)
10. **AC10:** "Refresh Prices" button triggers new comparison (forceRefresh=true)
11. **AC11:** Mock product list works without real BOM integration
12. **AC12:** All new code is in new files (minimal changes to existing files)

---

## Developer Resources

### File Paths Reference

**New Files (CREATE):**
```
collabcanvas/
├── src/
│   ├── types/
│   │   └── priceComparison.ts          # Type definitions
│   ├── data/
│   │   └── mockProducts.ts              # Mock product array
│   ├── services/
│   │   └── priceComparisonService.ts    # Frontend service
│   │   └── priceComparisonService.test.ts
│   └── components/
│       ├── PriceComparisonTable.tsx     # Table component
│       └── PriceComparisonPage.tsx      # Page wrapper
├── functions/
│   └── src/
│       ├── priceComparison.ts           # Cloud Function
│       └── priceComparison.test.ts
```

**Modified Files (MINOR CHANGES):**
```
collabcanvas/
├── src/
│   ├── components/
│   │   └── MaterialEstimationPanel.tsx  # Add button
│   └── App.tsx                          # Add route
├── functions/
│   └── src/
│       └── index.ts                     # Export function
```

### Key Code Locations

| Reference | File | Line/Section |
|-----------|------|--------------|
| Cloud Function pattern | `functions/src/pricing.ts` | Lines 226-365 |
| Progressive updates | `src/services/pricingService.ts` | Lines 57-130 |
| Material types | `src/types/material.ts` | Lines 54-70 |
| Button pattern | `src/components/MaterialEstimationPanel.tsx` | Search "Refresh Prices" |
| Firebase callable | `src/services/firebase.ts` | `functions` export |

### Testing Locations

| Test Type | Location |
|-----------|----------|
| Service unit tests | `src/services/priceComparisonService.test.ts` |
| Cloud Function tests | `functions/src/priceComparison.test.ts` |
| Component tests | `src/components/PriceComparisonTable.test.tsx` |

### Documentation to Update

- `README.md` - Add "Price Comparison" feature section (optional)
- `functions/.env.example` - Add `UNWRANGLE_API_KEY` placeholder

---

## UX/UI Considerations

### UI Components

**1. "Compare Prices" Button** (in MaterialEstimationPanel)
- Position: Next to existing "Refresh Prices" button
- Variant: Secondary/outline style
- Disabled state when no products available
- Opens: `/projects/{projectId}/compare-prices` in new tab

**2. Price Comparison Page** (new tab)
- Header with product count and "Refresh Prices" button
- Progress bar during processing
- Full-width responsive table
- Loading skeleton on first load, progress bar on refresh

**3. Page Header Layout**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Price Comparison                                   [Refresh Prices]    │
│  12 products compared                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**4. Progress Bar (during comparison)**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Comparing prices...                              8 of 12 products      │
│  ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  67%   │
└─────────────────────────────────────────────────────────────────────────┘
```

**4. Comparison Table**
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Product         │ Home Depot      │ Lowe's          │ Ace Hardware    │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 2x4 lumber 8ft  │ $3.58 ✓ BEST    │ $3.79           │ $4.29           │
│                 │ 2x4x96 Stud     │ 2x4-8 SPF       │ 2x4 Premium     │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ drywall 4x8     │ $12.98          │ $11.97 ✓ BEST   │ $14.99          │
│                 │ Sheetrock 1/2"  │ Gold Bond 1/2"  │ USG 1/2"        │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

Summary: Home Depot wins 7 | Lowe's wins 3 | Ace wins 2
```

### Visual States

| State | Display |
|-------|---------|
| Initial load (no data) | Skeleton rows with pulse animation |
| Processing | Progress bar + "Comparing..." button + partial table |
| Complete | Full table visible, "Refresh Prices" button enabled |
| Best Price | Green background highlight + "✓ BEST" badge |
| No Match | Gray cell with "No match found" text |
| Error | Red background with message + "Try again" link |

### Accessibility

- Table uses proper `<th>` headers with scope
- Color is not the only indicator (badges + text)
- Keyboard navigation for links
- Screen reader announces best price

---

## Testing Approach

### Test Matrix

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| Types/Guards | ✓ | - | - |
| Mock Data | ✓ | - | - |
| Cloud Function | ✓ | ✓ | - |
| Frontend Service | ✓ | ✓ | - |
| UI Components | ✓ | - | ✓ |

### Key Test Cases

**Cloud Function:**
1. All 3 retailers return results → success
2. One retailer fails → partial success
3. All retailers fail → graceful error
4. Cached result exists → return cached
5. LLM returns invalid JSON → fallback to first result
6. API timeout → retry then fail gracefully

**Frontend Service:**
1. Progress callback fires correctly
2. Error handling for network failures
3. Empty product list → early return

**UI:**
1. Button disabled during loading
2. Table renders all columns
3. Best price highlighting works
4. Links open in new tab

---

## Deployment Strategy

### Deployment Steps

1. **Deploy Cloud Function:**
   ```bash
   cd functions
   firebase deploy --only functions:comparePrices
   ```

2. **Set environment variables in Firebase:**
   ```bash
   firebase functions:secrets:set UNWRANGLE_API_KEY
   ```

3. **Deploy frontend:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

4. **Verify in production:**
   - Test compare button
   - Check Cloud Function logs
   - Verify Firestore caching

### Rollback Plan

1. **If Cloud Function fails:**
   ```bash
   # Redeploy previous version
   firebase functions:delete comparePrices
   # Or rollback to previous deployment
   ```

2. **If frontend fails:**
   - Button simply won't appear (feature flag)
   - Or redeploy previous hosting version

3. **If data corruption:**
   - Clear `comparisons/` collection in Firestore

### Monitoring

**Cloud Function Logs:**
```bash
firebase functions:log --only comparePrices
```

**Key Metrics to Watch:**
- Function execution time (target: < 30s)
- Error rate (target: < 5%)
- Unwrangle API credit usage
- OpenAI token consumption

**Alerts (if using Firebase monitoring):**
- Function error rate > 10%
- Function duration > 60s
- Cold start frequency
