/**
 * Price Comparison Table Component
 * Epic: Price Intelligence Module
 * Story: PC-4
 *
 * Displays comparison results in a table with retailer columns
 * Highlights best prices with green background and badge
 */

import type { ComparisonResult, Retailer, RetailerProduct } from '../types/priceComparison'

interface Props {
  results: ComparisonResult[]
}

const RETAILER_LABELS: Record<Retailer, string> = {
  homeDepot: 'Home Depot',
  lowes: "Lowe's",
  aceHardware: 'Ace Hardware', // kept for type compatibility but not displayed
}

// Only display these retailers in the UI
const DISPLAYED_RETAILERS: Retailer[] = ['homeDepot', 'lowes']

export function PriceComparisonTable({ results }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-white rounded-lg shadow">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-3 text-left font-semibold text-black">Product</th>
            {DISPLAYED_RETAILERS.map((retailer) => (
              <th key={retailer} className="p-3 text-left font-semibold text-black">
                {RETAILER_LABELS[retailer]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.originalProductName} className="border-t">
              <td className="p-3 font-medium text-black">{result.originalProductName}</td>
              {DISPLAYED_RETAILERS.map((retailer) => (
                <ProductCell
                  key={retailer}
                  match={result.matches[retailer]}
                  isBest={result.bestPrice?.retailer === retailer}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductCell({
  match,
  isBest,
}: {
  match?: { selectedProduct: RetailerProduct | null; confidence: number }
  isBest: boolean
}) {
  // Handle missing retailer data (retailer not queried)
  if (!match) {
    return (
      <td className="p-3 bg-gray-100 text-black italic">
        Not available
      </td>
    )
  }

  const product = match.selectedProduct

  if (!product) {
    return (
      <td className="p-3 bg-gray-50 text-black">
        No match found
      </td>
    )
  }

  return (
    <td className={`p-3 ${isBest ? 'bg-green-50' : ''}`}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-black">${product.price.toFixed(2)}</span>
          {isBest && (
            <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
              BEST
            </span>
          )}
        </div>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-black hover:underline truncate"
        >
          {product.name}
        </a>
        {product.brand && (
          <span className="text-xs text-black">{product.brand}</span>
        )}
      </div>
    </td>
  )
}
