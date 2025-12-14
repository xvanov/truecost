/**
 * Unit tests for Dashboard component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from '../pages/Dashboard';
import { useAuth } from '../hooks/useAuth';
import { useProjectStore } from '../store/projectStore';
import { subscribeToUserProjects } from '../services/projectService';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../store/projectStore');
vi.mock('../services/projectService');

const mockUseAuth = vi.mocked(useAuth);
const mockUseProjectStore = vi.mocked(useProjectStore);
const mockSubscribeToUserProjects = vi.mocked(subscribeToUserProjects);

describe('Dashboard Component', () => {
  const mockUser = {
    uid: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    photoURL: null,
  };

  const mockProjects = [
    {
      id: 'project-1',
      name: 'Test Project 1',
      description: 'Test description',
      status: 'estimating' as const,
      ownerId: 'user-123',
      collaborators: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'user-123',
      updatedBy: 'user-123',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    const mockState = {
      projects: mockProjects,
      loading: false,
      error: null,
      currentProject: null,
      setProjects: vi.fn(),
      addProject: vi.fn(),
      updateProject: vi.fn(),
      removeProject: vi.fn(),
      setCurrentProject: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      loadUserProjects: vi.fn().mockResolvedValue(undefined),
      createNewProject: vi.fn().mockResolvedValue(mockProjects[0]),
      updateProjectStatusAction: vi.fn().mockResolvedValue(undefined),
      deleteProjectAction: vi.fn().mockResolvedValue(undefined),
      shareProjectAction: vi.fn().mockResolvedValue(undefined),
      unsubscribe: null,
      setUnsubscribe: vi.fn(),
    };

    mockUseProjectStore.mockImplementation((selector?: (state: typeof mockState) => unknown) => {
      if (selector) {
        return selector(mockState);
      }
      return mockState;
    });

    mockSubscribeToUserProjects.mockReturnValue(vi.fn());
  });

  it('should render dashboard with project list', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    expect(screen.getByText('Your Projects')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
  });

  it('should display projects when available', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    expect(screen.getByText('Test Project 1')).toBeInTheDocument();
  });

  it('should show empty state when no projects', () => {
    const emptyState = {
      projects: [],
      loading: false,
      error: null,
      currentProject: null,
      setProjects: vi.fn(),
      addProject: vi.fn(),
      updateProject: vi.fn(),
      removeProject: vi.fn(),
      setCurrentProject: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      loadUserProjects: vi.fn().mockResolvedValue(undefined),
      createNewProject: vi.fn().mockResolvedValue(mockProjects[0]),
      updateProjectStatusAction: vi.fn().mockResolvedValue(undefined),
      deleteProjectAction: vi.fn().mockResolvedValue(undefined),
      shareProjectAction: vi.fn().mockResolvedValue(undefined),
      unsubscribe: null,
      setUnsubscribe: vi.fn(),
    };

    mockUseProjectStore.mockImplementation((selector?: (state: typeof emptyState) => unknown) => {
      if (selector) {
        return selector(emptyState);
      }
      return emptyState;
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });

  it('should show loading state', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: true,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

