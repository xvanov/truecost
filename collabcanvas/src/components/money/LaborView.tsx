/**
 * Labor View Component
 * Story 6-2: Dedicated labor analysis view for Estimate Page Labor tab
 * Displays labor breakdown, hourly rates, and time allocations
 */

import type { BillOfMaterials } from '../../types/material';
import { formatMargin } from '../../services/marginService';

interface LaborViewProps {
  bom: BillOfMaterials;
}

/**
 * Default labor categories and rates
 * TODO: These should come from agent output in a real implementation
 */
const LABOR_CATEGORIES = [
  { id: 'general', name: 'General Labor', rate: 45, description: 'Basic construction tasks, material handling' },
  { id: 'carpentry', name: 'Skilled Carpentry', rate: 65, description: 'Framing, trim work, finish carpentry' },
  { id: 'electrical', name: 'Licensed Electrician', rate: 85, description: 'Electrical installation, wiring, fixtures' },
  { id: 'plumbing', name: 'Licensed Plumber', rate: 90, description: 'Plumbing installation, fixtures, connections' },
  { id: 'hvac', name: 'HVAC Technician', rate: 80, description: 'Heating, ventilation, AC installation' },
  { id: 'drywall', name: 'Drywall & Finishing', rate: 55, description: 'Drywall installation, taping, texturing' },
];

export function LaborView({ bom }: LaborViewProps) {
  const formatted = bom.margin ? formatMargin(bom.margin) : null;

  // Calculate labor allocation based on material cost ratio
  // This is a simplified model - real implementation would use agent outputs
  const totalLaborCost = bom.margin?.laborCost || 0;
  const laborHours = totalLaborCost > 0 ? totalLaborCost / 50 : 0; // Assume $50/hr average
  const laborDays = laborHours / 8;

  // Distribute hours across categories based on typical project ratios
  const categoryAllocations = [
    { category: LABOR_CATEGORIES[0], percentage: 0.20 },
    { category: LABOR_CATEGORIES[1], percentage: 0.25 },
    { category: LABOR_CATEGORIES[2], percentage: 0.15 },
    { category: LABOR_CATEGORIES[3], percentage: 0.12 },
    { category: LABOR_CATEGORIES[4], percentage: 0.10 },
    { category: LABOR_CATEGORIES[5], percentage: 0.18 },
  ].map(({ category, percentage }) => ({
    ...category,
    hours: laborHours * percentage,
    cost: laborHours * percentage * category.rate,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-6">
          <h3 className="text-sm font-medium text-truecost-text-secondary mb-2">Total Labor Cost</h3>
          <p className="text-3xl font-bold text-truecost-cyan">
            {formatted?.laborCost || '$0.00'}
          </p>
          <p className="text-sm text-truecost-text-muted mt-1">
            Based on estimated work hours
          </p>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-sm font-medium text-truecost-text-secondary mb-2">Estimated Hours</h3>
          <p className="text-3xl font-bold text-truecost-text-primary">
            {laborHours.toFixed(0)} hrs
          </p>
          <p className="text-sm text-truecost-text-muted mt-1">
            {laborDays.toFixed(1)} work days
          </p>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-sm font-medium text-truecost-text-secondary mb-2">Avg Hourly Rate</h3>
          <p className="text-3xl font-bold text-truecost-text-primary">
            ${laborHours > 0 ? (totalLaborCost / laborHours).toFixed(2) : '0.00'}
          </p>
          <p className="text-sm text-truecost-text-muted mt-1">
            Blended rate across trades
          </p>
        </div>
      </div>

      {/* Labor Breakdown Table */}
      <div className="glass-panel">
        <div className="p-6 border-b border-truecost-glass-border">
          <h2 className="text-xl font-bold text-truecost-text-primary">Labor Breakdown by Trade</h2>
          <p className="text-sm text-truecost-text-secondary mt-1">
            Estimated hours and costs by labor category
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-truecost-bg-secondary border-b border-truecost-glass-border">
                <th className="text-left py-3 px-4 font-semibold text-truecost-text-secondary">Trade</th>
                <th className="text-left py-3 px-4 font-semibold text-truecost-text-secondary">Description</th>
                <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">Hourly Rate</th>
                <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">Est. Hours</th>
                <th className="text-right py-3 px-4 font-semibold text-truecost-text-secondary">Cost</th>
              </tr>
            </thead>
            <tbody>
              {categoryAllocations.map((allocation, index) => (
                <tr
                  key={allocation.id}
                  className={`border-b border-truecost-glass-border hover:bg-truecost-glass-bg ${
                    index % 2 === 0 ? 'bg-truecost-bg-primary' : 'bg-truecost-bg-secondary/50'
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-truecost-text-primary">
                    {allocation.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-truecost-text-secondary">
                    {allocation.description}
                  </td>
                  <td className="py-3 px-4 text-right text-truecost-text-primary">
                    ${allocation.rate.toFixed(2)}/hr
                  </td>
                  <td className="py-3 px-4 text-right text-truecost-text-primary">
                    {allocation.hours.toFixed(1)} hrs
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-truecost-cyan">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(allocation.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-truecost-bg-secondary border-t-2 border-truecost-glass-border">
                <td colSpan={3} className="py-3 px-4 font-bold text-truecost-text-primary">
                  Total
                </td>
                <td className="py-3 px-4 text-right font-bold text-truecost-text-primary">
                  {laborHours.toFixed(1)} hrs
                </td>
                <td className="py-3 px-4 text-right font-bold text-truecost-cyan">
                  {formatted?.laborCost || '$0.00'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Buffer Time Card */}
      {bom.margin && bom.margin.marginTimeSlack > 0 && (
        <div className="bg-truecost-cyan/10 rounded-lg border border-truecost-cyan/30 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-truecost-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-truecost-cyan">Buffer Time Included</h3>
              <p className="text-truecost-text-secondary mt-1">
                {formatted?.marginTimeSlack || '0 days'} of slack time has been added to account for
                delays, weather, and unexpected issues.
              </p>
              <p className="text-sm text-truecost-text-muted mt-2">
                This buffer is included in the margin calculation to protect your profit on this
                project.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="glass-panel p-6">
        <h3 className="text-sm font-semibold text-truecost-text-primary mb-3">Labor Estimation Notes</h3>
        <ul className="text-sm text-truecost-text-secondary space-y-2">
          <li>• Labor hours are estimated based on project scope and material quantities</li>
          <li>• Actual hours may vary based on site conditions and crew efficiency</li>
          <li>• Rates are based on regional averages and may need adjustment for your area</li>
          <li>• Consider adding contingency for complex or first-time tasks</li>
        </ul>
      </div>
    </div>
  );
}
