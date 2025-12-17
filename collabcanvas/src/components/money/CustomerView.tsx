/**
 * Customer View Component
 * AC: #8 - Customer View Display
 * Shows material + labor totals + included margin (margin incorporated into labor)
 * Format: Professional client presentation
 */

import type { BillOfMaterials } from '../../types/material';
import { formatMargin } from '../../services/marginService';

interface CustomerViewProps {
  bom: BillOfMaterials;
}

export function CustomerView({ bom }: CustomerViewProps) {
  if (!bom.margin) {
    return (
      <div className="text-center py-8 text-truecost-text-muted">
        <p>Margin calculation not available. Please generate BOM with prices.</p>
      </div>
    );
  }

  const formatted = formatMargin(bom.margin);
  
  // In Customer View, margin is incorporated into labor
  // So we show: Materials + (Labor + Margin) = Total
  const laborWithMargin = bom.margin.laborCost + bom.margin.marginDollars;

  return (
    <div className="glass-panel p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-truecost-text-primary mb-2">Project Estimate</h2>
        {bom.projectName && (
          <p className="text-sm text-truecost-text-secondary">Project: {bom.projectName}</p>
        )}
        <p className="text-xs text-truecost-text-muted mt-1">
          Generated: {new Date(bom.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Materials Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-3">Materials</h3>
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

      {/* Labor Section (with margin incorporated) */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-truecost-text-primary mb-3">Labor</h3>
        <div className="bg-truecost-glass-bg rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-truecost-text-secondary">Labor & Installation</span>
            <span className="text-base font-semibold text-truecost-cyan">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(laborWithMargin)}
            </span>
          </div>
          {bom.margin.marginTimeSlack > 0 && (
            <p className="text-xs text-truecost-text-muted mt-2">
              Includes {bom.margin.marginTimeSlack.toFixed(1)} days buffer time
            </p>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="border-t-2 border-truecost-glass-border pt-4">
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold text-truecost-text-primary">Total Project Cost</span>
          <span className="text-2xl font-bold text-truecost-cyan">{formatted.total}</span>
        </div>
        <p className="text-xs text-truecost-text-muted mt-2">
          All prices include materials and professional installation
        </p>
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
