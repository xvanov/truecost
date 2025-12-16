/**
 * Contractor Settings Component Tests
 *
 * Tests for contractor settings UI components:
 * - CrewsTab
 * - MaterialsTab
 * - SuppliersTab
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrewsTab } from './CrewsTab';
import { MaterialsTab } from './MaterialsTab';
import { SuppliersTab } from './SuppliersTab';

// Mock the contractor store with complete data
const mockCrewsStore = {
  crews: [],
  materials: [],
  suppliers: [],
  laborRates: [],
  savingCrew: false,
  savingMaterial: false,
  savingSupplier: false,
  savingLaborRate: false,
  addCrew: vi.fn(),
  updateCrew: vi.fn(),
  deleteCrew: vi.fn(),
  addMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
  addSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  addLaborRate: vi.fn(),
  updateLaborRate: vi.fn(),
  deleteLaborRate: vi.fn(),
};

vi.mock('../../store/contractorStore', () => ({
  useContractorStore: () => mockCrewsStore,
}));

describe('CrewsTab', () => {
  it('should render the crews tab header', () => {
    render(<CrewsTab userId="test-user" />);
    expect(screen.getByText('Crew Templates')).toBeInTheDocument();
  });

  it('should show empty state when no crews', () => {
    render(<CrewsTab userId="test-user" />);
    // Actual text in the component
    expect(screen.getByText('No crew templates yet')).toBeInTheDocument();
  });

  it('should have an add crew button', () => {
    render(<CrewsTab userId="test-user" />);
    expect(screen.getByText('+ Add Crew')).toBeInTheDocument();
  });

  it('should show form when add button is clicked', () => {
    render(<CrewsTab userId="test-user" />);
    fireEvent.click(screen.getByText('+ Add Crew'));
    // Check for form fields - actual placeholder in component is "e.g., Kitchen Remodel Crew"
    expect(screen.getByPlaceholderText(/e.g., Kitchen Remodel Crew/i)).toBeInTheDocument();
  });
});

describe('MaterialsTab', () => {
  it('should render search and filter elements', () => {
    render(<MaterialsTab userId="test-user" />);
    expect(screen.getByPlaceholderText('Search materials...')).toBeInTheDocument();
  });

  it('should show empty state when no materials', () => {
    render(<MaterialsTab userId="test-user" />);
    // Check for the actual text in the component
    expect(screen.getByText('No materials in your catalog yet')).toBeInTheDocument();
  });

  it('should have an add material button', () => {
    render(<MaterialsTab userId="test-user" />);
    expect(screen.getByText('+ Add Material')).toBeInTheDocument();
  });

  it('should have category filter', () => {
    render(<MaterialsTab userId="test-user" />);
    expect(screen.getByText('All Categories')).toBeInTheDocument();
  });
});

describe('SuppliersTab', () => {
  it('should render the suppliers tab header', () => {
    render(<SuppliersTab userId="test-user" />);
    expect(screen.getByText('Suppliers')).toBeInTheDocument();
  });

  it('should show empty state when no suppliers', () => {
    render(<SuppliersTab userId="test-user" />);
    expect(screen.getByText('No suppliers added yet')).toBeInTheDocument();
  });

  it('should have an add supplier button', () => {
    render(<SuppliersTab userId="test-user" />);
    expect(screen.getByText('+ Add Supplier')).toBeInTheDocument();
  });

  it('should show form when add button is clicked', () => {
    render(<SuppliersTab userId="test-user" />);
    fireEvent.click(screen.getByText('+ Add Supplier'));
    expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
  });
});
