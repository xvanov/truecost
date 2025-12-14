/**
 * Hook to track step completion status for the estimate workflow.
 * Determines completion based on actual persisted data, not local state.
 *
 * Completion criteria:
 * - Scope: Project document exists
 * - Annotate: Background image exists in board state
 * - Estimate: BOM exists with materials
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../services/firebase';
import { getBOM } from '../services/bomService';
import type { FirestoreBoardState } from '../services/firestore';

export type StepId = 'scope' | 'annotate' | 'estimate';

export interface StepCompletionState {
  completedSteps: StepId[];
  isLoading: boolean;
  hasProject: boolean;
  hasBackgroundImage: boolean;
  hasEstimate: boolean;
}

/**
 * Hook to determine which steps are completed based on persisted data.
 *
 * @param projectId - The project ID to check
 * @returns StepCompletionState with completed steps and loading state
 */
export function useStepCompletion(projectId: string | undefined): StepCompletionState {
  const [state, setState] = useState<StepCompletionState>({
    completedSteps: [],
    isLoading: true,
    hasProject: false,
    hasBackgroundImage: false,
    hasEstimate: false,
  });

  useEffect(() => {
    if (!projectId) {
      setState({
        completedSteps: [],
        isLoading: false,
        hasProject: false,
        hasBackgroundImage: false,
        hasEstimate: false,
      });
      return;
    }

    let isMounted = true;

    const checkCompletion = async () => {
      try {
        // Check if project exists (scope step)
        const projectRef = doc(firestore, 'projects', projectId);
        const projectDoc = await getDoc(projectRef);
        const hasProject = projectDoc.exists();

        // Check if background image exists (annotate step)
        const boardRef = doc(firestore, 'projects', projectId, 'board', 'state');
        const boardDoc = await getDoc(boardRef);
        const boardData = boardDoc.exists() ? (boardDoc.data() as FirestoreBoardState) : null;
        const hasBackgroundImage = !!boardData?.backgroundImage;

        // Check if BOM exists (estimate step)
        const bom = await getBOM(projectId);
        const hasEstimate = !!bom && bom.totalMaterials.length > 0;

        if (!isMounted) return;

        // Determine completed steps
        const completedSteps: StepId[] = [];
        if (hasProject) {
          completedSteps.push('scope');
        }
        if (hasBackgroundImage) {
          completedSteps.push('annotate');
        }
        if (hasEstimate) {
          completedSteps.push('estimate');
        }

        setState({
          completedSteps,
          isLoading: false,
          hasProject,
          hasBackgroundImage,
          hasEstimate,
        });
      } catch (error) {
        console.error('[useStepCompletion] Error checking completion:', error);
        if (isMounted) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Initial check
    checkCompletion();

    // Subscribe to board state changes for real-time updates
    const boardRef = doc(firestore, 'projects', projectId, 'board', 'state');
    const unsubscribe = onSnapshot(
      boardRef,
      (snapshot) => {
        if (!isMounted) return;
        const boardData = snapshot.exists() ? (snapshot.data() as FirestoreBoardState) : null;
        const hasBackgroundImage = !!boardData?.backgroundImage;

        setState((prev) => {
          // Update hasBackgroundImage and recalculate completedSteps
          const completedSteps: StepId[] = [];
          if (prev.hasProject) {
            completedSteps.push('scope');
          }
          if (hasBackgroundImage) {
            completedSteps.push('annotate');
          }
          if (prev.hasEstimate) {
            completedSteps.push('estimate');
          }

          return {
            ...prev,
            hasBackgroundImage,
            completedSteps,
          };
        });
      },
      (error) => {
        console.warn('[useStepCompletion] Board subscription error:', error);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [projectId]);

  return state;
}
