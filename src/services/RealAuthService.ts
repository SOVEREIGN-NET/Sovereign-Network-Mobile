/**
 * Real Authentication Service
 * Integrates with ZHTP API backend for actual identity operations
 */

import { ZhtpApi, ReactNativeConfigProvider, Identity, SignupRequest, LoginRequest } from '@sovereign-net/api-client/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  private readonly api: ZhtpApi;
  private readonly configProvider: ReactNativeConfigProvider;

  constructor(nodeUrl: string) {
    this.configProvider = new ReactNativeConfigProvider(
      {
        ZHTP_NODE_URL: nodeUrl,
        NETWORK_TYPE: 'testnet',
        DEBUG_MODE: __DEV__,
        ENABLE_BIOMETRICS: true,
      },
      AsyncStorage,
    );
    this.api = new ZhtpApi(this.configProvider);
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
   * Tries /api/v1/protocol/health endpoint (no authentication required)
   * @returns True if node is reachable
   */
  async testConnection(): Promise<boolean> {
    try {
      const baseUrl = this.api.getBaseUrl();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const fetchPromise = fetch(`${baseUrl}/api/v1/protocol/health`, {
        method: 'GET',
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      // 401/403 means node is reachable but auth required - that's fine
      const connected = response.ok || response.status === 401 || response.status === 403;
      console.log(connected ? '✅ Connected to ZHTP node' : `❌ Failed to connect to ZHTP node (${response.status})`);
      return connected;
    } catch (error: any) {
      console.error('❌ Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get comprehensive protocol and node information
   * Fetches node status directly from /api/v1/protocol/health endpoint
   * @returns Protocol info or null if unavailable
   */
  async getProtocolInfo() {
    try {
      const baseUrl = this.api.getBaseUrl();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const fetchPromise = fetch(`${baseUrl}/api/v1/protocol/health`, {
        method: 'GET',
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (response.ok || response.status === 401 || response.status === 403) {
        const data = await response.json();
        console.log('✅ Protocol info retrieved');
        return data;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to get protocol info:', error.message);
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
   * Update the ZHTP node URL dynamically
   * Persists to AsyncStorage for app restart
   * @param nodeUrl - New ZHTP node URL
   */
  async updateNodeUrl(nodeUrl: string): Promise<void> {
    try {
      await this.configProvider.updateConfig({ zhtpNodeUrl: nodeUrl });
      console.log('✅ Node URL updated to:', nodeUrl);
    } catch (error) {
      console.error('❌ Failed to update node URL:', error);
      throw error;
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
   * @returns Configured ZHTP node URL
   */
  getNodeUrl(): string {
    return this.api.getBaseUrl();
  }
}

// Export singleton instance with default node URL
// TODO: Make node URL configurable from app settings
const DEFAULT_NODE_URL = 'http://192.168.1.31:9333'; // Update this to your ZHTP node URL
export default new RealAuthService(DEFAULT_NODE_URL);

// Also export the class for creating custom instances
export { RealAuthService };
