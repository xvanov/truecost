/**
 * TypeScript types for Scope feature
 */

import type { FieldValue } from 'firebase/firestore';

export interface ScopeItem {
  scope: string;
  description: string;
}

export interface PlanImage {
  url: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  uploadedAt: number;
}

export interface Scope {
  items: ScopeItem[];
  scopeText?: string;  // Raw scope text input
  planImage?: PlanImage;  // Uploaded plan image
  uploadedAt: number;
  uploadedBy: string;
}

export interface ScopeDocument {
  items: ScopeItem[];
  scopeText?: string;
  planImage?: PlanImage;
  uploadedAt: FieldValue | number; // serverTimestamp or timestamp
  uploadedBy: string;
}

