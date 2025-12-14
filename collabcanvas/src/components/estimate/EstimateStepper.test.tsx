/**
 * Unit tests for EstimateStepper component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EstimateStepper } from './EstimateStepper';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('EstimateStepper Component', () => {
  const defaultProps = {
    currentStep: 'scope' as const,
    projectId: 'test-project-123',
    completedSteps: [] as ('scope' | 'annotate' | 'estimate')[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all three steps', () => {
    render(
      <BrowserRouter>
        <EstimateStepper {...defaultProps} />
      </BrowserRouter>
    );

    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Annotate')).toBeInTheDocument();
    expect(screen.getByText('Estimate')).toBeInTheDocument();
  });

  it('should highlight the current step', () => {
    render(
      <BrowserRouter>
        <EstimateStepper {...defaultProps} currentStep="annotate" />
      </BrowserRouter>
    );

    const annotateButton = screen.getByText('Annotate').closest('button');
    expect(annotateButton).toHaveClass('bg-gradient-to-br');
  });

  it('should show completed steps with checkmark', () => {
    render(
      <BrowserRouter>
        <EstimateStepper
          {...defaultProps}
          currentStep="annotate"
          completedSteps={['scope']}
        />
      </BrowserRouter>
    );

    // Scope button should have a checkmark (SVG path element)
    const scopeButton = screen.getByText('Scope').closest('button');
    const checkIcon = scopeButton?.querySelector('svg');
    expect(checkIcon).toBeInTheDocument();
  });

  it('should disable future steps (but not the immediate next step)', () => {
    render(
      <BrowserRouter>
        <EstimateStepper {...defaultProps} currentStep="scope" />
      </BrowserRouter>
    );

    const annotateButton = screen.getByText('Annotate').closest('button');
    const estimateButton = screen.getByText('Estimate').closest('button');

    // Next step (annotate) is accessible, only 2+ steps ahead are disabled
    expect(annotateButton).not.toBeDisabled();
    expect(estimateButton).toBeDisabled();
  });

  it('should navigate when clicking completed step', () => {
    render(
      <BrowserRouter>
        <EstimateStepper
          {...defaultProps}
          currentStep="estimate"
          completedSteps={['scope', 'annotate']}
        />
      </BrowserRouter>
    );

    const scopeButton = screen.getByText('Scope').closest('button');
    fireEvent.click(scopeButton!);

    expect(mockNavigate).toHaveBeenCalledWith('/project/test-project-123/scope');
  });

  it('should navigate when clicking current step', () => {
    render(
      <BrowserRouter>
        <EstimateStepper {...defaultProps} currentStep="annotate" />
      </BrowserRouter>
    );

    const annotateButton = screen.getByText('Annotate').closest('button');
    fireEvent.click(annotateButton!);

    expect(mockNavigate).toHaveBeenCalledWith('/project/test-project-123/annotate');
  });

  it('should not navigate when clicking future step', () => {
    render(
      <BrowserRouter>
        <EstimateStepper {...defaultProps} currentStep="scope" />
      </BrowserRouter>
    );

    const estimateButton = screen.getByText('Estimate').closest('button');
    fireEvent.click(estimateButton!);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should treat previous steps as implicitly completed', () => {
    render(
      <BrowserRouter>
        <EstimateStepper
          {...defaultProps}
          currentStep="estimate"
          completedSteps={[]} // Empty, but scope and annotate should be clickable
        />
      </BrowserRouter>
    );

    const scopeButton = screen.getByText('Scope').closest('button');
    fireEvent.click(scopeButton!);

    expect(mockNavigate).toHaveBeenCalledWith('/project/test-project-123/scope');
  });
});
