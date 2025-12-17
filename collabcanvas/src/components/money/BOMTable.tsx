/**
 * BOM Table Component
 * AC: #10 - BOM Modification
 * Displays BOM with inline editing for quantities, prices, and descriptions
 */

import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { BillOfMaterials } from '../../types/material';
import { saveBOM, recalculateMargin, updateActualCost } from '../../services/bomService';
import { useCanvasStore } from '../../store/canvasStore';
import { formatErrorForDisplay, retryWithBackoff } from '../../utils/errorHandler';

interface BOMTableProps {
  bom: BillOfMaterials;
  onBOMUpdate?: (updatedBOM: BillOfMaterials) => void;
}

export function BOMTable({ bom, onBOMUpdate }: BOMTableProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const setBillOfMaterials = useCanvasStore(state => state.setBillOfMaterials);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'quantity' | 'price' | 'notes' | 'actualCost' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleStartEdit = useCallback((materialId: string, field: 'quantity' | 'price' | 'notes' | 'actualCost', currentValue: string | number | undefined) => {
    setEditingMaterialId(materialId);
    setEditingField(field);
    setEditValue(String(currentValue || ''));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMaterialId(null);
    setEditingField(null);
    setEditValue('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!projectId || !user || !editingMaterialId || !editingField) return;

    setSaving(true);
    try {
      const materialIndex = bom.totalMaterials.findIndex(m => 
        (m.id && m.id === editingMaterialId) || 
        (!m.id && m.name === editingMaterialId)
      );

      if (materialIndex === -1) {
        throw new Error('Material not found');
      }

      const updatedMaterials = [...bom.totalMaterials];
      const material = { ...updatedMaterials[materialIndex] };

      // Update the field being edited
      if (editingField === 'quantity') {
        const quantity = parseFloat(editValue);
        if (isNaN(quantity) || quantity < 0) {
          throw new Error('Invalid quantity');
        }
        material.quantity = quantity;
      } else if (editingField === 'price') {
        const price = parseFloat(editValue);
        if (isNaN(price) || price < 0) {
          throw new Error('Invalid price');
        }
        material.priceUSD = price;
        material.priceError = undefined; // Clear error when manually entering price
      } else if (editingField === 'notes') {
        material.notes = editValue || undefined;
      } else if (editingField === 'actualCost') {
        // Actual cost is handled separately via updateActualCost function
        // AC: #23 - Actual cost save failure handling with retry logic
        const actualCost = editValue === '' ? null : parseFloat(editValue);
        if (actualCost !== null && (isNaN(actualCost) || actualCost < 0)) {
          throw new Error('Invalid actual cost');
        }
        
        try {
          const updatedBOM = await retryWithBackoff(
            () => updateActualCost(projectId, editingMaterialId, actualCost, user.uid, bom),
            3, // max retries
            1000 // initial delay
          );
          setBillOfMaterials(updatedBOM);
          onBOMUpdate?.(updatedBOM);
          handleCancelEdit();
          return; // Early return since updateActualCost already saves to Firestore
        } catch (retryError) {
          const errorInfo = formatErrorForDisplay(retryError);
          throw new Error(`${errorInfo.title}: ${errorInfo.message}${errorInfo.canRetry ? ' Please try again.' : ''}`);
        }
      }

      updatedMaterials[materialIndex] = material;

      const updatedBOM: BillOfMaterials = {
        ...bom,
        totalMaterials: updatedMaterials,
      };

      // Recalculate margin if price changed
      if (editingField === 'price') {
        const bomWithMargin = await recalculateMargin(projectId, updatedBOM);
        await saveBOM(projectId, bomWithMargin, user.uid);
        setBillOfMaterials(bomWithMargin);
        onBOMUpdate?.(bomWithMargin);
      } else {
        await saveBOM(projectId, updatedBOM, user.uid);
        setBillOfMaterials(updatedBOM);
        onBOMUpdate?.(updatedBOM);
      }

      handleCancelEdit();
    } catch (error) {
      console.error('Error saving BOM edit:', error);
      const errorInfo = formatErrorForDisplay(error);
      alert(`${errorInfo.title}: ${errorInfo.message}${errorInfo.canRetry ? '\n\nYou can try again by clicking the field.' : ''}`);
    } finally {
      setSaving(false);
    }
  }, [projectId, user, bom, editingMaterialId, editingField, editValue, setBillOfMaterials, onBOMUpdate, handleCancelEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full divide-y divide-truecost-glass-border">
        <thead className="bg-truecost-bg-secondary">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Material
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Category
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Quantity
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Unit Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Total
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Actual Cost
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-truecost-text-secondary uppercase tracking-wider">
              Notes
            </th>
          </tr>
        </thead>
        <tbody className="bg-truecost-bg-primary divide-y divide-truecost-glass-border">
          {bom.totalMaterials.map((material, index) => {
            const materialId = material.id || material.name;
            const isEditing = editingMaterialId === materialId;
            const hasPrice = typeof material.priceUSD === 'number' && material.priceUSD > 0;
            const total = hasPrice && material.priceUSD !== undefined ? material.quantity * material.priceUSD : 0;

            return (
              <tr key={`${materialId}-${index}`} className="hover:bg-truecost-glass-bg">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-truecost-text-primary">{material.name}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-truecost-cyan/20 text-truecost-cyan rounded capitalize">
                    {material.category}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {isEditing && editingField === 'quantity' ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="w-20 px-2 py-1 text-sm border border-truecost-glass-border rounded text-right bg-truecost-bg-secondary text-truecost-text-primary"
                      autoFocus
                      disabled={saving}
                      min="0"
                      step="0.01"
                    />
                  ) : (
                    <button
                      onClick={() => handleStartEdit(materialId, 'quantity', material.quantity)}
                      className="text-sm text-truecost-text-primary hover:text-truecost-cyan hover:underline"
                    >
                      {material.quantity.toFixed(0)} <span className="text-truecost-text-muted">{material.unit}</span>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {isEditing && editingField === 'price' ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm text-truecost-text-muted">$</span>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={handleKeyDown}
                        className="w-24 px-2 py-1 text-sm border border-truecost-glass-border rounded text-right bg-truecost-bg-secondary text-truecost-text-primary"
                        autoFocus
                        disabled={saving}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  ) : hasPrice ? (
                    <button
                      onClick={() => handleStartEdit(materialId, 'price', material.priceUSD ?? 0)}
                      className="text-sm font-semibold text-truecost-success hover:text-truecost-cyan hover:underline"
                    >
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(material.priceUSD ?? 0)}
                    </button>
                  ) : material.priceError ? (
                    <div className="flex flex-col items-end">
                      <button
                        onClick={() => handleStartEdit(materialId, 'price', '')}
                        className="text-xs text-truecost-warning hover:text-truecost-cyan hover:underline"
                      >
                        Enter price
                      </button>
                      <span className="text-xs text-truecost-warning mt-1">{material.priceError}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartEdit(materialId, 'price', '')}
                      className="text-sm text-truecost-text-muted hover:text-truecost-cyan hover:underline"
                    >
                      N/A
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm font-semibold text-truecost-cyan">
                    {hasPrice
                      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)
                      : 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {isEditing && editingField === 'actualCost' ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm text-truecost-text-muted">$</span>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={handleKeyDown}
                        className="w-24 px-2 py-1 text-sm border border-truecost-glass-border rounded text-right bg-truecost-bg-secondary text-truecost-text-primary"
                        autoFocus
                        disabled={saving}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        title="Enter total actual cost (not unit price)"
                      />
                    </div>
                  ) : typeof material.actualCostUSD === 'number' ? (
                    <button
                      onClick={() => handleStartEdit(materialId, 'actualCost', material.actualCostUSD)}
                      className="text-sm font-semibold text-truecost-teal hover:text-truecost-cyan hover:underline"
                      title="Total actual cost"
                    >
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(material.actualCostUSD)}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartEdit(materialId, 'actualCost', '')}
                      className="text-sm text-truecost-text-muted hover:text-truecost-cyan hover:underline"
                      title="Enter total actual cost"
                    >
                      Enter
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing && editingField === 'notes' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="w-full px-2 py-1 text-sm border border-truecost-glass-border rounded bg-truecost-bg-secondary text-truecost-text-primary"
                      autoFocus
                      disabled={saving}
                      placeholder="Add notes..."
                    />
                  ) : (
                    <button
                      onClick={() => handleStartEdit(materialId, 'notes', material.notes)}
                      className="text-sm text-truecost-text-secondary hover:text-truecost-cyan hover:underline text-left w-full"
                    >
                      {material.notes || <span className="text-truecost-text-muted italic">Click to add notes</span>}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

