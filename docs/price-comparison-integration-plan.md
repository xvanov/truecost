# Price Comparison Integration Plan

## Overview

Integrate the Price Comparison feature with the estimation pipeline so that it uses **actual purchasable product names** from the estimate instead of generic line item descriptions.

## Problem Statement

### Current State
The Price Comparison panel extracts product names from `billOfMaterials.totalMaterials[].name`, which comes from `costOutput.divisions[].lineItems[].description`. These descriptions are CSI-style work descriptions, NOT searchable retail product names.

**Current Flow:**
```
Estimate Pipeline → costOutput.divisions[].lineItems[].description
                              ↓
               transformEstimateToBOM() → totalMaterials[].name = description
                              ↓
               PriceComparisonPanel → extracts names → startComparison(productNames)
                              ↓
               Cloud Function → searches Google Shopping for "descriptions" ❌
```

### Example of the Problem

| Current (line item description) | What's Needed (product names) |
|--------------------------------|-------------------------------|
| "Install interior partition walls - 500 sqft" | "2x4x8 SPF Stud", "1/2in Drywall 4x8 Sheet", "Drywall Screws 1-5/8in" |
| "Plumbing rough-in for 2 fixtures" | "1/2in PEX Tubing 100ft", "SharkBite Elbow Fitting", "PEX Crimp Rings" |
| "Electrical rough-in for 10 outlets" | "14/2 Romex Wire 250ft", "Single Gang Electrical Box", "15A Outlet" |

The Google Shopping API and LLM matching work correctly - they just need actual searchable product names.

## Solution: Extend Cost Agent to Generate Products

### Architecture

```
Cost Agent (Python)
    ↓
costOutput.divisions[].lineItems[].products[] ← NEW
    ↓
estimates/{estimateId}.costOutput
    ↓
EstimatePage.tsx → transformProductsForComparison()
    ↓
projects/{projectId}/priceComparison/products ← NEW collection
    ↓
PriceComparisonPanel → loads products → startComparison(productNames)
```

---

## Implementation Steps

### Step 1: Backend - Add Product Model

**File:** `/functions/models/cost_estimate.py`

Add a new `ProductSpec` model and extend `LineItemCost`:

```python
class ProductSpec(BaseModel):
    """Individual purchasable product for a line item."""

    name: str = Field(..., description="Searchable retail product name (e.g., '2x4x8 SPF Stud')")
    quantity: float = Field(..., ge=0, description="Quantity needed")
    unit: str = Field(..., description="Unit of measurement (piece, linear ft, sqft, etc.)")
    estimated_unit_price: float = Field(default=0, ge=0, description="Estimated unit price in USD")
    category: Optional[str] = Field(None, description="Product category (lumber, drywall, electrical, etc.)")
    notes: Optional[str] = Field(None, description="Additional notes or specifications")


class LineItemCost(BaseModel):
    # ... existing fields ...

    # NEW: Actual purchasable products for this line item
    products: List[ProductSpec] = Field(
        default_factory=list,
        description="List of actual retail products needed for this line item"
    )
```

Update `to_agent_output()` in `LineItemCost` to include products:

```python
def to_agent_output(self) -> Dict[str, Any]:
    return {
        # ... existing fields ...
        "products": [
            {
                "name": p.name,
                "quantity": p.quantity,
                "unit": p.unit,
                "estimatedUnitPrice": p.estimated_unit_price,
                "category": p.category,
                "notes": p.notes,
            }
            for p in self.products
        ],
    }
```

### Step 2: Backend - Update Cost Agent LLM Prompt

**File:** `/functions/agents/primary/cost_agent.py`

Modify the LLM prompt to also generate product specs for each line item. The prompt should instruct the model to:

1. For each line item, identify the specific retail products needed
2. Generate searchable product names (as they would appear on Home Depot/Lowe's)
3. Calculate quantities based on the line item quantity
4. Estimate unit prices

**Example prompt addition:**
```
For each line item, also provide a list of actual purchasable products:
- Product names should be searchable on Home Depot or Lowe's
- Include specific sizes, dimensions, and specifications
- Examples: "2x4x8 SPF Stud", "1/2in Drywall Sheet 4x8", "14/2 Romex Wire 250ft"
- Calculate the quantity needed based on the line item scope
```

### Step 3: Frontend - Create Products Type

**File:** `/collabcanvas/src/types/priceComparison.ts`

Add new types for products:

```typescript
/**
 * Product extracted from estimate for price comparison
 */
export interface ProductForComparison {
  id: string;
  name: string;                    // Searchable product name
  quantity: number;
  unit: string;
  estimatedUnitPrice: number;
  lineItemId: string;              // Reference to parent line item
  division: string;                // CSI division name
  category?: string;               // Product category
}

/**
 * Products collection stored in Firestore
 */
export interface ProductsForComparison {
  projectId: string;
  estimateId: string;
  products: ProductForComparison[];
  createdAt: number;
  updatedAt: number;
}
```

### Step 4: Frontend - Create Products Service

**File:** `/collabcanvas/src/services/productsService.ts`

```typescript
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from './firebase';
import type { ProductsForComparison, ProductForComparison } from '../types/priceComparison';

/**
 * Transform estimate costOutput to products for comparison
 */
export function transformEstimateToProducts(
  estimateData: any,
  estimateId: string,
  projectId: string
): ProductsForComparison | null {
  const costOutput = estimateData.costOutput;
  if (!costOutput?.divisions) return null;

  const products: ProductForComparison[] = [];
  let productIndex = 0;

  for (const division of costOutput.divisions) {
    for (const lineItem of division.lineItems || []) {
      for (const product of lineItem.products || []) {
        products.push({
          id: `prod-${productIndex++}`,
          name: product.name,
          quantity: product.quantity,
          unit: product.unit,
          estimatedUnitPrice: product.estimatedUnitPrice || 0,
          lineItemId: lineItem.lineItemId,
          division: division.divisionName,
          category: product.category,
        });
      }
    }
  }

  if (products.length === 0) return null;

  return {
    projectId,
    estimateId,
    products,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Save products to Firestore
 */
export async function saveProductsForComparison(
  projectId: string,
  data: ProductsForComparison
): Promise<void> {
  const docRef = doc(firestore, 'projects', projectId, 'priceComparison', 'products');
  await setDoc(docRef, data);
}

/**
 * Get products from Firestore
 */
export async function getProductsForComparison(
  projectId: string
): Promise<ProductsForComparison | null> {
  const docRef = doc(firestore, 'projects', projectId, 'priceComparison', 'products');
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as ProductsForComparison;
}
```

### Step 5: Frontend - Save Products on Pipeline Completion

**File:** `/collabcanvas/src/pages/project/EstimatePage.tsx`

Add products save when estimate completes (alongside CPM save):

```typescript
import {
  transformEstimateToProducts,
  saveProductsForComparison,
} from '../../services/productsService';

// Inside pipeline completion handler, after BOM transform:
if (estimateData.costOutput && projectId && user) {
  const productsData = transformEstimateToProducts(
    estimateData,
    estimateId,
    projectId
  );
  if (productsData) {
    saveProductsForComparison(projectId, productsData)
      .then(() => console.log('[FLOW][Estimate] Products saved successfully'))
      .catch((err) => console.error('[FLOW][Estimate] Failed to save products:', err));
  }
}
```

### Step 6: Frontend - Update PriceComparisonPanel

**File:** `/collabcanvas/src/components/estimate/PriceComparisonPanel.tsx`

Update to load products from Firestore instead of extracting from BOM:

```typescript
import { getProductsForComparison } from '../../services/productsService';
import type { ProductsForComparison } from '../../types/priceComparison';

// Replace BOM-based product extraction with Firestore load
const [productsData, setProductsData] = useState<ProductsForComparison | null>(null);

useEffect(() => {
  getProductsForComparison(projectId)
    .then(setProductsData)
    .catch(console.error);
}, [projectId]);

// Extract product names for comparison
const productNames = useMemo(() => {
  if (!productsData?.products) return [];
  return productsData.products.map((p) => p.name);
}, [productsData]);

// Can also show quantity and estimated price in the UI
```

---

## Data Flow Summary

```
1. User generates estimate
        ↓
2. Cost Agent runs with updated prompt
        ↓
3. costOutput includes products[] for each line item
        ↓
4. Saved to estimates/{estimateId}
        ↓
5. Pipeline completes → EstimatePage loads estimate
        ↓
6. transformEstimateToProducts() extracts products
        ↓
7. Saved to projects/{projectId}/priceComparison/products
        ↓
8. PriceComparisonPanel loads products
        ↓
9. startComparison(productNames) with actual searchable names
        ↓
10. Google Shopping API finds real products
        ↓
11. Results displayed with quantity × best price calculations
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `/functions/models/cost_estimate.py` | Add `ProductSpec` model, extend `LineItemCost` |
| `/functions/agents/primary/cost_agent.py` | Update LLM prompt to generate products |
| `/collabcanvas/src/types/priceComparison.ts` | Add `ProductForComparison` types |
| `/collabcanvas/src/services/productsService.ts` | NEW: Products transformation and Firestore ops |
| `/collabcanvas/src/pages/project/EstimatePage.tsx` | Save products on pipeline completion |
| `/collabcanvas/src/components/estimate/PriceComparisonPanel.tsx` | Load products from Firestore |

---

## UI Enhancements (Future)

Once products are available with quantities, the UI can show:

1. **Quantity Column** - How many of each product needed
2. **Estimated vs Actual Price** - Compare estimate price with retailer prices
3. **Total Cost by Product** - quantity × unit price
4. **Total Savings** - Sum of (estimated - best_price) × quantity
5. **Export Shopping List** - Generate a shopping list with quantities

---

## Testing Considerations

1. **Unit Tests**
   - `ProductSpec` model validation
   - `transformEstimateToProducts()` transformation
   - Products Firestore save/load

2. **Integration Tests**
   - Cost Agent generates valid products
   - Products flow through pipeline to UI
   - Price comparison works with real product names

3. **Manual Testing**
   - Generate estimate for kitchen remodel
   - Verify products are searchable on Home Depot
   - Compare prices and verify savings calculation

---

## Migration Notes

- Existing estimates without `products` field will have empty products
- PriceComparisonPanel should fall back to BOM names if no products exist
- No database migration needed - new collection is additive

---

## Timeline

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1 | Backend model changes + Cost Agent prompt | Medium |
| Phase 2 | Frontend types + services | Small |
| Phase 3 | EstimatePage integration | Small |
| Phase 4 | PriceComparisonPanel update | Medium |
| Phase 5 | Testing + refinement | Medium |
