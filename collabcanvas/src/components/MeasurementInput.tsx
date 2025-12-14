/**
 * MeasurementInput component for construction measurements
 * Provides a better UI for inputting measurements with unit selection
 */

import { useState, useEffect } from 'react';
import type { UnitType } from '../types';
import { getAvailableUnits, UNIT_CONFIGS } from '../types';
import { parseMeasurement, formatMeasurement } from '../services/unitConversion';

interface MeasurementInputProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void; // Optional cancel handler - if not provided, uses onClose
  onSubmit: (value: number, unit: UnitType) => void;
  initialValue?: number;
  initialUnit?: UnitType;
  title?: string;
}

export function MeasurementInput({
  isOpen,
  onClose,
  onCancel,
  onSubmit,
  initialValue = 0,
  initialUnit = 'feet',
  title = 'Enter Measurement'
}: MeasurementInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<UnitType>(initialUnit);
  const [error, setError] = useState('');
  const [parsedValue, setParsedValue] = useState<number | null>(null);

  const availableUnits = getAvailableUnits();

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setInputValue(initialValue > 0 ? initialValue.toString() : '');
      setSelectedUnit(initialUnit);
      setError('');
      setParsedValue(null);
    }
  }, [isOpen, initialValue, initialUnit]);

  // Parse input as user types
  useEffect(() => {
    if (!inputValue.trim()) {
      setParsedValue(null);
      setError('');
      return;
    }

    try {
      const parsed = parseMeasurement(inputValue, selectedUnit);
      setParsedValue(parsed);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid measurement');
      setParsedValue(null);
    }
  }, [inputValue, selectedUnit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (parsedValue === null) {
      setError('Please enter a valid measurement');
      return;
    }

    // Call onSubmit first, then close
    // Don't call onClose here - let the parent handle closing after submission
    onSubmit(parsedValue, selectedUnit);
    // Note: onClose is called separately by the parent after successful submission
  };

  const handleCancel = () => {
    // Use onCancel if provided, otherwise use onClose
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-truecost-bg-surface border border-truecost-glass-border rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-truecost-glass-border">
          <h3 className="text-lg font-medium text-truecost-text-primary">{title}</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {/* Input field */}
            <div>
              <label htmlFor="measurement" className="block text-sm font-medium text-truecost-text-secondary mb-2">
                Measurement
              </label>
              <input
                id="measurement"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g., 5 feet 10 inches, 2.5m, 150cm"
                className="w-full px-3 py-2 bg-truecost-bg-primary border border-truecost-glass-border rounded-md shadow-sm text-truecost-text-primary placeholder-truecost-text-muted focus:outline-none focus:ring-2 focus:ring-truecost-cyan focus:border-truecost-cyan"
                autoFocus
              />
              {error && (
                <p className="mt-1 text-sm text-truecost-danger">{error}</p>
              )}
              {parsedValue !== null && (
                <p className="mt-1 text-sm text-truecost-teal">
                  Parsed as: {formatMeasurement(parsedValue, selectedUnit)}
                </p>
              )}
            </div>

            {/* Unit selection */}
            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-truecost-text-secondary mb-2">
                Unit
              </label>
              <select
                id="unit"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value as UnitType)}
                className="w-full px-3 py-2 bg-truecost-bg-primary border border-truecost-glass-border rounded-md shadow-sm text-truecost-text-primary focus:outline-none focus:ring-2 focus:ring-truecost-cyan focus:border-truecost-cyan"
              >
                {availableUnits.map((unit) => (
                  <option key={unit} value={unit} className="bg-truecost-bg-primary text-truecost-text-primary">
                    {UNIT_CONFIGS[unit].fullName} ({UNIT_CONFIGS[unit].abbreviation})
                  </option>
                ))}
              </select>
            </div>

            {/* Examples */}
            <div className="text-sm text-truecost-text-muted">
              <p className="font-medium mb-1 text-truecost-text-secondary">Examples:</p>
              <ul className="list-disc list-inside space-y-1">
                {selectedUnit === 'feet' && (
                  <>
                    <li>5 feet 10 inches</li>
                    <li>5' 10"</li>
                    <li>5'10"</li>
                    <li>3/4 inch</li>
                    <li>2.5 feet</li>
                  </>
                )}
                {selectedUnit === 'inches' && (
                  <>
                    <li>5 feet 10 inches</li>
                    <li>5' 10"</li>
                    <li>5'10"</li>
                    <li>3/4 inch</li>
                    <li>30 inches</li>
                  </>
                )}
                {selectedUnit === 'meters' && (
                  <>
                    <li>2.5 meters</li>
                    <li>1.5 m</li>
                    <li>0.5 meters</li>
                  </>
                )}
                {selectedUnit === 'centimeters' && (
                  <>
                    <li>150 centimeters</li>
                    <li>150 cm</li>
                    <li>25.5 cm</li>
                  </>
                )}
                {selectedUnit === 'millimeters' && (
                  <>
                    <li>1500 millimeters</li>
                    <li>1500 mm</li>
                    <li>255 mm</li>
                  </>
                )}
                {selectedUnit === 'yards' && (
                  <>
                    <li>5 yards</li>
                    <li>2.5 yards</li>
                    <li>1 yard</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-truecost-text-primary bg-truecost-bg-primary border border-truecost-glass-border rounded-md hover:bg-truecost-glass-bg focus:outline-none focus:ring-2 focus:ring-truecost-glass-border focus:ring-offset-2 focus:ring-offset-truecost-bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={parsedValue === null}
              className="px-4 py-2 text-sm font-medium text-truecost-bg-primary bg-gradient-to-r from-truecost-cyan to-truecost-teal border border-transparent rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-truecost-cyan focus:ring-offset-2 focus:ring-offset-truecost-bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Set Measurement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
