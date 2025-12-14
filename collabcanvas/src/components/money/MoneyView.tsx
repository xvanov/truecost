/**
 * Money View Component
 * AC: All - Integrates BOM, pricing, margin calculation, and estimate views
 * Main container for Money view tab
 *
 * Story 6-2: Added mode prop for Materials/Labor tab filtering
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCanvasStore } from '../../store/canvasStore';
import { getBOM, recalculateMargin } from '../../services/bomService';
import { fetchPricesForBOM, type PriceFetchStats } from '../../services/pricingService';
import { exportEstimateAsPDF, type BOMExportView } from '../../services/exportService';
import { BOMTable } from './BOMTable';
import { CustomerView } from './CustomerView';
import { ContractorView } from './ContractorView';
import { ComparisonView } from './ComparisonView';
import { LaborView } from './LaborView';
import { FloatingAIChat } from '../shared/FloatingAIChat';
import type { BillOfMaterials } from '../../types/material';

type EstimateView = 'customer' | 'contractor' | 'bom' | 'comparison';

/**
 * MoneyView mode prop for filtering display
 * - 'materials': Show BOM Table + Customer/Contractor/Comparison sub-views (materials focus)
 * - 'labor': Show Labor Analysis view
 * - 'full' | undefined: Show current full MoneyView (backward compatible)
 */
export interface MoneyViewProps {
  mode?: 'materials' | 'labor' | 'full';
}

export function MoneyView({ mode = 'full' }: MoneyViewProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const billOfMaterials = useCanvasStore(state => state.billOfMaterials);
  const setBillOfMaterials = useCanvasStore(state => state.setBillOfMaterials);
  const [currentView, setCurrentView] = useState<EstimateView>('bom');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceStats, setPriceStats] = useState<PriceFetchStats | null>(null);

  // Load BOM on mount - BUT skip if already loaded in store (e.g., from deep pipeline)
  useEffect(() => {
    // If BOM is already in store (e.g., from EstimatePage deep pipeline), use it
    if (billOfMaterials) {
      console.log('[MoneyView] BOM already in store, skipping fetch');
      setLoading(false);
      return;
    }

    if (!projectId) {
      setLoading(false);
      return;
    }

    const loadBOM = async () => {
      try {
        setLoading(true);
        const bom = await getBOM(projectId);
        if (bom) {
          setBillOfMaterials(bom);
        }
      } catch (err) {
        console.error('Error loading BOM:', err);
        setError(err instanceof Error ? err.message : 'Failed to load BOM');
      } finally {
        setLoading(false);
      }
    };

    loadBOM();
  }, [projectId, setBillOfMaterials, billOfMaterials]);

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem('money-view-preference') as EstimateView | null;
    if (savedView && ['customer', 'contractor', 'bom', 'comparison'].includes(savedView)) {
      setCurrentView(savedView);
    }
  }, []);

  // Save view preference to localStorage
  const handleViewChange = useCallback((view: EstimateView) => {
    setCurrentView(view);
    localStorage.setItem('money-view-preference', view);
  }, []);

  const handleRefreshPrices = useCallback(async () => {
    if (!billOfMaterials || !projectId) return;

    setFetchingPrices(true);
    setPriceStats(null);

    try {
      const updateProgress = (stats: PriceFetchStats, updatedBOM?: BillOfMaterials) => {
        setPriceStats(stats);
        if (updatedBOM) {
          setBillOfMaterials(updatedBOM);
        }
      };

      const result = await fetchPricesForBOM(
        billOfMaterials,
        updateProgress,
        false
      );

      // Recalculate margin after prices update
      const bomWithMargin = await recalculateMargin(projectId, result.bom);
      setBillOfMaterials(bomWithMargin);
      setPriceStats(result.stats);
    } catch (error) {
      console.error('[MONEY] Failed to refresh prices:', error);
      setError(error instanceof Error ? error.message : 'Failed to refresh prices');
    } finally {
      setFetchingPrices(false);
    }
  }, [billOfMaterials, projectId, setBillOfMaterials]);

  const handleBOMUpdate = useCallback(async (updatedBOM: BillOfMaterials) => {
    if (!projectId || !user) return;

    try {
      // Recalculate margin when BOM is updated
      const bomWithMargin = await recalculateMargin(projectId, updatedBOM);
      setBillOfMaterials(bomWithMargin);
    } catch (error) {
      console.error('[MONEY] Error updating BOM:', error);
    }
  }, [projectId, user, setBillOfMaterials]);

  const handleExportPDF = useCallback(async () => {
    if (!billOfMaterials) return;

    try {
      const exportView: BOMExportView = currentView === 'bom' ? 'contractor' : currentView;
      await exportEstimateAsPDF(billOfMaterials, exportView, {
        projectName: billOfMaterials.projectName,
      });
    } catch (error) {
      console.error('[MONEY] Error exporting PDF:', error);
      alert(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [billOfMaterials, currentView]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading BOM...</p>
        </div>
      </div>
    );
  }

  if (error && !billOfMaterials) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50">
      <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render labor-only view for mode="labor"
  if (mode === 'labor') {
    return (
      <div className="flex h-full bg-gray-50" data-testid="money-view-labor">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Labor Analysis</h1>
                {billOfMaterials?.projectName && (
                  <p className="text-sm text-gray-600 mt-1">{billOfMaterials.projectName}</p>
                )}
              </div>
            </div>
          </div>

          {/* Labor Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!billOfMaterials ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Labor Data</h3>
                  <p className="text-gray-600 mb-4">Generate an estimate to see labor analysis</p>
                </div>
              </div>
            ) : billOfMaterials.margin ? (
              <LaborView bom={billOfMaterials} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-600">Labor calculation not available. Please generate BOM with prices first.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render materials-focused view for mode="materials"
  if (mode === 'materials') {
    return (
      <div className="flex h-full bg-gray-50" data-testid="money-view-materials">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with View Toggle */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
                {billOfMaterials?.projectName && (
                  <p className="text-sm text-gray-600 mt-1">{billOfMaterials.projectName}</p>
                )}
              </div>
              <div className="flex items-center gap-4">
                {/* View Toggle */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => handleViewChange('bom')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                      currentView === 'bom'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    BOM Table
                  </button>
                  <button
                    onClick={() => handleViewChange('customer')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                      currentView === 'customer'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Customer View
                  </button>
                  <button
                    onClick={() => handleViewChange('contractor')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                      currentView === 'contractor'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Contractor View
                  </button>
                </div>

                {/* Refresh Prices Button */}
                {billOfMaterials && (
                  <>
                    <button
                      onClick={handleRefreshPrices}
                      disabled={fetchingPrices}
                      className={`px-4 py-2 text-sm rounded transition-colors ${
                        fetchingPrices
                          ? 'bg-gray-400 text-white cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {fetchingPrices ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Fetching...
                        </span>
                      ) : (
                        'Refresh Prices'
                      )}
                    </button>
                    {priceStats && (
                      <div className="text-xs text-gray-600 px-2">
                        {priceStats.successful}/{priceStats.total} priced ({priceStats.successRate.toFixed(0)}%)
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Materials Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!billOfMaterials ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No BOM Generated</h3>
                  <p className="text-gray-600 mb-4">Generate an estimate to see materials</p>
                </div>
              </div>
            ) : (
              <>
                {currentView === 'bom' && (
                  <BOMTable bom={billOfMaterials} onBOMUpdate={handleBOMUpdate} />
                )}
                {currentView === 'customer' && (
                  <CustomerView bom={billOfMaterials} />
                )}
                {currentView === 'contractor' && (
                  <ContractorView bom={billOfMaterials} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: Full view (mode='full' or undefined)
  return (
    <div className="flex h-full bg-gray-50">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with View Toggle */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Money View</h1>
              {billOfMaterials?.projectName && (
                <p className="text-sm text-gray-600 mt-1">{billOfMaterials.projectName}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* View Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => handleViewChange('bom')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    currentView === 'bom'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  BOM Table
                </button>
                <button
                  onClick={() => handleViewChange('customer')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    currentView === 'customer'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Customer View
                </button>
                <button
                  onClick={() => handleViewChange('contractor')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    currentView === 'contractor'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Contractor View
                </button>
                <button
                  onClick={() => handleViewChange('comparison')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    currentView === 'comparison'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Comparison
                </button>
              </div>

              {/* Refresh Prices Button */}
              {billOfMaterials && (
                <>
                  <button
                    onClick={handleRefreshPrices}
                    disabled={fetchingPrices}
                    className={`px-4 py-2 text-sm rounded transition-colors ${
                      fetchingPrices
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {fetchingPrices ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Fetching...
                      </span>
                    ) : (
                      'Refresh Prices'
                    )}
                  </button>
                  {priceStats && (
                    <div className="text-xs text-gray-600 px-2">
                      {priceStats.successful}/{priceStats.total} priced ({priceStats.successRate.toFixed(0)}%)
                    </div>
                  )}
                  <button
                    onClick={handleExportPDF}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                    title="Export current view as PDF"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PDF
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {!billOfMaterials ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No BOM Generated</h3>
                <p className="text-gray-600 mb-4">Use the AI Assistant to generate a Bill of Materials</p>
                <p className="text-sm text-gray-500">Open the AI chat panel to get started</p>
              </div>
            </div>
          ) : (
            <>
              {currentView === 'bom' && (
                <BOMTable bom={billOfMaterials} onBOMUpdate={handleBOMUpdate} />
              )}
              {currentView === 'customer' && (
                <CustomerView bom={billOfMaterials} />
              )}
              {currentView === 'contractor' && (
                <ContractorView bom={billOfMaterials} />
              )}
              {currentView === 'comparison' && (
                <ComparisonView bom={billOfMaterials} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating AI Chat Button */}
      <FloatingAIChat />
    </div>
  );
}
