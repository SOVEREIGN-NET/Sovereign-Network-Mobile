/**
 * Real Authentication Service
 * Integrates with SOV API backend for actual identity operations
 * Uses native QUIC transport via QuicFetchAdapter
 *
 * SECURITY: Phase 3.2 - Certificate Pinning Integration
 * Certificate pinning is configured via CertificatePinning service
 * Validated at the QUIC transport level to prevent MITM attacks
 *
 * SECURITY: Phase 3.3 - Device-Based Identity Provisioning (iOS)
 * iOS: Keys generated locally, private keys in Keychain only
 * Server: Registers public keys via /api/v1/identity/register
 */

import { Platform } from 'react-native';
import { ZhtpApi, ReactNativeConfigProvider, Identity, SignupRequest, LoginRequest } from '@sovereign-net/api-client/react-native';
import type { FetchAdapter } from '@sovereign-net/api-client/react-native';
import QuicClient from './QuicClient';
import { createQuicFetchAdapterSync } from './QuicFetchAdapter';
import CertificatePinning from './CertificatePinning';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';

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

/**
 * Real auth service using SOV API over native QUIC transport
 */
class RealAuthService {
  private readonly api: ZhtpApi;
  private readonly configProvider: ReactNativeConfigProvider;
  private readonly quicFetch: FetchAdapter;

  constructor(nodeUrl: string) {
    // Node URL comes from .env only - no runtime changes
    this.configProvider = new ReactNativeConfigProvider(
      {
        ZHTP_NODE_URL: nodeUrl, // Key must match api-client's expected envVar name
        NETWORK_TYPE: 'testnet',
        DEBUG_MODE: __DEV__,
        ENABLE_BIOMETRICS: true,
      },
      // Don't pass AsyncStorage - config is read-only from .env
      undefined,
    );

    // SECURITY: Only accept self-signed certificates in development
    // Production builds require valid certificates
    const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';

    // Create QUIC-based fetch adapter for native transport
    this.quicFetch = createQuicFetchAdapterSync({
      insecure: isDevelopment,  // Only accept self-signed certs in development
      timeout: 30,
      fallbackToHttp: false, // Server only supports QUIC - no HTTP fallback
      onFallback: (url, reason) => {
        // SECURITY: Throw error instead of fallback to HTTP
        throw new Error(
          `QUIC connection required but failed: ${reason}. ` +
          `HTTP fallback is disabled for security.`
        );
      },
    });

    // SECURITY: Verify insecure mode is not accidentally enabled in production
    if (!isDevelopment) {
      const adapterStr = this.quicFetch.toString();
      if (adapterStr.includes('insecure') && adapterStr.includes('true')) {
        throw new Error(
          '🔴 SECURITY CRITICAL: QUIC insecure mode is enabled in production build! ' +
          'This is a critical security vulnerability.'
        );
      }
    }

    // SECURITY: Phase 3.2 - Verify certificate pinning is configured for production
    if (!isDevelopment && CertificatePinning.PINNING_CONFIG.enabled) {
      const pinnedHosts = CertificatePinning.getPinnedHosts();
      if (pinnedHosts.length === 0) {
        console.warn('⚠️ Certificate pinning enabled but no hosts are configured');
      } else if (__DEV__) {
        console.log(`✅ Certificate pinning enabled for hosts: ${pinnedHosts.join(', ')}`);
      }
    }

    // Pass QUIC adapter to ZhtpApi - all requests now go over QUIC/UDP
    this.api = new ZhtpApi(this.configProvider, this.quicFetch);
  }

  /**
   * Sign in with identity ID and password
   * @param credentials - Identity ID and password
   * @returns Identity with wallets
   */
  async signIn(credentials: SignInCredentials): Promise<Identity> {
    // Extract the hex identity ID from full DID if needed
    // e.g., "did:zhtp:abc123..." -> "abc123..."
    let identityId = credentials.identity_id.trim();
    if (identityId.startsWith('did:zhtp:')) {
      identityId = identityId.substring('did:zhtp:'.length);
      console.log('📝 Extracted identity ID from DID:', identityId);
    }

    const request: LoginRequest = {
      identity_id: identityId,
      password: credentials.password,
    };

    try {
      const identity = await this.api.login(request);
      console.log('✅ Signed in successfully:', identity.displayName);
      return identity;
    } catch (error: any) {
      console.error('❌ Sign in failed:', error);
      throw new Error(error.message || 'Failed to sign in');
    }
  }

  /**
   * Create a new citizen identity
   *
   * iOS: Uses device-based provisioning (keys generated locally, Keychain-stored)
   * Android: Uses API endpoint (to be implemented)
   *
   * @param data - Identity creation data
   * @returns Newly created identity with seed phrases for backup
   */
  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    // Validation
    if (!data.display_name || data.display_name.length < 2) {
      throw new Error('Display name must be at least 2 characters');
    }

    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // iOS: Device-based identity provisioning
    if (Platform.OS === 'ios') {
      return this.createIdentityIOS(data);
    }

    // Android: Falls back to API endpoint (future implementation)
    console.warn('⚠️ Android identity creation not yet implemented');
    throw new Error('Identity creation not available on Android');
  }

  /**
   * Create identity on iOS using device-based provisioning
   * SECURITY: Private keys generated locally, stored in Keychain only
   */
  private async createIdentityIOS(data: CreateIdentityData): Promise<Identity> {
    try {
      // Get node URL from environment
      const nodeUrl = this.configProvider.nodeUrl || 'https://localhost:9002';

      console.log('[RealAuthService] 🔑 Starting iOS identity provisioning...');
      console.log('[RealAuthService]    Display name: ' + data.display_name);
      console.log('[RealAuthService]    Server URL: ' + nodeUrl);

      // Step 1: Generate keys locally + register with server + provision locally
      let provisioningResult;
      try {
        provisioningResult = await nativeIdentityProvisioning.provisionIdentity(
          data.display_name,
          nodeUrl
        );
      } catch (nativeError: any) {
        console.error('[RealAuthService] ❌ Native provisioning failed:', nativeError);
        throw new Error('Device-based provisioning failed: ' + (nativeError.message || nativeError.toString()));
      }

      console.log(
        '[RealAuthService] ✅ Identity provisioned successfully:'
      );
      console.log('[RealAuthService]    identity_id: ' + provisioningResult.identity_id);
      console.log('[RealAuthService]    DID: ' + provisioningResult.did);
      console.log('[RealAuthService]    Device: ' + provisioningResult.device_id);
      console.log('[RealAuthService]    PQC enabled: ' + provisioningResult.pqc_enabled);

      // Step 2: Fetch the created identity from server
      // (Server should return identity info after registration)
      try {
        // Make a simple request to verify identity was registered
        // For now, construct identity from provisioning result
        const seedPhrases = this.generateSeedPhrasesFromMasterSeed(provisioningResult.masterSeedHex);

        console.log(
          '⚠️ IMPORTANT: Save backup seed phrase securely!',
          seedPhrases.join(' ')
        );

        // Construct identity from provisioning result
        // Private keys are in Keychain (identity_id is the reference to fetch them)
        const identity: Identity & { seedPhrases?: string[] } = {
          did: provisioningResult.did,
          displayName: data.display_name,
          identityId: provisioningResult.identity_id,
          identityType: 'human',
          createdAt: Date.now(),
          seedPhrases,
          wallets: [],
          publicKey: '',
        };

        return identity;
      } catch (error: any) {
        console.warn('Failed to fetch created identity:', error);
        // Return identity with provisioning result data
        const seedPhrases = this.generateSeedPhrasesFromMasterSeed(provisioningResult.masterSeedHex);
        return {
          did: provisioningResult.did,
          displayName: data.display_name,
          identityId: provisioningResult.identity_id,
          identityType: 'human',
          createdAt: Date.now(),
          seedPhrases,
          wallets: [],
          publicKey: '',
        } as Identity & { seedPhrases: string[] };
      }
    } catch (error: any) {
      console.error('❌ iOS identity provisioning failed:', error);
      throw new Error(
        error.message || 'Failed to provision identity on device'
      );
    }
  }

  /**
   * Generate seed phrases from master seed for backup
   * Uses simple encoding - in production should use BIP39
   * Master seed is kept on device (Keychain), this is for user backup only
   */
  private generateSeedPhrasesFromMasterSeed(masterSeedHex: string): string[] {
    // For now, split hex into 20-character chunks and map to BIP39 words
    // In production, should use proper BIP39 library
    const bip39Words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'abuse', 'access',
      'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act', 'action',
    ];

    const chunks = masterSeedHex.match(/.{1,2}/g) || [];
    const seedPhrase: string[] = [];

    for (let i = 0; i < Math.min(20, chunks.length); i++) {
      const byteValue = parseInt(chunks[i], 16);
      seedPhrase.push(bip39Words[byteValue % bip39Words.length]);
    }

    return seedPhrase.slice(0, 20);
  }

  /**
   * Recover identity using seed phrase
   * @param seedPhrase - 20-word seed phrase
   * @returns Recovered identity
   */
  async recoverWithSeed(seedPhrase: string): Promise<Identity> {
    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error('Seed phrase cannot be empty');
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 20) {
      throw new Error('Seed phrase must be exactly 20 words');
    }

    try {
      const identity = await this.api.recoverIdentityFromSeed({ seedPhrase: words });
      console.log('✅ Identity recovered from seed phrase:', identity.did);
      return identity;
    } catch (error: any) {
      console.error('❌ Recovery failed:', error);
      throw new Error(error.message || 'Failed to recover identity from seed phrase');
    }
  }

  /**
   * Recover identity with backup file
   * @param fileContent - Backup file content
   * @param password - Password to decrypt backup
   * @returns Recovered identity
   */
  async recoverWithBackup(fileContent: string, password: string): Promise<Identity> {
    if (!fileContent) {
      throw new Error('Backup file content is empty');
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    try {
      const backupData = JSON.parse(fileContent);
      const identity = await this.api.restoreIdentityFromBackup({
        backupData,
        password,
      });
      console.log('✅ Identity restored from backup:', identity.did);
      return identity;
    } catch (error: any) {
      console.error('❌ Backup recovery failed:', error);
      throw new Error(error.message || 'Failed to restore identity from backup');
    }
  }

  /**
   * Recover identity with social recovery (guardian-based)
   * @param guardianIds - Array of guardian DID/IDs
   * @returns Recovered identity
   */
  async recoverWithSocial(guardianIds: string[]): Promise<Identity> {
    if (!guardianIds || guardianIds.length === 0) {
      throw new Error('At least one guardian ID is required');
    }

    try {
      const identity = await this.api.recoverIdentityWithGuardians({
        guardianIds,
      });
      console.log('✅ Identity recovered with guardians:', identity.did);
      return identity;
    } catch (error: any) {
      console.error('❌ Social recovery failed:', error);
      throw new Error(error.message || 'Failed to recover identity with guardians');
    }
  }

  /**
   * Test connection to SOV node via UDP reachability check
   * Uses simple UDP probe instead of full QUIC+PQC handshake
   * @returns True if node is reachable
   */
  async testConnection(): Promise<boolean> {
    // console.log('[RealAuthService] 🔍 testConnection() - UDP Reachability Check');
    try {
      // Always prefer the configured default node URL for reachability checks
      const baseUrl = DEFAULT_SOV_NODE_URL;
      const url = new URL(baseUrl);
      const host = url.hostname;
      const port = parseInt(url.port, 10) || 9334;

      // console.log(`[RealAuthService] Checking UDP reachability: ${host}:${port}`);

      // Use UDP reachability check (doesn't require PQC handshake)
      const result = await QuicClient.checkReachability(host, port);
      const connected = result.reachable;
      // console.log(connected
      //   ? `[RealAuthService] ✅ UDP reachable at ${host}:${port} (${result.latencyMs ? Math.round(result.latencyMs) + 'ms' : 'unknown latency'})`
      //   : `[RealAuthService] ❌ UDP not reachable: ${result.error}`);
      return connected;
    } catch (error: any) {
      console.error('[RealAuthService] ❌ UDP reachability check failed:', error.message);
      return false;
    }
  }

  /**
   * Get comprehensive protocol and node information via QUIC
   * @returns Protocol info or null if unavailable
   */
  async getProtocolInfo() {
    // console.log('[RealAuthService] 🌐 getProtocolInfo() - Full QUIC Health Check');
    try {
      const baseUrl = this.api.getBaseUrl();
      const healthUrl = `${baseUrl}/api/v1/protocol/health`;
      // console.log(`[RealAuthService] Requesting: ${healthUrl}`);

      const response = await QuicClient.request(healthUrl, {
        method: 'GET',
        timeout: 10,
        alpn: 'public', // Health check is unauthenticated
      });

      if (response.ok) {
        const data = JSON.parse(response.body);
        // console.log('[RealAuthService] ✅ Protocol info retrieved via QUIC:', data);
        return data;
      } else {
        // console.log(`[RealAuthService] ❌ Health check failed: HTTP ${response.status}`);
        throw new Error(`QUIC ${response.status}`);
      }
    } catch (error: any) {
      console.error('[RealAuthService] ❌ Failed to get protocol info:', error.message);
      return null;
    }
  }

  /**
   * Ensure API is initialized and connected
   * Reinitializes config if connection was lost
   * @returns True if connection established
   */
  async ensureConnection(): Promise<boolean> {
    try {
      const connected = await this.api.ensureConnection();
      console.log(connected ? '✅ Connection ensured' : '❌ Connection failed');
      return connected;
    } catch (error) {
      console.error('❌ Failed to ensure connection:', error);
      return false;
    }
  }

  /**
   * Get API instance for direct access
   * @returns ZhtpApi instance
   */
  getApi(): ZhtpApi {
    return this.api;
  }

  /**
   * Get current node URL
   * @returns Configured SOV node URL
   */
  getNodeUrl(): string {
    return this.api.getBaseUrl();
  }

  /**
   * Export identity backup file encrypted with password
   * @param identityId - Identity DID/ID to backup
   * @param password - Password to encrypt backup file
   * @returns Encrypted backup data as object
   */
  async exportBackup(identityId: string, password: string): Promise<any> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    try {
      const backupData = await this.api.exportBackup(identityId, password);
      console.log('✅ Backup exported successfully');
      return backupData;
    } catch (error: any) {
      console.error('❌ Backup export failed:', error);
      throw new Error(error.message || 'Failed to export backup');
    }
  }

  /**
   * Import and restore identity from backup file
   * @param backupData - Encrypted backup data as string or object
   * @param password - Password to decrypt backup
   * @returns Restored identity
   */
  async importBackup(backupData: string | object, password: string): Promise<Identity> {
    if (!backupData) {
      throw new Error('Backup data is required');
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    try {
      const parsedData = typeof backupData === 'string' ? JSON.parse(backupData) : backupData;
      const identity = await this.api.restoreIdentityFromBackup({
        backupData: parsedData,
        password,
      });
      console.log('✅ Identity imported from backup:', identity.did);
      return identity;
    } catch (error: any) {
      console.error('❌ Backup import failed:', error);
      throw new Error(error.message || 'Failed to import backup');
    }
  }

  async signInWithDid(did: string, passphrase: string): Promise<Identity> {
    if (!did || did.trim().length === 0) {
      throw new Error('DID cannot be empty');
    }
    if (!passphrase || passphrase.length === 0) {
      throw new Error('Passphrase cannot be empty');
    }

    try {
      const identity = await this.api.signIn(did, passphrase);
      console.log('✅ Signed in with DID:', did);
      return identity;
    } catch (error: any) {
      console.error('❌ DID sign in failed:', error);
      throw new Error(error.message || 'Failed to sign in with DID');
    }
  }

  async signInWithIdentity(identity: Identity, passphrase: string): Promise<{ token: string; identity: Identity }> {
    if (!identity || !identity.did) {
      throw new Error('Identity is required');
    }
    if (!passphrase || passphrase.length === 0) {
      throw new Error('Passphrase cannot be empty');
    }

    try {
      const result = await this.api.signInWithIdentity(identity as any, passphrase);
      console.log('✅ Signed in with Identity object:', identity.did);
      return result;
    } catch (error: any) {
      console.error('❌ Identity sign in failed:', error);
      throw new Error(error.message || 'Failed to sign in with Identity');
    }
  }

  async createZkDid(didData?: Record<string, any>): Promise<any> {
    try {
      const result = await this.api.createZkDid(didData);
      console.log('✅ ZK-DID created');
      return result;
    } catch (error: any) {
      console.error('❌ ZK-DID creation failed:', error);
      throw new Error(error.message || 'Failed to create ZK-DID');
    }
  }

  async checkIdentityExists(identifier: string): Promise<boolean> {
    if (!identifier || identifier.trim().length === 0) {
      throw new Error('Identifier cannot be empty');
    }

    try {
      const exists = await this.api.checkIdentityExists(identifier);
      console.log(`✅ Identity existence checked: ${identifier}`, exists);
      return exists;
    } catch (error: any) {
      console.error('❌ Identity check failed:', error);
      throw new Error(error.message || 'Failed to check identity existence');
    }
  }

  async verifyIdentity(did: string, requirements?: Record<string, any>): Promise<boolean> {
    if (!did || did.trim().length === 0) {
      throw new Error('DID cannot be empty');
    }

    try {
      const verified = await this.api.verifyIdentity(did, requirements);
      console.log('✅ Identity verified:', did);
      return verified;
    } catch (error: any) {
      console.error('❌ Identity verification failed:', error);
      throw new Error(error.message || 'Failed to verify identity');
    }
  }

  async applyCitizenship(identityId: string, applicationData?: Record<string, any>): Promise<any> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }

    try {
      const result = await this.api.applyCitizenship(identityId, applicationData);
      console.log('✅ Citizenship application submitted:', identityId);
      return result;
    } catch (error: any) {
      console.error('❌ Citizenship application failed:', error);
      throw new Error(error.message || 'Failed to apply for citizenship');
    }
  }

  async exportSeedPhrases(identityId: string): Promise<any> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }

    try {
      const seedPhrases = await this.api.exportSeedPhrases(identityId);
      console.log('✅ Seed phrases exported:', identityId);
      return seedPhrases;
    } catch (error: any) {
      console.error('❌ Seed phrase export failed:', error);
      throw new Error(error.message || 'Failed to export seed phrases');
    }
  }

  async verifySeedPhrase(identityId: string, seedPhrase: string): Promise<any> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }
    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error('Seed phrase cannot be empty');
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 20 && words.length !== 12) {
      throw new Error('Seed phrase must be 12 or 20 words');
    }

    try {
      const result = await this.api.verifySeedPhrase(identityId, seedPhrase);
      console.log('✅ Seed phrase verified:', identityId);
      return result;
    } catch (error: any) {
      console.error('❌ Seed phrase verification failed:', error);
      throw new Error(error.message || 'Failed to verify seed phrase');
    }
  }

  async verifyBackup(backupData: string): Promise<any> {
    if (!backupData || backupData.trim().length === 0) {
      throw new Error('Backup data cannot be empty');
    }

    try {
      const result = await this.api.verifyBackup(backupData);
      console.log('✅ Backup verified');
      return result;
    } catch (error: any) {
      console.error('❌ Backup verification failed:', error);
      throw new Error(error.message || 'Failed to verify backup');
    }
  }

  async addGuardian(identityId: string, guardianId: string, guardianInfo?: Record<string, any>): Promise<any> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }
    if (!guardianId || guardianId.trim().length === 0) {
      throw new Error('Guardian ID cannot be empty');
    }

    try {
      const result = await this.api.addGuardian(identityId, guardianId, guardianInfo);
      console.log('✅ Guardian added:', guardianId);
      return result;
    } catch (error: any) {
      console.error('❌ Add guardian failed:', error);
      throw new Error(error.message || 'Failed to add guardian');
    }
  }

  async listGuardians(identityId: string): Promise<any[]> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }

    try {
      const guardians = await this.api.listGuardians(identityId);
      console.log('✅ Guardians listed:', identityId);
      return guardians;
    } catch (error: any) {
      console.error('❌ List guardians failed:', error);
      throw new Error(error.message || 'Failed to list guardians');
    }
  }

  async removeGuardian(identityId: string, guardianId: string): Promise<void> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }
    if (!guardianId || guardianId.trim().length === 0) {
      throw new Error('Guardian ID cannot be empty');
    }

    try {
      await this.api.removeGuardian(identityId, guardianId);
      console.log('✅ Guardian removed:', guardianId);
    } catch (error: any) {
      console.error('❌ Remove guardian failed:', error);
      throw new Error(error.message || 'Failed to remove guardian');
    }
  }

  async acceptGuardianInvite(guardianId: string, identityId: string): Promise<void> {
    if (!guardianId || guardianId.trim().length === 0) {
      throw new Error('Guardian ID cannot be empty');
    }
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }

    try {
      await this.api.acceptGuardianInvite(guardianId, identityId);
      console.log('✅ Guardian invite accepted');
    } catch (error: any) {
      console.error('❌ Accept guardian invite failed:', error);
      throw new Error(error.message || 'Failed to accept guardian invite');
    }
  }

  async declineGuardianInvite(guardianId: string, identityId: string): Promise<void> {
    if (!guardianId || guardianId.trim().length === 0) {
      throw new Error('Guardian ID cannot be empty');
    }
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }

    try {
      await this.api.declineGuardianInvite(guardianId, identityId);
      console.log('✅ Guardian invite declined');
    } catch (error: any) {
      console.error('❌ Decline guardian invite failed:', error);
      throw new Error(error.message || 'Failed to decline guardian invite');
    }
  }

  async initiateRecovery(identityId: string, guardianIds: string[]): Promise<any> {
    if (!identityId || identityId.trim().length === 0) {
      throw new Error('Identity ID cannot be empty');
    }
    if (!guardianIds || guardianIds.length === 0) {
      throw new Error('At least one guardian ID is required');
    }

    try {
      const result = await this.api.initiateRecovery(identityId, guardianIds);
      console.log('✅ Recovery initiated:', identityId);
      return result;
    } catch (error: any) {
      console.error('❌ Initiate recovery failed:', error);
      throw new Error(error.message || 'Failed to initiate recovery');
    }
  }

  async approveRecovery(guardianId: string, recoveryId: string, approval: boolean): Promise<void> {
    if (!guardianId || guardianId.trim().length === 0) {
      throw new Error('Guardian ID cannot be empty');
    }
    if (!recoveryId || recoveryId.trim().length === 0) {
      throw new Error('Recovery ID cannot be empty');
    }

    try {
      await this.api.approveRecovery(guardianId, recoveryId, approval);
      console.log('✅ Recovery approval submitted:', recoveryId);
    } catch (error: any) {
      console.error('❌ Approve recovery failed:', error);
      throw new Error(error.message || 'Failed to approve recovery');
    }
  }

  async getRecoveryStatus(recoveryId: string): Promise<any> {
    if (!recoveryId || recoveryId.trim().length === 0) {
      throw new Error('Recovery ID cannot be empty');
    }

    try {
      const status = await this.api.getRecoveryStatus(recoveryId);
      console.log('✅ Recovery status retrieved:', recoveryId);
      return status;
    } catch (error: any) {
      console.error('❌ Get recovery status failed:', error);
      throw new Error(error.message || 'Failed to get recovery status');
    }
  }

  async cancelRecovery(recoveryId: string): Promise<void> {
    if (!recoveryId || recoveryId.trim().length === 0) {
      throw new Error('Recovery ID cannot be empty');
    }

    try {
      await this.api.cancelRecovery(recoveryId);
      console.log('✅ Recovery cancelled:', recoveryId);
    } catch (error: any) {
      console.error('❌ Cancel recovery failed:', error);
      throw new Error(error.message || 'Failed to cancel recovery');
    }
  }
}

import { DEFAULT_SOV_NODE_URL } from '../config';

// Export singleton instance - uses centralized config
const authServiceInstance = new RealAuthService(DEFAULT_SOV_NODE_URL);
export default authServiceInstance;

// Also export the class for creating custom instances
export { RealAuthService };
