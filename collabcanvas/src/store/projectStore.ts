/**
 * Zustand store for project state management
 * Manages project list and current project state
 */

import { create } from 'zustand';
import type { Project } from '../types/project';
import { getUserProjects, createProject, updateProjectStatus, deleteProject, shareProject, getProject, updateProjectScope, type ProjectScopeData } from '../services/projectService';

interface ProjectState {
  // Project list
  projects: Project[];
  loading: boolean;
  error: string | null;
  
  // Current project
  currentProject: Project | null;
  
  // Actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  removeProject: (projectId: string) => void;
  setCurrentProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Service methods
  loadUserProjects: (userId: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<Project | null>;
  createNewProject: (name: string, description: string, userId: string, scopeData?: Partial<ProjectScopeData>) => Promise<Project>;
  updateProjectScopeAction: (projectId: string, scopeData: Partial<ProjectScopeData>, userId: string) => Promise<void>;
  updateProjectStatusAction: (projectId: string, status: Project['status'], userId: string, actualCosts?: number, estimateTotal?: number) => Promise<void>;
  deleteProjectAction: (projectId: string, userId: string) => Promise<void>;
  shareProjectAction: (projectId: string, userId: string, role: 'editor' | 'viewer', currentUserId: string) => Promise<void>;
  
  // Real-time subscription
  unsubscribe: (() => void) | null;
  setUnsubscribe: (unsubscribe: (() => void) | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  // Initial state
  projects: [],
  loading: false,
  error: null,
  currentProject: null,
  unsubscribe: null,
  
  // Basic setters
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ 
    projects: [...state.projects, project] 
  })),
  updateProject: (projectId, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, ...updates } : p
    ),
    currentProject: state.currentProject?.id === projectId 
      ? { ...state.currentProject, ...updates }
      : state.currentProject
  })),
  removeProject: (projectId) => set((state) => ({
    projects: state.projects.filter(p => p.id !== projectId),
    currentProject: state.currentProject?.id === projectId ? null : state.currentProject
  })),
  setCurrentProject: (project) => set({ currentProject: project }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setUnsubscribe: (unsubscribe) => set({ unsubscribe }),
  
  // Service methods
  loadUserProjects: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const projects = await getUserProjects(userId);
      set({ projects, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load projects';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  loadProject: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const project = await getProject(projectId);
      if (project) {
        set({ currentProject: project, loading: false });
      } else {
        set({ loading: false });
      }
      return project;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load project';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  createNewProject: async (name: string, description: string, userId: string, scopeData?: Partial<ProjectScopeData>) => {
    set({ loading: true, error: null });
    try {
      const project = await createProject(name, description, userId, scopeData);
      set((state) => ({
        projects: [...state.projects, project],
        loading: false
      }));
      return project;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  updateProjectScopeAction: async (projectId: string, scopeData: Partial<ProjectScopeData>, userId: string) => {
    set({ loading: true, error: null });
    try {
      await updateProjectScope(projectId, scopeData, userId);
      set((state) => ({
        projects: state.projects.map(p =>
          p.id === projectId ? { ...p, ...scopeData, updatedAt: Date.now(), updatedBy: userId } : p
        ),
        currentProject: state.currentProject?.id === projectId
          ? { ...state.currentProject, ...scopeData, updatedAt: Date.now(), updatedBy: userId }
          : state.currentProject,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project scope';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },
  
  updateProjectStatusAction: async (projectId: string, status: Project['status'], userId: string, actualCosts?: number, estimateTotal?: number) => {
    set({ loading: true, error: null });
    try {
      await updateProjectStatus(projectId, status, userId, actualCosts, estimateTotal);
      set((state) => ({
        projects: state.projects.map(p => {
          if (p.id === projectId) {
            const updated: Project = { ...p, status, updatedAt: Date.now(), updatedBy: userId };
            if (actualCosts !== undefined) updated.actualCosts = actualCosts;
            if (estimateTotal !== undefined) updated.estimateTotal = estimateTotal;
            // Profit/loss will be calculated by the service
            return updated;
          }
          return p;
        }),
        currentProject: state.currentProject?.id === projectId
          ? { ...state.currentProject, status, updatedAt: Date.now(), updatedBy: userId }
          : state.currentProject,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project status';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },
  
  deleteProjectAction: async (projectId: string, userId: string) => {
    set({ loading: true, error: null });
    try {
      await deleteProject(projectId, userId);
      set((state) => ({
        projects: state.projects.filter(p => p.id !== projectId),
        currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },
  
  shareProjectAction: async (projectId: string, userId: string, role: 'editor' | 'viewer', currentUserId: string) => {
    set({ loading: true, error: null });
    try {
      await shareProject(projectId, userId, role, currentUserId);
      set((state) => ({
        projects: state.projects.map(p => {
          if (p.id === projectId) {
            const collaboratorExists = p.collaborators.some(c => c.userId === userId);
            if (collaboratorExists) {
              return {
                ...p,
                collaborators: p.collaborators.map(c => 
                  c.userId === userId ? { ...c, role } : c
                ),
                updatedAt: Date.now(),
                updatedBy: currentUserId
              };
            } else {
              return {
                ...p,
                collaborators: [...p.collaborators, { userId, role }],
                updatedAt: Date.now(),
                updatedBy: currentUserId
              };
            }
          }
          return p;
        }),
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share project';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },
}));

