/**
 * Contractor View Component
 * AC: #9 - Contractor View Display
 * Shows labor, materials costs, and margin separate (margin in dollars and time/slack)
 * Format: Detailed contractor use
 */

import type { BillOfMaterials } from '../../types/material';
import { formatMargin } from '../../services/marginService';

interface ContractorViewProps {
  bom: BillOfMaterials;
}

export function ContractorView({ bom }: ContractorViewProps) {
  if (!bom.margin) {
    return (
      <div className="text-center py-8 text-truecost-text-muted">
        <p>Margin calculation not available. Please generate BOM with prices.</p>
      </div>
    );
  }

  const formatted = formatMargin(bom.margin);

  return (
    <div className="glass-panel p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Project Estimate - Contractor View</h2>
        {bom.projectName && (
          <p className="text-sm text-truecost-text-secondary">Project: {bom.projectName}</p>
        )}
        <p className="text-xs text-truecost-text-muted mt-1">
          Generated: {new Date(bom.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Materials Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-3">Materials Breakdown</h3>
        <div className="space-y-2">
          {bom.totalMaterials.map((material, index) => {
            const hasPrice = typeof material.priceUSD === 'number' && material.priceUSD > 0 && material.priceUSD !== undefined;
            const lineTotal = hasPrice && material.priceUSD !== undefined ? material.quantity * material.priceUSD : 0;
            
            return (
              <div key={`${material.id || material.name}-${index}`} className="flex justify-between items-center py-2 border-b border-truecost-glass-border">
                <div className="flex-1">
                  <span className="text-sm font-medium text-truecost-text-primary">{material.name}</span>
                  <span className="text-xs text-truecost-text-muted ml-2">
                    {material.quantity.toFixed(0)} {material.unit}
                    {hasPrice && material.priceUSD !== undefined && (
                      <span className="ml-2">
                        @ {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(material.priceUSD)}
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-sm text-truecost-cyan">
                  {hasPrice
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(lineTotal)
                    : 'TBD'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t-2 border-truecost-glass-border">
          <span className="text-base font-semibold text-truecost-text-primary">Materials Subtotal</span>
          <span className="text-base font-semibold text-truecost-cyan">{formatted.materialCost}</span>
        </div>
      </div>

      {/* Labor Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-3">Labor</h3>
        <div className="bg-truecost-glass-bg rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-truecost-text-secondary">Labor Costs</span>
            <span className="text-base font-semibold text-truecost-cyan">{formatted.laborCost}</span>
          </div>
          {bom.margin.laborCost > 0 && (
            <p className="text-xs text-truecost-text-muted mt-2">
              Based on {(bom.margin.laborCost / 50 / 8).toFixed(1)} days @ $50/hour (8 hours/day)
            </p>
          )}
        </div>
      </div>

      {/* Margin Section (separate) */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-3">Margin & Profit</h3>
        <div className="bg-truecost-cyan/10 rounded-lg p-4 space-y-2 border border-truecost-cyan/30">
          <div className="flex justify-between items-center">
            <span className="text-sm text-truecost-text-secondary">Margin ({formatted.marginPercentage})</span>
            <span className="text-base font-semibold text-truecost-cyan">{formatted.marginDollars}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-truecost-text-secondary">Buffer Time (Slack)</span>
            <span className="text-base font-semibold text-truecost-cyan">{formatted.marginTimeSlack}</span>
          </div>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="border-t-2 border-truecost-glass-border pt-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-truecost-text-secondary">Subtotal (Materials + Labor)</span>
          <span className="text-sm font-semibold text-truecost-text-primary">{formatted.subtotal}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-truecost-text-secondary">Margin ({formatted.marginPercentage})</span>
          <span className="text-sm font-semibold text-truecost-cyan">{formatted.marginDollars}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-truecost-glass-border">
          <span className="text-xl font-bold text-truecost-text-primary">Total Project Cost</span>
          <span className="text-2xl font-bold text-truecost-cyan">{formatted.total}</span>
        </div>
      </div>

      {/* Notes */}
      {bom.notes && (
        <div className="mt-6 pt-6 border-t border-truecost-glass-border">
          <h4 className="text-sm font-semibold text-truecost-text-primary mb-2">Notes</h4>
          <p className="text-sm text-truecost-text-secondary whitespace-pre-wrap">{bom.notes}</p>
        </div>
      )}
    </div>
  );
}
