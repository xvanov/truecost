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
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-truecost-bg-secondary">
            <th className="p-3 text-left font-semibold text-truecost-text-primary">Product</th>
            {DISPLAYED_RETAILERS.map((retailer) => (
              <th key={retailer} className="p-3 text-left font-semibold text-truecost-text-primary">
                {RETAILER_LABELS[retailer]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-truecost-glass-border">
          {results.map((result) => (
            <tr key={result.originalProductName} className="hover:bg-truecost-glass-bg">
              <td className="p-3 font-medium text-truecost-text-primary">{result.originalProductName}</td>
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
      <td className="p-3 bg-truecost-bg-secondary text-truecost-text-muted italic">
        Not available
      </td>
    )
  }

  const product = match.selectedProduct

  if (!product) {
    return (
      <td className="p-3 text-truecost-text-muted">
        No match found
      </td>
    )
  }

  return (
    <td className={`p-3 ${isBest ? 'bg-truecost-success/10' : ''}`}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isBest ? 'text-truecost-success' : 'text-truecost-cyan'}`}>
            ${product.price.toFixed(2)}
          </span>
          {isBest && (
            <span className="text-xs bg-truecost-success text-white px-2 py-0.5 rounded">
              BEST
            </span>
          )}
        </div>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-truecost-text-secondary hover:text-truecost-cyan hover:underline truncate"
        >
          {product.name}
        </a>
      </div>
    </td>
  )
}
