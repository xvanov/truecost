/**
 * Estimation service for TrueCost
 * Handles estimation session management, clarification chat, and analysis
 */

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  type Unsubscribe,
  type FieldValue,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from './firebase';
import type {
  EstimationSession,
  EstimationStatus,
  ClarificationMessage,
  AnnotationSnapshot,
  ClarificationOutput,
} from '../types/estimation';
import type { PlanImage } from '../types/scope';

// ===================
// TYPES
// ===================

interface EstimationSessionDocument extends Omit<EstimationSession, 'createdAt' | 'updatedAt' | 'lastAnalysisAt'> {
  createdAt: FieldValue | number;
  updatedAt: FieldValue | number;
  lastAnalysisAt?: FieldValue | number;
}

// ===================
// HELPERS
// ===================

function firestoreDocToSession(id: string, data: EstimationSessionDocument): EstimationSession {
  const toNumber = (val: FieldValue | number | undefined | null): number | undefined => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && val !== null && 'toMillis' in val) {
      return (val as { toMillis: () => number }).toMillis();
    }
    return Date.now();
  };

  return {
    id,
    projectId: data.projectId,
    status: data.status,
    scopeText: data.scopeText,
    planImageUrl: data.planImageUrl,
    planImageFileName: data.planImageFileName,
    clarificationMessages: data.clarificationMessages || [],
    clarificationComplete: data.clarificationComplete || false,
    annotationSnapshot: data.annotationSnapshot,
    clarificationOutput: data.clarificationOutput,
    analysisPassCount: data.analysisPassCount || 0,
    lastAnalysisAt: toNumber(data.lastAnalysisAt),
    createdAt: toNumber(data.createdAt) || Date.now(),
    updatedAt: toNumber(data.updatedAt) || Date.now(),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

// ===================
// PLAN IMAGE UPLOAD
// ===================

/**
 * Upload a plan image for estimation
 */
export async function uploadPlanImage(
  projectId: string,
  file: File,
  _userId: string
): Promise<PlanImage> {
  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload a PNG, JPG, or WebP image.');
  }

  const timestamp = Date.now();
  const fileName = `plan-${timestamp}-${file.name}`;
  const storagePath = `projects/${projectId}/plans/${fileName}`;
  
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(snapshot.ref);

  // Get image dimensions
  const dimensions = await getImageDimensions(file);

  return {
    url,
    fileName: file.name,
    fileSize: file.size,
    width: dimensions.width,
    height: dimensions.height,
    uploadedAt: timestamp,
  };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

// ===================
// ESTIMATION SESSION
// ===================

/**
 * Create a new estimation session
 */
export async function createEstimationSession(
  projectId: string,
  scopeText: string,
  planImage: PlanImage,
  userId: string
): Promise<EstimationSession> {
  const sessionId = `est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  const sessionData: EstimationSessionDocument = {
    id: sessionId,
    projectId,
    status: 'draft',
    scopeText,
    planImageUrl: planImage.url,
    planImageFileName: planImage.fileName,
    clarificationMessages: [],
    clarificationComplete: false,
    analysisPassCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  await setDoc(sessionRef, sessionData);

  return {
    ...sessionData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as EstimationSession;
}

/**
 * Get an estimation session by ID
 */
export async function getEstimationSession(
  projectId: string,
  sessionId: string
): Promise<EstimationSession | null> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);
  const sessionDoc = await getDoc(sessionRef);

  if (!sessionDoc.exists()) {
    return null;
  }

  return firestoreDocToSession(sessionId, sessionDoc.data() as EstimationSessionDocument);
}

/**
 * Get the latest estimation session for a project
 */
export async function getLatestEstimationSession(
  projectId: string
): Promise<EstimationSession | null> {
  const sessionsRef = collection(firestore, 'projects', projectId, 'estimations');
  const q = query(sessionsRef, where('status', '!=', 'error'));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  // Find the most recent session
  let latestSession: EstimationSession | null = null;
  let latestTime = 0;

  snapshot.forEach((docSnap) => {
    const session = firestoreDocToSession(docSnap.id, docSnap.data() as EstimationSessionDocument);
    if (session.createdAt > latestTime) {
      latestTime = session.createdAt;
      latestSession = session;
    }
  });

  return latestSession;
}

/**
 * Update estimation session status
 */
export async function updateEstimationStatus(
  projectId: string,
  sessionId: string,
  status: EstimationStatus,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);
  
  await updateDoc(sessionRef, {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Add a clarification message
 */
export async function addClarificationMessage(
  projectId: string,
  sessionId: string,
  message: Omit<ClarificationMessage, 'id' | 'timestamp'>,
  userId: string
): Promise<ClarificationMessage> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);
  const session = await getEstimationSession(projectId, sessionId);

  if (!session) {
    throw new Error('Estimation session not found');
  }

  const newMessage: ClarificationMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ...message,
    timestamp: Date.now(),
  };

  const messages = [...session.clarificationMessages, newMessage];

  await updateDoc(sessionRef, {
    clarificationMessages: messages,
    status: 'clarifying',
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  return newMessage;
}

/**
 * Mark clarification as complete
 */
export async function completeClarification(
  projectId: string,
  sessionId: string,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    clarificationComplete: true,
    status: 'annotating',
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Save annotation snapshot from Space tab
 */
export async function saveAnnotationSnapshot(
  projectId: string,
  sessionId: string,
  snapshot: AnnotationSnapshot,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    annotationSnapshot: snapshot,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Save the generated ClarificationOutput
 */
export async function saveClarificationOutput(
  projectId: string,
  sessionId: string,
  output: ClarificationOutput,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    clarificationOutput: output,
    status: 'complete',
    lastAnalysisAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Increment analysis pass count
 */
export async function incrementAnalysisPass(
  projectId: string,
  sessionId: string,
  userId: string
): Promise<number> {
  const session = await getEstimationSession(projectId, sessionId);
  if (!session) {
    throw new Error('Estimation session not found');
  }

  const newCount = session.analysisPassCount + 1;
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    analysisPassCount: newCount,
    lastAnalysisAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  return newCount;
}

/**
 * Subscribe to estimation session updates
 */
export function subscribeToEstimationSession(
  projectId: string,
  sessionId: string,
  callback: (session: EstimationSession | null) => void
): Unsubscribe {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  return onSnapshot(
    sessionRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(firestoreDocToSession(sessionId, snapshot.data() as EstimationSessionDocument));
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Error in estimation session subscription:', error);
      callback(null);
    }
  );
}

// ===================
// ANALYSIS TRIGGER
// ===================

/**
 * Start the estimation analysis
 * This triggers the Cloud Function to analyze the plan
 */
export async function startEstimationAnalysis(
  projectId: string,
  sessionId: string,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    status: 'analyzing',
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  // The Cloud Function will be triggered via callable function
  // See estimationPipeline Cloud Function
}

/**
 * Mark the estimation analysis as failed
 * Called when the Cloud Function throws an error
 */
export async function markEstimationFailed(
  projectId: string,
  sessionId: string,
  errorMessage: string,
  userId: string
): Promise<void> {
  const sessionRef = doc(firestore, 'projects', projectId, 'estimations', sessionId);

  await updateDoc(sessionRef, {
    status: 'error',
    errorMessage,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

