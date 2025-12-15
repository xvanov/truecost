/**
 * Room Scanner Component
 *
 * Provides room scanning with multiple methods:
 * - ARCore native scanning (Android) - Uses plane detection and depth API
 * - Canvas LiDAR scanning (iOS) - Import measurements from Canvas app
 * - Manual room entry - Fallback for any device
 * - Generate scope items from scanned rooms
 */

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button, Input, GlassPanel } from '../ui';
import {
  createRoom,
  parseCanvasMeasurements,
  generateScopeFromRooms,
  getCanvasAppLink,
  calculateRoomMetrics,
} from '../../services/roomScanService';
import type { ScannedRoom, RoomType, RoomFeature } from '../../types/roomScan';
import { ROOM_TYPE_LABELS, FEATURE_TYPE_LABELS } from '../../types/roomScan';
import ARCoreRoomScanner from '../../plugins/ARCoreRoomScanner';

interface RoomScannerProps {
  projectId: string;
  onRoomsScanned: (rooms: ScannedRoom[]) => void;
  onScopeGenerated?: (
    scopeItems: { category: string; item: string; quantity: number; unit: string }[]
  ) => void;
}

type ViewMode = 'home' | 'canvas-guide' | 'import' | 'manual' | 'review' | 'arcore-scanning';

export function RoomScanner({ onRoomsScanned, onScopeGenerated }: RoomScannerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [rooms, setRooms] = useState<ScannedRoom[]>([]);
  const [importText, setImportText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // ARCore state
  const [isAndroid, setIsAndroid] = useState(false);
  const [arCoreAvailable, setArCoreAvailable] = useState(false);
  const [arCoreScanning, setArCoreScanning] = useState(false);
  const [arCoreError, setArCoreError] = useState<string | null>(null);

  // Check ARCore availability on mount
  useEffect(() => {
    const checkARCore = async () => {
      const platform = Capacitor.getPlatform();
      setIsAndroid(platform === 'android');

      if (platform === 'android') {
        try {
          const availability = await ARCoreRoomScanner.checkAvailability();
          setArCoreAvailable(availability.isSupported);
        } catch {
          setArCoreAvailable(false);
        }
      }
    };

    checkARCore();
  }, []);

  // Handle ARCore room scan
  const handleARCoreScan = async () => {
    setArCoreError(null);
    setArCoreScanning(true);

    try {
      // Request camera permission first
      const permission = await ARCoreRoomScanner.requestPermission();
      if (!permission.granted) {
        setArCoreError('Camera permission is required for AR scanning');
        setArCoreScanning(false);
        return;
      }

      // Start the scan
      const result = await ARCoreRoomScanner.startScan();

      if (result.success && result.dimensions) {
        // Create room from ARCore scan results
        const newRoom: ScannedRoom = {
          id: `room_${Date.now()}_arcore`,
          name: 'Scanned Room',
          type: 'other',
          dimensions: {
            length: result.dimensions.length,
            width: result.dimensions.width,
            height: result.dimensions.height,
            area: result.dimensions.area,
            volume: result.dimensions.volume,
          },
          features: result.features?.map((f) => ({
            type: f.type,
            count: f.count,
          })) || [],
          scanDate: new Date(),
          sourceApp: 'arcore',
        };

        setRooms((prev) => [...prev, newRoom]);
        setViewMode('review');
      } else {
        setArCoreError(result.reason || 'Scan was cancelled');
      }
    } catch (err) {
      setArCoreError('Failed to scan room. Please try again or use manual entry.');
      console.error('ARCore scan error:', err);
    } finally {
      setArCoreScanning(false);
    }
  };

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    name: '',
    type: 'other' as RoomType,
    length: '',
    width: '',
    height: '8',
    windows: '0',
    doors: '1',
  });

  const canvasInfo = getCanvasAppLink();

  const handleImportMeasurements = () => {
    setParseError(null);

    if (!importText.trim()) {
      setParseError('Please paste measurement data from Canvas');
      return;
    }

    try {
      const { rooms: parsedRooms } = parseCanvasMeasurements(importText);

      if (parsedRooms.length === 0) {
        setParseError(
          'Could not parse any rooms from the input. Please check the format.'
        );
        return;
      }

      // Convert partial rooms to full rooms
      const fullRooms: ScannedRoom[] = parsedRooms.map((r, idx) => ({
        id: `room_${Date.now()}_${idx}`,
        name: r.name || `Room ${idx + 1}`,
        type: r.type || 'other',
        dimensions: r.dimensions || calculateRoomMetrics(10, 10, 8),
        features: r.features || [],
        scanDate: new Date(),
        sourceApp: 'canvas',
      }));

      setRooms((prev) => [...prev, ...fullRooms]);
      setImportText('');
      setViewMode('review');
    } catch (err) {
      setParseError('Failed to parse measurements. Please check the format.');
      console.error('Parse error:', err);
    }
  };

  const handleManualAdd = () => {
    const length = parseFloat(manualForm.length);
    const width = parseFloat(manualForm.width);
    const height = parseFloat(manualForm.height);

    if (!manualForm.name || isNaN(length) || isNaN(width)) {
      return;
    }

    const features: RoomFeature[] = [];
    const windows = parseInt(manualForm.windows);
    const doors = parseInt(manualForm.doors);

    if (windows > 0) {
      features.push({ type: 'window', count: windows });
    }
    if (doors > 0) {
      features.push({ type: 'door', count: doors });
    }

    const newRoom = createRoom(
      manualForm.name,
      manualForm.type,
      length,
      width,
      height,
      'manual'
    );
    newRoom.features = features;

    setRooms((prev) => [...prev, newRoom]);
    setManualForm({
      name: '',
      type: 'other',
      length: '',
      width: '',
      height: '8',
      windows: '0',
      doors: '1',
    });
  };

  const handleDeleteRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  };

  const handleFinish = () => {
    onRoomsScanned(rooms);

    if (onScopeGenerated && rooms.length > 0) {
      const scopeItems = generateScopeFromRooms(rooms);
      onScopeGenerated(scopeItems);
    }
  };

  const totalSqFt = rooms.reduce((sum, r) => sum + r.dimensions.area, 0);

  // Home view - choose scanning method
  if (viewMode === 'home') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="font-heading text-h2 text-truecost-text-primary mb-2">
            Room Scanner
          </h2>
          <p className="font-body text-body text-truecost-text-secondary">
            Scan your project space to auto-generate accurate measurements
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ARCore Option - Android Only */}
          {isAndroid && arCoreAvailable && (
            <button
              onClick={handleARCoreScan}
              disabled={arCoreScanning}
              className="glass-panel-hover p-6 text-left transition-all duration-120 group disabled:opacity-50"
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{arCoreScanning ? '⏳' : '📐'}</div>
                <div>
                  <h3 className="font-heading text-body font-medium text-truecost-text-primary group-hover:text-truecost-cyan transition-colors">
                    {arCoreScanning ? 'Scanning...' : 'AR Room Scan'}
                  </h3>
                  <p className="font-body text-body-meta text-truecost-text-secondary mt-1">
                    Use your camera to scan room dimensions with ARCore depth sensing
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs bg-truecost-teal/20 text-truecost-teal px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                    <span className="text-xs text-truecost-text-muted">
                      Native Android AR
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Canvas/LiDAR Option - Show for iOS or when ARCore not available */}
          {(!isAndroid || !arCoreAvailable) && (
            <button
              onClick={() => setViewMode('canvas-guide')}
              className="glass-panel-hover p-6 text-left transition-all duration-120 group"
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">📱</div>
                <div>
                  <h3 className="font-heading text-body font-medium text-truecost-text-primary group-hover:text-truecost-cyan transition-colors">
                    LiDAR Scan with Canvas
                  </h3>
                  <p className="font-body text-body-meta text-truecost-text-secondary mt-1">
                    Use iPhone/iPad LiDAR for professional-grade 3D scanning with 99%
                    accuracy
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs bg-truecost-teal/20 text-truecost-teal px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                    <span className="text-xs text-truecost-text-muted">
                      Requires iPhone 12 Pro+
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Manual Entry Option */}
          <button
            onClick={() => setViewMode('manual')}
            className="glass-panel-hover p-6 text-left transition-all duration-120 group"
          >
            <div className="flex items-start gap-4">
              <div className="text-4xl">📏</div>
              <div>
                <h3 className="font-heading text-body font-medium text-truecost-text-primary group-hover:text-truecost-cyan transition-colors">
                  Manual Entry
                </h3>
                <p className="font-body text-body-meta text-truecost-text-secondary mt-1">
                  Enter room dimensions manually using a tape measure
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs bg-truecost-glass-bg text-truecost-text-secondary px-2 py-0.5 rounded-full border border-truecost-glass-border">
                    Any device
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* ARCore Error Message */}
        {arCoreError && (
          <div className="bg-truecost-danger/10 border border-truecost-danger/30 rounded-lg p-4">
            <p className="font-body text-body-meta text-truecost-danger">
              {arCoreError}
            </p>
            <button
              onClick={() => setArCoreError(null)}
              className="font-body text-body-meta text-truecost-text-secondary hover:text-truecost-text-primary mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Already have rooms */}
        {rooms.length > 0 && (
          <div className="mt-6">
            <Button variant="primary" onClick={() => setViewMode('review')} className="w-full">
              Review {rooms.length} Room{rooms.length !== 1 ? 's' : ''} ({totalSqFt.toFixed(0)} sq ft)
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Canvas Guide view
  if (viewMode === 'canvas-guide') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setViewMode('home')}
          className="font-body text-body-meta text-truecost-text-secondary hover:text-truecost-cyan transition-colors"
        >
          &larr; Back
        </button>

        <div className="text-center mb-6">
          <h2 className="font-heading text-h3 text-truecost-text-primary mb-2">
            Scan with Canvas App
          </h2>
          <p className="font-body text-body-meta text-truecost-text-secondary">
            Follow these steps to capture accurate room measurements
          </p>
        </div>

        {/* App Store Link */}
        <GlassPanel className="p-4 text-center">
          <p className="font-body text-body-meta text-truecost-text-secondary mb-3">
            Don't have Canvas? Download free from the App Store
          </p>
          <a
            href={canvasInfo.ios}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-truecost-cyan text-truecost-bg-primary rounded-full font-body text-body-meta font-medium hover:bg-truecost-teal transition-colors"
          >
            <span>📲</span> Download Canvas
          </a>
        </GlassPanel>

        {/* Instructions */}
        <div className="glass-panel p-6">
          <h3 className="font-heading text-body font-medium text-truecost-text-primary mb-4">
            Scanning Instructions
          </h3>
          <ol className="space-y-3">
            {canvasInfo.instructions.map((step, idx) => (
              <li
                key={idx}
                className="flex gap-3 font-body text-body-meta text-truecost-text-secondary"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-truecost-cyan/20 text-truecost-cyan text-xs flex items-center justify-center font-medium">
                  {idx + 1}
                </span>
                <span>{step.replace(/^\d+\.\s*/, '')}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Import Button */}
        <Button
          variant="primary"
          onClick={() => setViewMode('import')}
          className="w-full"
        >
          I've completed my scan - Import Measurements
        </Button>
      </div>
    );
  }

  // Import view
  if (viewMode === 'import') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setViewMode('canvas-guide')}
          className="font-body text-body-meta text-truecost-text-secondary hover:text-truecost-cyan transition-colors"
        >
          &larr; Back
        </button>

        <div className="text-center mb-6">
          <h2 className="font-heading text-h3 text-truecost-text-primary mb-2">
            Import Canvas Measurements
          </h2>
          <p className="font-body text-body-meta text-truecost-text-secondary">
            Paste the measurement data from Canvas export
          </p>
        </div>

        <div className="glass-panel p-6">
          <label className="block font-body text-body-meta text-truecost-text-secondary mb-2">
            Paste measurements here
          </label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`Example format:
Living Room:
12' x 14'
2 Windows
1 Door

Bedroom 1:
10' x 12'
Area: 120 sq ft
1 Window
1 Door`}
            rows={10}
            className="glass-input w-full resize-none font-mono text-sm"
          />

          {parseError && (
            <p className="font-body text-body-meta text-truecost-danger mt-2">
              {parseError}
            </p>
          )}

          <div className="flex gap-3 mt-4">
            <Button variant="primary" onClick={handleImportMeasurements}>
              Parse & Import
            </Button>
            <Button variant="secondary" onClick={() => setViewMode('manual')}>
              Enter Manually Instead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Manual entry view
  if (viewMode === 'manual') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setViewMode('home')}
          className="font-body text-body-meta text-truecost-text-secondary hover:text-truecost-cyan transition-colors"
        >
          &larr; Back
        </button>

        <div className="text-center mb-6">
          <h2 className="font-heading text-h3 text-truecost-text-primary mb-2">
            Manual Room Entry
          </h2>
          <p className="font-body text-body-meta text-truecost-text-secondary">
            Enter room dimensions from your measurements
          </p>
        </div>

        {/* Entry Form */}
        <div className="glass-panel p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Room Name *
              </label>
              <Input
                type="text"
                value={manualForm.name}
                onChange={(e) =>
                  setManualForm({ ...manualForm, name: e.target.value })
                }
                placeholder="e.g., Living Room, Master Bedroom"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Room Type
              </label>
              <select
                value={manualForm.type}
                onChange={(e) =>
                  setManualForm({ ...manualForm, type: e.target.value as RoomType })
                }
                className="glass-input w-full"
              >
                {Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Length (ft) *
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={manualForm.length}
                onChange={(e) =>
                  setManualForm({ ...manualForm, length: e.target.value })
                }
                placeholder="12"
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Width (ft) *
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={manualForm.width}
                onChange={(e) =>
                  setManualForm({ ...manualForm, width: e.target.value })
                }
                placeholder="10"
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Ceiling (ft)
              </label>
              <input
                type="number"
                min="6"
                max="20"
                step="0.5"
                value={manualForm.height}
                onChange={(e) =>
                  setManualForm({ ...manualForm, height: e.target.value })
                }
                placeholder="8"
                className="glass-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Windows
              </label>
              <input
                type="number"
                min="0"
                value={manualForm.windows}
                onChange={(e) =>
                  setManualForm({ ...manualForm, windows: e.target.value })
                }
                className="glass-input w-full"
              />
            </div>
            <div>
              <label className="block font-body text-body-meta text-truecost-text-secondary mb-1">
                Doors
              </label>
              <input
                type="number"
                min="0"
                value={manualForm.doors}
                onChange={(e) =>
                  setManualForm({ ...manualForm, doors: e.target.value })
                }
                className="glass-input w-full"
              />
            </div>
          </div>

          <Button
            variant="primary"
            onClick={handleManualAdd}
            disabled={
              !manualForm.name || !manualForm.length || !manualForm.width
            }
          >
            Add Room
          </Button>
        </div>

        {/* Rooms List */}
        {rooms.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-heading text-body font-medium text-truecost-text-primary">
              Added Rooms ({rooms.length})
            </h3>
            {rooms.map((room) => (
              <div
                key={room.id}
                className="glass-panel p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-body text-body text-truecost-text-primary">
                    {room.name}
                  </p>
                  <p className="font-body text-body-meta text-truecost-text-muted">
                    {room.dimensions.length}' x {room.dimensions.width}' ={' '}
                    {room.dimensions.area} sq ft
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="font-body text-body-meta text-truecost-danger hover:text-truecost-danger/80"
                >
                  Remove
                </button>
              </div>
            ))}

            <div className="flex justify-between items-center pt-4 border-t border-truecost-glass-border">
              <p className="font-body text-body text-truecost-text-secondary">
                Total: <span className="text-truecost-cyan">{totalSqFt.toFixed(0)} sq ft</span>
              </p>
              <Button variant="primary" onClick={() => setViewMode('review')}>
                Review & Finish
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Review view
  if (viewMode === 'review') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setViewMode('manual')}
          className="font-body text-body-meta text-truecost-text-secondary hover:text-truecost-cyan transition-colors"
        >
          &larr; Add More Rooms
        </button>

        <div className="text-center mb-6">
          <h2 className="font-heading text-h3 text-truecost-text-primary mb-2">
            Review Scanned Rooms
          </h2>
          <p className="font-body text-body-meta text-truecost-text-secondary">
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} totaling{' '}
            <span className="text-truecost-cyan">{totalSqFt.toFixed(0)} sq ft</span>
          </p>
        </div>

        {/* Room Cards */}
        <div className="space-y-4">
          {rooms.map((room) => (
            <div key={room.id} className="glass-panel p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-heading text-body font-medium text-truecost-text-primary">
                    {room.name}
                  </h3>
                  <p className="font-body text-body-meta text-truecost-text-muted">
                    {ROOM_TYPE_LABELS[room.type]}
                  </p>
                </div>
                <span className="text-xs bg-truecost-cyan/20 text-truecost-cyan px-2 py-0.5 rounded-full">
                  {room.sourceApp === 'canvas' ? 'LiDAR' : room.sourceApp === 'arcore' ? 'ARCore' : 'Manual'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-body text-body-meta text-truecost-text-muted">
                    Dimensions
                  </p>
                  <p className="font-body text-body text-truecost-text-primary">
                    {room.dimensions.length}' x {room.dimensions.width}'
                  </p>
                </div>
                <div>
                  <p className="font-body text-body-meta text-truecost-text-muted">
                    Area
                  </p>
                  <p className="font-body text-body text-truecost-cyan">
                    {room.dimensions.area} sq ft
                  </p>
                </div>
                <div>
                  <p className="font-body text-body-meta text-truecost-text-muted">
                    Ceiling
                  </p>
                  <p className="font-body text-body text-truecost-text-primary">
                    {room.dimensions.height}'
                  </p>
                </div>
              </div>

              {room.features.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-truecost-glass-border">
                  {room.features.map((f, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-truecost-glass-bg text-truecost-text-secondary px-2 py-1 rounded-full border border-truecost-glass-border"
                    >
                      {f.count} {FEATURE_TYPE_LABELS[f.type]}
                      {f.count !== 1 ? 's' : ''}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleDeleteRoom(room.id)}
                className="mt-3 font-body text-body-meta text-truecost-danger hover:text-truecost-danger/80"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="primary" onClick={handleFinish} className="flex-1">
            Generate Scope from Rooms
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onRoomsScanned(rooms);
            }}
          >
            Save Without Scope
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
