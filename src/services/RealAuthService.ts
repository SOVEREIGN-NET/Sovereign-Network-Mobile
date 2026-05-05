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
import { DEFAULT_SOV_NODE_URL } from '../config';
import { isQuicSupported, testQuicConnection, quicRequestRaw, publicQuicRequest } from './quic';
import { getActiveTarget } from './NetworkBootstrap';
import IdentityCleanup from './IdentityCleanup';
import SeedVaultService from './SeedVaultService';
import { maskIdentifier } from '../utils/maskIdentifier';
import { ChainBindingStorage } from './ChainBindingStorage';
import type { LocalChainBinding } from './ChainBindingStorage';

const { NativeZhtpApi } = NativeModules;

import type { Identity } from '../types/identity';
export type { Identity };

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

export interface MigrationResult {
  identity: Identity;
  newSeedPhrase: string[];
}

/** Strip the `did:zhtp:` prefix from a DID, returning just the identity id,
 * or `undefined` if the input is missing/empty. */
function stripDidPrefix(did: string | undefined): string | undefined {
  if (!did) return undefined;
  return did.startsWith('did:zhtp:') ? did.substring('did:zhtp:'.length) : did;
}

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
  private lastSeedRecoveryNotFound = false;

  /**
   * Sign in with identity ID and password
   */
  async signIn(credentials: SignInCredentials): Promise<Identity> {
    try {
      const maskedId = maskIdentifier(credentials.identity_id);
      console.log('[RealAuthService] signIn called for:', maskedId);

      // 1. Check identity exists on device
      const local = await nativeIdentityProvisioning.getLocalIdentity(credentials.identity_id);
      if (!local || local.status !== 'found' || !local.identity_id || !local.did) {
        throw new Error('Identity not found on this device');
      }

      // 2. Validate password against locally stored credentials
      const stored = await SecureIdentityStorage.getLoginCredentials();
      if (!stored) {
        throw new Error('No credentials stored — please recover your identity first');
      }
      if (stored.password !== credentials.password) {
        throw new Error('Invalid password');
      }

      // 3. Restore Rust identity handle for signing
      const restore = await nativeIdentityProvisioning.restoreIdentityToHandleStore(local.identity_id);
      if (restore?.status !== 'restored') {
        throw new Error('Failed to restore identity for signing');
      }

      // 4. Build identity object and persist session
      const identity: Identity = {
        identityId: local.identity_id,
        did: local.did,
        displayName: local.did,
        identityType: (local.identity_type || 'human') as Identity['identityType'],
        deviceId: local.device_id,
        createdAt: local.created_at,
      };

      console.log('[RealAuthService] Local sign-in successful');
      await this.storeIdentity(identity);
      return identity;
    } catch (error: unknown) {
      console.error('[RealAuthService] signIn failed:', error);
      throw error;
    }
  }

  /**
   * Create a new citizen identity
   */
  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    try {
      console.log('[RealAuthService] createIdentity called');

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
    } catch (error: unknown) {
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
    const data = await publicQuicRequest<{ available?: boolean }>(
      `/api/v1/identity/username/available/${encoded}`,
    );
    return Boolean(data?.available);
  }

  /**
   * Create identity on device using native provisioning + QUIC registration
   */
  private async createIdentityDevice(data: CreateIdentityData): Promise<Identity> {
    try {
      const nodeUrl = DEFAULT_SOV_NODE_URL.replace(/\/+$/, '');

      console.log('[RealAuthService] Starting identity provisioning...');
      console.log('[RealAuthService]    Display name: ' + data.display_name);

      let generatedIdentity;
      try {
        generatedIdentity = await nativeIdentityProvisioning.provisionIdentity(
          data.display_name,
          nodeUrl
        );
      } catch (nativeError: unknown) {
        const msg = nativeError instanceof Error ? nativeError.message : String(nativeError);
        console.error('[RealAuthService] Native key generation failed:', nativeError);
        throw new Error('Device-based key generation failed: ' + msg);
      }

      console.log('[RealAuthService] Identity generated locally:');
      console.log('[RealAuthService]    DID: ' + maskIdentifier(generatedIdentity.did));
      console.log('[RealAuthService]    Device: ' + generatedIdentity.deviceId);

      let registrationProof;
      try {
        registrationProof = await nativeIdentityProvisioning.createRegistrationProof(
          data.display_name,
          { did: generatedIdentity.did }
        );
      } catch (proofError: unknown) {
        const msg = proofError instanceof Error ? proofError.message : String(proofError);
        console.error('[RealAuthService] Proof creation failed:', proofError);
        throw new Error('Failed to create registration proof: ' + msg);
      }

      console.log('[RealAuthService] Registration proof created');

      let identityId = '';
      let masterSeedPhrase = '';
      try {
        console.log('[RealAuthService] Registering identity via /api/v1/identity/register...');
        const registerRequest = {
          public_key: registrationProof.public_key,
          kyber_public_key: registrationProof.kyber_public_key,
          device_id: registrationProof.device_id,
          display_name: data.display_name,
          identity_type: 'human',
          registration_proof: registrationProof.registration_proof,
          timestamp: registrationProof.timestamp,
        };

        const registerResponse = await quicRequestRaw(
          '/api/v1/identity/register',
          {
            method: 'POST',
            body: JSON.stringify(registerRequest),
            headers: { 'Content-Type': 'application/json' },
          },
        );

        if (!registerResponse.ok) {
          if (registerResponse.status === 409 && registerResponse.body?.includes('Identity already registered')) {
            identityId = generatedIdentity.did.startsWith('did:zhtp:')
              ? generatedIdentity.did.substring('did:zhtp:'.length)
              : generatedIdentity.did;
            console.warn('[RealAuthService] Identity already registered, continuing with derived identity ID');
          } else {
            throw new Error(`HTTP ${registerResponse.status}: ${registerResponse.body}`);
          }
        } else {
          const registrationResponse = JSON.parse(registerResponse.body);
          identityId = registrationResponse.identity_id || '';
          const serverDid = registrationResponse.did;

          console.log('[RealAuthService] Server registration succeeded');
          console.log('[RealAuthService]    Identity ID: ' + identityId);
          if (serverDid) {
            generatedIdentity.did = serverDid;
          }

          // Save initial chain binding so future launches can detect chain changes
          try {
            const { fetchChainInfo } = require('./ChainInfoService');
            const chainInfo = await fetchChainInfo();
            await ChainBindingStorage.set({
              chainId: chainInfo.chain_id,
              registeredHeight: chainInfo.height,
              identityId,
              primaryWalletId: registrationResponse.primary_wallet_id || '',
              ubiWalletId: registrationResponse.ubi_wallet_id || '',
              savingsWalletId: registrationResponse.savings_wallet_id || '',
            });
            console.log('[RealAuthService] Initial chain binding saved for chain', chainInfo.chain_id);
          } catch (chainErr) {
            console.warn('[RealAuthService] Failed to save initial chain binding (non-fatal):', chainErr);
          }
        }
      } catch (serverError: unknown) {
        const msg = serverError instanceof Error ? serverError.message : String(serverError);
        console.error('[RealAuthService] Server registration failed:', serverError);
        throw new Error('Server registration failed: ' + msg);
      }

      try {
        await nativeIdentityProvisioning.storeProvisionedIdentity(
          identityId,
          { did: generatedIdentity.did }
        );
        console.log('[RealAuthService] Identity provisioned and stored');
      } catch (storeError: unknown) {
        console.error('[RealAuthService] Keychain storage failed:', storeError);
      }

      try {
        masterSeedPhrase = await nativeIdentityProvisioning.getSeedPhraseForBackup(
          generatedIdentity.did
        );
      } catch (phraseError: unknown) {
        console.warn('[RealAuthService] Failed to fetch master seed phrase:', phraseError);
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to provision identity on device';
      console.error('[RealAuthService] Device identity provisioning failed:', error);
      throw new Error(msg);
    }
  }

  /**
   * Test connection to node
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[RealAuthService] QUIC reachability check');
      const supported = await isQuicSupported();
      console.log(`[RealAuthService] QUIC supported: ${supported}`);
      if (!supported) return false;

      const target = getActiveTarget();
      const result = await testQuicConnection(target.host, target.port);
      const connected = !!result.success;
      console.log('[RealAuthService]', connected ? 'CONNECTED' : 'DISCONNECTED');
      return connected;
    } catch (error: unknown) {
      console.error('[RealAuthService] testConnection exception:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get comprehensive protocol and node information
   */
  async getProtocolInfo(): Promise<unknown> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[RealAuthService] Full QUIC protocol health check');
      const protocolInfo = await NativeZhtpApi.getProtocolInfo(DEFAULT_SOV_NODE_URL);
      console.log('[RealAuthService] Protocol info received:', protocolInfo);
      return protocolInfo;
    } catch (error: unknown) {
      console.error('[RealAuthService] getProtocolInfo error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * POST the seed to `/api/v1/identity/recover` and return the server
   * response in a decoded shape. Tolerates network errors and bodies that
   * aren't valid JSON — callers still get `{ payload: {}, responseOk: false,
   * responseStatus: 0 }` and can decide how to proceed.
   */
  private async callServerSeedRecover(phrase: string): Promise<{
    payload: Record<string, unknown>;
    responseOk: boolean;
    responseStatus: number;
  }> {
    let payload: Record<string, unknown> = {};
    let responseOk = false;
    let responseStatus = 0;
    try {
      const response = await quicRequestRaw('/api/v1/identity/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovery_phrase: phrase }),
      });
      responseStatus = response.status;
      responseOk = response.ok;
      try {
        payload = JSON.parse(response.body) ?? {};
      } catch {
        if (response.body) payload = { message: response.body };
      }
    } catch (networkError) {
      console.warn(
        '[RealAuthService] Seed recovery network error, falling back to local restore:',
        networkError,
      );
    }
    return { payload, responseOk, responseStatus };
  }

  /**
   * Decide whether the seed-recover response is a "not found" (migration
   * required) case. 404 is the canonical signal, but the server may also
   * embed "not found" in a message/error field.
   */
  private static isRecoverNotFound(
    payload: Record<string, unknown>,
    status: number,
  ): boolean {
    if (status === 404) return true;
    const m = String(payload?.message || '').toLowerCase();
    const e = String(payload?.error || '').toLowerCase();
    return m.includes('not found') || e.includes('not found');
  }

  /**
   * Take the raw server response and either stash the session token, throw
   * MIGRATION_REQUIRED, or throw a generic error. Returns silently when
   * there's no server interaction to react to (network error path).
   */
  private async reactToRecoverResponse(
    payload: Record<string, unknown>,
    responseOk: boolean,
    responseStatus: number,
  ): Promise<void> {
    if (responseOk && payload?.session_token) {
      try {
        await SecureIdentityStorage.setSessionToken(
          payload.session_token as string,
        );
      } catch (tokenError) {
        console.warn('[RealAuthService] Failed to store session token:', tokenError);
      }
      return;
    }
    if (!responseStatus || responseOk) return;
    if (RealAuthService.isRecoverNotFound(payload, responseStatus)) {
      console.warn(
        '[RealAuthService] Seed recovery not found on server, continuing with local restore',
      );
      this.lastSeedRecoveryNotFound = true;
      throw new Error('MIGRATION_REQUIRED');
    }
    const message =
      (payload?.message as string) || `HTTP ${responseStatus}: Recovery failed`;
    throw new Error(message);
  }

  /**
   * Recover identity with seed phrase
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

      const { payload, responseOk, responseStatus } =
        await this.callServerSeedRecover(phrase);
      await this.reactToRecoverResponse(payload, responseOk, responseStatus);

      const restored = await nativeIdentityProvisioning.restoreIdentityFromPhrase(phrase);

      const serverIdentityId = responseOk ? (payload?.identity as Record<string, unknown>)?.identity_id as string | undefined : undefined;
      const didFromServer = responseOk ? (payload?.identity as Record<string, unknown>)?.did as string | undefined : undefined;
      const identityDid = restored?.did || didFromServer;
      const identityId = stripDidPrefix(identityDid) ?? serverIdentityId;
      if (!identityId) {
        throw new Error('Recovery failed: missing identity id');
      }

      try {
        await nativeIdentityProvisioning.storeProvisionedIdentity(
          identityId,
          { did: identityDid }
        );
      } catch (storeError: unknown) {
        console.error('[RealAuthService] Keychain storage failed:', storeError);
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
    } catch (error: unknown) {
      console.error('[RealAuthService] recoverWithSeed failed:', error);
      throw error;
    }
  }

  getLastSeedRecoveryNotFound(): boolean {
    return this.lastSeedRecoveryNotFound;
  }

  /**
   * Migrate identity using old seed phrase and create a new identity/seed
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

    console.log('[RealAuthService] migrateIdentityFromSeed starting');
    const restored = await nativeIdentityProvisioning.restoreIdentityFromPhrase(phrase);
    const restoredDid = restored?.did;
    if (!restoredDid) {
      throw new Error('Failed to restore identity from seed');
    }
    const restoredPublicDilithium = restored?.publicDilithium;
    if (!restoredPublicDilithium) {
      throw new Error('Missing public key from restored identity');
    }

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

    const migrateResponse = await quicRequestRaw(
      '/api/v1/identity/migrate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_public_key: newPublicKeyHex,
          device_id: restored.deviceId,
          display_name: displayName,
          timestamp,
          signature,
        }),
      },
    );

    let migratePayload: Record<string, unknown> = {};
    try {
      migratePayload = JSON.parse(migrateResponse.body) ?? {};
    } catch {
      if (migrateResponse.body) migratePayload = { message: migrateResponse.body };
    }

    const statusMessage = String(migratePayload?.status_message || migratePayload?.message || '').toLowerCase();
    const statusText = String(migratePayload?.status || '').toLowerCase();
    const alreadyMigrated = statusText === 'conflict' || statusMessage.includes('already registered');

    if (!migrateResponse.ok && !alreadyMigrated) {
      const message = (migratePayload?.message as string) || `HTTP ${migrateResponse.status}: Migration failed`;
      throw new Error(message);
    }

    if (alreadyMigrated) {
      console.warn('[RealAuthService] Migration already completed on server, restoring locally');
    }

    const serverDid = !alreadyMigrated
      ? ((migratePayload?.new_did || migratePayload?.did || restoredDid) as string)
      : restoredDid;
    const newIdentityId = serverDid.startsWith('did:zhtp:') ? serverDid.substring('did:zhtp:'.length) : serverDid;

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
      console.warn('[RealAuthService] Failed to store migrated identity:', storeError);
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
   */
  async recoverWithBackup(fileContent: string, password: string): Promise<Identity> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[RealAuthService] recoverWithBackup called');
      const identity = await NativeZhtpApi.recoverWithBackup(fileContent, password, DEFAULT_SOV_NODE_URL);
      await this.storeIdentity(identity);
      return identity;
    } catch (error: unknown) {
      console.error('[RealAuthService] recoverWithBackup failed:', error);
      throw error;
    }
  }

  /**
   * Recover identity with social recovery (guardian-based)
   */
  async recoverWithSocial(guardianIds: string[]): Promise<Identity> {
    try {
      if (!NativeZhtpApi) {
        throw new Error('NativeZhtpApi module not available');
      }

      console.log('[RealAuthService] recoverWithSocial called');
      const identity = await NativeZhtpApi.recoverWithSocial(guardianIds, DEFAULT_SOV_NODE_URL);
      await this.storeIdentity(identity);
      return identity;
    } catch (error: unknown) {
      console.error('[RealAuthService] recoverWithSocial failed:', error);
      throw error;
    }
  }

  async ensureConnection(): Promise<boolean> {
    try {
      return await this.testConnection();
    } catch {
      return false;
    }
  }

  getNodeUrl(): string {
    return DEFAULT_SOV_NODE_URL;
  }

  /**
   * Re-register an existing on-device identity against a new chain.
   *
   * CRITICAL: This method NEVER generates new keys. It loads the existing
   * Rust identity handle from secure storage, signs a fresh registration
   * proof, and submits it to the node. The keypair is unchanged.
   *
   * Returns the updated LocalChainBinding on success.
   */
  async reRegisterExistingIdentity(
    currentIdentity: Identity,
    newChainId: number,
    newHeight: number,
  ): Promise<LocalChainBinding> {
    const identityId = currentIdentity.identityId;
    if (!identityId) {
      throw new Error('Cannot re-register: identity has no identityId');
    }

    console.log('[RealAuthService] Re-registering existing identity on chain', newChainId);

    // 1. Ensure the Rust handle is loaded from Keychain/ESP
    try {
      const restoreResult = await nativeIdentityProvisioning.restoreIdentityToHandleStore(identityId);
      if (restoreResult?.status !== 'restored' && restoreResult?.status !== 'already_loaded') {
        console.warn('[RealAuthService] Handle restore status:', restoreResult?.status);
      }
    } catch (err) {
      throw new Error('Failed to restore identity handle for re-registration: ' + (err instanceof Error ? err.message : String(err)));
    }

    // 2. Get registration proof (signs with existing Dilithium5 key)
    const displayName = currentIdentity.displayName || 'Recovered Identity';
    const registrationProof = await nativeIdentityProvisioning.createRegistrationProof(
      displayName,
      { did: currentIdentity.did },
    );

    // 3. POST to /api/v1/identity/register — same endpoint, existing key
    const registerRequest = {
      public_key: registrationProof.public_key,
      kyber_public_key: registrationProof.kyber_public_key,
      device_id: registrationProof.device_id,
      display_name: displayName,
      identity_type: currentIdentity.identityType || 'human',
      registration_proof: registrationProof.registration_proof,
      timestamp: registrationProof.timestamp,
    };

    const response = await quicRequestRaw(
      '/api/v1/identity/register',
      {
        method: 'POST',
        body: JSON.stringify(registerRequest),
        headers: { 'Content-Type': 'application/json' },
      },
    );

    let newIdentityId = identityId;
    let primaryWalletId = '';
    let ubiWalletId = '';
    let savingsWalletId = '';

    if (response.ok) {
      const body = JSON.parse(response.body);
      newIdentityId = body.identity_id || identityId;
      primaryWalletId = body.primary_wallet_id || '';
      ubiWalletId = body.ubi_wallet_id || '';
      savingsWalletId = body.savings_wallet_id || '';
      console.log('[RealAuthService] Re-registration succeeded, new identityId:', newIdentityId);
    } else if (response.status === 409) {
      // Already registered on this chain — treat as success
      console.warn('[RealAuthService] Identity already registered on new chain, continuing');
    } else {
      throw new Error(`Re-registration failed: HTTP ${response.status}: ${response.body}`);
    }

    // 4. If the server assigned a different identityId, update native storage
    if (newIdentityId !== identityId) {
      try {
        await nativeIdentityProvisioning.storeProvisionedIdentity(
          newIdentityId,
          { did: currentIdentity.did },
        );
      } catch (err) {
        console.warn('[RealAuthService] Failed to update native store with new identityId:', err);
      }

      try {
        await nativeIdentityProvisioning.restoreIdentityToHandleStore(newIdentityId);
      } catch (err) {
        console.warn('[RealAuthService] Failed to restore new identityId to handle store:', err);
      }
    }

    // 5. Persist chain binding
    const binding: LocalChainBinding = {
      chainId: newChainId,
      registeredHeight: newHeight,
      identityId: newIdentityId,
      primaryWalletId,
      ubiWalletId,
      savingsWalletId,
    };
    await ChainBindingStorage.set(binding);

    console.log('[RealAuthService] Chain binding saved for chain', newChainId);
    return binding;
  }

  private async storeIdentity(identity: Identity): Promise<void> {
    try {
      if (identity.masterSeedPhrase && identity.identityId) {
        await walletKeychainService.storeMasterSeedPhrase(
          identity.masterSeedPhrase,
          identity.identityId
        );
      }
    } catch (error) {
      console.warn('[RealAuthService] Failed to store identity seeds:', error);
    }
  }
}

function base64ToHex(input: string): string {
  if (!input) return '';
  // React Native ships a browser-compatible `buffer` shim via Metro's
  // resolver; the `node:buffer` specifier does NOT resolve in Metro
  // (it's a Node-only scheme). Keep the plain `'buffer'` import here
  // regardless of what Sonar suggests — the RN runtime has no `node:*`.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Buffer } = require('buffer');
  return Buffer.from(input, 'base64').toString('hex');
}

const authServiceInstance = new RealAuthService();
export default authServiceInstance;
export { RealAuthService };
