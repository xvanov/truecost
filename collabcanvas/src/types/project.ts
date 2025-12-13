/**
 * Project types for CollabCanvas
 */

export type ProjectStatus = 
  | 'estimating' 
  | 'bid-ready' 
  | 'bid-lost' 
  | 'executing' 
  | 'completed-profitable' 
  | 'completed-unprofitable' 
  | 'completed-unknown';

export type CollaboratorRole = 'editor' | 'viewer';

export interface Collaborator {
  userId: string;
  role: CollaboratorRole;
}

// Estimate configuration stored with project
export interface EstimateConfig {
  // Project details from Define Your Project Scope page
  projectName?: string;
  location?: string; // Note: location and address are the same thing
  projectType?: string;
  approximateSize?: string;
  useUnionLabor?: boolean;
  zipCodeOverride?: string;
  
  // Scope definition (user-provided description)
  scopeText?: string;
  
  // Estimate configuration
  overheadPercent: number;
  profitPercent: number;
  contingencyPercent: number;
  wasteFactorPercent: number;
  startDate: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  ownerId: string;
  collaborators: Collaborator[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  profitLoss?: number; // Calculated when status is completed-profitable or completed-unprofitable
  actualCosts?: number; // Actual costs entered by user (for profit/loss calculation)
  estimateTotal?: number; // Estimated total from BOM (for profit/loss calculation)

  // Scope fields
  location?: string;
  projectType?: string;
  size?: string;
  zipCode?: string;
  useUnionLabor?: boolean;
  estimateConfig?: EstimateConfig;

  // Plan image (from file upload)
  planImageUrl?: string;
  planImageFileName?: string;
}

