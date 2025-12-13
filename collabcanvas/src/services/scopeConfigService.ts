/**
 * Scope Config Service - Firestore persistence for project scope and estimate configuration
 * Stores the EstimateConfig data per project so it persists across page refreshes
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './firebase';
import type { EstimateConfig } from '../pages/project/ScopePage';

/**
 * Firestore document structure for scope config
 */
interface FirestoreScopeConfig extends EstimateConfig {
  updatedAt: ReturnType<typeof serverTimestamp>;
  updatedBy: string;
}

/**
 * Get the scope config document reference for a project
 */
function getScopeConfigDoc(projectId: string) {
  return doc(firestore, 'projects', projectId, 'config', 'scope');
}

/**
 * Save the estimate config for a project
 */
export async function saveScopeConfig(
  projectId: string,
  userId: string,
  config: EstimateConfig
): Promise<void> {
  const configDoc = getScopeConfigDoc(projectId);
  
  const firestoreConfig: FirestoreScopeConfig = {
    ...config,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
  
  await setDoc(configDoc, firestoreConfig, { merge: true });
}

/**
 * Load the estimate config for a project
 */
export async function loadScopeConfig(
  projectId: string
): Promise<EstimateConfig | null> {
  const configDoc = getScopeConfigDoc(projectId);
  
  const snapshot = await getDoc(configDoc);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const data = snapshot.data() as FirestoreScopeConfig;
  
  // Remove Firestore-specific fields and return EstimateConfig
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedAt, updatedBy, ...config } = data;
  
  return config as EstimateConfig;
}

/**
 * Subscribe to scope config changes for real-time updates
 */
export function subscribeToScopeConfig(
  projectId: string,
  onConfig: (config: EstimateConfig | null) => void
): Unsubscribe {
  const configDoc = getScopeConfigDoc(projectId);
  
  return onSnapshot(configDoc, (snapshot) => {
    if (!snapshot.exists()) {
      onConfig(null);
      return;
    }
    
    const data = snapshot.data() as FirestoreScopeConfig;
    
    // Remove Firestore-specific fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { updatedAt, updatedBy, ...config } = data;
    
    onConfig(config as EstimateConfig);
  });
}

