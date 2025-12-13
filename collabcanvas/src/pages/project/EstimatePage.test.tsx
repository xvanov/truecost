/**
 * EstimatePage Unit Tests
 * Story 6-2: Test two-phase UI and tab navigation
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EstimatePage } from './EstimatePage';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user-123' }, loading: false }),
}));

vi.mock('../../store/canvasStore', () => ({
  useCanvasStore: vi.fn((selector) => {
    const mockState = {
      billOfMaterials: {
        id: 'test-bom',
        totalMaterials: [
          { id: 'm1', name: 'Drywall', quantity: 10, unit: 'sheet', priceUSD: 12.99 },
        ],
        margin: {
          materialCost: 380,
          laborCost: 1200,
          subtotal: 1580,
          marginPercentage: 15,
          marginDollars: 237,
          marginTimeSlack: 2,
          total: 1817,
          calculatedAt: Date.now(),
        },
        createdAt: Date.now(),
        createdBy: 'test-user',
        updatedAt: Date.now(),
      },
      setBillOfMaterials: vi.fn(),
    };
    return selector(mockState);
  }),
}));

vi.mock('../../services/bomService', () => ({
  getBOM: vi.fn().mockResolvedValue({
    id: 'test-bom',
    totalMaterials: [{ id: 'm1', name: 'Test Material', quantity: 10, unit: 'piece' }],
    margin: { laborCost: 1200 },
    createdAt: Date.now(),
    createdBy: 'test-user',
    updatedAt: Date.now(),
  }),
}));

vi.mock('../../services/pipelineService', () => {
  const INITIAL_PROGRESS = {
    status: 'idle',
    currentStage: null,
    stageName: '',
    completedStages: [],
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
  };
  return {
    subscribeToPipelineProgress: vi.fn(() => () => {}),
    triggerEstimatePipeline: vi.fn().mockResolvedValue({ success: true, estimateId: 'est-test-123' }),
    getPipelineStatus: vi.fn().mockResolvedValue(INITIAL_PROGRESS),
    checkPipelineComplete: vi.fn().mockResolvedValue(true),
    INITIAL_PROGRESS,
    PIPELINE_STAGES: [
      { id: 'cad_analysis', name: 'Analyzing blueprints', weight: 10 },
      { id: 'final', name: 'Finalizing estimate', weight: 15 },
    ],
  };
});

vi.mock('../../services/pdfService', () => ({
  generateContractorPDF: vi.fn().mockResolvedValue({ success: true, pdfUrl: 'http://example.com/contractor.pdf' }),
  generateClientPDF: vi.fn().mockResolvedValue({ success: true, pdfUrl: 'http://example.com/client.pdf' }),
  openPDFInNewTab: vi.fn(),
}));

// Mock child components
vi.mock('../../components/money/MoneyView', () => ({
  MoneyView: ({ mode }: { mode?: string }) => (
    <div data-testid={`money-view-${mode || 'full'}`}>MoneyView ({mode || 'full'})</div>
  ),
}));

vi.mock('../../components/money/ComparisonView', () => ({
  ComparisonView: () => <div data-testid="comparison-view">ComparisonView</div>,
}));

vi.mock('../../components/time/TimeView', () => ({
  TimeView: ({ projectId }: { projectId: string }) => (
    <div data-testid="time-view">TimeView for {projectId}</div>
  ),
}));

vi.mock('../../components/estimate/PriceComparisonPanel', () => ({
  PriceComparisonPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="price-comparison-panel">PriceComparisonPanel for {projectId}</div>
  ),
}));

vi.mock('../../components/estimate/EstimateStepper', () => ({
  EstimateStepper: () => <div data-testid="estimate-stepper">EstimateStepper</div>,
}));

vi.mock('../../components/layouts/AuthenticatedLayout', () => ({
  AuthenticatedLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Test wrapper with router
const renderWithRouter = (projectId: string = 'test-project-123') => {
  return render(
    <MemoryRouter initialEntries={[`/project/${projectId}/estimate`]}>
      <Routes>
        <Route path="/project/:id/estimate" element={<EstimatePage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('EstimatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the estimate stepper', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId('estimate-stepper')).toBeInTheDocument();
    });
  });

  it('displays results view with tabs when BOM exists', async () => {
    renderWithRouter();

    await waitFor(() => {
      // Should show results phase since BOM exists
      expect(screen.getByText('Project Estimate')).toBeInTheDocument();
    });
  });

  it('renders all five tabs in results view', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /materials/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /labor/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /time/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /price comparison/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /estimate vs actual/i })).toBeInTheDocument();
    });
  });

  it('shows Materials tab content when Materials tab is clicked', async () => {
    renderWithRouter();

    // Click on Materials tab
    await waitFor(() => {
      const materialsTab = screen.getByRole('button', { name: /materials/i });
      fireEvent.click(materialsTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('money-view-materials')).toBeInTheDocument();
    });
  });

  it('switches to Labor tab when clicked', async () => {
    renderWithRouter();

    await waitFor(() => {
      const laborTab = screen.getByRole('button', { name: /labor/i });
      fireEvent.click(laborTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('money-view-labor')).toBeInTheDocument();
    });
  });

  it('switches to Time tab when clicked', async () => {
    renderWithRouter();

    await waitFor(() => {
      const timeTab = screen.getByRole('button', { name: /time/i });
      fireEvent.click(timeTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('time-view')).toBeInTheDocument();
    });
  });

  it('switches to Price Comparison tab when clicked', async () => {
    renderWithRouter();

    await waitFor(() => {
      const pcTab = screen.getByRole('button', { name: /price comparison/i });
      fireEvent.click(pcTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('price-comparison-panel')).toBeInTheDocument();
    });
  });

  it('shows PDF export buttons in results view', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /contractor estimate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /client estimate/i })).toBeInTheDocument();
    });
  });

  it('renders back to annotate button', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to annotate/i })).toBeInTheDocument();
    });
  });
});
