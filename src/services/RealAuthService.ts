/**
 * Real Authentication Service
 * Thin wrapper around native NativeZhtpApi module
 * All network calls go through native QUIC layer
 *
 * SECURITY: Phase 3.2 - Certificate Pinning Integration
 * Configured via CertificatePinning service at QUIC transport level
 *
 * SECURITY: Phase 3.3 - Device-Based Identity Provisioning
 * iOS/Android: Keys generated locally, private keys in Keychain only
 */

import { NativeModules, Platform } from 'react-native';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import { walletKeychainService } from './WalletKeychainService';
import SecureIdentityStorage from './SecureIdentityStorage';
import { DEFAULT_SOV_NODE_URL, DEFAULT_NODE_HOST, DEFAULT_NODE_PORT, QUIC_CONFIG } from '../config';
import { isQuicSupported, testQuicConnection } from './QuicClient';
import { createQuicFetchAdapterSync, FetchAdapter } from './QuicFetchAdapter';
import IdentityCleanup from './IdentityCleanup';
import SeedVaultService from './SeedVaultService';
import { maskIdentifier } from '../utils/maskIdentifier';

const { NativeZhtpApi } = NativeModules;

export interface SignInCredentials {
  identity_id: string;
  password: string;
}

export interface CreateIdentityData {
  display_name: string;
  password: string;
  identity_type?: string;
  recovery_options?: string[];
}

export interface Identity {
  identityId: string;
  did: string;
  displayName: string;
  identityType: string;
  deviceId?: string;
  createdAt?: number;
  masterSeedPhrase?: string;
}

export interface MigrationResult {
  identity: Identity;
  newSeedPhrase: string[];
}

/**
 * Real auth service using native NativeZhtpApi module
 * All 4 core methods delegate to native layer
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

class RealAuthService {
  private readonly nodeUrl: string;
  private readonly quicFetch: FetchAdapter;
  private lastSeedRecoveryNotFound = false;

  constructor(nodeUrl: string) {
    this.nodeUrl = nodeUrl;
    this.quicFetch = createQuicFetchAdapterSync({
      insecure: QUIC_CONFIG.insecure,
      timeout: QUIC_CONFIG.defaultTimeout,
    });
    console.log('[RealAuthService] Initialized with node URL:', nodeUrl);
  }

  /**
   * Sign in with identity ID and password
   * @param credentials - Identity ID and password
   * @returns Identity object or throws specific error
   */
  async signIn(credentials: SignInCredentials): Promise<Identity> {
    try {
      const maskedId = maskIdentifier(credentials.identity_id);
      console.log('[RealAuthService] signIn called for:', maskedId);

      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      // Local-first: if identity materials exist on device, restore and skip network login
      try {
        const local = await nativeIdentityProvisioning.getLocalIdentity(credentials.identity_id);
        if (local?.status === 'found' && local.identity_id && local.did) {
          const restore = await nativeIdentityProvisioning.restoreIdentityToHandleStore(local.identity_id);
          if (restore?.status === 'restored') {
            const identity: Identity = {
              identityId: local.identity_id,
              did: local.did,
              displayName: local.did,
              identityType: local.identity_type || 'Human',
              deviceId: local.device_id,
              createdAt: local.created_at,
            };
            console.log('[RealAuthService] ✅ Local identity restored, skipping server login');
            await this.storeIdentity(identity);
            return identity;
          } else {
            console.warn('[RealAuthService] ⚠️ Local restore skipped:', restore);
          }
        }
      } catch (err) {
        console.warn('[RealAuthService] ⚠️ Local identity check failed, falling back to server login:', err);
      }

      const identity = await NativeZhtpApi.signIn(
        credentials.identity_id,
        credentials.password,
        this.nodeUrl
      );

      console.log('✅ Signed in successfully:', identity.displayName);

      // Store identity in Keychain
      await this.storeIdentity(identity);

      // Restore identity to native handle store for UHP signing
      try {
        await nativeIdentityProvisioning.restoreIdentityToHandleStore(identity.identityId);
      } catch (err) {
        console.warn('[RealAuthService] Failed to restore identity to handle store:', err);
      }

      return identity;
    } catch (error: any) {
      console.error('[RealAuthService] signIn failed:', error);
      throw error;
    }
  }

  /**
   * Create a new citizen identity
   * Delegates to NativeIdentityProvisioning for device-based provisioning
   * @param data - Identity creation data
   * @returns Newly created identity with master seed phrase (if available)
   */
  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    try {
      console.log('[RealAuthService] createIdentity called');

      // Validation
      if (!data.display_name || data.display_name.length < 2) {
        throw new Error('Display name must be at least 2 characters');
      }

      if (!data.password || data.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        return await this.createIdentityDevice(data);
      }

      throw new Error('Identity creation not available on this platform');
    } catch (error: any) {
      console.error('[RealAuthService] createIdentity failed:', error);
      throw error;
    }
  }

  /**
   * Check if a username is available (public endpoint)
   */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    const normalized = username.trim();
    if (!normalized) {
      throw new Error('Username is required');
    }

    const encoded = encodeURIComponent(normalized);
    const url = `quic://${DEFAULT_NODE_HOST}:${DEFAULT_NODE_PORT}/api/v1/identity/username/available/${encoded}`;
    const response = await this.quicFetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to check username availability`);
    }

    const data = await response.json();
    return Boolean(data?.available);
  }

  /**
   * Create identity on device using native provisioning + QUIC registration
   */
  private async createIdentityDevice(data: CreateIdentityData): Promise<Identity> {
    try {
      const nodeUrl = this.nodeUrl.replace(/\/+$/, '');

      console.log('[RealAuthService] 🔑 Starting identity provisioning...');
      console.log('[RealAuthService]    Display name: ' + data.display_name);
      console.log('[RealAuthService]    Server URL: ' + nodeUrl);

      let generatedIdentity;
      try {
        generatedIdentity = await nativeIdentityProvisioning.provisionIdentity(
          data.display_name,
          nodeUrl
        );
      } catch (nativeError: any) {
        console.error('[RealAuthService] ❌ Native key generation failed:', nativeError);
        throw new Error('Device-based key generation failed: ' + (nativeError.message || nativeError.toString()));
      }

      console.log('[RealAuthService] ✅ Identity generated locally:');
      console.log('[RealAuthService]    DID: ' + maskIdentifier(generatedIdentity.did));
      console.log('[RealAuthService]    Device: ' + generatedIdentity.deviceId);

      let registrationProof;
      try {
        registrationProof = await nativeIdentityProvisioning.createRegistrationProof(
          data.display_name,
          { did: generatedIdentity.did }
        );
      } catch (proofError: any) {
        console.error('[RealAuthService] ❌ Proof creation failed:', proofError);
        throw new Error('Failed to create registration proof: ' + (proofError.message || proofError.toString()));
      }

      console.log('[RealAuthService] ✅ Registration proof created');

      let identityId = '';
      let masterSeedPhrase = '';
      try {
        console.log('[RealAuthService] 🔐 Registering identity via /api/v1/identity/register...');
        const registerRequest = {
          public_key: registrationProof.public_key,
          kyber_public_key: registrationProof.kyber_public_key,
          device_id: registrationProof.device_id,
          display_name: data.display_name,
          identity_type: 'human',
          registration_proof: registrationProof.registration_proof,
          timestamp: registrationProof.timestamp,
        };

        const registerResponse = await this.quicFetch(`${nodeUrl}/api/v1/identity/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerRequest),
        });

        if (!registerResponse.ok) {
          const bodyText = await registerResponse.text();
          if (registerResponse.status === 409 && bodyText.includes('Identity already registered')) {
            identityId = generatedIdentity.did.startsWith('did:zhtp:')
              ? generatedIdentity.did.substring('did:zhtp:'.length)
              : generatedIdentity.did;
            console.warn('[RealAuthService] ⚠️ Identity already registered, continuing with derived identity ID');
          } else {
            throw new Error(`HTTP ${registerResponse.status}: ${bodyText}`);
          }
        } else {
          const registrationResponse = await registerResponse.json();
          identityId = registrationResponse.identity_id || '';
          const serverDid = registrationResponse.did;

          // Mobile flow derives seed phrase locally; ignore server phrases.

          console.log('[RealAuthService] ✅ Server registration succeeded');
          console.log('[RealAuthService]    Identity ID: ' + identityId);
          if (serverDid) {
            generatedIdentity.did = serverDid;
          }
        }
      } catch (serverError: any) {
        console.error('[RealAuthService] ❌ Server registration failed:', serverError);
        throw new Error('Server registration failed: ' + (serverError.message || serverError.toString()));
      }

      try {
        await nativeIdentityProvisioning.storeProvisionedIdentity(
          identityId,
          { did: generatedIdentity.did }
        );
        console.log('[RealAuthService] ✅ Identity provisioned and stored');
      } catch (storeError: any) {
        console.error('[RealAuthService] ⚠️ Keychain storage failed:', storeError);
      }

      try {
        masterSeedPhrase = await nativeIdentityProvisioning.getSeedPhraseForBackup(
          generatedIdentity.did
        );
      } catch (phraseError: any) {
        console.warn('[RealAuthService] ⚠️ Failed to fetch master seed phrase:', phraseError);
      }

      try {
        await nativeIdentityProvisioning.restoreIdentityToHandleStore(identityId);
      } catch (err) {
        console.warn('[RealAuthService] Failed to restore identity to handle store:', err);
      }

      const identity: Identity = {
        did: generatedIdentity.did,
        displayName: data.display_name,
        identityId: identityId,
        identityType: 'human',
        deviceId: generatedIdentity.deviceId,
        createdAt: generatedIdentity.timestamp,
        masterSeedPhrase: masterSeedPhrase || undefined,
      };

      await this.storeIdentity(identity);
      return identity;
    } catch (error: any) {
      console.error('❌ Device identity provisioning failed:', error);
      throw new Error(error.message || 'Failed to provision identity on device');
    }
  }

  /**
   * Test connection to node
   * Simple health check via GET /api/v1/protocol/health
   * @returns true if connected, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[👆 testConnection] QUIC reachability check');
      const supported = await isQuicSupported();
      console.log(`[👆 testConnection] QUIC supported: ${supported}`);
      if (!supported) {
        return false;
      }
      const result = await testQuicConnection(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);
      const connected = !!result.success;
      console.log('[👆 testConnection]', connected ? '✅ CONNECTED' : '❌ DISCONNECTED');
      return connected;
    } catch (error: any) {
      console.error('[👆 testConnection] ❌ Exception:', error.message);
      return false;
    }
  }

  /**
   * Get comprehensive protocol and node information
   * @returns Protocol info object or null on error
   */
  async getProtocolInfo(): Promise<any> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[👆👆 getProtocolInfo] Full QUIC protocol health check');

      const protocolInfo = await NativeZhtpApi.getProtocolInfo(this.nodeUrl);
      console.log('[👆👆 getProtocolInfo] Protocol info received:', protocolInfo);

      return protocolInfo;
    } catch (error: any) {
      console.error('[👆👆 getProtocolInfo] Error:', error.message);
      return null;
    }
  }

  /**
   * Recover identity with seed phrase
   * @param seedPhrase - 24-word master seed phrase
   * @returns Recovered identity or throws error
   */
  async recoverWithSeed(seedPhrase: string): Promise<Identity> {
    try {
      console.log('[RealAuthService] recoverWithSeed called');
      this.lastSeedRecoveryNotFound = false;

      const normalized = seedPhrase
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (normalized.length !== 24) {
        throw new Error('Recovery phrase must be 24 words');
      }

      const phrase = normalized.join(' ');
      const nodeUrl = this.nodeUrl.replace(/\/+$/, '');
      const url = `${nodeUrl}/api/v1/identity/recover`;

      let payload: any = {};
      let responseOk = false;
      let responseStatus = 0;

      try {
        const response = await this.quicFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recovery_phrase: phrase }),
        });
        responseStatus = response.status;
        payload = await response.json().catch(() => ({}));
        if (!payload || Object.keys(payload).length === 0) {
          const text = await response.text().catch(() => '');
          if (text) {
            payload = { message: text };
          }
        }
        responseOk = response.ok;
      } catch (networkError) {
        console.warn('[RealAuthService] Seed recovery network error, falling back to local restore:', networkError);
      }

      const notFound =
        responseStatus === 404 ||
        String(payload?.message || '').toLowerCase().includes('not found') ||
        String(payload?.error || '').toLowerCase().includes('not found');

      if (responseOk && payload?.session_token) {
        try {
          await SecureIdentityStorage.setSessionToken(payload.session_token);
        } catch (tokenError) {
          console.warn('[RealAuthService] Failed to store session token:', tokenError);
        }
      } else if (responseStatus && !responseOk && !notFound) {
        const message = payload?.message || `HTTP ${responseStatus}: Recovery failed`;
        throw new Error(message);
      } else if (responseStatus && !responseOk && notFound) {
        console.warn('[RealAuthService] Seed recovery not found on server, continuing with local restore');
        this.lastSeedRecoveryNotFound = true;
        throw new Error('MIGRATION_REQUIRED');
      }

      const restored = await nativeIdentityProvisioning.restoreIdentityFromPhrase(phrase);

      const serverIdentityId = responseOk ? payload?.identity?.identity_id : undefined;
      const didFromServer = responseOk ? payload?.identity?.did : undefined;
      const identityDid = restored?.did || didFromServer;
      const identityId = identityDid
        ? identityDid.startsWith('did:zhtp:')
          ? identityDid.substring('did:zhtp:'.length)
          : identityDid
        : serverIdentityId;
      if (!identityId) {
        throw new Error('Recovery failed: missing identity id');
      }

      try {
        await nativeIdentityProvisioning.storeProvisionedIdentity(
          identityId,
          { did: identityDid }
        );
      } catch (storeError: any) {
        console.error('[RealAuthService] ⚠️ Keychain storage failed:', storeError);
      }

      try {
        await nativeIdentityProvisioning.restoreIdentityToHandleStore(identityId);
      } catch (err) {
        console.warn('[RealAuthService] Failed to restore identity to handle store:', err);
      }

      const identity: Identity = {
        did: identityDid,
        displayName: restored.displayName || 'Recovered Identity',
        identityId,
        identityType: restored.identityType || 'human',
        deviceId: restored.deviceId,
        createdAt: restored.createdAt,
        masterSeedPhrase: phrase,
      };

      await this.storeIdentity(identity);
      return identity;
    } catch (error: any) {
      console.error('[RealAuthService] recoverWithSeed failed:', error);
      throw error;
    }
  }

  getLastSeedRecoveryNotFound(): boolean {
    return this.lastSeedRecoveryNotFound;
  }

  /**
   * Migrate identity using old seed phrase and create a new identity/seed
   * Returns new identity and the new seed phrase words
   */
  async migrateIdentityFromSeed(displayName: string, seedPhrase: string): Promise<MigrationResult> {
    if (!displayName.trim()) {
      throw new Error('Display name is required');
    }

    const normalized = seedPhrase
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (normalized.length !== 24) {
      throw new Error('Recovery phrase must be 24 words');
    }

    const phrase = normalized.join(' ');

    // Restore identity deterministically from seed (this becomes the NEW identity)
    console.log('[RealAuthService] migrateIdentityFromSeed starting');
    const restored = await nativeIdentityProvisioning.restoreIdentityFromPhrase(phrase);
    const restoredDid = restored?.did;
    if (!restoredDid) {
      throw new Error('Failed to restore identity from seed');
    }
    const restoredIdentityId = restoredDid.startsWith('did:zhtp:') ? restoredDid.substring('did:zhtp:'.length) : restoredDid;
    const restoredPublicDilithium = restored?.publicDilithium;
    if (!restoredPublicDilithium) {
      throw new Error('Missing public key from restored identity');
    }

    const nodeUrl = this.nodeUrl.replace(/\/+$/, '');
    const newSeedPhrase = phrase;
    const newSeedWords = normalized;

    const newPublicKeyHex = base64ToHex(restoredPublicDilithium);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `SEED_MIGRATE:${displayName}:${newPublicKeyHex}:${timestamp}`;
    console.log('[RealAuthService] Signing migration message');
    const signature = await withTimeout(
      nativeIdentityProvisioning.signMessageFromSeed(phrase, message),
      15000,
      'Signing timed out (seed migration)'
    );
    console.log('[RealAuthService] Migration signature created');
    console.log('[RealAuthService] Sending /identity/migrate');
    const migrateResponse = await this.quicFetch(`${nodeUrl}/api/v1/identity/migrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_public_key: newPublicKeyHex,
        device_id: restored.deviceId,
        display_name: displayName,
        timestamp,
        signature,
      }),
    });

    let migratePayload: any = {};
    try {
      migratePayload = await migrateResponse.json();
    } catch {
      const text = await migrateResponse.text().catch(() => '');
      if (text) migratePayload = { message: text };
    }

    const statusMessage = String(migratePayload?.status_message || migratePayload?.message || '').toLowerCase();
    const statusText = String(migratePayload?.status || '').toLowerCase();
    const alreadyMigrated = statusText === 'conflict' || statusMessage.includes('already registered');

    if (!migrateResponse.ok && !alreadyMigrated) {
      const message = migratePayload?.message || `HTTP ${migrateResponse.status}: Migration failed`;
      throw new Error(message);
    }

    if (alreadyMigrated) {
      console.warn('[RealAuthService] ⚠️ Migration already completed on server, restoring locally');
    }

    const serverDid = !alreadyMigrated
      ? (migratePayload?.new_did || migratePayload?.did || restoredDid)
      : restoredDid;
    const newIdentityId = serverDid.startsWith('did:zhtp:') ? serverDid.substring('did:zhtp:'.length) : serverDid;

    // Replace all local identities/keys with new identity unless this is already migrated.
    // Note: IdentityCleanup clears the native in-memory cache that storeProvisionedIdentity depends on.
    // Re-restore from seed after cleanup so the identity is re-cached natively.
    if (!alreadyMigrated) {
      await IdentityCleanup.cleanAllIdentities();
      await SeedVaultService.clearSeedPhrase();
    }

    try {
      if (!alreadyMigrated) {
        const restoredAfterCleanup = await nativeIdentityProvisioning.restoreIdentityFromPhrase(phrase);
        const didAfterCleanup = restoredAfterCleanup?.did;

        await nativeIdentityProvisioning.storeProvisionedIdentity(newIdentityId, {
          did: didAfterCleanup || serverDid,
        });
      } else {
        await nativeIdentityProvisioning.storeProvisionedIdentity(newIdentityId, {
          did: serverDid,
        });
      }
    } catch (storeError) {
      console.warn('[RealAuthService] ⚠️ Failed to store migrated identity:', storeError);
    }

    try {
      await nativeIdentityProvisioning.restoreIdentityToHandleStore(newIdentityId);
    } catch (err) {
      console.warn('[RealAuthService] Failed to restore migrated identity to handle store:', err);
    }

    const identity: Identity = {
      identityId: newIdentityId,
      did: serverDid,
      displayName,
      identityType: 'human',
      deviceId: restored.deviceId,
      createdAt: restored.createdAt,
      masterSeedPhrase: newSeedPhrase,
    };

    return { identity, newSeedPhrase: newSeedWords };
  }

  /**
   * Recover identity with backup file
   * @param fileContent - Backup file content
   * @param password - Decryption password
   * @returns Recovered identity or throws error
   */
  async recoverWithBackup(fileContent: string, password: string): Promise<Identity> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[RealAuthService] recoverWithBackup called');

      const identity = await NativeZhtpApi.recoverWithBackup(fileContent, password, this.nodeUrl);

      // Store identity in Keychain
      await this.storeIdentity(identity);

      return identity;
    } catch (error: any) {
      console.error('[RealAuthService] recoverWithBackup failed:', error);
      throw error;
    }
  }

  /**
   * Recover identity with social recovery (guardian-based)
   * @param guardianIds - Array of guardian DIDs
   * @returns Recovered identity or throws error
   */
  async recoverWithSocial(guardianIds: string[]): Promise<Identity> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[RealAuthService] recoverWithSocial called');

      const identity = await NativeZhtpApi.recoverWithSocial(guardianIds, this.nodeUrl);

      // Store identity in Keychain
      await this.storeIdentity(identity);

      return identity;
    } catch (error: any) {
      console.error('[RealAuthService] recoverWithSocial failed:', error);
      throw error;
    }
  }

  /**
   * Ensure connection is active
   * Placeholder for future use
   */
  async ensureConnection(): Promise<boolean> {
    try {
      return await this.testConnection();
    } catch (error: any) {
      console.error('❌ Failed to ensure connection:', error);
      return false;
    }
  }

  /**
   * Get current node URL
   */
  getNodeUrl(): string {
    return this.nodeUrl;
  }

  /**
   * Store identity in secure storage
   * @param identity - Identity to store
   */
  private async storeIdentity(identity: Identity): Promise<void> {
    try {
      if (identity.masterSeedPhrase) {
        await walletKeychainService.storeMasterSeedPhrase(
          identity.masterSeedPhrase,
          identity.identityId
        );
      }
    } catch (error) {
      console.warn('[RealAuthService] Failed to store identity seeds:', error);
      // Non-fatal - continue anyway
    }
  }
}

function base64ToHex(input: string): string {
  if (!input) return '';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Buffer } = require('buffer');
  return Buffer.from(input, 'base64').toString('hex');
}

// Export singleton instance
const authServiceInstance = new RealAuthService(DEFAULT_SOV_NODE_URL);
export default authServiceInstance;

// Also export the class for creating custom instances
export { RealAuthService };
