/**
 * Estimation Store
 * Zustand store for managing estimation session state
 */

import { create } from 'zustand';
import type { Unsubscribe } from 'firebase/firestore';
import type {
  EstimationSession,
  ClarificationMessage,
  AnnotationSnapshot,
} from '../types/estimation';
import type { PlanImage } from '../types/scope';
import {
  createEstimationSession,
  getLatestEstimationSession,
  subscribeToEstimationSession,
  addClarificationMessage,
  completeClarification,
  saveAnnotationSnapshot,
  updateEstimationStatus,
} from '../services/estimationService';

interface EstimationState {
  // Current session
  session: EstimationSession | null;
  loading: boolean;
  error: string | null;
  
  // Subscription management
  unsubscribe: Unsubscribe | null;
  
  // Actions
  loadSession: (projectId: string) => Promise<void>;
  createSession: (projectId: string, scopeText: string, planImage: PlanImage, userId: string) => Promise<EstimationSession>;
  subscribe: (projectId: string, sessionId: string) => void;
  
  // Clarification actions
  addMessage: (projectId: string, sessionId: string, message: Omit<ClarificationMessage, 'id' | 'timestamp'>, userId: string) => Promise<ClarificationMessage>;
  markClarificationComplete: (projectId: string, sessionId: string, userId: string) => Promise<void>;
  
  // Annotation actions
  saveAnnotations: (projectId: string, sessionId: string, snapshot: AnnotationSnapshot, userId: string) => Promise<void>;
  
  // Status actions
  setStatus: (projectId: string, sessionId: string, status: EstimationSession['status'], userId: string) => Promise<void>;
  
  // Cleanup
  cleanup: () => void;
}

export const useEstimationStore = create<EstimationState>((set, get) => ({
  session: null,
  loading: false,
  error: null,
  unsubscribe: null,

  loadSession: async (projectId: string) => {
    set({ loading: true, error: null });
    
    try {
      const session = await getLatestEstimationSession(projectId);
      set({ session, loading: false });
      
      // Subscribe if session exists
      if (session) {
        get().subscribe(projectId, session.id);
      }
    } catch (err) {
      console.error('Failed to load estimation session:', err);
      set({ 
        error: err instanceof Error ? err.message : 'Failed to load session',
        loading: false,
      });
    }
  },

  createSession: async (projectId: string, scopeText: string, planImage: PlanImage, userId: string) => {
    set({ loading: true, error: null });
    
    try {
      const session = await createEstimationSession(projectId, scopeText, planImage, userId);
      set({ session, loading: false });
      
      // Subscribe to updates
      get().subscribe(projectId, session.id);
      
      return session;
    } catch (err) {
      console.error('Failed to create estimation session:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to create session',
        loading: false,
      });
      throw err;
    }
  },

  subscribe: (projectId: string, sessionId: string) => {
    // Cleanup existing subscription
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
    }
    
    const newUnsubscribe = subscribeToEstimationSession(projectId, sessionId, (session) => {
      set({ session });
    });
    
    set({ unsubscribe: newUnsubscribe });
  },

  addMessage: async (projectId: string, sessionId: string, message: Omit<ClarificationMessage, 'id' | 'timestamp'>, userId: string) => {
    try {
      const newMessage = await addClarificationMessage(projectId, sessionId, message, userId);
      return newMessage;
    } catch (err) {
      console.error('Failed to add message:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to add message' });
      throw err;
    }
  },

  markClarificationComplete: async (projectId: string, sessionId: string, userId: string) => {
    try {
      await completeClarification(projectId, sessionId, userId);
    } catch (err) {
      console.error('Failed to complete clarification:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to complete clarification' });
      throw err;
    }
  },

  saveAnnotations: async (projectId: string, sessionId: string, snapshot: AnnotationSnapshot, userId: string) => {
    try {
      await saveAnnotationSnapshot(projectId, sessionId, snapshot, userId);
    } catch (err) {
      console.error('Failed to save annotations:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to save annotations' });
      throw err;
    }
  },

  setStatus: async (projectId: string, sessionId: string, status: EstimationSession['status'], userId: string) => {
    try {
      await updateEstimationStatus(projectId, sessionId, status, userId);
    } catch (err) {
      console.error('Failed to update status:', err);
      set({ error: err instanceof Error ? err.message : 'Failed to update status' });
      throw err;
    }
  },

  cleanup: () => {
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
    }
    set({ session: null, unsubscribe: null, error: null });
  },
}));

