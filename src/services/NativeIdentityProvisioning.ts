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
  status: 'generated';
  did: string;
  deviceId: string;
  publicDilithium: string; // base64
  publicKyber: string; // base64
  timestamp: number;
  masterSeedHex: string; // For user backup only
}

interface ProvisioningResult {
  status: 'provisioned';
  identity_id: string;
  did: string;
}

/**
 * Native bridge to iOS identity provisioning
 * Only available on iOS platform
 */
class NativeIdentityProvisioningBridge {
  private nativeModule: any;

  constructor() {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      this.nativeModule = NativeModules.NativeIdentityProvisioning;
      if (!this.nativeModule) {
        console.warn('⚠️ NativeIdentityProvisioning module not found');
      }
    }
  }

  /**
   * Generate identity locally on device
   * Returns generated identity - TypeScript then handles QUIC server registration
   */
  async generateLocalIdentity(displayName: string): Promise<GeneratedIdentityData> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.generateLocalIdentity(displayName);
  }

  /**
   * Provision identity (alias for generateLocalIdentity for backwards compatibility)
   * Generates keys locally, returns generated identity for QUIC server registration
   */
  async provisionIdentity(displayName: string, serverUrl: string): Promise<GeneratedIdentityData> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    // Call native provisionIdentity which generates keys and caches them
    return await this.nativeModule.provisionIdentity(displayName, serverUrl);
  }

  /**
   * Create registration proof with signature for QUIC POST
   * Called after generating identity to get the proof data for server registration
   */
  async createRegistrationProof(displayName: string, didData: any): Promise<any> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.createRegistrationProof(displayName, didData);
  }

  /**
   * Store provisioned identity after server registration
   * Called after successful QUIC POST to /api/v1/identity/register
   */
  async storeProvisionedIdentity(identityId: string, didData: any): Promise<ProvisioningResult> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.storeProvisionedIdentity(identityId, didData);
  }

  /**
   * Sign a token creation transaction with Dilithium keypair
   * Private key remains in device Keychain - never reaches JavaScript
   * Returns hex-encoded signed transaction ready for API
   */
  async signTokenCreateTransaction(params: {
    name: string;
    symbol: string;
    initialSupply: number;
    decimals: number;
    maxSupply: number | null;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.signTokenCreateTransaction(params);
  }

  /**
   * Sign a token mint transaction with Dilithium keypair
   * Returns hex-encoded signed transaction ready for API
   */
  async signTokenMintTransaction(params: {
    tokenId: string;
    amount: number;
    recipientDid: string;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.signTokenMintTransaction(params);
  }

  /**
   * Sign a token transfer transaction with Dilithium keypair
   * Returns hex-encoded signed transaction ready for API
   */
  async signTokenTransferTransaction(params: {
    tokenId: string;
    toAddress: string;
    amount: number;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error('NativeIdentityProvisioning not available on this platform');
    }

    return await this.nativeModule.signTokenTransferTransaction(params);
  }
}

// Export singleton instance
export const nativeIdentityProvisioning = new NativeIdentityProvisioningBridge();

// Export types for use throughout app
export type { GeneratedIdentityData, ProvisioningResult };
