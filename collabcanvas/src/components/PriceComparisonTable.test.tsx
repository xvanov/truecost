/**
 * Price Comparison Table Tests
 * Story: PC-4
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceComparisonTable } from './PriceComparisonTable'
import type { ComparisonResult, RetailerProduct } from '../types/priceComparison'

// Helper to create a mock retailer product
function createMockProduct(overrides: Partial<RetailerProduct> = {}): RetailerProduct {
  return {
    id: 'test-id',
    name: 'Test Product',
    brand: 'Test Brand',
    price: 9.99,
    currency: 'USD',
    url: 'https://example.com/product',
    retailer: 'homeDepot',
    ...overrides,
  }
}

// Helper to create a mock comparison result
function createMockResult(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  const homeDepotProduct = createMockProduct({ retailer: 'homeDepot', price: 10.99 })
  const lowesProduct = createMockProduct({ retailer: 'lowes', price: 9.99 })
  const aceProduct = createMockProduct({ retailer: 'aceHardware', price: 11.99 })

  return {
    originalProductName: '2x4 lumber 8ft',
    matches: {
      homeDepot: { selectedProduct: homeDepotProduct, confidence: 0.9, reasoning: 'Good match', searchResultsCount: 5 },
      lowes: { selectedProduct: lowesProduct, confidence: 0.85, reasoning: 'Good match', searchResultsCount: 4 },
      aceHardware: { selectedProduct: aceProduct, confidence: 0.8, reasoning: 'Good match', searchResultsCount: 3 },
    },
    bestPrice: { retailer: 'lowes', product: lowesProduct, savings: 2 },
    comparedAt: Date.now(),
    cached: false,
    ...overrides,
  }
}

describe('PriceComparisonTable', () => {
  it('renders table with product and retailer columns', () => {
    const results = [createMockResult()]
    render(<PriceComparisonTable results={results} />)

    // Check headers (only homeDepot and lowes are displayed)
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Home Depot')).toBeInTheDocument()
    expect(screen.getByText("Lowe's")).toBeInTheDocument()

    // Check product name
    expect(screen.getByText('2x4 lumber 8ft')).toBeInTheDocument()
  })

  it('displays prices for each retailer', () => {
    const results = [createMockResult()]
    render(<PriceComparisonTable results={results} />)

    // Only homeDepot ($10.99) and lowes ($9.99) are displayed
    expect(screen.getByText('$10.99')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
  })

  it('highlights best price with BEST badge', () => {
    const results = [createMockResult()]
    render(<PriceComparisonTable results={results} />)

    const bestBadge = screen.getByText('BEST')
    expect(bestBadge).toBeInTheDocument()
    expect(bestBadge).toHaveClass('bg-green-600')
  })

  it('shows "No match found" for null matches', () => {
    const result = createMockResult()
    result.matches.lowes = {
      selectedProduct: null,
      confidence: 0,
      reasoning: 'No products found',
      searchResultsCount: 0,
    }
    result.bestPrice = null

    render(<PriceComparisonTable results={[result]} />)

    expect(screen.getByText('No match found')).toBeInTheDocument()
  })

  it('renders product links with target="_blank" and rel="noopener noreferrer"', () => {
    const results = [createMockResult()]
    render(<PriceComparisonTable results={results} />)

    const links = screen.getAllByRole('link')
    links.forEach(link => {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('renders multiple products correctly', () => {
    const results = [
      createMockResult({ originalProductName: 'Product 1' }),
      createMockResult({ originalProductName: 'Product 2' }),
      createMockResult({ originalProductName: 'Product 3' }),
    ]
    render(<PriceComparisonTable results={results} />)

    expect(screen.getByText('Product 1')).toBeInTheDocument()
    expect(screen.getByText('Product 2')).toBeInTheDocument()
    expect(screen.getByText('Product 3')).toBeInTheDocument()
  })

  it('displays product name and price correctly', () => {
    const results = [createMockResult()]
    render(<PriceComparisonTable results={results} />)

    // Verify product name is displayed (appears twice - once for each retailer)
    const productNames = screen.getAllByText('Test Product')
    expect(productNames.length).toBe(2) // Home Depot and Lowe's
    // Verify prices are displayed
    expect(screen.getByText('$10.99')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
  })

  it('applies bg-green-50 to best price cell', () => {
    const results = [createMockResult()]
    const { container } = render(<PriceComparisonTable results={results} />)

    // Find cells with bg-green-50 class
    const greenCells = container.querySelectorAll('.bg-green-50')
    expect(greenCells.length).toBe(1)
  })

  it('applies bg-gray-50 to no-match cells', () => {
    const result = createMockResult()
    result.matches.lowes = {
      selectedProduct: null,
      confidence: 0,
      reasoning: 'No products found',
      searchResultsCount: 0,
    }

    const { container } = render(<PriceComparisonTable results={[result]} />)

    const grayCells = container.querySelectorAll('.bg-gray-50')
    expect(grayCells.length).toBeGreaterThan(0)
  })
})
