/**
 * Price Comparison Panel Component
 * Story 6-2: Embedded panel for Price Comparison tab in EstimatePage
 *
 * Adapted from PriceComparisonPage to work as a panel within the estimate view
 * Subscribes to Firestore for real-time price comparison updates
 *
 * AC #11: Uses real BOM materials instead of mock data
 */

import { useEffect, useState, useMemo } from 'react';
import { PriceComparisonTable } from '../PriceComparisonTable';
import {
  startComparison,
  subscribeToComparison,
} from '../../services/priceComparisonService';
import { useCanvasStore } from '../../store/canvasStore';
import type { ComparisonProgress } from '../../types/priceComparison';

interface PriceComparisonPanelProps {
  projectId: string;
}

export function PriceComparisonPanel({ projectId }: PriceComparisonPanelProps) {
  const [progress, setProgress] = useState<ComparisonProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  // Get BOM from Zustand store to extract real product names
  const billOfMaterials = useCanvasStore((state) => state.billOfMaterials);

  // Extract product names from real BOM data
  const productNames = useMemo(() => {
    if (!billOfMaterials?.totalMaterials) return [];

    // Extract names from BOM materials
    return billOfMaterials.totalMaterials
      .map((material) => material.name)
      .filter((name) => name && name.length > 0);
  }, [billOfMaterials]);

  // Subscribe to Firestore for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToComparison(
      projectId,
      (data) => {
        setProgress(data);
        if (data.status === 'error') {
          setError(data.error || 'Comparison failed');
        }
      },
      (err) => setError(err.message)
    );

    return () => unsubscribe();
  }, [projectId]);

  // Auto-start comparison when panel mounts (if BOM has products and not already started)
  useEffect(() => {
    if (!hasStarted && !progress && productNames.length > 0) {
      setHasStarted(true);
      startComparison(projectId, productNames, false).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start comparison');
      });
    }
  }, [projectId, hasStarted, progress, productNames]);

  async function handleRefresh() {
    if (productNames.length === 0) {
      setError('No materials in BOM to compare. Generate an estimate first.');
      return;
    }

    setError(null);
    try {
      await startComparison(projectId, productNames, true); // forceRefresh = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }

  const status = progress?.status || 'idle';
  const isProcessing = status === 'processing';

  // Calculate potential savings
  const potentialSavings = progress?.results?.reduce((total, result) => {
    if (!result.bestPrice || !result.matches) return total;

    // Find highest price among matches
    let maxPrice = result.bestPrice.product.price;
    Object.values(result.matches).forEach((match) => {
      if (match?.selectedProduct?.price && match.selectedProduct.price > maxPrice) {
        maxPrice = match.selectedProduct.price;
      }
    });

    return total + (maxPrice - result.bestPrice.product.price);
  }, 0) || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-truecost-glass-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-truecost-text-primary">Price Comparison</h1>
            <div className="flex items-center gap-4 mt-1">
              {productNames.length > 0 && (
                <p className="text-sm text-truecost-text-secondary">
                  {progress && progress.results.length > 0
                    ? `${progress.results.length} products compared across retailers`
                    : `${productNames.length} material${productNames.length !== 1 ? 's' : ''} from BOM`}
                </p>
              )}
              {potentialSavings > 0 && (
                <span className="text-sm font-medium text-truecost-success">
                  Potential savings: ${potentialSavings.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              isProcessing
                ? 'bg-truecost-text-muted text-truecost-bg-primary cursor-not-allowed'
                : 'bg-gradient-to-r from-truecost-cyan to-truecost-teal text-truecost-bg-primary hover:opacity-90'
            }`}
          >
            {isProcessing ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Comparing...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh Prices
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Progress bar (while processing) */}
        {isProcessing && progress && (
          <div className="mb-6 glass-panel p-4">
            <div className="flex justify-between text-sm text-truecost-text-secondary mb-2">
              <span>Comparing prices across retailers...</span>
              <span>
                {progress.completedProducts} of {progress.totalProducts} products
              </span>
            </div>
            <div className="w-full bg-truecost-glass-bg rounded-full h-3">
              <div
                className="bg-gradient-to-r from-truecost-cyan to-truecost-teal h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    progress.totalProducts > 0
                      ? Math.min((progress.completedProducts / progress.totalProducts) * 100, 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Loading skeleton (initial load, no data yet) */}
        {!progress && !error && (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-truecost-glass-bg rounded" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-truecost-glass-bg rounded" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-truecost-danger p-4 bg-truecost-danger/10 rounded-lg border border-truecost-danger/30 mb-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{error}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="mt-2 text-truecost-cyan hover:underline text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state - no BOM data */}
        {productNames.length === 0 && !isProcessing && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-truecost-text-muted mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-2">No Materials to Compare</h3>
            <p className="text-truecost-text-secondary mb-4">
              Generate an estimate first to get a Bill of Materials for price comparison.
            </p>
          </div>
        )}

        {/* Empty state - has BOM but no results yet */}
        {productNames.length > 0 && progress && progress.results.length === 0 && !isProcessing && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-truecost-text-muted mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <h3 className="text-lg font-semibold text-truecost-text-primary mb-2">Ready to Compare</h3>
            <p className="text-truecost-text-secondary mb-4">
              {productNames.length} material{productNames.length !== 1 ? 's' : ''} found in BOM.
              Click "Refresh Prices" to compare prices across retailers.
            </p>
          </div>
        )}

        {/* Results table */}
        {progress && progress.results.length > 0 && (
          <div className="glass-panel overflow-hidden">
            <PriceComparisonTable results={progress.results} />
          </div>
        )}

        {/* Retailer legend */}
        {progress && progress.results.length > 0 && (
          <div className="mt-6 glass-panel p-4">
            <h4 className="text-sm font-semibold text-truecost-text-primary mb-2">Retailers Compared</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded" />
                <span className="text-sm text-truecost-text-secondary">Home Depot</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-700 rounded" />
                <span className="text-sm text-truecost-text-secondary">Lowe's</span>
              </div>
            </div>
            <p className="text-xs text-truecost-text-muted mt-3">
              Prices are fetched in real-time and may vary by location. Best prices are
              highlighted in green.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
