/**
 * Project service for Firebase Firestore operations
 * Handles CRUD operations for projects
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { firestore } from './firebase';
import type { Project, ProjectStatus, CollaboratorRole, EstimateConfig, ProjectAddress } from '../types/project';
import { canEditProject, canDeleteProject, canShareProject } from '../utils/projectAccess';

const projectsCollection = collection(firestore, 'projects');

/**
 * Convert Firestore document to Project
 */
function firestoreDocToProject(docId: string, data: DocumentData): Project {
  return {
    id: docId,
    name: data.name || '',
    description: data.description || '',
    status: data.status || 'estimating',
    ownerId: data.ownerId || '',
    collaborators: data.collaborators || [],
    createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
    createdBy: data.createdBy || '',
    updatedBy: data.updatedBy || '',
    profitLoss: data.profitLoss,
    actualCosts: data.actualCosts,
    estimateTotal: data.estimateTotal,
    // Scope fields
    address: data.address,
    projectType: data.projectType,
    useUnionLabor: data.useUnionLabor,
    estimateConfig: data.estimateConfig,
    planImageUrl: data.planImageUrl,
    planImageFileName: data.planImageFileName,
  };
}

/**
 * Get all projects for a user (owned or collaborated)
 */
export async function getUserProjects(userId: string): Promise<Project[]> {
  try {
    // Query projects where user is owner
    const ownerQuery = query(
      projectsCollection,
      where('ownerId', '==', userId)
    );
    
    const ownerSnapshot = await getDocs(ownerQuery);
    const projects: Project[] = [];
    
    ownerSnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      projects.push(firestoreDocToProject(docSnapshot.id, data));
    });
    
    // Note: Firestore doesn't support querying by array contains for collaborators
    // We would need a Cloud Function or a different data structure to efficiently query collaborators
    // For now, we only return projects where user is owner
    // Collaborator projects will be loaded via real-time subscription which filters client-side
    
    return projects;
  } catch (error) {
    console.error('Error fetching user projects:', error);
    throw error;
  }
}

// Input for creating/updating project scope data
export interface ProjectScopeData {
  name: string;
  description: string;
  address?: ProjectAddress;
  projectType?: string;
  useUnionLabor?: boolean;
  estimateConfig?: EstimateConfig;
  planImageUrl?: string;
  planImageFileName?: string;
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const projectRef = doc(projectsCollection, projectId);
    const projectDoc = await getDoc(projectRef);

    if (!projectDoc.exists()) {
      return null;
    }

    return firestoreDocToProject(projectId, projectDoc.data());
  } catch (error) {
    console.error('Error fetching project:', error);
    throw error;
  }
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  description: string,
  userId: string,
  scopeData?: Partial<ProjectScopeData>
): Promise<Project> {
  try {
    const projectRef = doc(projectsCollection);
    const now = Date.now();

    const projectData: Record<string, unknown> = {
      name,
      description,
      status: 'estimating' as ProjectStatus,
      ownerId: userId,
      collaborators: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      updatedBy: userId,
    };

    // Add optional scope fields if provided
    if (scopeData) {
      if (scopeData.address) projectData.address = scopeData.address;
      if (scopeData.projectType) projectData.projectType = scopeData.projectType;
      if (scopeData.useUnionLabor !== undefined) projectData.useUnionLabor = scopeData.useUnionLabor;
      if (scopeData.estimateConfig) projectData.estimateConfig = scopeData.estimateConfig;
      if (scopeData.planImageUrl) projectData.planImageUrl = scopeData.planImageUrl;
      if (scopeData.planImageFileName) projectData.planImageFileName = scopeData.planImageFileName;
    }

    await setDoc(projectRef, projectData);

    return {
      id: projectRef.id,
      name,
      description,
      status: 'estimating',
      ownerId: userId,
      collaborators: [],
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      address: scopeData?.address,
      projectType: scopeData?.projectType,
      useUnionLabor: scopeData?.useUnionLabor,
      estimateConfig: scopeData?.estimateConfig,
      planImageUrl: scopeData?.planImageUrl,
      planImageFileName: scopeData?.planImageFileName,
    };
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Update project scope data
 */
export async function updateProjectScope(
  projectId: string,
  scopeData: Partial<ProjectScopeData>,
  userId: string
): Promise<void> {
  try {
    const projectRef = doc(projectsCollection, projectId);
    const projectDoc = await getDoc(projectRef);

    if (!projectDoc.exists()) {
      throw new Error('Project not found');
    }

    const projectData = projectDoc.data();
    const project: Project = firestoreDocToProject(projectId, projectData);

    // Check access control - only owners and editors can update
    if (!canEditProject(project, userId)) {
      throw new Error('PERMISSION_DENIED: You do not have permission to modify this project.');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    };

    // Add scope fields to update
    if (scopeData.name !== undefined) updateData.name = scopeData.name;
    if (scopeData.description !== undefined) updateData.description = scopeData.description;
    if (scopeData.address !== undefined) updateData.address = scopeData.address;
    if (scopeData.projectType !== undefined) updateData.projectType = scopeData.projectType;
    if (scopeData.useUnionLabor !== undefined) updateData.useUnionLabor = scopeData.useUnionLabor;
    if (scopeData.estimateConfig !== undefined) updateData.estimateConfig = scopeData.estimateConfig;
    if (scopeData.planImageUrl !== undefined) updateData.planImageUrl = scopeData.planImageUrl;
    if (scopeData.planImageFileName !== undefined) updateData.planImageFileName = scopeData.planImageFileName;

    await updateDoc(projectRef, updateData);
  } catch (error) {
    console.error('Error updating project scope:', error);
    throw error;
  }
}

/**
 * Calculate profit/loss from estimate and actual costs
 */
function calculateProfitLoss(estimateTotal: number | undefined, actualCosts: number | undefined): number | undefined {
  if (estimateTotal === undefined || actualCosts === undefined) {
    return undefined;
  }
  return actualCosts - estimateTotal;
}

/**
 * Update project status with profit/loss calculation and access control
 */
export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
  userId: string,
  actualCosts?: number,
  estimateTotal?: number
): Promise<void> {
  try {
    const projectRef = doc(projectsCollection, projectId);
    const projectDoc = await getDoc(projectRef);
    
    if (!projectDoc.exists()) {
      throw new Error('Project not found');
    }
    
    const projectData = projectDoc.data();
    const project: Project = firestoreDocToProject(projectId, projectData);
    
    // Check access control - only owners and editors can update status
    if (!canEditProject(project, userId)) {
      throw new Error('PERMISSION_DENIED: You do not have permission to modify this project. Only owners and editors can update project status.');
    }
    
    const currentActualCosts = actualCosts ?? projectData.actualCosts;
    const currentEstimateTotal = estimateTotal ?? projectData.estimateTotal;
    
    // Calculate profit/loss if status is completed-profitable or completed-unprofitable
    let profitLoss: number | undefined;
    let finalStatus = status;
    
    if (status === 'completed-profitable' || status === 'completed-unprofitable') {
      profitLoss = calculateProfitLoss(currentEstimateTotal, currentActualCosts);
      
      // If no actual costs provided, set status to completed-unknown
      if (currentActualCosts === undefined) {
        finalStatus = 'completed-unknown';
        profitLoss = undefined;
      } else if (currentEstimateTotal === undefined) {
        // If no estimate total, we can't calculate profit/loss, but keep the requested status
        profitLoss = undefined;
      } else {
        // Determine status based on profit/loss
        if (profitLoss !== undefined && profitLoss > 0) {
          finalStatus = 'completed-profitable';
        } else {
          finalStatus = 'completed-unprofitable';
        }
      }
    }
    
    const updateData: Record<string, unknown> = {
      status: finalStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    };
    
    if (actualCosts !== undefined) {
      updateData.actualCosts = actualCosts;
    }
    
    if (estimateTotal !== undefined) {
      updateData.estimateTotal = estimateTotal;
    }
    
    if (profitLoss !== undefined) {
      updateData.profitLoss = profitLoss;
    }
    
    await updateDoc(projectRef, updateData);
  } catch (error) {
    console.error('Error updating project status:', error);
    throw error;
  }
}

/**
 * Delete a project and all its subcollections with access control
 */
export async function deleteProject(
  projectId: string,
  userId: string
): Promise<void> {
  try {
    const projectRef = doc(projectsCollection, projectId);
    const projectDoc = await getDoc(projectRef);
    
    if (!projectDoc.exists()) {
      throw new Error('Project not found');
    }
    
    const projectData = projectDoc.data();
    const project: Project = firestoreDocToProject(projectId, projectData);
    
    // Check access control - only owners can delete
    if (!canDeleteProject(project, userId)) {
      throw new Error('PERMISSION_DENIED: You do not have permission to delete this project. Only project owners can delete projects.');
    }
    
    // TODO: Delete all subcollections (boards, BOMs, etc.)
    // For now, just delete the project document
    // In a production app, you'd use a Cloud Function to recursively delete subcollections
    
    await deleteDoc(projectRef);
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

/**
 * Share a project with another user with access control
 */
export async function shareProject(
  projectId: string,
  userId: string,
  role: CollaboratorRole,
  currentUserId: string
): Promise<void> {
  try {
    const projectRef = doc(projectsCollection, projectId);
    const projectDoc = await getDoc(projectRef);
    
    if (!projectDoc.exists()) {
      throw new Error('Project not found');
    }
    
    const projectData = projectDoc.data();
    const project: Project = firestoreDocToProject(projectId, projectData);
    
    // Check access control - only owners can share
    if (!canShareProject(project, currentUserId)) {
      throw new Error('PERMISSION_DENIED: You do not have permission to share this project. Only project owners can share projects.');
    }
    
    const collaborators = projectData.collaborators || [];
    
    // Check if user is already a collaborator
    const existingIndex = collaborators.findIndex(
      (c: { userId: string }) => c.userId === userId
    );
    
    if (existingIndex >= 0) {
      // Update existing collaborator role
      collaborators[existingIndex] = { userId, role };
    } else {
      // Add new collaborator
      collaborators.push({ userId, role });
    }
    
    await updateDoc(projectRef, {
      collaborators,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserId,
    });
  } catch (error) {
    console.error('Error sharing project:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time updates for user's projects
 */
export function subscribeToUserProjects(
  userId: string,
  callback: (projects: Project[]) => void
): Unsubscribe {
  // Query projects where user is owner
  // Note: We can't easily query by collaborator array, so we subscribe to owned projects
  // Collaborator projects would need a different approach (e.g., Cloud Function or separate collection)
  const q = query(
    projectsCollection,
    where('ownerId', '==', userId)
  );
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const projects: Project[] = [];
      
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        projects.push(firestoreDocToProject(docSnapshot.id, data));
      });
      
      callback(projects);
    },
    (error) => {
      console.error('Error in project subscription:', error);
    }
  );
  
  return unsubscribe;
}

