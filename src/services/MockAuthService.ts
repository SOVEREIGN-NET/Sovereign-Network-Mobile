/**
 * Mock Authentication Service
 * Simulates SOV authentication without backend integration
 * TODO: Replace with real SOV API calls when backend is ready
 */

export interface WalletInfo {
  id: string;
  wallet_type: string;
  name: string;
  balance: number;
  staked_balance: number;
  pending_rewards: number;
}

export interface Identity {
  did: string;
  displayName: string;
  username?: string;
  identityType: 'citizen' | 'organization' | 'developer' | 'validator';
  avatar?: string;
  createdAt: string;
  citizenship?: boolean;
  publicKey?: string;
  biometricHash?: string;
  wallets?: {
    primary: WalletInfo;
    ubi: WalletInfo;
    savings: WalletInfo;
  };
  daoMembership?: {
    votingPower: number;
    soulboundNftIssued: boolean;
  };
  masterSeedPhrase?: string;
  votingPower?: number;
  ubiEarned?: number;
}

// Keep old Wallet interface for backwards compatibility
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  address: string;
}

export interface SignInCredentials {
  did: string;
  passphrase: string;
}

export interface CreateIdentityData {
  identityType: 'citizen' | 'organization' | 'developer' | 'validator';
  username: string;
  displayName: string;
  passphrase?: string;
  biometricHash?: string;
  acceptedTerms: boolean;
}

export interface RecoverIdentityData {
  method: 'seed' | 'backup' | 'social';
  data: string;
}

/**
 * Mock identities for testing
 */
const MOCK_IDENTITIES: Record<string, Identity> = {
  'did:zhtp:demo001': {
    did: 'did:zhtp:demo001',
    displayName: 'Demo Citizen',
    username: 'democitizen',
    identityType: 'citizen',
    avatar: '👤',
    createdAt: '2025-10-15T08:00:00Z',
    citizenship: true,
    wallets: {
      primary: {
        id: 'wallet_primary_001',
        wallet_type: 'Primary',
        name: 'Primary Wallet',
        balance: 5000,
        staked_balance: 0,
        pending_rewards: 0,
      },
      ubi: {
        id: 'wallet_ubi_001',
        wallet_type: 'UBI',
        name: 'UBI Wallet',
        balance: 150.5,
        staked_balance: 0,
        pending_rewards: 0,
      },
      savings: {
        id: 'wallet_savings_001',
        wallet_type: 'Savings',
        name: 'Savings Wallet',
        balance: 0,
        staked_balance: 0,
        pending_rewards: 0,
      },
    },
    daoMembership: {
      votingPower: 1000,
      soulboundNftIssued: true,
    },
    votingPower: 1000,
    ubiEarned: 150.5,
    masterSeedPhrase: 'abandon ability able about above absent absorb abstract abuse access accident account achieve acid acoustic acquire across act action activate adapt add addict',
  },
  'did:zhtp:demo002': {
    did: 'did:zhtp:demo002',
    displayName: 'Test Organization',
    username: 'testorg',
    identityType: 'organization',
    avatar: '🏢',
    createdAt: '2025-10-16T10:30:00Z',
    citizenship: false,
    wallets: {
      primary: {
        id: 'wallet_primary_002',
        wallet_type: 'Primary',
        name: 'Treasury',
        balance: 50000,
        staked_balance: 0,
        pending_rewards: 0,
      },
      ubi: {
        id: 'wallet_ubi_002',
        wallet_type: 'UBI',
        name: 'UBI Wallet',
        balance: 0,
        staked_balance: 0,
        pending_rewards: 0,
      },
      savings: {
        id: 'wallet_savings_002',
        wallet_type: 'Savings',
        name: 'Savings Wallet',
        balance: 0,
        staked_balance: 0,
        pending_rewards: 0,
      },
    },
    daoMembership: {
      votingPower: 5000,
      soulboundNftIssued: false,
    },
    votingPower: 5000,
  },
};

/**
 * Mock auth service
 * All operations are simulated with delays to mimic network latency
 */
class MockAuthService {
  private delay: number = 800; // Simulate network delay

  /**
   * Get demo credentials for testing
   * @returns Demo credentials object
   */
  getDemoCredentials(): SignInCredentials {
    return {
      did: 'did:zhtp:demo001',
      passphrase: 'democitizen',
    };
  }

  /**
   * Simulate signing in with DID and passphrase
   * @param credentials - DID and passphrase
   * @returns Identity if successful
   */
  async signIn(credentials: SignInCredentials): Promise<Identity> {
    await this.simulateDelay();

    // Mock validation
    if (!credentials.did.startsWith('did:zhtp:')) {
      throw new Error('Invalid DID format. Expected: did:zhtp:...');
    }

    if (!credentials.passphrase || credentials.passphrase.length < 6) {
      throw new Error('Invalid passphrase');
    }

    // Mock lookup
    const identity = MOCK_IDENTITIES[credentials.did];
    if (!identity) {
      throw new Error('Identity not found on SOV network');
    }

    // Mock successful signin
    console.log(`✅ Signed in as: ${identity.displayName}`);
    return identity;
  }

  /**
   * Simulate creating a new ZK-DID identity
   * @param data - Identity creation data
   * @returns Newly created identity
   */
  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    await this.simulateDelay();

    // Mock validation
    if (!data.displayName || data.displayName.length < 2) {
      throw new Error('Display name must be at least 2 characters');
    }

    if (!data.username || data.username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      throw new Error('Username can only contain letters, numbers, and underscores');
    }

    if (data.passphrase && data.passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters');
    }

    if (!data.acceptedTerms) {
      throw new Error('You must accept the terms and conditions');
    }

    if (!data.passphrase && !data.biometricHash) {
      throw new Error('You must set either a passphrase or biometric');
    }

    // Mock username availability check
    const existingUsername = Object.values(MOCK_IDENTITIES).find(
      (id) => id.username === data.username
    );
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Generate mock DID
    const newDid = `did:zhtp:${this.generateMockId()}`;

    // Create identity
    const newIdentity: Identity = {
      did: newDid,
      displayName: data.displayName,
      username: data.username,
      identityType: data.identityType,
      avatar: this.getAvatarForType(data.identityType),
      createdAt: new Date().toISOString(),
      citizenship: data.identityType === 'citizen',
      wallets: {
        primary: {
          id: 'wallet_primary_' + this.generateMockId(),
          wallet_type: 'Primary',
          name: 'Primary Wallet',
          balance: data.identityType === 'citizen' ? 5000 : 0, // Welcome bonus
          staked_balance: 0,
          pending_rewards: 0,
        },
        ubi: {
          id: 'wallet_ubi_' + this.generateMockId(),
          wallet_type: 'UBI',
          name: 'UBI Wallet',
          balance: 0,
          staked_balance: 0,
          pending_rewards: 0,
        },
        savings: {
          id: 'wallet_savings_' + this.generateMockId(),
          wallet_type: 'Savings',
          name: 'Savings Wallet',
          balance: 0,
          staked_balance: 0,
          pending_rewards: 0,
        },
      },
      daoMembership: data.identityType === 'citizen' ? {
        votingPower: 1,
        soulboundNftIssued: true,
      } : undefined,
      masterSeedPhrase: this.generateSeedPhrase().join(' '),
      votingPower: data.identityType === 'citizen' ? 1 : 0,
      ubiEarned: 0,
    };

    // Mock store
    MOCK_IDENTITIES[newDid] = newIdentity;

    console.log(`✅ Identity created: ${newIdentity.did}`);
    return newIdentity;
  }

  /**
   * Simulate recovering identity with seed phrase
   * @param seedPhrase - 24-word seed
   * @returns Recovered identity
   */
  async recoverWithSeed(seedPhrase: string): Promise<Identity> {
    await this.simulateDelay();

    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error('Seed phrase cannot be empty');
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 24) {
      throw new Error('Seed phrase must be exactly 24 words');
    }

    // Mock recovery - use first word to map to a demo identity
    const didKey = Object.keys(MOCK_IDENTITIES)[0];
    if (!didKey) {
      throw new Error('No identities to recover');
    }

    console.log(`✅ Identity recovered from seed phrase`);
    return MOCK_IDENTITIES[didKey];
  }

  /**
   * Simulate recovering identity with backup file
   * @param fileContent - Backup file content
   * @param password - Password to decrypt backup
   * @returns Recovered identity
   */
  async recoverWithBackup(fileContent: string, password: string): Promise<Identity> {
    await this.simulateDelay();

    if (!fileContent) {
      throw new Error('Backup file content is empty');
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Mock decryption
    try {
      const backup = JSON.parse(fileContent);
      if (!backup.did || !backup.displayName) {
        throw new Error('Invalid backup file format');
      }

      const identity = MOCK_IDENTITIES[backup.did];
      if (!identity) {
        throw new Error('Identity not found');
      }

      console.log(`✅ Identity recovered from backup file`);
      return identity;
    } catch (error: any) {
      // Rethrow validation errors as-is
      if (error.message === 'Invalid backup file format' || error.message === 'Identity not found') {
        throw error;
      }
      // Catch JSON parsing errors
      throw new Error('Failed to decrypt backup file');
    }
  }

  /**
   * Simulate recovering identity with social recovery
   * @param guardianCode - Guardian recovery code
   * @returns Recovered identity
   */
  async recoverWithSocial(guardianIds: string[]): Promise<Identity> {
    await this.simulateDelay();

    if (!guardianIds || !Array.isArray(guardianIds) || guardianIds.length === 0) {
      throw new Error('At least one guardian ID is required');
    }

    // Validate guardian IDs format
    for (const id of guardianIds) {
      if (!id || typeof id !== 'string' || id.length < 3) {
        throw new Error('Invalid guardian ID format');
      }
    }

    // Mock recovery - return first demo identity
    const didKey = Object.keys(MOCK_IDENTITIES)[0];
    if (!didKey) {
      throw new Error('No identities available for recovery');
    }

    console.log(`✅ Identity recovered via social recovery with ${guardianIds.length} guardian(s)`);
    return MOCK_IDENTITIES[didKey];
  }

  /**
   * Check if a username is available
   * @param username - Username to check
   * @returns True if available
   */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    await this.simulateDelay();

    if (!username || username.length < 3) {
      return false;
    }

    const exists = Object.values(MOCK_IDENTITIES).some((id) => id.username === username);
    return !exists;
  }

  /**
   * Get all stored mock identities (for testing)
   * @returns All identities
   */
  getMockIdentities(): Identity[] {
    return Object.values(MOCK_IDENTITIES);
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Simulate network delay
   */
  private simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delay));
  }

  /**
   * Generate mock seed phrase (24 words)
   */
  private generateSeedPhrase(): string[] {
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'abuse', 'access',
      'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act', 'action',
      'activate', 'active', 'actor', 'acts', 'actual', 'acute', 'addition', 'address', 'adjacent', 'adjust',
    ];
    const phrase: string[] = [];
    for (let i = 0; i < 24; i++) {
      phrase.push(words[Math.floor(Math.random() * words.length)]);
    }
    return phrase;
  }

  /**
   * Generate a mock ID
   */
  private generateMockId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  /**
   * Generate a mock wallet address
   */
  private generateMockAddress(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let address = 'zhtp1';
    for (let i = 0; i < 20; i++) {
      address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
  }

  /**
   * Get avatar emoji for identity type
   */
  private getAvatarForType(type: string): string {
    const avatars: Record<string, string> = {
      citizen: '👤',
      organization: '🏢',
      developer: '👨‍💻',
      validator: '🔒',
    };
    return avatars[type] || '👤';
  }
}

// Export singleton instance
export default new MockAuthService();
