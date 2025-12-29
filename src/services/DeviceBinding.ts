/**
 * Device Binding Service
 * Binds identity to specific device to prevent unauthorized portability
 *
 * SECURITY: Phase 4.4 - Device Binding
 * - Generates unique device fingerprint
 * - Binds identity to device hardware
 * - Detects device changes/spoofing
 * - Prevents identity portability attacks
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/**
 * Device fingerprint data
 */
export interface DeviceFingerprint {
  deviceId: string;
  model: string;
  manufacturer: string;
  osVersion: string;
  buildId: string;
  serialNumber?: string;
  hardwareFingerprint: string;
  timestamp: number;
}

/**
 * Device binding result
 */
export interface DeviceBindingResult {
  isBound: boolean;
  currentFingerprint: DeviceFingerprint;
  boundFingerprint?: DeviceFingerprint;
  matches: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  warnings: string[];
  timestamp: number;
}

/**
 * Device binding service
 * SECURITY: Phase 4.4 - Device identity verification
 */
class DeviceBinding {
  private boundDeviceId: string | null = null;
  private boundFingerprint: DeviceFingerprint | null = null;

  /**
   * Generate unique device fingerprint
   * SECURITY: Phase 4.4 - Hardware identification
   */
  async generateDeviceFingerprint(): Promise<DeviceFingerprint> {
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      const model = await DeviceInfo.getModel();
      const manufacturer = await DeviceInfo.getManufacturer();
      const osVersion = await DeviceInfo.getSystemVersion();
      const buildId = await DeviceInfo.getBuildId();

      // Android-specific: Try to get serial number
      let serialNumber: string | undefined;
      if (Platform.OS === 'android') {
        try {
          serialNumber = await DeviceInfo.getSerialNumber();
        } catch (error) {
          // Serial number may not be accessible
        }
      }

      // Generate hardware fingerprint
      const fingerprintData = `${deviceId}-${model}-${manufacturer}-${osVersion}`;
      const hardwareFingerprint = this.hashFingerprint(fingerprintData);

      const fingerprint: DeviceFingerprint = {
        deviceId,
        model,
        manufacturer,
        osVersion,
        buildId,
        serialNumber,
        hardwareFingerprint,
        timestamp: Date.now(),
      };

      if (__DEV__) {
        console.log('📱 DeviceBinding: Generated fingerprint', {
          deviceId,
          model,
          manufacturer,
          osVersion,
        });
      }

      return fingerprint;
    } catch (error) {
      console.error('❌ DeviceBinding: Failed to generate fingerprint', error);
      throw new Error('Cannot generate device fingerprint');
    }
  }

  /**
   * Bind identity to current device
   * SECURITY: Phase 4.4 - Device locking
   */
  async bindIdentityToDevice(identityId: string): Promise<DeviceBindingResult> {
    try {
      const currentFingerprint = await this.generateDeviceFingerprint();

      // Store binding
      this.boundDeviceId = currentFingerprint.deviceId;
      this.boundFingerprint = currentFingerprint;

      if (__DEV__) {
        console.log('✅ DeviceBinding: Identity bound to device', {
          identityId,
          deviceId: currentFingerprint.deviceId,
        });
      }

      return {
        isBound: true,
        currentFingerprint,
        boundFingerprint: currentFingerprint,
        matches: true,
        riskLevel: 'none',
        warnings: [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('❌ DeviceBinding: Failed to bind identity', error);
      throw error;
    }
  }

  /**
   * Verify identity is still bound to same device
   * SECURITY: Phase 4.4 - Device verification
   */
  async verifyDeviceBinding(
    boundFingerprint: DeviceFingerprint
  ): Promise<DeviceBindingResult> {
    try {
      const currentFingerprint = await this.generateDeviceFingerprint();
      const warnings: string[] = [];
      let riskLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

      // Check exact device match
      const deviceIdMatches = currentFingerprint.deviceId === boundFingerprint.deviceId;
      const modelMatches = currentFingerprint.model === boundFingerprint.model;
      const manufacturerMatches =
        currentFingerprint.manufacturer === boundFingerprint.manufacturer;
      const hardwareFingerprintMatches =
        currentFingerprint.hardwareFingerprint === boundFingerprint.hardwareFingerprint;

      // Assess risk
      if (!hardwareFingerprintMatches) {
        warnings.push('Hardware fingerprint mismatch');
        riskLevel = 'high';
      }

      if (!deviceIdMatches) {
        warnings.push('Device ID changed');
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
      }

      if (!modelMatches) {
        warnings.push('Device model changed');
        riskLevel = riskLevel === 'high' ? 'high' : 'low';
      }

      if (!manufacturerMatches) {
        warnings.push('Device manufacturer changed');
        riskLevel = riskLevel === 'high' ? 'high' : 'low';
      }

      // Check OS version change (minor risk - updates expected)
      if (currentFingerprint.osVersion !== boundFingerprint.osVersion) {
        warnings.push('OS version updated');
        if (riskLevel === 'none') {
          riskLevel = 'low';
        }
      }

      const matches = hardwareFingerprintMatches && deviceIdMatches;

      if (__DEV__) {
        console.log('📱 DeviceBinding: Verification result', {
          matches,
          riskLevel,
          warnings,
        });
      }

      if (warnings.length > 0) {
        console.warn('⚠️ DeviceBinding: Device changes detected', warnings);
      }

      return {
        isBound: true,
        currentFingerprint,
        boundFingerprint,
        matches,
        riskLevel,
        warnings,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('❌ DeviceBinding: Failed to verify binding', error);
      throw error;
    }
  }

  /**
   * Check if device should be trusted
   * SECURITY: Phase 4.4 - Policy enforcement
   */
  shouldTrustDevice(result: DeviceBindingResult, strictMode: boolean = !__DEV__): boolean {
    if (strictMode) {
      // Production: Require exact match
      return result.matches && result.riskLevel === 'none';
    }

    // Development: Allow some changes
    return result.riskLevel !== 'high';
  }

  /**
   * Get device risk assessment
   */
  getRiskAssessment(result: DeviceBindingResult): string {
    if (result.riskLevel === 'none') {
      return '✅ Device is trusted and unchanged';
    }

    if (result.riskLevel === 'low') {
      return '⚠️ Low risk: Minor device changes detected (OS update?)';
    }

    if (result.riskLevel === 'medium') {
      return '🟠 Medium risk: Device appears to have changed';
    }

    return '🔴 High risk: Device hardware signature mismatch - possible compromise or device replacement';
  }

  /**
   * Clear device binding
   */
  clearBinding(): void {
    this.boundDeviceId = null;
    this.boundFingerprint = null;

    if (__DEV__) {
      console.log('🗑️ DeviceBinding: Binding cleared');
    }
  }

  /**
   * Get bound device info
   */
  getBoundDeviceInfo(): DeviceFingerprint | null {
    return this.boundFingerprint;
  }

  /**
   * Private helpers
   */
  private hashFingerprint(data: string): string {
    // Simple hash for fingerprinting - in production use crypto module
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `fp_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Global device binding instance
 */
export const deviceBinding = new DeviceBinding();

export default DeviceBinding;
