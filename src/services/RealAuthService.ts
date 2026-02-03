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
import { testQuicHealthCheck, quicRequest } from './QuicClient';
import { createQuicFetchAdapterSync } from './QuicFetchAdapter';
import CertificatePinning from './CertificatePinning';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import { walletKeychainService } from './WalletKeychainService';
import { QUIC_CONFIG } from '../config';

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
  private readonly nodeUrl: string;

  constructor(nodeUrl: string) {
    // Node URL comes from .env only - no runtime changes
    this.nodeUrl = nodeUrl;
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

    // Create QUIC-based fetch adapter for native transport
    // Uses insecure setting from config (defaults to __DEV__)
    this.quicFetch = createQuicFetchAdapterSync({
      insecure: QUIC_CONFIG.insecure,  // From config.ts - allows self-signed certs in dev
      timeout: QUIC_CONFIG.defaultTimeout,
      fallbackToHttp: QUIC_CONFIG.fallbackToHttp, // Disabled - server is pure QUIC
      onFallback: (url, reason) => {
        // SECURITY: Throw error instead of fallback to HTTP
        throw new Error(
          `QUIC connection required but failed: ${reason}. ` +
          `HTTP fallback is disabled for security.`
        );
      },
    });

    // Log critical config in dev only
    if (__DEV__) {
      console.log('✅ QUIC adapter configured');
      console.log('[RealAuthService]   insecure:', QUIC_CONFIG.insecure);
      console.log('[RealAuthService]   timeout:', QUIC_CONFIG.defaultTimeout, 'seconds');
      console.log('[RealAuthService]   fallbackToHttp:', QUIC_CONFIG.fallbackToHttp);
      console.log('[RealAuthService]   __DEV__:', __DEV__);
      console.log('[RealAuthService]   DEFAULT_NETWORK_TYPE:', require('../config').DEFAULT_NETWORK_TYPE);
      console.log('📌 Certificate pinning configured for:', CertificatePinning.getPinnedHosts().join(', '));
    }

    // SECURITY: Phase 3.2 - Verify certificate pinning is configured for production
    if (!__DEV__ && CertificatePinning.PINNING_CONFIG.enabled) {
      const pinnedHosts = CertificatePinning.getPinnedHosts();
      if (pinnedHosts.length === 0) {
        console.warn('⚠️ Certificate pinning enabled but no hosts are configured');
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

    // Device-based identity provisioning (iOS + Android)
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return this.createIdentityIOS(data);
    }

    throw new Error('Identity creation not available on this platform');
  }

  /**
   * Create identity on iOS using device-based provisioning
   * SECURITY: Private keys generated locally, stored in Keychain only
   */
  private async createIdentityIOS(data: CreateIdentityData): Promise<Identity> {
    try {
      // Use the node URL from constructor (comes from config)
      const nodeUrl = this.nodeUrl;

      console.log('[RealAuthService] 🔑 Starting iOS identity provisioning...');
      console.log('[RealAuthService]    Display name: ' + data.display_name);
      console.log('[RealAuthService]    Server URL: ' + nodeUrl);

      // Step 1: Generate keys locally
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
      console.log('[RealAuthService]    DID: ' + generatedIdentity.did);
      console.log('[RealAuthService]    Device: ' + generatedIdentity.deviceId);

      // Step 2: Create registration proof (signature)
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

      // Step 3: Register identity with server via QUIC (client-side key registration)
      let identityId: string;
      let walletIds: { primary?: string; ubi?: string; savings?: string } = {};
      let walletSeedPhrases: { primary?: string; ubi?: string; savings?: string } = {};
      try {
        console.log('[RealAuthService] 🔐 Registering client-side generated keys via /api/v1/identity/register...');
        const registerRequest = {
          did: generatedIdentity.did,
          public_key: registrationProof.public_key,
          kyber_public_key: registrationProof.kyber_public_key,
          node_id: registrationProof.node_id,
          device_id: registrationProof.device_id,
          display_name: data.display_name,
          identity_type: 'human',
          registration_proof: registrationProof.registration_proof,
          timestamp: registrationProof.timestamp,
        };

        const registerResponse = await this.quicFetch(this.nodeUrl + '/api/v1/identity/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerRequest),
        });
        const registrationResponse = await registerResponse.json();

        console.log('[RealAuthService] 📊 Full server response:', JSON.stringify(registrationResponse, null, 2).substring(0, 500));
        console.log('[RealAuthService] 📊 Response keys:', Object.keys(registrationResponse));

        identityId = registrationResponse.identity_id || '';

        // Parse wallet IDs from response (new server-generated wallets)
        walletIds = {
          primary: registrationResponse.primary_wallet_id,
          ubi: registrationResponse.ubi_wallet_id,
          savings: registrationResponse.savings_wallet_id,
        };
        console.log('[RealAuthService] 💼 Wallet IDs from server:');
        console.log('[RealAuthService]    Primary: ' + (walletIds.primary ? walletIds.primary.substring(0, 16) + '...' : 'N/A'));
        console.log('[RealAuthService]    UBI: ' + (walletIds.ubi ? walletIds.ubi.substring(0, 16) + '...' : 'N/A'));
        console.log('[RealAuthService]    Savings: ' + (walletIds.savings ? walletIds.savings.substring(0, 16) + '...' : 'N/A'));

        // Parse wallet seed phrases from response (for secure Keychain storage)
        if (registrationResponse.wallet_seed_phrases) {
          walletSeedPhrases = registrationResponse.wallet_seed_phrases;
          console.log('[RealAuthService] 🌱 Wallet seed phrases received from server');
          console.log('[RealAuthService]    Primary seed: ' + (walletSeedPhrases.primary ? 'received' : 'N/A'));
          console.log('[RealAuthService]    UBI seed: ' + (walletSeedPhrases.ubi ? 'received' : 'N/A'));
          console.log('[RealAuthService]    Savings seed: ' + (walletSeedPhrases.savings ? 'received' : 'N/A'));
        }

        console.log('[RealAuthService] ✅ Server registration succeeded');
        console.log('[RealAuthService]    Identity ID: ' + identityId);
      } catch (serverError: any) {
        console.error('[RealAuthService] ❌ Server registration failed:', serverError);
        throw new Error('Server registration failed: ' + (serverError.message || serverError.toString()));
      }

      // Step 4: Store provisioned identity in Keychain
      try {
        console.log('[RealAuthService] 📦 About to call storeProvisionedIdentity...');
        console.log('[RealAuthService]    identityId: ' + identityId);
        console.log('[RealAuthService]    identityId type: ' + typeof identityId);
        console.log('[RealAuthService]    identityId isEmpty: ' + (identityId === '' || identityId === null || identityId === undefined));

        if (!identityId) {
          console.error('[RealAuthService] ❌ CRITICAL: identityId is empty/null/undefined!');
          console.error('[RealAuthService]    Server response:', registrationResponse);
        }

        const storeResult = await nativeIdentityProvisioning.storeProvisionedIdentity(
          identityId,
          { did: generatedIdentity.did }
        );
        console.log('[RealAuthService] ✅ storeProvisionedIdentity completed');
        console.log('[RealAuthService]    Result:', storeResult);
        console.log('[RealAuthService] ✅ Identity provisioned and stored');
      } catch (storeError: any) {
        console.error('[RealAuthService] ⚠️ Keychain storage failed:', storeError);
        console.error('[RealAuthService]    Error message:', storeError.message);
        console.error('[RealAuthService]    Error code:', storeError.code);
        // Non-fatal - continue anyway
      }

      // Step 4b: Store wallet seed phrases in Keychain (server-generated)
      if (walletSeedPhrases && Object.keys(walletSeedPhrases).length > 0) {
        try {
          console.log('[RealAuthService] 🔐 Storing wallet seed phrases in Keychain...');
          const seedsStored = await walletKeychainService.storeAllSeeds(walletSeedPhrases, identityId);
          if (seedsStored) {
            console.log('[RealAuthService] ✅ Wallet seeds stored securely in Keychain');
          } else {
            console.warn('[RealAuthService] ⚠️ Wallet seeds not persisted to Keychain (native module not available)');
            console.warn('[RealAuthService] ℹ️  Seeds still available from Identity.walletSeedPhrases for this session');
          }
        } catch (keychainError: any) {
          console.error('[RealAuthService] ⚠️ Failed to store wallet seeds in Keychain:', keychainError);
          // Non-fatal - seeds still available from identity response
        }
      }

      // Step 5: Return final identity with wallet information
      console.log('[RealAuthService] 📱 Creating identity response with wallet data...');

      // Store wallet info in identity for immediate access
      const identity: Identity & {
        walletIds?: { primary?: string; ubi?: string; savings?: string };
        walletSeedPhrases?: { primary?: string; ubi?: string; savings?: string };
      } = {
        did: generatedIdentity.did,
        displayName: data.display_name,
        identityId: identityId,
        identityType: 'human',
        createdAt: Date.now(),
        walletIds: walletIds,
        walletSeedPhrases: walletSeedPhrases, // Server-generated, available immediately
        wallets: [],
        publicKey: '',
      };

      console.log('[RealAuthService] ✅ Identity created successfully with wallets:');
      console.log('[RealAuthService]    Primary Wallet: ' + (walletIds.primary ? '✓' : '✗'));
      console.log('[RealAuthService]    UBI Wallet: ' + (walletIds.ubi ? '✓' : '✗'));
      console.log('[RealAuthService]    Savings Wallet: ' + (walletIds.savings ? '✓' : '✗'));
      if (walletSeedPhrases && Object.keys(walletSeedPhrases).length > 0) {
        console.log('[RealAuthService] 🌱 Wallet seed phrases available:');
        console.log('[RealAuthService]    Primary: ' + (walletSeedPhrases.primary ? 'Available' : 'Not provided'));
        console.log('[RealAuthService]    UBI: ' + (walletSeedPhrases.ubi ? 'Available' : 'Not provided'));
        console.log('[RealAuthService]    Savings: ' + (walletSeedPhrases.savings ? 'Available' : 'Not provided'));
      }
      console.log('[RealAuthService] 📋 Wallet information available via Identity object');

      return identity;
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
    // console.log('[RealAuthService] 🔍 testConnection() - QUIC Handshake Test');
    try {
      // Use QUIC connection test (does full PQC handshake)
      const connected = await testQuicHealthCheck();
      // console.log(connected
      //   ? `[RealAuthService] ✅ QUIC connection successful`
      //   : `[RealAuthService] ❌ QUIC connection failed`);
      return connected;
    } catch (error: any) {
      console.error('[RealAuthService] ❌ QUIC health check failed:', error.message);
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

      const response = await quicRequest(healthUrl, {
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
