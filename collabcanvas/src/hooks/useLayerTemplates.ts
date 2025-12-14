/**
 * useLayerTemplates Hook
 * Pre-populates annotation layers based on scope text analysis
 * 
 * Only creates layers that match keywords in the user's scope description
 * All layers are optional - no mandatory requirements
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLayers } from './useLayers';
import {
  generateLayersForProject,
  getLayerCompletionStatus,
  type LayerTemplate,
} from '../services/layerTemplateService';
import type { EstimateConfig } from '../types/project';

interface LayerCompletionItem {
  template: LayerTemplate;
  status: 'empty' | 'complete';
  count: number;
}

interface UseLayerTemplatesResult {
  /** Generated layer templates based on scope text */
  templates: LayerTemplate[];
  
  /** Layer completion status for each template */
  completionStatus: LayerCompletionItem[];
  
  /** Total layers and how many are annotated */
  coverage: {
    total: number;
    annotated: number;
  };
  
  /** Create pre-populated layers from templates */
  createTemplatedLayers: () => Promise<void>;
  
  /** Whether layers have been initialized from templates */
  layersInitialized: boolean;
  
  /** Loading state */
  isLoading: boolean;
  
  /** Get guidance for a specific layer */
  getLayerGuidance: (layerId: string) => string | null;
}

/**
 * Hook for managing layer templates based on scope text
 */
export function useLayerTemplates(
  projectId: string | undefined,
  estimateConfig: EstimateConfig | undefined
): UseLayerTemplatesResult {
  const { layers, createLayer } = useLayers(projectId);
  const [templates, setTemplates] = useState<LayerTemplate[]>([]);
  const [layersInitialized, setLayersInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track if we've already attempted initialization to prevent loops
  const initAttemptedRef = useRef(false);
  const prevScopeRef = useRef<string | null>(null);
  
  // Generate templates when scope text changes
  useEffect(() => {
    if (!estimateConfig?.scopeText) {
      setTemplates([]);
      return;
    }
    
    const scopeText = estimateConfig.scopeText;
    
    // Only regenerate if scope actually changed
    if (scopeText === prevScopeRef.current) {
      return;
    }
    
    prevScopeRef.current = scopeText;
    
    console.log('[LayerTemplates] Analyzing scope text for layers...');
    const generated = generateLayersForProject('', scopeText);
    setTemplates(generated);
    
    // Reset initialization flag when scope changes
    if (generated.length > 0) {
      initAttemptedRef.current = false;
      setLayersInitialized(false);
    }
  }, [estimateConfig?.scopeText]);
  
  // Calculate layer shape counts for completion tracking
  const getLayerShapeCounts = useCallback((): Record<string, number> => {
    const counts: Record<string, number> = {};
    
    for (const layer of layers) {
      // Try to match layer to template by id or name
      const templateMatch = templates.find(t => 
        t.id === layer.id || 
        t.name.toLowerCase() === layer.name.toLowerCase() ||
        layer.name.toLowerCase().includes(t.id.toLowerCase())
      );
      
      if (templateMatch) {
        counts[templateMatch.id] = layer.shapes?.length || 0;
      }
    }
    
    return counts;
  }, [layers, templates]);
  
  // Compute completion status
  const completionStatus = getLayerCompletionStatus(templates, getLayerShapeCounts());
  
  // Compute coverage stats
  const annotatedCount = completionStatus.filter(s => s.count > 0).length;
  const coverage = {
    total: templates.length,
    annotated: annotatedCount,
  };
  
  /**
   * Create layers from templates
   * Only creates layers that don't already exist
   */
  const createTemplatedLayers = useCallback(async () => {
    if (!projectId || templates.length === 0 || initAttemptedRef.current) {
      return;
    }
    
    initAttemptedRef.current = true;
    setIsLoading(true);
    
    try {
      console.log('[LayerTemplates] Creating layers from scope analysis...');
      
      // Get existing layer names (lowercase for comparison)
      const existingNames = new Set(layers.map(l => l.name.toLowerCase()));
      const existingIds = new Set(layers.map(l => l.id));
      
      // Filter to only templates that don't exist yet
      const toCreate = templates.filter(template => 
        !existingIds.has(template.id) && 
        !existingNames.has(template.name.toLowerCase())
      );
      
      console.log(`[LayerTemplates] Creating ${toCreate.length} new layers (${templates.length - toCreate.length} already exist)`);
      
      // Create layers sequentially to maintain order
      for (const template of toCreate) {
        await createLayer(template.name, template.id);
        
        // Small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setLayersInitialized(true);
      console.log('[LayerTemplates] Layer initialization complete');
    } catch (error) {
      console.error('[LayerTemplates] Failed to create layers:', error);
      initAttemptedRef.current = false; // Allow retry on error
    } finally {
      setIsLoading(false);
    }
  }, [projectId, templates, layers, createLayer]);
  
  /**
   * Get guidance text for a layer
   */
  const getLayerGuidance = useCallback((layerId: string): string | null => {
    const template = templates.find(t => t.id === layerId);
    if (!template) return null;
    
    const shapeGuide: Record<string, string> = {
      polyline: 'Draw connected line segments along the feature',
      polygon: 'Draw a closed shape around the area',
      rect: 'Draw a rectangle over the item',
      any: 'Use any shape type that fits',
    };
    
    return [
      template.description,
      '',
      `📐 ${shapeGuide[template.shapeType]}`,
      `📝 Examples: ${template.examples.join(', ')}`,
      template.matchedKeywords.length > 0 
        ? `🔍 Detected from: "${template.matchedKeywords.join('", "')}"` 
        : '',
    ].filter(Boolean).join('\n');
  }, [templates]);
  
  return {
    templates,
    completionStatus,
    coverage,
    createTemplatedLayers,
    layersInitialized,
    isLoading,
    getLayerGuidance,
  };
}

/**
 * Helper function to get color for a layer based on template
 */
export function getTemplateColor(templates: LayerTemplate[], layerId: string): string | undefined {
  const template = templates.find(t => t.id === layerId);
  return template?.color;
}
