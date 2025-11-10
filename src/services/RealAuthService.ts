/**
 * Real Authentication Service
 * Integrates with ZHTP API backend for actual identity operations
 */

import { ZhtpApi, Identity, SignupRequest, LoginRequest } from '@sovereign-net/api-client';

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
 * Real auth service using ZHTP API
 */
class RealAuthService {
  private api: ZhtpApi;

  constructor(nodeUrl: string) {
    this.api = new ZhtpApi({
      zhtpNodeUrl: nodeUrl,
      networkType: 'testnet',
      debugMode: __DEV__,
      enableBiometrics: false,
    });
  }

  /**
   * Sign in with identity ID and password
   * @param credentials - Identity ID and password
   * @returns Identity with wallets
   */
  async signIn(credentials: SignInCredentials): Promise<Identity> {
    const request: LoginRequest = {
      identity_id: credentials.identity_id,
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
   * @param data - Identity creation data
   * @returns Newly created identity with seed phrases
   */
  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    // Validation
    if (!data.display_name || data.display_name.length < 2) {
      throw new Error('Display name must be at least 2 characters');
    }

    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const request: SignupRequest = {
      display_name: data.display_name,
      password: data.password,
      identity_type: data.identity_type || 'human',
      recovery_options: data.recovery_options || [],
    };

    try {
      const identity = await this.api.signup(request);
      console.log('✅ Identity created:', identity.did);

      // Log seed phrases reminder (they should be displayed to user once)
      if (identity.seedPhrases) {
        console.warn('⚠️ IMPORTANT: Save seed phrases securely!');
      }

      return identity;
    } catch (error: any) {
      console.error('❌ Identity creation failed:', error);
      throw new Error(error.message || 'Failed to create identity');
    }
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
      // TODO: Implement recovery endpoint on backend
      // For now, throw error indicating feature not yet implemented
      throw new Error('Seed phrase recovery not yet implemented on backend');
    } catch (error: any) {
      console.error('❌ Recovery failed:', error);
      throw error;
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
      // TODO: Implement backup recovery endpoint on backend
      throw new Error('Backup recovery not yet implemented on backend');
    } catch (error: any) {
      console.error('❌ Backup recovery failed:', error);
      throw error;
    }
  }

  /**
   * Recover identity with social recovery
   * @param guardianCode - Guardian recovery code
   * @returns Recovered identity
   */
  async recoverWithSocial(guardianCode: string): Promise<Identity> {
    if (!guardianCode || guardianCode.length < 6) {
      throw new Error('Invalid guardian code');
    }

    try {
      // TODO: Implement social recovery endpoint on backend
      throw new Error('Social recovery not yet implemented on backend');
    } catch (error: any) {
      console.error('❌ Social recovery failed:', error);
      throw error;
    }
  }

  /**
   * Test connection to ZHTP node
   * @returns True if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const connected = await this.api.testConnection();
      console.log(connected ? '✅ Connected to ZHTP node' : '❌ Failed to connect to ZHTP node');
      return connected;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
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
}

// Export singleton instance with default node URL
// TODO: Make node URL configurable from app settings
const DEFAULT_NODE_URL = 'http://localhost:3000'; // Update this to your ZHTP node URL
export default new RealAuthService(DEFAULT_NODE_URL);

// Also export the class for creating custom instances
export { RealAuthService };
