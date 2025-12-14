/**
 * Clarification Context Service
 * Manages structured clarification data extracted from annotation check and scope conversations.
 * This context is used by the estimation pipeline to make smarter calculations.
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from './firebase';

// Structured clarification data (mirrors the backend type)
export interface ExtractedClarifications {
  // Confirmed quantities (from user confirmation)
  confirmedQuantities?: {
    doors?: number;
    windows?: number;
    rooms?: number;
    walls?: number;
  };
  // Area relationships (e.g., "demolition area = floor area")
  areaRelationships?: {
    demolitionArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    ceilingArea?: 'same_as_floor' | 'same_as_room' | 'custom' | 'none';
    paintArea?: 'walls_only' | 'walls_and_ceiling' | 'custom';
  };
  // Exclusions (things user confirmed are NOT needed)
  exclusions?: {
    electrical?: boolean;
    plumbing?: boolean;
    hvac?: boolean;
    demolition?: boolean;
    ceiling?: boolean;
    trim?: boolean;
    [key: string]: boolean | undefined;
  };
  // Inclusions (things user confirmed ARE included)
  inclusions?: {
    windowTrim?: boolean;
    doorHardware?: boolean;
    baseTrim?: boolean;
    crownMolding?: boolean;
    [key: string]: boolean | undefined;
  };
  // Specific details provided
  details?: {
    ceilingType?: string;
    flooringType?: string;
    paintType?: string;
    doorStyle?: string;
    [key: string]: string | undefined;
  };
  // Raw clarification notes for LLM context
  notes?: string[];
}

export interface ClarificationContext {
  projectId: string;
  lastUpdated: Date;
  // Accumulated clarifications from all conversations
  clarifications: ExtractedClarifications;
  // Summary text for LLM context (will be appended to scope)
  summaryText: string;
}

/**
 * Merge new clarifications into existing ones (additive merge)
 */
export function mergeClarifications(
  existing: ExtractedClarifications,
  incoming: ExtractedClarifications
): ExtractedClarifications {
  return {
    confirmedQuantities: {
      ...existing.confirmedQuantities,
      ...incoming.confirmedQuantities,
    },
    areaRelationships: {
      ...existing.areaRelationships,
      ...incoming.areaRelationships,
    },
    exclusions: {
      ...existing.exclusions,
      ...incoming.exclusions,
    },
    inclusions: {
      ...existing.inclusions,
      ...incoming.inclusions,
    },
    details: {
      ...existing.details,
      ...incoming.details,
    },
    notes: [
      ...(existing.notes || []),
      ...(incoming.notes || []),
    ],
  };
}

/**
 * Generate a human-readable summary of clarifications for LLM context
 */
export function generateClarificationSummary(clarifications: ExtractedClarifications): string {
  const lines: string[] = [];

  // Confirmed quantities
  if (clarifications.confirmedQuantities) {
    const quantities = clarifications.confirmedQuantities;
    if (quantities.doors !== undefined) {
      lines.push(`- Confirmed door count: ${quantities.doors}`);
    }
    if (quantities.windows !== undefined) {
      lines.push(`- Confirmed window count: ${quantities.windows}`);
    }
    if (quantities.rooms !== undefined) {
      lines.push(`- Confirmed room count: ${quantities.rooms}`);
    }
  }

  // Area relationships
  if (clarifications.areaRelationships) {
    const areas = clarifications.areaRelationships;
    if (areas.demolitionArea) {
      const mapping: Record<string, string> = {
        'same_as_floor': 'same as floor area',
        'same_as_room': 'same as room area',
        'custom': 'custom area specified',
        'none': 'no demolition needed',
      };
      lines.push(`- Demolition area: ${mapping[areas.demolitionArea] || areas.demolitionArea}`);
    }
    if (areas.ceilingArea) {
      const mapping: Record<string, string> = {
        'same_as_floor': 'same as floor area',
        'same_as_room': 'same as room area',
        'custom': 'custom area specified',
        'none': 'no ceiling work needed',
      };
      lines.push(`- Ceiling area: ${mapping[areas.ceilingArea] || areas.ceilingArea}`);
    }
    if (areas.paintArea) {
      const mapping: Record<string, string> = {
        'walls_only': 'walls only',
        'walls_and_ceiling': 'walls and ceiling',
        'custom': 'custom areas specified',
      };
      lines.push(`- Paint area: ${mapping[areas.paintArea] || areas.paintArea}`);
    }
  }

  // Exclusions
  if (clarifications.exclusions) {
    const excluded = Object.entries(clarifications.exclusions)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
    if (excluded.length > 0) {
      lines.push(`- Excluded from scope: ${excluded.join(', ')}`);
    }
  }

  // Inclusions
  if (clarifications.inclusions) {
    const included = Object.entries(clarifications.inclusions)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
    if (included.length > 0) {
      lines.push(`- Confirmed inclusions: ${included.join(', ')}`);
    }
  }

  // Details
  if (clarifications.details) {
    const details = Object.entries(clarifications.details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${value}`);
    if (details.length > 0) {
      lines.push(`- Specific details: ${details.join('; ')}`);
    }
  }

  // Notes
  if (clarifications.notes && clarifications.notes.length > 0) {
    lines.push(`- Additional notes:`);
    clarifications.notes.forEach((note) => {
      lines.push(`  • ${note}`);
    });
  }

  if (lines.length === 0) {
    return '';
  }

  return `\n--- Annotation Clarifications ---\n${lines.join('\n')}`;
}

/**
 * Save clarification context to Firestore
 */
export async function saveClarificationContext(
  projectId: string,
  userId: string,
  clarifications: ExtractedClarifications
): Promise<void> {
  const docRef = doc(firestore, 'users', userId, 'projects', projectId, 'context', 'clarifications');
  
  try {
    const existingDoc = await getDoc(docRef);
    
    if (existingDoc.exists()) {
      // Merge with existing
      const existingData = existingDoc.data() as ClarificationContext;
      const merged = mergeClarifications(existingData.clarifications || {}, clarifications);
      const summaryText = generateClarificationSummary(merged);
      
      await updateDoc(docRef, {
        clarifications: merged,
        summaryText,
        lastUpdated: new Date(),
      });
    } else {
      // Create new
      const summaryText = generateClarificationSummary(clarifications);
      
      await setDoc(docRef, {
        projectId,
        clarifications,
        summaryText,
        lastUpdated: new Date(),
      });
    }
  } catch (error) {
    console.error('Error saving clarification context:', error);
    throw error;
  }
}

/**
 * Load clarification context from Firestore
 */
export async function loadClarificationContext(
  projectId: string,
  userId: string
): Promise<ClarificationContext | null> {
  const docRef = doc(firestore, 'users', userId, 'projects', projectId, 'context', 'clarifications');
  
  try {
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as ClarificationContext;
    }
    
    return null;
  } catch (error) {
    console.error('Error loading clarification context:', error);
    return null;
  }
}

/**
 * Get clarification summary text to append to scope
 */
export async function getClarificationSummaryText(
  projectId: string,
  userId: string
): Promise<string> {
  const context = await loadClarificationContext(projectId, userId);
  
  if (!context) {
    return '';
  }
  
  return context.summaryText || generateClarificationSummary(context.clarifications);
}

