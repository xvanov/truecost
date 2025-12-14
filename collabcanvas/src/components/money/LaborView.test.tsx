/**
 * LaborView Unit Tests
 * Story 6-2: Test labor analysis display
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LaborView } from './LaborView';
import type { BillOfMaterials } from '../../types/material';

// Mock margin service
vi.mock('../../services/marginService', () => ({
  formatMargin: (margin: { laborCost: number; subtotal: number; marginPercentage: number; marginDollars: number; marginTimeSlack: number; total: number }) => ({
    laborCost: `$${margin.laborCost.toFixed(2)}`,
    subtotal: `$${margin.subtotal.toFixed(2)}`,
    marginPercentage: `${margin.marginPercentage}%`,
    marginDollars: `$${margin.marginDollars.toFixed(2)}`,
    marginTimeSlack: `${margin.marginTimeSlack} days`,
    total: `$${margin.total.toFixed(2)}`,
    materialCost: '$380.00',
  }),
}));

describe('LaborView', () => {
  const mockBOMWithMargin: BillOfMaterials = {
    id: 'test-bom',
    totalMaterials: [
      { id: 'm1', name: 'Drywall', quantity: 10, unit: 'sheet', category: 'surface', priceUSD: 12.99 },
    ],
    calculations: [],
    margin: {
      materialCost: 380,
      laborCost: 4000,
      subtotal: 4380,
      marginPercentage: 15,
      marginDollars: 657,
      marginTimeSlack: 3,
      total: 5037,
      calculatedAt: Date.now(),
    },
    createdAt: Date.now(),
    createdBy: 'test-user',
    updatedAt: Date.now(),
  };

  // Unused but kept for future tests (e.g., testing empty state)
  const _mockBOMWithoutMargin: BillOfMaterials = {
    id: 'test-bom-no-margin',
    totalMaterials: [],
    calculations: [],
    createdAt: Date.now(),
    createdBy: 'test-user',
    updatedAt: Date.now(),
  };

  it('renders labor summary cards', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    expect(screen.getByText('Total Labor Cost')).toBeInTheDocument();
    expect(screen.getByText('Estimated Hours')).toBeInTheDocument();
    expect(screen.getByText('Avg Hourly Rate')).toBeInTheDocument();
  });

  it('displays correct total labor cost', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    // Should show formatted labor cost (appears multiple times, use getAllBy)
    const laborCostElements = screen.getAllByText('$4000.00');
    expect(laborCostElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders labor breakdown table with trades', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    expect(screen.getByText('Labor Breakdown by Trade')).toBeInTheDocument();
    expect(screen.getByText('General Labor')).toBeInTheDocument();
    expect(screen.getByText('Skilled Carpentry')).toBeInTheDocument();
    expect(screen.getByText('Licensed Electrician')).toBeInTheDocument();
    expect(screen.getByText('Licensed Plumber')).toBeInTheDocument();
    expect(screen.getByText('HVAC Technician')).toBeInTheDocument();
    expect(screen.getByText('Drywall & Finishing')).toBeInTheDocument();
  });

  it('shows hourly rates for each trade', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    expect(screen.getByText('$45.00/hr')).toBeInTheDocument(); // General Labor
    expect(screen.getByText('$65.00/hr')).toBeInTheDocument(); // Carpentry
    expect(screen.getByText('$85.00/hr')).toBeInTheDocument(); // Electrician
    expect(screen.getByText('$90.00/hr')).toBeInTheDocument(); // Plumber
  });

  it('displays buffer time when margin has time slack', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    expect(screen.getByText('Buffer Time Included')).toBeInTheDocument();
    expect(screen.getByText(/3 days of slack time/i)).toBeInTheDocument();
  });

  it('renders labor estimation notes', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    expect(screen.getByText('Labor Estimation Notes')).toBeInTheDocument();
    expect(screen.getByText(/Labor hours are estimated based on project scope/i)).toBeInTheDocument();
  });

  it('calculates estimated hours correctly', () => {
    render(<LaborView bom={mockBOMWithMargin} />);

    // laborCost = 4000, average rate = $50/hr, so hours = 80
    expect(screen.getByText('80 hrs')).toBeInTheDocument();
    // 80 hours / 8 hours per day = 10 days
    expect(screen.getByText('10.0 work days')).toBeInTheDocument();
  });
});
