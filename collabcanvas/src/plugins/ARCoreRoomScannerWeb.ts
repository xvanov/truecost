/**
 * ARCore Room Scanner Web Implementation
 *
 * Fallback implementation for web/non-Android platforms.
 * Returns not supported since ARCore only works on Android.
 */

import { WebPlugin } from '@capacitor/core';
import type {
  ARCoreRoomScannerPlugin,
  ARCoreAvailability,
  ARCorePermission,
  ARCoreInstallStatus,
  ScanResult,
} from './ARCoreRoomScanner';

export class ARCoreRoomScannerWeb
  extends WebPlugin
  implements ARCoreRoomScannerPlugin
{
  async checkAvailability(): Promise<ARCoreAvailability> {
    return {
      isSupported: false,
      hasDepthSupport: false,
      reason: 'ARCore is only available on Android devices',
    };
  }

  async requestPermission(): Promise<ARCorePermission> {
    return {
      granted: false,
      reason: 'ARCore is only available on Android devices',
    };
  }

  async startScan(): Promise<ScanResult> {
    return {
      success: false,
      reason: 'ARCore is only available on Android devices. Please use manual room entry.',
    };
  }

  async installARCore(): Promise<ARCoreInstallStatus> {
    return {
      status: 'INSTALL_REQUESTED',
      installed: false,
    };
  }
}
