/**
 * Native Identity Provisioning Bridge
 *
 * Bridges TypeScript to iOS native identity provisioning
 * Handles device-based key generation, server registration, and local storage
 *
 * SECURITY: Private keys NEVER leave device or reach JavaScript
 */

import { NativeModules, Platform } from 'react-native';

interface GeneratedIdentityData {
  did: string;
  deviceId: string;
  timestamp: number;
  publicKeySize: number;
  kyberPublicKeySize: number;
  nodeIdSize: number;
  masterSeedHex: string; // For user backup only
}

interface ServerRegistrationResponse {
  status: string;
  identity_id: string;
  did: string;
  device_id: string;
  pqc_enabled: boolean;
}

interface ProvisioningResult {
  status: 'provisioned';
  identity_id: string;
  did: string;
  device_id: string;
  pqc_enabled: boolean;
  masterSeedHex: string; // For user backup/recovery
}

/**
 * Native bridge to iOS identity provisioning
 * Only available on iOS platform
 */
class NativeIdentityProvisioningBridge {
  private nativeModule: any;

  constructor() {
    if (Platform.OS === 'ios') {
      this.nativeModule = NativeModules.NativeIdentityProvisioning;
      if (!this.nativeModule) {
        console.warn('⚠️ NativeIdentityProvisioning module not found');
      }
    }
  }

  /**
   * Generate identity locally on device
   * Returns public info only - private keys stay in Keychain
   */
  async generateLocalIdentity(displayName: string): Promise<GeneratedIdentityData> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return new Promise((resolve, reject) => {
      this.nativeModule.generateLocalIdentity(
        displayName,
        (result: GeneratedIdentityData) => resolve(result),
        (error: string) => reject(new Error(error))
      );
    });
  }

  /**
   * Register identity with server
   * Server validates Dilithium5 signature and stores public identity
   */
  async registerWithServer(
    identityData: GeneratedIdentityData,
    displayName: string,
    serverUrl: string
  ): Promise<ServerRegistrationResponse> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return new Promise((resolve, reject) => {
      this.nativeModule.registerWithServer(
        identityData,
        displayName,
        serverUrl,
        (result: ServerRegistrationResponse) => resolve(result),
        (error: string) => reject(new Error(error))
      );
    });
  }

  /**
   * Complete provisioning flow: generate → register → store
   * Returns identity_id for UHP handshake
   */
  async provisionIdentity(displayName: string, serverUrl: string): Promise<ProvisioningResult> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return new Promise((resolve, reject) => {
      this.nativeModule.provisionIdentity(
        displayName,
        serverUrl,
        (result: ProvisioningResult) => resolve(result),
        (error: string) => reject(new Error(error))
      );
    });
  }
}

// Export singleton instance
export const nativeIdentityProvisioning = new NativeIdentityProvisioningBridge();

// Export types for use throughout app
export type { GeneratedIdentityData, ServerRegistrationResponse, ProvisioningResult };
