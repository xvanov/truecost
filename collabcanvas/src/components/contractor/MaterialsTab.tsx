/**
 * Materials Tab Component
 *
 * Manage custom material catalog with:
 * - Add/Edit/Delete materials
 * - Pre-negotiated pricing
 * - Supplier associations
 * - Lead time tracking
 */

import { useState } from 'react';
import { useContractorStore } from '../../store/contractorStore';
import { Button, Input } from '../ui';
import type {
  ContractorMaterial,
  MaterialCatalogCategory,
  MaterialUnitType,
} from '../../types/contractor';
import { MATERIAL_CATEGORY_LABELS } from '../../types/contractor';

interface MaterialsTabProps {
  userId: string;
}

const ALL_CATEGORIES: MaterialCatalogCategory[] = [
  'lumber',
  'drywall',
  'flooring',
  'tile',
  'plumbing',
  'electrical',
  'hvac',
  'paint',
  'hardware',
  'appliances',
  'cabinets',
  'countertops',
  'insulation',
  'roofing',
  'windows_doors',
  'other',
];

const UNIT_LABELS: Record<MaterialUnitType, string> = {
  each: 'Each',
  sqft: 'Sq Ft',
  lf: 'Linear Ft',
  bf: 'Board Ft',
  gallon: 'Gallon',
  bag: 'Bag',
  box: 'Box',
  roll: 'Roll',
  bundle: 'Bundle',
  sheet: 'Sheet',
  ton: 'Ton',
  yard: 'Cubic Yard',
};

const ALL_UNITS: MaterialUnitType[] = Object.keys(UNIT_LABELS) as MaterialUnitType[];

export function MaterialsTab({ userId }: MaterialsTabProps) {
  const {
    materials,
    suppliers,
    savingMaterial,
    addMaterial,
    updateMaterial,
    deleteMaterial,
  } = useContractorStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<MaterialCatalogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [form, setForm] = useState<{
    name: string;
    description: string;
    category: MaterialCatalogCategory;
    unitCost: number;
    unit: MaterialUnitType;
    supplierId: string;
    supplierSku: string;
    leadTimeDays: number;
    notes: string;
    tags: string[];
  }>({
    name: '',
    description: '',
    category: 'other',
    unitCost: 0,
    unit: 'each',
    supplierId: '',
    supplierSku: '',
    leadTimeDays: 0,
    notes: '',
    tags: [],
  });

  const [tagInput, setTagInput] = useState('');

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      category: 'other',
      unitCost: 0,
      unit: 'each',
      supplierId: '',
      supplierSku: '',
      leadTimeDays: 0,
      notes: '',
      tags: [],
    });
    setTagInput('');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleEdit = (material: ContractorMaterial) => {
    setForm({
      name: material.name,
      description: material.description || '',
      category: material.category,
      unitCost: material.unitCost,
      unit: material.unit,
      supplierId: material.supplierId || '',
      supplierSku: material.supplierSku || '',
      leadTimeDays: material.leadTimeDays || 0,
      notes: material.notes || '',
      tags: material.tags || [],
    });
    setEditingId(material.id);
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.unitCost <= 0) return;

    try {
      const materialData = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        unitCost: form.unitCost,
        unit: form.unit,
        supplierId: form.supplierId || undefined,
        supplierSku: form.supplierSku || undefined,
        leadTimeDays: form.leadTimeDays || undefined,
        notes: form.notes.trim() || undefined,
        tags: form.tags.length > 0 ? form.tags : undefined,
      };

      if (editingId) {
        await updateMaterial(userId, editingId, materialData);
      } else {
        await addMaterial(userId, materialData);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save material:', err);
    }
  };

  const handleDelete = async (materialId: string) => {
    if (!confirm('Are you sure you want to delete this material?')) return;
    try {
      await deleteMaterial(userId, materialId);
    } catch (err) {
      console.error('Failed to delete material:', err);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
  };

  // Filter materials
  const filteredMaterials = materials.filter((m) => {
    const matchesCategory = filterCategory === 'all' || m.category === filterCategory;
    const matchesSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Group materials by category for display
  const groupedMaterials = filteredMaterials.reduce(
    (acc, material) => {
      const cat = material.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(material);
      return acc;
    },
    {} as Record<MaterialCatalogCategory, ContractorMaterial[]>
  );

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null;
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 flex-1">
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as MaterialCatalogCategory | 'all')}
            className="glass-input"
          >
            <option value="all">All Categories</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {MATERIAL_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
        {!isCreating && (
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            + Add Material
          </Button>
        )}
      </div>

      {/* Material Form */}
      {isCreating && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-body font-medium text-truecost-text-primary mb-4">
            {editingId ? 'Edit Material' : 'Add New Material'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Input
              label="Material Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., 2x4 SPF Lumber"
            />
            <div className="space-y-2">
              <label className="block font-body text-body font-medium text-truecost-text-primary">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as MaterialCatalogCategory })
                }
                className="glass-input w-full"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {MATERIAL_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="block font-body text-body font-medium text-truecost-text-primary">
                  Unit Cost *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-truecost-text-muted">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.unitCost}
                    onChange={(e) =>
                      setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })
                    }
                    className="glass-input w-full pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block font-body text-body font-medium text-truecost-text-primary">Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) =>
                    setForm({ ...form, unit: e.target.value as MaterialUnitType })
                  }
                  className="glass-input w-full"
                >
                  {ALL_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <label className="block font-body text-body font-medium text-truecost-text-primary">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Additional details about this material..."
              rows={2}
              className="glass-input w-full resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <label className="block font-body text-body font-medium text-truecost-text-primary">
                Supplier
              </label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="glass-input w-full"
              >
                <option value="">No supplier selected</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Supplier SKU"
              value={form.supplierSku}
              onChange={(e) => setForm({ ...form, supplierSku: e.target.value })}
              placeholder="e.g., LUM-2X4-8FT"
            />
            <div className="space-y-2">
              <label className="block font-body text-body font-medium text-truecost-text-primary">
                Lead Time (days)
              </label>
              <input
                type="number"
                min="0"
                value={form.leadTimeDays}
                onChange={(e) =>
                  setForm({ ...form, leadTimeDays: parseInt(e.target.value) || 0 })
                }
                className="glass-input w-full"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block font-body text-body font-medium text-truecost-text-primary mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center bg-truecost-cyan/20 text-truecost-cyan px-2 py-1 rounded text-body-meta"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 text-truecost-cyan hover:text-truecost-teal"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add a tag..."
                className="glass-input flex-1"
              />
              <Button variant="secondary" size="sm" onClick={handleAddTag}>
                Add
              </Button>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <label className="block font-body text-body font-medium text-truecost-text-primary">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes..."
              rows={2}
              className="glass-input w-full resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={savingMaterial || !form.name.trim() || form.unitCost <= 0}
              loading={savingMaterial}
            >
              {editingId ? 'Update Material' : 'Save Material'}
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Materials List */}
      {filteredMaterials.length === 0 && !isCreating ? (
        <div className="text-center py-12 glass-panel border-2 border-dashed border-truecost-glass-border">
          <p className="font-body text-body text-truecost-text-secondary mb-4">
            {searchQuery || filterCategory !== 'all'
              ? 'No materials match your search'
              : 'No materials in your catalog yet'}
          </p>
          {!searchQuery && filterCategory === 'all' && (
            <button
              onClick={() => setIsCreating(true)}
              className="font-body text-body text-truecost-cyan hover:text-truecost-teal font-medium transition-colors"
            >
              Add your first material
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMaterials).map(([category, categoryMaterials]) => (
            <div key={category}>
              <h3 className="font-heading text-body font-medium text-truecost-text-primary mb-3">
                {MATERIAL_CATEGORY_LABELS[category as MaterialCatalogCategory]}
                <span className="font-body text-body-meta text-truecost-text-muted ml-2">
                  ({categoryMaterials.length})
                </span>
              </h3>
              <div className="glass-panel overflow-hidden">
                <table className="min-w-full">
                  <thead className="border-b border-truecost-glass-border">
                    <tr>
                      <th className="px-4 py-3 text-left font-heading text-body-meta font-medium text-truecost-text-secondary uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-4 py-3 text-left font-heading text-body-meta font-medium text-truecost-text-secondary uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left font-heading text-body-meta font-medium text-truecost-text-secondary uppercase tracking-wider">
                        Supplier
                      </th>
                      <th className="px-4 py-3 text-left font-heading text-body-meta font-medium text-truecost-text-secondary uppercase tracking-wider">
                        Lead Time
                      </th>
                      <th className="px-4 py-3 text-right font-heading text-body-meta font-medium text-truecost-text-secondary uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-truecost-glass-border">
                    {categoryMaterials.map((material) => (
                      <tr key={material.id} className="hover:bg-truecost-glass-bg/30 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-body text-body font-medium text-truecost-text-primary">{material.name}</div>
                            {material.description && (
                              <div className="font-body text-body-meta text-truecost-text-muted">{material.description}</div>
                            )}
                            {material.tags && material.tags.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {material.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-body-meta bg-truecost-glass-bg text-truecost-text-muted px-1.5 py-0.5 rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-body text-body font-medium text-truecost-teal">
                            ${material.unitCost.toFixed(2)}
                          </span>
                          <span className="font-body text-body-meta text-truecost-text-muted">
                            {' '}
                            / {UNIT_LABELS[material.unit]}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-body text-body-meta text-truecost-text-secondary">
                          {getSupplierName(material.supplierId) || '-'}
                          {material.supplierSku && (
                            <div className="text-body-meta text-truecost-text-muted">{material.supplierSku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-body text-body-meta text-truecost-text-secondary">
                          {material.leadTimeDays
                            ? `${material.leadTimeDays} days`
                            : 'In stock'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleEdit(material)}
                            className="font-body text-body-meta text-truecost-cyan hover:text-truecost-teal mr-3 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(material.id)}
                            className="font-body text-body-meta text-truecost-danger hover:text-truecost-danger/80 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
