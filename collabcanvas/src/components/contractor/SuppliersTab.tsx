/**
 * Suppliers Tab Component
 *
 * Manage supplier relationships with:
 * - Add/Edit/Delete suppliers
 * - Contact information
 * - Discount and payment terms
 * - Delivery information
 */

import { useState } from 'react';
import { useContractorStore } from '../../store/contractorStore';
import type { Supplier, MaterialCatalogCategory } from '../../types/contractor';
import { MATERIAL_CATEGORY_LABELS } from '../../types/contractor';
import { Button, Input } from '../ui';

interface SuppliersTabProps {
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

export function SuppliersTab({ userId }: SuppliersTabProps) {
  const { suppliers, materials, savingSupplier, addSupplier, updateSupplier, deleteSupplier } =
    useContractorStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<{
    name: string;
    contactName: string;
    phone: string;
    email: string;
    website: string;
    accountNumber: string;
    discountPercent: number;
    paymentTerms: string;
    deliveryZipCodes: string[];
    deliveryFee: number;
    freeDeliveryMinimum: number;
    categories: MaterialCatalogCategory[];
    notes: string;
    isPrimary: boolean;
  }>({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    website: '',
    accountNumber: '',
    discountPercent: 0,
    paymentTerms: '',
    deliveryZipCodes: [],
    deliveryFee: 0,
    freeDeliveryMinimum: 0,
    categories: [],
    notes: '',
    isPrimary: false,
  });

  const [zipInput, setZipInput] = useState('');

  const resetForm = () => {
    setForm({
      name: '',
      contactName: '',
      phone: '',
      email: '',
      website: '',
      accountNumber: '',
      discountPercent: 0,
      paymentTerms: '',
      deliveryZipCodes: [],
      deliveryFee: 0,
      freeDeliveryMinimum: 0,
      categories: [],
      notes: '',
      isPrimary: false,
    });
    setZipInput('');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleEdit = (supplier: Supplier) => {
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      website: supplier.website || '',
      accountNumber: supplier.accountNumber || '',
      discountPercent: supplier.discountPercent || 0,
      paymentTerms: supplier.paymentTerms || '',
      deliveryZipCodes: supplier.deliveryZipCodes || [],
      deliveryFee: supplier.deliveryFee || 0,
      freeDeliveryMinimum: supplier.freeDeliveryMinimum || 0,
      categories: supplier.categories || [],
      notes: supplier.notes || '',
      isPrimary: supplier.isPrimary || false,
    });
    setEditingId(supplier.id);
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    try {
      const supplierData = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        discountPercent: form.discountPercent || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        deliveryZipCodes:
          form.deliveryZipCodes.length > 0 ? form.deliveryZipCodes : undefined,
        deliveryFee: form.deliveryFee || undefined,
        freeDeliveryMinimum: form.freeDeliveryMinimum || undefined,
        categories: form.categories.length > 0 ? form.categories : undefined,
        notes: form.notes.trim() || undefined,
        isPrimary: form.isPrimary,
      };

      if (editingId) {
        await updateSupplier(userId, editingId, supplierData);
      } else {
        await addSupplier(userId, supplierData);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save supplier:', err);
    }
  };

  const handleDelete = async (supplierId: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await deleteSupplier(userId, supplierId);
    } catch (err) {
      console.error('Failed to delete supplier:', err);
    }
  };

  const handleAddZip = () => {
    const zip = zipInput.trim();
    if (zip && !form.deliveryZipCodes.includes(zip)) {
      setForm({ ...form, deliveryZipCodes: [...form.deliveryZipCodes, zip] });
      setZipInput('');
    }
  };

  const handleRemoveZip = (zip: string) => {
    setForm({
      ...form,
      deliveryZipCodes: form.deliveryZipCodes.filter((z) => z !== zip),
    });
  };

  const toggleCategory = (category: MaterialCatalogCategory) => {
    if (form.categories.includes(category)) {
      setForm({ ...form, categories: form.categories.filter((c) => c !== category) });
    } else {
      setForm({ ...form, categories: [...form.categories, category] });
    }
  };

  // Count materials from each supplier
  const getMaterialCount = (supplierId: string) => {
    return materials.filter((m) => m.supplierId === supplierId).length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-h3 text-truecost-text-primary">Suppliers</h2>
          <p className="font-body text-body-meta text-truecost-text-secondary">
            Manage your supplier relationships and contact information
          </p>
        </div>
        {!isCreating && (
          <Button variant="primary" onClick={() => setIsCreating(true)}>
            + Add Supplier
          </Button>
        )}
      </div>

      {/* Supplier Form */}
      {isCreating && (
        <div className="glass-panel p-6">
          <h3 className="font-heading text-body font-medium text-truecost-text-primary mb-4">
            {editingId ? 'Edit Supplier' : 'Add New Supplier'}
          </h3>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Company Name *
              </label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Home Depot, Local Lumber Co."
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Contact Name
              </label>
              <Input
                type="text"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Primary contact"
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Phone
              </label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Email
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="orders@supplier.com"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Website
              </label>
              <Input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://supplier.com"
              />
            </div>
          </div>

          {/* Account Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Account Number
              </label>
              <Input
                type="text"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                placeholder="Your account #"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Contractor Discount (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.discountPercent}
                onChange={(e) =>
                  setForm({ ...form, discountPercent: parseFloat(e.target.value) || 0 })
                }
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Payment Terms
              </label>
              <Input
                type="text"
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                placeholder="e.g., Net 30"
              />
            </div>
          </div>

          {/* Delivery Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Delivery Fee ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.deliveryFee}
                onChange={(e) =>
                  setForm({ ...form, deliveryFee: parseFloat(e.target.value) || 0 })
                }
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Free Delivery Minimum ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeDeliveryMinimum}
                onChange={(e) =>
                  setForm({ ...form, freeDeliveryMinimum: parseFloat(e.target.value) || 0 })
                }
                className="glass-input w-full"
              />
            </div>
          </div>

          {/* Delivery ZIP Codes */}
          <div className="mb-4">
            <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
              Delivery ZIP Codes
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.deliveryZipCodes.map((zip) => (
                <span
                  key={zip}
                  className="inline-flex items-center bg-truecost-cyan/20 text-truecost-cyan px-2 py-1 rounded-full text-sm"
                >
                  {zip}
                  <button
                    onClick={() => handleRemoveZip(zip)}
                    className="ml-1 text-truecost-cyan/70 hover:text-truecost-cyan"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddZip();
                  }
                }}
                placeholder="Enter ZIP code"
                className="glass-input w-32"
              />
              <Button variant="secondary" onClick={handleAddZip}>
                Add
              </Button>
            </div>
          </div>

          {/* Categories */}
          <div className="mb-4">
            <label className="block font-body text-body-meta text-truecost-text-secondary mb-2">
              Material Categories Supplied
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1 rounded-full text-sm font-body transition-all duration-120 ${
                    form.categories.includes(cat)
                      ? 'bg-truecost-cyan text-truecost-bg-primary'
                      : 'border border-truecost-glass-border text-truecost-text-secondary hover:border-truecost-cyan hover:text-truecost-cyan'
                  }`}
                >
                  {MATERIAL_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes and Primary */}
          <div className="mb-4">
            <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes about this supplier..."
              rows={2}
              className="glass-input w-full resize-none"
            />
          </div>

          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="isPrimary"
              checked={form.isPrimary}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              className="h-4 w-4 rounded border-truecost-glass-border bg-truecost-glass-bg text-truecost-cyan focus:ring-truecost-cyan/50"
            />
            <label htmlFor="isPrimary" className="ml-2 font-body text-body-meta text-truecost-text-secondary">
              Primary supplier (preferred for new orders)
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={savingSupplier || !form.name.trim()}
            >
              {savingSupplier
                ? 'Saving...'
                : editingId
                  ? 'Update Supplier'
                  : 'Save Supplier'}
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Suppliers List */}
      {suppliers.length === 0 && !isCreating ? (
        <div className="glass-panel text-center py-12 border-2 border-dashed border-truecost-glass-border">
          <p className="font-body text-body text-truecost-text-muted mb-4">
            No suppliers added yet
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="font-body text-body text-truecost-cyan hover:text-truecost-teal transition-colors"
          >
            Add your first supplier
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="glass-panel-hover overflow-hidden transition-all duration-120"
            >
              {/* Supplier Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() =>
                  setExpandedId(expandedId === supplier.id ? null : supplier.id)
                }
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-body font-medium text-truecost-text-primary">
                        {supplier.name}
                      </h3>
                      {supplier.isPrimary && (
                        <span className="text-xs bg-truecost-teal/20 text-truecost-teal px-2 py-0.5 rounded-full">
                          Primary
                        </span>
                      )}
                      {supplier.discountPercent && supplier.discountPercent > 0 && (
                        <span className="text-xs bg-truecost-cyan/20 text-truecost-cyan px-2 py-0.5 rounded-full">
                          {supplier.discountPercent}% discount
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1 font-body text-body-meta text-truecost-text-muted">
                      {supplier.phone && <span>{supplier.phone}</span>}
                      {supplier.email && <span>{supplier.email}</span>}
                      <span>{getMaterialCount(supplier.id)} materials linked</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(supplier);
                      }}
                      className="font-body text-body-meta text-truecost-cyan hover:text-truecost-teal transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(supplier.id);
                      }}
                      className="font-body text-body-meta text-truecost-danger hover:text-truecost-danger/80 transition-colors"
                    >
                      Delete
                    </button>
                    <span className="text-truecost-text-muted ml-2">
                      {expandedId === supplier.id ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === supplier.id && (
                <div className="px-4 pb-4 border-t border-truecost-glass-border bg-truecost-glass-bg/30">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                    {/* Contact */}
                    <div>
                      <h4 className="text-xs font-heading font-medium text-truecost-text-muted uppercase mb-2">
                        Contact
                      </h4>
                      {supplier.contactName && (
                        <p className="font-body text-body-meta text-truecost-text-secondary">
                          {supplier.contactName}
                        </p>
                      )}
                      {supplier.phone && (
                        <p className="font-body text-body-meta text-truecost-text-secondary">
                          {supplier.phone}
                        </p>
                      )}
                      {supplier.email && (
                        <p className="font-body text-body-meta text-truecost-cyan">
                          <a href={`mailto:${supplier.email}`}>{supplier.email}</a>
                        </p>
                      )}
                      {supplier.website && (
                        <p className="font-body text-body-meta text-truecost-cyan">
                          <a
                            href={supplier.website}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Website
                          </a>
                        </p>
                      )}
                    </div>

                    {/* Account */}
                    <div>
                      <h4 className="text-xs font-heading font-medium text-truecost-text-muted uppercase mb-2">
                        Account
                      </h4>
                      {supplier.accountNumber && (
                        <p className="font-body text-body-meta text-truecost-text-secondary">
                          Account #: {supplier.accountNumber}
                        </p>
                      )}
                      {supplier.discountPercent && supplier.discountPercent > 0 && (
                        <p className="font-body text-body-meta text-truecost-teal">
                          {supplier.discountPercent}% contractor discount
                        </p>
                      )}
                      {supplier.paymentTerms && (
                        <p className="font-body text-body-meta text-truecost-text-secondary">
                          Terms: {supplier.paymentTerms}
                        </p>
                      )}
                    </div>

                    {/* Delivery */}
                    <div>
                      <h4 className="text-xs font-heading font-medium text-truecost-text-muted uppercase mb-2">
                        Delivery
                      </h4>
                      {supplier.deliveryFee && supplier.deliveryFee > 0 ? (
                        <p className="font-body text-body-meta text-truecost-text-secondary">
                          Delivery fee: ${supplier.deliveryFee.toFixed(2)}
                        </p>
                      ) : (
                        <p className="font-body text-body-meta text-truecost-text-muted">
                          No delivery fee info
                        </p>
                      )}
                      {supplier.freeDeliveryMinimum && supplier.freeDeliveryMinimum > 0 && (
                        <p className="font-body text-body-meta text-truecost-teal">
                          Free delivery over ${supplier.freeDeliveryMinimum.toFixed(2)}
                        </p>
                      )}
                      {supplier.deliveryZipCodes && supplier.deliveryZipCodes.length > 0 && (
                        <p className="font-body text-body-meta text-truecost-text-muted mt-1">
                          ZIP codes: {supplier.deliveryZipCodes.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Categories */}
                  {supplier.categories && supplier.categories.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-heading font-medium text-truecost-text-muted uppercase mb-2">
                        Categories
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {supplier.categories.map((cat) => (
                          <span
                            key={cat}
                            className="text-xs bg-truecost-glass-bg text-truecost-text-secondary px-2 py-1 rounded-full border border-truecost-glass-border"
                          >
                            {MATERIAL_CATEGORY_LABELS[cat]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {supplier.notes && (
                    <div className="mt-4">
                      <h4 className="text-xs font-heading font-medium text-truecost-text-muted uppercase mb-2">
                        Notes
                      </h4>
                      <p className="font-body text-body-meta text-truecost-text-muted">
                        {supplier.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
