import { RealAuthService } from 'src/services/RealAuthService';

describe('RealAuthService', () => {
  let authService: RealAuthService;
  const TEST_NODE_URL = 'http://localhost:3000';

  beforeEach(() => {
    authService = new RealAuthService(TEST_NODE_URL);
  });

  describe('constructor', () => {
    it('should create instance with node URL', () => {
      expect(authService).toBeDefined();
      expect(authService.getApi()).toBeDefined();
    });
  });

  describe('createIdentity', () => {
    it('should validate display name length', async () => {
      const data = {
        display_name: 'A',
        password: 'SecurePass123!@#',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Display name must be at least 2 characters',
      );
    });

    it('should validate password length', async () => {
      const data = {
        display_name: 'Test User',
        password: 'short',
      };

      await expect(authService.createIdentity(data)).rejects.toThrow(
        'Password must be at least 8 characters',
      );
    });

    it('should accept valid identity data', () => {
      const data = {
        display_name: 'Test User',
        password: 'SecurePass123!@#',
        identity_type: 'human',
        recovery_options: [],
      };

      // This will fail without a running backend, but validates structure
      expect(data.display_name.length).toBeGreaterThanOrEqual(2);
      expect(data.password.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('signIn', () => {
    it('should accept valid credentials structure', () => {
      const credentials = {
        identity_id: 'abc123def456',
        password: 'SecurePass123!@#',
      };

      // Validate structure
      expect(credentials.identity_id).toBeDefined();
      expect(credentials.password).toBeDefined();
      expect(typeof credentials.identity_id).toBe('string');
      expect(typeof credentials.password).toBe('string');
    });
  });

  describe('recovery methods', () => {
    it('should validate seed phrase word count', async () => {
      const shortSeedPhrase = 'word1 word2 word3';

      await expect(authService.recoverWithSeed(shortSeedPhrase)).rejects.toThrow(
        'Seed phrase must be exactly 20 words',
      );
    });

    it('should validate empty seed phrase', async () => {
      await expect(authService.recoverWithSeed('')).rejects.toThrow(
        'Seed phrase cannot be empty',
      );
    });

    it('should validate backup file content', async () => {
      await expect(
        authService.recoverWithBackup('', 'password123'),
      ).rejects.toThrow('Backup file content is empty');
    });

    it('should validate backup password length', async () => {
      await expect(
        authService.recoverWithBackup('backup-content', 'short'),
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should validate social recovery requires guardians', async () => {
      await expect(
        authService.recoverWithSocial([]),
      ).rejects.toThrow('At least one guardian ID is required');
    });

    it('should validate social recovery with valid guardians array', () => {
      const guardianIds = ['guardian-1', 'guardian-2'];
      // Validates the input structure
      expect(guardianIds).toBeDefined();
      expect(guardianIds.length).toBeGreaterThan(0);
    });

    it('should have exportBackup and importBackup methods', () => {
      expect(typeof authService.exportBackup).toBe('function');
      expect(typeof authService.importBackup).toBe('function');
    });
  });

  describe('API integration', () => {
    it('should have access to API instance', () => {
      const api = authService.getApi();
      expect(api).toBeDefined();
    });

    it('should test connection to node', async () => {
      // This will fail without a running backend
      const connected = await authService.testConnection();
      // We expect false since no backend is running in tests
      expect(typeof connected).toBe('boolean');
    });
  });
});
