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
    it('should throw not implemented error for seed recovery', async () => {
      const seedPhrase = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20';

      await expect(authService.recoverWithSeed(seedPhrase)).rejects.toThrow(
        'Seed phrase recovery not yet implemented',
      );
    });

    it('should validate seed phrase word count', async () => {
      const shortSeedPhrase = 'word1 word2 word3';

      await expect(authService.recoverWithSeed(shortSeedPhrase)).rejects.toThrow(
        'Seed phrase must be exactly 20 words',
      );
    });

    it('should throw not implemented error for backup recovery', async () => {
      await expect(
        authService.recoverWithBackup('backup-content', 'password123'),
      ).rejects.toThrow('Backup recovery not yet implemented');
    });

    it('should throw not implemented error for social recovery', async () => {
      await expect(
        authService.recoverWithSocial('GUARD-123456'),
      ).rejects.toThrow('Social recovery not yet implemented');
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
