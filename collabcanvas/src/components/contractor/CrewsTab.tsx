/**
 * Crews Tab Component
 *
 * Manage crew templates with:
 * - Add/Edit/Delete crew templates
 * - Configure workers by trade
 * - Set productivity factors
 * - Custom labor rates per crew
 */

import { useState } from 'react';
import { useContractorStore } from '../../store/contractorStore';
import { Button, Input } from '../ui';
import type {
  CrewTemplate,
  CrewMember,
  TradeType,
} from '../../types/contractor';
import { TRADE_LABELS } from '../../types/contractor';

interface CrewsTabProps {
  userId: string;
}

const ALL_TRADES: TradeType[] = [
  'electrician',
  'plumber',
  'carpenter',
  'hvac',
  'general_labor',
  'painter',
  'tile_setter',
  'roofer',
  'concrete_finisher',
  'drywall_installer',
];

export function CrewsTab({ userId }: CrewsTabProps) {
  const {
    crews,
    laborRates,
    savingCrew,
    savingLaborRate,
    addCrew,
    updateCrew,
    deleteCrew,
    saveLaborRate,
    deleteLaborRate,
  } = useContractorStore();

  const [isCreatingCrew, setIsCreatingCrew] = useState(false);
  const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
  const [showLaborRates, setShowLaborRates] = useState(false);

  // Form state for new/edit crew
  const [crewForm, setCrewForm] = useState<{
    name: string;
    description: string;
    members: CrewMember[];
    productivityFactor: number;
    isDefault: boolean;
  }>({
    name: '',
    description: '',
    members: [],
    productivityFactor: 1.0,
    isDefault: false,
  });

  // Labor rate form
  const [laborRateForm, setLaborRateForm] = useState<{
    trade: TradeType;
    baseRate: number;
    benefitsBurden: number;
    isUnion: boolean;
    notes: string;
  }>({
    trade: 'general_labor',
    baseRate: 35,
    benefitsBurden: 0.35,
    isUnion: false,
    notes: '',
  });

  const resetCrewForm = () => {
    setCrewForm({
      name: '',
      description: '',
      members: [],
      productivityFactor: 1.0,
      isDefault: false,
    });
    setIsCreatingCrew(false);
    setEditingCrewId(null);
  };

  const handleEditCrew = (crew: CrewTemplate) => {
    setCrewForm({
      name: crew.name,
      description: crew.description || '',
      members: [...crew.members],
      productivityFactor: crew.productivityFactor,
      isDefault: crew.isDefault || false,
    });
    setEditingCrewId(crew.id);
    setIsCreatingCrew(true);
  };

  const handleSaveCrew = async () => {
    if (!crewForm.name.trim()) return;

    try {
      if (editingCrewId) {
        await updateCrew(userId, editingCrewId, crewForm);
      } else {
        await addCrew(userId, crewForm);
      }
      resetCrewForm();
    } catch (err) {
      console.error('Failed to save crew:', err);
    }
  };

  const handleDeleteCrew = async (crewId: string) => {
    if (!confirm('Are you sure you want to delete this crew template?')) return;
    try {
      await deleteCrew(userId, crewId);
    } catch (err) {
      console.error('Failed to delete crew:', err);
    }
  };

  const handleAddMember = (trade: TradeType) => {
    const existing = crewForm.members.find((m) => m.trade === trade);
    if (existing) {
      setCrewForm({
        ...crewForm,
        members: crewForm.members.map((m) =>
          m.trade === trade ? { ...m, count: m.count + 1 } : m
        ),
      });
    } else {
      setCrewForm({
        ...crewForm,
        members: [...crewForm.members, { trade, count: 1 }],
      });
    }
  };

  const handleRemoveMember = (trade: TradeType) => {
    setCrewForm({
      ...crewForm,
      members: crewForm.members
        .map((m) => (m.trade === trade ? { ...m, count: m.count - 1 } : m))
        .filter((m) => m.count > 0),
    });
  };

  const handleSaveLaborRate = async () => {
    const totalRate = laborRateForm.baseRate * (1 + laborRateForm.benefitsBurden);
    try {
      await saveLaborRate(userId, {
        ...laborRateForm,
        totalRate,
      });
      setLaborRateForm({
        trade: 'general_labor',
        baseRate: 35,
        benefitsBurden: 0.35,
        isUnion: false,
        notes: '',
      });
    } catch (err) {
      console.error('Failed to save labor rate:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section: Crew Templates */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-heading text-h3 text-truecost-text-primary">Crew Templates</h2>
          {!isCreatingCrew && (
            <Button variant="primary" size="sm" onClick={() => setIsCreatingCrew(true)}>
              + Add Crew
            </Button>
          )}
        </div>

        {/* Crew Form */}
        {isCreatingCrew && (
          <div className="glass-panel p-6 mb-6">
            <h3 className="font-heading text-body font-medium text-truecost-text-primary mb-4">
              {editingCrewId ? 'Edit Crew Template' : 'New Crew Template'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input
                label="Crew Name *"
                value={crewForm.name}
                onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })}
                placeholder="e.g., Kitchen Remodel Crew"
              />
              <div className="space-y-2">
                <label className="block font-body text-body font-medium text-truecost-text-primary">
                  Productivity Factor
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="2.0"
                  value={crewForm.productivityFactor}
                  onChange={(e) =>
                    setCrewForm({ ...crewForm, productivityFactor: parseFloat(e.target.value) || 1.0 })
                  }
                  className="glass-input w-full"
                />
                <p className="text-body-meta text-truecost-text-muted">
                  1.0 = normal, 1.2 = 20% faster
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              <label className="block font-body text-body font-medium text-truecost-text-primary">
                Description
              </label>
              <textarea
                value={crewForm.description}
                onChange={(e) => setCrewForm({ ...crewForm, description: e.target.value })}
                placeholder="Describe this crew's typical work..."
                rows={2}
                className="glass-input w-full resize-none"
              />
            </div>

            {/* Crew Members */}
            <div className="mb-4">
              <label className="block font-body text-body font-medium text-truecost-text-primary mb-2">
                Crew Members
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {crewForm.members.map((member) => (
                  <div
                    key={member.trade}
                    className="flex items-center bg-truecost-cyan/20 text-truecost-cyan px-3 py-1.5 rounded-full"
                  >
                    <span className="font-body text-body-meta">
                      {member.count}x {TRADE_LABELS[member.trade]}
                    </span>
                    <button
                      onClick={() => handleRemoveMember(member.trade)}
                      className="ml-2 text-truecost-cyan hover:text-truecost-teal transition-colors"
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleAddMember(member.trade)}
                      className="ml-1 text-truecost-cyan hover:text-truecost-teal transition-colors"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_TRADES.filter((t) => !crewForm.members.some((m) => m.trade === t)).map(
                  (trade) => (
                    <button
                      key={trade}
                      onClick={() => handleAddMember(trade)}
                      className="font-body text-body-meta px-3 py-1.5 border border-truecost-glass-border rounded-full text-truecost-text-secondary hover:border-truecost-cyan hover:text-truecost-cyan transition-all duration-120"
                    >
                      + {TRADE_LABELS[trade]}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="isDefault"
                checked={crewForm.isDefault}
                onChange={(e) => setCrewForm({ ...crewForm, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-truecost-glass-border bg-truecost-glass-bg text-truecost-cyan focus:ring-truecost-cyan"
              />
              <label htmlFor="isDefault" className="ml-2 font-body text-body-meta text-truecost-text-secondary">
                Use as default crew for new projects
              </label>
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleSaveCrew}
                disabled={savingCrew || !crewForm.name.trim()}
                loading={savingCrew}
              >
                {editingCrewId ? 'Update Crew' : 'Save Crew'}
              </Button>
              <Button variant="secondary" onClick={resetCrewForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Crew List */}
        {crews.length === 0 && !isCreatingCrew ? (
          <div className="text-center py-12 glass-panel border-2 border-dashed border-truecost-glass-border">
            <p className="font-body text-body text-truecost-text-secondary mb-4">No crew templates yet</p>
            <button
              onClick={() => setIsCreatingCrew(true)}
              className="font-body text-body text-truecost-cyan hover:text-truecost-teal font-medium transition-colors"
            >
              Create your first crew template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {crews.map((crew) => (
              <div
                key={crew.id}
                className="glass-panel-hover p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-heading text-body font-medium text-truecost-text-primary">{crew.name}</h3>
                    {crew.isDefault && (
                      <span className="text-body-meta bg-truecost-teal/20 text-truecost-teal px-2 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCrew(crew)}
                      className="font-body text-body-meta text-truecost-text-muted hover:text-truecost-cyan transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCrew(crew.id)}
                      className="font-body text-body-meta text-truecost-text-muted hover:text-truecost-danger transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {crew.description && (
                  <p className="font-body text-body-meta text-truecost-text-secondary mb-3">{crew.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-2">
                  {crew.members.map((member) => (
                    <span
                      key={member.trade}
                      className="text-body-meta bg-truecost-glass-bg text-truecost-text-secondary px-2 py-1 rounded"
                    >
                      {member.count}x {TRADE_LABELS[member.trade]}
                    </span>
                  ))}
                </div>
                <p className="font-body text-body-meta text-truecost-text-muted">
                  Productivity: {crew.productivityFactor}x
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Custom Labor Rates */}
      <div className="border-t border-truecost-glass-border pt-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-heading text-h3 text-truecost-text-primary">Custom Labor Rates</h2>
            <p className="font-body text-body-meta text-truecost-text-secondary">
              Override regional labor rates with your actual costs
            </p>
          </div>
          <button
            onClick={() => setShowLaborRates(!showLaborRates)}
            className="font-body text-body text-truecost-cyan hover:text-truecost-teal font-medium transition-colors"
          >
            {showLaborRates ? 'Hide' : 'Show'} ({laborRates.length} configured)
          </button>
        </div>

        {showLaborRates && (
          <div className="glass-panel p-6">
            {/* Add new labor rate */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="space-y-2">
                <label className="block font-body text-body-meta font-medium text-truecost-text-primary">Trade</label>
                <select
                  value={laborRateForm.trade}
                  onChange={(e) =>
                    setLaborRateForm({ ...laborRateForm, trade: e.target.value as TradeType })
                  }
                  className="glass-input w-full"
                >
                  {ALL_TRADES.map((trade) => (
                    <option key={trade} value={trade}>
                      {TRADE_LABELS[trade]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block font-body text-body-meta font-medium text-truecost-text-primary">
                  Base Rate ($/hr)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={laborRateForm.baseRate}
                  onChange={(e) =>
                    setLaborRateForm({
                      ...laborRateForm,
                      baseRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="glass-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-body text-body-meta font-medium text-truecost-text-primary">
                  Burden (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={laborRateForm.benefitsBurden * 100}
                  onChange={(e) =>
                    setLaborRateForm({
                      ...laborRateForm,
                      benefitsBurden: (parseFloat(e.target.value) || 0) / 100,
                    })
                  }
                  className="glass-input w-full"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={laborRateForm.isUnion}
                    onChange={(e) =>
                      setLaborRateForm({ ...laborRateForm, isUnion: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-truecost-glass-border bg-truecost-glass-bg text-truecost-cyan focus:ring-truecost-cyan"
                  />
                  <span className="ml-2 font-body text-body-meta text-truecost-text-secondary">Union</span>
                </label>
              </div>
              <div className="flex items-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveLaborRate}
                  disabled={savingLaborRate}
                  loading={savingLaborRate}
                  fullWidth
                >
                  Save Rate
                </Button>
              </div>
            </div>

            {/* Existing labor rates */}
            {laborRates.length > 0 ? (
              <div className="space-y-2">
                {laborRates.map((rate) => (
                  <div
                    key={rate.trade}
                    className="flex items-center justify-between glass-panel p-3"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-heading text-body font-medium text-truecost-text-primary">
                        {TRADE_LABELS[rate.trade]}
                      </span>
                      <span className="font-body text-body-meta text-truecost-text-secondary">${rate.baseRate}/hr</span>
                      <span className="font-body text-body-meta text-truecost-text-muted">
                        + {(rate.benefitsBurden * 100).toFixed(0)}% burden
                      </span>
                      <span className="font-body text-body-meta text-truecost-teal font-medium">
                        = ${rate.totalRate.toFixed(2)}/hr
                      </span>
                      {rate.isUnion && (
                        <span className="text-body-meta bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                          Union
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteLaborRate(userId, rate.trade)}
                      className="font-body text-body-meta text-truecost-danger hover:text-truecost-danger/80 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center font-body text-body text-truecost-text-secondary py-4">
                No custom labor rates configured. Regional rates will be used.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
