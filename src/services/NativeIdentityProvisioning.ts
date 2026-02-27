/**
 * Native Identity Provisioning Bridge
 *
 * Bridges TypeScript to iOS native identity provisioning
 * Handles device-based key generation, server registration, and local storage
 *
 * LIB-CLIENT CRYPTO (DO NOT DRIFT):
 * - Identity (identity.rs):
 *   generate_identity(device_id) -> Identity        // Dilithium5 keypair
 *   restore_identity_from_seed(seed, device_id)
 *   sign_message(identity, message) -> Vec<u8>
 *   verify_signature(pk, message, sig) -> bool
 *   serialize_identity(identity) -> String
 *   deserialize_identity(json) -> Identity
 * - Handshake (handshake.rs):
 *   HandshakeState::new(identity, channel_binding)
 *     .create_client_hello() -> Vec<u8>
 *     .process_server_hello(data) -> Vec<u8>
 *     .finalize() -> HandshakeResult
 * - Channel binding (if used by transport):
 *   compute_channel_binding(local_addr, peer_addr) -> Vec<u8>
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

interface LocalIdentityResult {
  status: 'found' | 'missing';
  identity_id?: string;
  did?: string;
  device_id?: string;
  created_at?: number;
  identity_type?: string;
  reason?: string;
  error?: string;
}

interface BackupFileResult {
  path: string;
  uri?: string;
  fileName?: string;
}

interface PublicIdentity {
  did: string;
  publicKey: string; // base64
  kyberPublicKey: string; // base64
  nodeId: string; // base64
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
      } else if (__DEV__) {
        const hasSignForDid =
          typeof this.nativeModule.signMessageForDid === 'function';
        const hasSignFromSeed =
          typeof this.nativeModule.signMessageFromSeed === 'function';
        console.log(
          '[NativeIdentityProvisioning] signMessageForDid available:',
          hasSignForDid,
        );
        console.log(
          '[NativeIdentityProvisioning] signMessageFromSeed available:',
          hasSignFromSeed,
        );
      }
    }
  }

  /**
   * Generate identity locally on device
   * Returns generated identity - TypeScript then handles QUIC server registration
   */
  async generateLocalIdentity(
    displayName: string,
  ): Promise<GeneratedIdentityData> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.generateLocalIdentity(displayName);
  }

  /**
   * Provision identity (alias for generateLocalIdentity for backwards compatibility)
   * Generates keys locally, returns generated identity for QUIC server registration
   */
  async provisionIdentity(
    displayName: string,
    serverUrl: string,
  ): Promise<GeneratedIdentityData> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    // Call native provisionIdentity which generates keys and caches them
    return await this.nativeModule.provisionIdentity(displayName, serverUrl);
  }

  /**
   * Create registration proof with signature for QUIC POST
   * Called after generating identity to get the proof data for server registration
   */
  async createRegistrationProof(
    displayName: string,
    didData: any,
  ): Promise<any> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.createRegistrationProof(
      displayName,
      didData,
    );
  }

  /**
   * Store provisioned identity after server registration
   * Called after successful QUIC POST to /api/v1/identity/register
   */
  async storeProvisionedIdentity(
    identityId: string,
    didData: any,
  ): Promise<ProvisioningResult> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.storeProvisionedIdentity(
      identityId,
      didData,
    );
  }

  /**
   * Restore identity to native handle store (for UHP signing)
   */
  async restoreIdentityToHandleStore(identityId: string): Promise<any> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.restoreIdentityToHandleStore(identityId);
  }

  /**
   * Check for local identity materials without server access
   */
  async getLocalIdentity(
    identityIdOrDid: string,
  ): Promise<LocalIdentityResult> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.getLocalIdentity) {
      return { status: 'missing', reason: 'not_supported' };
    }

    return await this.nativeModule.getLocalIdentity(identityIdOrDid);
  }

  /**
   * Get 24-word master seed phrase for backup
   * Derived locally from lib-client master seed
   */
  async getSeedPhraseForBackup(did: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.getSeedPhraseForBackup(did);
  }

  /**
   * Get 24-word seed phrase from locally stored identity materials
   */
  async getSeedPhraseFromStoredIdentity(
    identityIdOrDid: string,
  ): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.getSeedPhraseFromStoredIdentity) {
      throw new Error(
        'NativeIdentityProvisioning.getSeedPhraseFromStoredIdentity not available',
      );
    }

    return await this.nativeModule.getSeedPhraseFromStoredIdentity(
      identityIdOrDid,
    );
  }

  /**
   * Export identity keystore as a base64 blob for backup payload generation.
   */
  async exportKeystoreBase64(identityIdOrDid: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.exportKeystoreBase64) {
      throw new Error(
        'NativeIdentityProvisioning.exportKeystoreBase64 not available',
      );
    }

    return await this.nativeModule.exportKeystoreBase64(identityIdOrDid);
  }

  /**
   * Create a backup file on-device and return its URI/path for sharing.
   */
  async createBackupFile(
    fileName: string,
    content: string,
  ): Promise<BackupFileResult> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.createBackupFile) {
      throw new Error(
        'NativeIdentityProvisioning.createBackupFile not available',
      );
    }

    return await this.nativeModule.createBackupFile(fileName, content);
  }

  /**
   * iOS-only: open system export picker to save backup file to Files/Downloads.
   */
  async exportBackupFile(filePath: string): Promise<{
    saved: boolean;
    cancelled?: boolean;
    destination?: string;
  }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.exportBackupFile) {
      throw new Error(
        'NativeIdentityProvisioning.exportBackupFile not available',
      );
    }

    return await this.nativeModule.exportBackupFile(filePath);
  }

  /**
   * Restore identity from 24-word master seed phrase
   * Returns a locally restored identity (must be registered/saved by caller)
   */
  async restoreIdentityFromPhrase(phrase: string): Promise<any> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.restoreIdentityFromPhrase(phrase);
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
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
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
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
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
    nonce: number;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.signTokenTransferTransaction(params);
  }

  /**
   * Sign a token burn transaction with Dilithium keypair
   * Returns hex-encoded signed transaction ready for API
   */
  async signTokenBurnTransaction(params: {
    tokenId: string;
    amount: number;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.signTokenBurnTransaction(params);
  }

  /**
   * Sign a SOV wallet-to-wallet transfer transaction with Dilithium keypair
   * Uses wallet IDs (32 bytes each) instead of token_id + pubkey
   * Returns hex-encoded signed transaction ready for API
   */
  async signSovWalletTransferTransaction(params: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    nonce: number;
    chainId?: number;
  }): Promise<{ signed_tx: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    return await this.nativeModule.signSovWalletTransferTransaction(params);
  }

  /**
   * Pass fee config JSON (from server) to Rust for cached fee computation.
   * Returns updatedAt height and current chain height.
   */
  async setFeeConfig(configJson: string): Promise<{
    ok: boolean;
    updatedAt: number;
    chainHeight: number;
  }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    return await this.nativeModule.setFeeConfig(configJson);
  }

  /**
   * Quote exact fee for a hex-encoded transaction.
   * Returns fee in atomic units.
   */
  async quoteFeeForTxHex(txHex: string): Promise<number> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    return await this.nativeModule.quoteFeeForTxHex(txHex);
  }

  /**
   * Build a signed domain registration request (JSON for REST API)
   * lib-client builds the complete request body with signature + timestamp
   */
  async signDomainRegisterRequest(params: {
    domain: string;
    contentMappingsJson?: string | null;
  }): Promise<{ request_json: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.signDomainRegisterRequest) {
      throw new Error(
        'NativeIdentityProvisioning.signDomainRegisterRequest not available',
      );
    }

    return await this.nativeModule.signDomainRegisterRequest(params);
  }

  /**
   * Build a signed domain update request (JSON for REST API)
   * Uses manifest CID versioning with compare-and-swap
   */
  async signDomainUpdateRequest(params: {
    domain: string;
    newManifestCid: string;
    expectedPreviousManifestCid: string;
  }): Promise<{ request_json: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.signDomainUpdateRequest) {
      throw new Error(
        'NativeIdentityProvisioning.signDomainUpdateRequest not available',
      );
    }

    return await this.nativeModule.signDomainUpdateRequest(params);
  }

  /**
   * Build a signed domain transfer request (JSON for REST API)
   * Transfers domain ownership to another DID
   */
  async signDomainTransferRequest(params: {
    domain: string;
    toOwnerDid: string;
  }): Promise<{ request_json: string }> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.signDomainTransferRequest) {
      throw new Error(
        'NativeIdentityProvisioning.signDomainTransferRequest not available',
      );
    }

    return await this.nativeModule.signDomainTransferRequest(params);
  }

  /**
   * Sign an arbitrary message with Dilithium keypair
   * Returns hex-encoded signature
   */
  async signMessage(message: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }

    if (!this.nativeModule.signMessage) {
      throw new Error('NativeIdentityProvisioning.signMessage not available');
    }

    const result = await this.nativeModule.signMessage(message);
    if (!result?.signature) {
      throw new Error(
        'NativeIdentityProvisioning.signMessage returned no signature',
      );
    }
    return result.signature;
  }

  /**
   * Get current public identity material.
   */
  async getPublicIdentity(): Promise<PublicIdentity> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    if (!this.nativeModule.getPublicIdentity) {
      throw new Error(
        'NativeIdentityProvisioning.getPublicIdentity not available',
      );
    }
    return await this.nativeModule.getPublicIdentity();
  }

  /**
   * Sign PoUW receipt JSON via canonical Rust path (JSON -> Receipt -> bincode -> Dilithium5).
   * Returns base64 signature for controller compatibility.
   */
  async signPouwReceipt(receiptJson: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    if (!this.nativeModule.signPouwReceipt) {
      throw new Error(
        'NativeIdentityProvisioning.signPouwReceipt not available',
      );
    }
    return await this.nativeModule.signPouwReceipt(receiptJson);
  }

  /**
   * Sign an arbitrary message with a specific cached identity (by DID)
   * Returns hex-encoded signature
   */
  async signMessageForDid(did: string, message: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    if (!this.nativeModule.signMessageForDid) {
      throw new Error(
        'NativeIdentityProvisioning.signMessageForDid not available',
      );
    }
    const result = await this.nativeModule.signMessageForDid(did, message);
    if (!result?.signature) {
      throw new Error(
        'NativeIdentityProvisioning.signMessageForDid returned no signature',
      );
    }
    return result.signature;
  }

  /**
   * Sign an arbitrary message using a seed phrase (restores identity internally)
   * Returns hex-encoded signature
   */
  async signMessageFromSeed(phrase: string, message: string): Promise<string> {
    if (!this.nativeModule) {
      throw new Error(
        'NativeIdentityProvisioning not available on this platform',
      );
    }
    if (!this.nativeModule.signMessageFromSeed) {
      throw new Error(
        'NativeIdentityProvisioning.signMessageFromSeed not available',
      );
    }
    const startedAt = Date.now();
    // Avoid logging sensitive values (seed phrase / message contents).
    console.log(
      '[NativeIdentityProvisioning] signMessageFromSeed calling native',
      {
        phraseWordCount: phrase.trim().split(/\s+/).filter(Boolean).length,
        messageLen: message.length,
      },
    );
    const result = await this.nativeModule.signMessageFromSeed(phrase, message);
    console.log(
      '[NativeIdentityProvisioning] signMessageFromSeed native returned',
      {
        elapsedMs: Date.now() - startedAt,
        hasSignature: Boolean(result?.signature),
      },
    );
    if (!result?.signature) {
      throw new Error(
        'NativeIdentityProvisioning.signMessageFromSeed returned no signature',
      );
    }
    return result.signature;
  }
}

// Export singleton instance
export const nativeIdentityProvisioning =
  new NativeIdentityProvisioningBridge();

// Canonical alias used by lib-client/react-native/js PoUWController.
export const identityProvisioning = nativeIdentityProvisioning;

// Export types for use throughout app
export type { GeneratedIdentityData, ProvisioningResult, PublicIdentity };
