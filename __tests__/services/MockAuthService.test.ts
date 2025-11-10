import authService, {
  SignInCredentials,
  CreateIdentityData,
} from 'src/services/MockAuthService';

describe('MockAuthService', () => {
  beforeEach(() => {
    // authService is a singleton, no need to instantiate
  });

  describe('getDemoCredentials', () => {
    it('should return demo credentials', () => {
      const credentials = authService.getDemoCredentials();

      expect(credentials).toBeDefined();
      expect(credentials.did).toBeDefined();
      expect(credentials.passphrase).toBeDefined();
      expect(credentials.did.startsWith('did:zhtp:')).toBe(true);
    });

    it('should return consistent demo credentials', () => {
      const credentials1 = authService.getDemoCredentials();
      const credentials2 = authService.getDemoCredentials();

      expect(credentials1.did).toBe(credentials2.did);
      expect(credentials1.passphrase).toBe(credentials2.passphrase);
    });

    it('should return valid credentials format', () => {
      const credentials = authService.getDemoCredentials();

      expect(typeof credentials.did).toBe('string');
      expect(typeof credentials.passphrase).toBe('string');
    });
  });

  describe('signIn', () => {
    it('should sign in with valid credentials', async () => {
      const credentials = authService.getDemoCredentials();
      const identity = await authService.signIn(credentials);

      expect(identity).toBeDefined();
      expect(identity.did).toBe(credentials.did);
      expect(identity.displayName).toBeDefined();
    });

    it('should throw error with invalid DID format', async () => {
      const credentials: SignInCredentials = {
        did: 'invalid-did',
        passphrase: 'password',
      };

      await expect(authService.signIn(credentials)).rejects.toThrow(
        'Invalid DID format',
      );
    });

    it('should throw error with short passphrase', async () => {
      const credentials: SignInCredentials = {
        did: 'did:zhtp:demo001',
        passphrase: 'short',
      };

      await expect(authService.signIn(credentials)).rejects.toThrow(
        'Invalid passphrase',
      );
    });

    it('should throw error with empty passphrase', async () => {
      const credentials: SignInCredentials = {
        did: 'did:zhtp:demo001',
        passphrase: '',
      };

      await expect(authService.signIn(credentials)).rejects.toThrow(
        'Invalid passphrase',
      );
    });

    it('should throw error with non-existent identity', async () => {
      const credentials: SignInCredentials = {
        did: 'did:zhtp:nonexistent',
        passphrase: 'password123',
      };

      await expect(authService.signIn(credentials)).rejects.toThrow(
        'Identity not found',
      );
    });

    it('should return identity with three wallets', async () => {
      const credentials = authService.getDemoCredentials();
      const identity = await authService.signIn(credentials);

      expect(identity.wallets).toBeDefined();
      expect(identity.wallets!.primary).toBeDefined();
      expect(identity.wallets!.ubi).toBeDefined();
      expect(identity.wallets!.savings).toBeDefined();

      // Verify wallet structure
      expect(identity.wallets!.primary.wallet_type).toBe('Primary');
      expect(identity.wallets!.ubi.wallet_type).toBe('UBI');
      expect(identity.wallets!.savings.wallet_type).toBe('Savings');
    });

    it('should return identity with voting power', async () => {
      const credentials = authService.getDemoCredentials();
      const identity = await authService.signIn(credentials);

      expect(identity.votingPower).toBeDefined();
      expect(typeof identity.votingPower).toBe('number');
    });
  });

  describe('createIdentity', () => {
    let testCounter = 0;

    const getValidCreateData = (): CreateIdentityData => ({
      identityType: 'citizen',
      username: `newuser${testCounter++}`,
      displayName: 'New User',
      passphrase: 'password123',
      acceptedTerms: true,
    });

    it('should create identity with valid data', async () => {
      const validCreateData = getValidCreateData();
      const identity = await authService.createIdentity(validCreateData);

      expect(identity).toBeDefined();
      expect(identity.did).toBeDefined();
      expect(identity.did.startsWith('did:zhtp:')).toBe(true);
      expect(identity.displayName).toBe(validCreateData.displayName);
      expect(identity.username).toBe(validCreateData.username);
    });

    it('should throw error with short display name', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        displayName: 'A',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Display name must be at least 2 characters',
      );
    });

    it('should throw error with short username', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        username: 'ab',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Username must be at least 3 characters',
      );
    });

    it('should throw error with invalid username characters', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        username: 'user@name',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Username can only contain letters, numbers, and underscores',
      );
    });

    it('should throw error with short passphrase', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        passphrase: 'pass',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Passphrase must be at least 8 characters',
      );
    });

    it('should throw error when terms not accepted', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        acceptedTerms: false,
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'You must accept the terms and conditions',
      );
    });

    it('should throw error without passphrase or biometric', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        passphrase: undefined,
        biometricHash: undefined,
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'You must set either a passphrase or biometric',
      );
    });

    it('should throw error with duplicate username', async () => {
      const data = getValidCreateData();
      await authService.createIdentity(data);

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Username already taken',
      );
    });

    it('should create identity with biometric instead of passphrase', async () => {
      const data: CreateIdentityData = {
        ...getValidCreateData(),
        passphrase: undefined,
        biometricHash: 'fingerprint_hash_123',
      };

      const identity = await authService.createIdentity(data);
      expect(identity).toBeDefined();
      expect(identity.username).toBe(data.username);
    });

    it('should return identity with three wallets', async () => {
      const identity = await authService.createIdentity(getValidCreateData());

      expect(identity.wallets).toBeDefined();
      expect(identity.wallets!.primary).toBeDefined();
      expect(identity.wallets!.ubi).toBeDefined();
      expect(identity.wallets!.savings).toBeDefined();

      // Verify 5000 ZHTP welcome bonus for citizens
      expect(identity.wallets!.primary.balance).toBe(5000);
    });

    it('should set citizenship for citizen type', async () => {
      const identity = await authService.createIdentity(getValidCreateData());

      expect(identity.citizenship).toBe(true);
    });

    it('should set appropriate voting power for identity type', async () => {
      const identity = await authService.createIdentity({
        ...getValidCreateData(),
        identityType: 'citizen',
      });

      expect(identity.votingPower).toBeGreaterThan(0);
    });

    it('should set DAO membership for citizens', async () => {
      const identity = await authService.createIdentity({
        ...getValidCreateData(),
        identityType: 'citizen',
      });

      expect(identity.daoMembership).toBeDefined();
      expect(identity.daoMembership!.votingPower).toBe(1);
      expect(identity.daoMembership!.soulboundNftIssued).toBe(true);
    });

    it('should not set DAO membership for non-citizens', async () => {
      const identity = await authService.createIdentity({
        ...getValidCreateData(),
        identityType: 'organization',
      });

      expect(identity.daoMembership).toBeUndefined();
    });
  });

  describe('recoverWithSeed', () => {
    it('should recover with valid 12-word seed phrase', async () => {
      const seedPhrase =
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
      const identity = await authService.recoverWithSeed(seedPhrase);

      expect(identity).toBeDefined();
      expect(identity.did).toBeDefined();
    });

    it('should throw error with empty seed phrase', async () => {
      await expect(authService.recoverWithSeed('')).rejects.toThrow(
        'Seed phrase cannot be empty',
      );
    });

    it('should throw error with whitespace seed phrase', async () => {
      await expect(authService.recoverWithSeed('   ')).rejects.toThrow(
        'Seed phrase cannot be empty',
      );
    });

    it('should throw error with wrong word count', async () => {
      const seedPhrase = 'word1 word2 word3 word4 word5';

      await expect(authService.recoverWithSeed(seedPhrase)).rejects.toThrow(
        'Seed phrase must be exactly 12 words',
      );
    });

    it('should return identity with expected structure', async () => {
      const seedPhrase =
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
      const identity = await authService.recoverWithSeed(seedPhrase);

      expect(identity.displayName).toBeDefined();
      expect(identity.identityType).toBeDefined();
    });
  });

  describe('recoverWithBackup', () => {
    it('should recover with valid backup file and password', async () => {
      const backup = {
        did: 'did:zhtp:demo001',
        displayName: 'Demo Citizen',
      };
      const password = 'password123';

      const identity = await authService.recoverWithBackup(
        JSON.stringify(backup),
        password,
      );

      expect(identity).toBeDefined();
      expect(identity.did).toBe(backup.did);
    });

    it('should throw error with empty backup file', async () => {
      await expect(authService.recoverWithBackup('', 'password')).rejects.toThrow(
        'Backup file content is empty',
      );
    });

    it('should throw error with short password', async () => {
      const backup = { did: 'did:zhtp:demo001', displayName: 'Demo' };

      await expect(
        authService.recoverWithBackup(JSON.stringify(backup), 'short'),
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should throw error with invalid JSON', async () => {
      await expect(
        authService.recoverWithBackup('invalid json', 'password123'),
      ).rejects.toThrow('Failed to decrypt backup file');
    });

    it('should throw error with invalid backup format', async () => {
      const invalidBackup = JSON.stringify({ invalid: 'data' });

      await expect(
        authService.recoverWithBackup(invalidBackup, 'password123'),
      ).rejects.toThrow('Invalid backup file format');
    });

    it('should throw error when identity not found', async () => {
      const backup = {
        did: 'did:zhtp:nonexistent',
        displayName: 'Not Found',
      };

      await expect(
        authService.recoverWithBackup(JSON.stringify(backup), 'password123'),
      ).rejects.toThrow('Identity not found');
    });
  });
});
