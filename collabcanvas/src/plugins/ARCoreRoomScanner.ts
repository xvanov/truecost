/**
 * ARCore Room Scanner Plugin
 *
 * TypeScript interface for the native Android ARCore room scanning plugin.
 * Uses ARCore SDK 1.47.0 with Plane Detection and Depth API for room measurement.
 */

import { registerPlugin } from '@capacitor/core';

export interface ARCoreAvailability {
  isSupported: boolean;
  hasDepthSupport: boolean;
  reason?: string;
}

export interface ARCorePermission {
  granted: boolean;
  reason?: string;
}

export interface ARCoreInstallStatus {
  status: 'INSTALLED' | 'INSTALL_REQUESTED';
  installed: boolean;
}

export interface RoomDimensions {
  length: number;
  width: number;
  height: number;
  area: number;
  volume: number;
}

export interface RoomFeature {
  type: 'window' | 'door';
  count: number;
}

export interface ScanResult {
  success: boolean;
  dimensions?: RoomDimensions;
  features?: RoomFeature[];
  sourceApp?: 'arcore';
  reason?: string;
}

export interface ARCoreRoomScannerPlugin {
  /**
   * Check if ARCore is available on this device
   */
  checkAvailability(): Promise<ARCoreAvailability>;

  /**
   * Request camera permission for AR scanning
   */
  requestPermission(): Promise<ARCorePermission>;

  /**
   * Start the AR room scanning activity
   * Returns room dimensions and detected features when scan completes
   */
  startScan(): Promise<ScanResult>;

  /**
   * Install or update ARCore if needed
   */
  installARCore(): Promise<ARCoreInstallStatus>;
}

const ARCoreRoomScanner = registerPlugin<ARCoreRoomScannerPlugin>(
  'ARCoreRoomScanner',
  {
    web: () => import('./ARCoreRoomScannerWeb').then((m) => new m.ARCoreRoomScannerWeb()),
  }
);

export default ARCoreRoomScanner;
