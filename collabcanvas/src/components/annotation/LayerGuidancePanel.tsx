/**
 * LayerGuidancePanel - Shows users which layers were detected from their scope
 * All layers are optional - provides guidance on what to annotate
 */

import { useState } from 'react';
import type { LayerTemplate } from '../../services/layerTemplateService';

// ===================
// INLINE SVG ICONS
// ===================

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const InfoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LayersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

// ===================
// TYPES
// ===================

interface LayerCompletionItem {
  template: LayerTemplate;
  status: 'empty' | 'complete';
  count: number;
}

interface LayerGuidancePanelProps {
  templates: LayerTemplate[];
  completionStatus: LayerCompletionItem[];
  coverage: {
    total: number;
    annotated: number;
  };
  isLoading?: boolean;
  onLayerSelect?: (layerId: string) => void;
  activeLayerId?: string;
  className?: string;
}

// ===================
// COMPONENT
// ===================

export function LayerGuidancePanel({
  templates,
  completionStatus,
  coverage,
  isLoading = false,
  onLayerSelect,
  activeLayerId,
  className = '',
}: LayerGuidancePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showHelp, setShowHelp] = useState<string | null>(null);
  
  if (templates.length === 0 && !isLoading) {
    return (
      <div className={`bg-truecost-bg-secondary/80 backdrop-blur-sm border border-truecost-glass-border rounded-lg p-3 ${className}`}>
        <div className="flex items-center gap-2 text-truecost-text-muted">
          <SparklesIcon className="w-4 h-4" />
          <span className="text-sm">No specific elements detected in scope</span>
        </div>
        <p className="text-xs text-truecost-text-muted mt-1">
          Add details to your scope description to get suggested annotation layers.
        </p>
      </div>
    );
  }
  
  const progress = coverage.total > 0 ? Math.round((coverage.annotated / coverage.total) * 100) : 0;
  
  return (
    <div className={`bg-truecost-bg-secondary/80 backdrop-blur-sm border border-truecost-glass-border rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-truecost-glass-bg/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-truecost-primary" />
          <span className="text-sm font-medium text-truecost-text-primary">
            Detected Layers
          </span>
          {!isExpanded && (
            <span className="text-xs text-truecost-text-muted">
              ({coverage.annotated}/{coverage.total} annotated)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-truecost-text-muted">
            {coverage.annotated} of {coverage.total}
          </span>
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-truecost-text-muted" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-truecost-text-muted" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <>
          {/* Progress bar */}
          <div className="px-3 pb-2">
            <div className="h-1.5 bg-truecost-glass-bg rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 bg-truecost-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-truecost-text-muted mt-1">
              All layers are optional — annotate what you need
            </p>
          </div>
          
          {/* Loading state */}
          {isLoading && (
            <div className="px-3 pb-2">
              <p className="text-xs text-truecost-text-muted animate-pulse">
                Creating annotation layers...
              </p>
            </div>
          )}
          
          {/* Layer list */}
          <div className="max-h-64 overflow-y-auto px-1 pb-2">
            {completionStatus.map(({ template, status, count }) => (
              <div key={template.id} className="relative">
                <button
                  onClick={() => onLayerSelect?.(template.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left ${
                    activeLayerId === template.id
                      ? 'bg-truecost-primary/20 border border-truecost-primary/50'
                      : 'hover:bg-truecost-glass-bg/30'
                  }`}
                >
                  {/* Status icon */}
                  {status === 'complete' ? (
                    <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <CircleIcon className="w-4 h-4 text-truecost-text-muted flex-shrink-0" />
                  )}
                  
                  {/* Color indicator */}
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: template.color }}
                  />
                  
                  {/* Layer name */}
                  <span className={`text-sm flex-1 truncate ${
                    status === 'complete'
                      ? 'text-truecost-text-muted'
                      : 'text-truecost-text-primary'
                  }`}>
                    {template.name}
                  </span>
                  
                  {/* Count badge */}
                  {count > 0 && (
                    <span className="text-xs bg-truecost-glass-bg px-1.5 py-0.5 rounded text-truecost-text-muted">
                      {count}
                    </span>
                  )}
                  
                  {/* Help button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHelp(showHelp === template.id ? null : template.id);
                    }}
                    className="p-0.5 hover:bg-truecost-glass-bg rounded opacity-50 hover:opacity-100"
                  >
                    <InfoIcon className="w-3 h-3" />
                  </button>
                </button>
                
                {/* Help tooltip */}
                {showHelp === template.id && (
                  <div className="absolute left-full ml-2 top-0 z-50 w-64 p-3 bg-truecost-bg-secondary border border-truecost-glass-border rounded-lg shadow-xl">
                    <button
                      onClick={() => setShowHelp(null)}
                      className="absolute top-1 right-1 p-1 hover:bg-truecost-glass-bg rounded"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                    <h4 className="font-medium text-sm text-truecost-text-primary mb-1">
                      {template.name}
                    </h4>
                    <p className="text-xs text-truecost-text-muted mb-2">
                      {template.description}
                    </p>
                    <div className="text-xs space-y-1">
                      <p className="text-truecost-text-muted">
                        <span className="font-medium">Shape:</span>{' '}
                        {template.shapeType === 'polyline' && 'Draw line segments'}
                        {template.shapeType === 'polygon' && 'Draw closed area'}
                        {template.shapeType === 'rect' && 'Draw rectangle'}
                        {template.shapeType === 'any' && 'Any shape'}
                      </p>
                      <p className="text-truecost-text-muted">
                        <span className="font-medium">Examples:</span>{' '}
                        {template.examples.slice(0, 3).join(', ')}
                      </p>
                      {template.matchedKeywords && template.matchedKeywords.length > 0 && (
                        <p className="text-truecost-primary/80">
                          <span className="font-medium">Detected from:</span>{' '}
                          "{template.matchedKeywords.join('", "')}"
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Info footer */}
          <div className="px-3 py-2 border-t border-truecost-glass-border bg-truecost-glass-bg/20">
            <p className="text-xs text-truecost-text-muted flex items-center gap-1">
              <LayersIcon className="w-3 h-3" />
              Click a layer to select it, then annotate on the plan
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Compact version for toolbar
 */
export function LayerGuidanceCompact({
  annotatedCount,
  totalCount,
  onClick,
}: {
  annotatedCount: number;
  totalCount: number;
  onClick?: () => void;
}) {
  if (totalCount === 0) return null;
  
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors bg-truecost-primary/20 text-truecost-primary hover:bg-truecost-primary/30"
    >
      <SparklesIcon className="w-3.5 h-3.5" />
      <span>
        {annotatedCount}/{totalCount} layers
      </span>
    </button>
  );
}
