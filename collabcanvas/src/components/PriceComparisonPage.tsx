/**
 * Price Comparison Page Component
 * Epic: Price Intelligence Module
 * Story: PC-4
 *
 * Full-page wrapper for price comparison results
 * Subscribes to Firestore for real-time progress updates
 */

import { useEffect, useState } from 'react'
import { PriceComparisonTable } from './PriceComparisonTable'
import {
  startMockComparison,
  subscribeToComparison,
} from '../services/priceComparisonService'
import type { ComparisonProgress } from '../types/priceComparison'

// Mock project ID for development (will be replaced with real projectId later)
const MOCK_PROJECT_ID = 'mock-project-001'

export function PriceComparisonPage() {
  const [progress, setProgress] = useState<ComparisonProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to Firestore for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToComparison(
      MOCK_PROJECT_ID,
      (data) => {
        setProgress(data)
        if (data.status === 'error') {
          setError(data.error || 'Comparison failed')
        }
      },
      (err) => setError(err.message)
    )

    // Start comparison on mount (will use cached if available)
    startMockComparison(MOCK_PROJECT_ID, false).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to start comparison')
    })

    return () => unsubscribe()
  }, [])

  async function handleRefresh() {
    setError(null)
    try {
      await startMockComparison(MOCK_PROJECT_ID, true) // forceRefresh = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    }
  }

  const status = progress?.status || 'idle'
  const isProcessing = status === 'processing'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-black">Price Comparison</h1>
            {progress && (
              <p className="text-sm text-black">
                {progress.results.length} products compared
              </p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Comparing...' : 'Refresh Prices'}
          </button>
        </div>

        {/* Progress bar (while processing) */}
        {isProcessing && progress && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-black mb-2">
              <span>Comparing prices...</span>
              <span>{progress.completedProducts} of {progress.totalProducts} products</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${progress.totalProducts > 0 ? Math.min((progress.completedProducts / progress.totalProducts) * 100, 100) : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Loading skeleton (initial load, no data yet) */}
        {!progress && !error && (
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-black p-4 bg-red-50 rounded mb-4">
            {error}
            <button
              onClick={handleRefresh}
              className="ml-4 text-black underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results table (shows incrementally as products complete) */}
        {progress && progress.results.length > 0 && (
          <PriceComparisonTable results={progress.results} />
        )}
      </div>
    </div>
  )
}
