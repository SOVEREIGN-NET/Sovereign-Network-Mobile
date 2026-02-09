/**
 * Authentication Context
 * Manages global auth state for the app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import SeedVaultService from '../services/SeedVaultService';
import { rateLimiter } from '../services/RateLimiter';
import MockAuthService from '../services/MockAuthService';
import type { Identity } from '../types/identity';
import type { CreateIdentityData } from '../services/RealAuthService';
import { walletKeychainService } from '../services/WalletKeychainService';
import { nativeIdentityProvisioning } from '../services/NativeIdentityProvisioning';
import IdentityCleanup from '../services/IdentityCleanup';
import { maskIdentifier } from '../utils/maskIdentifier';

// Always import RealAuthService, use it when node is available
import RealAuthServiceModule from '../services/RealAuthService';

// Use real auth service instance
const RealAuthService = RealAuthServiceModule;

// Use native storage on Android, AsyncStorage on iOS
const storage = Platform.OS === 'android' ? NativeStorage : AsyncStorage;
const MIGRATION_REQUIRED_KEY = 'sovnet_migration_required';
const MIGRATION_REQUIRED_REASON_KEY = 'sovnet_migration_required_reason';

function isSecureStorageUnavailableError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();

  // Heuristic match for common secure storage failures (device not secured, keystore reset, etc).
  return (
    message.includes('cryptofailedexception') ||
    message.includes('keystore') ||
    message.includes('strongbox') ||
    message.includes('secure hardware') ||
    message.includes('authentication tag verification failed') ||
    message.includes('user not authenticated') ||
    message.includes('biometry') ||
    message.includes('biometric') ||
    (message.includes('keychain') && message.includes('unavailable'))
  );
}

// Create context for feature flag management
type UseMockServiceListener = (useMock: boolean) => void;
const mockServiceListeners = new Set<UseMockServiceListener>();

let cachedUseMockService: boolean | null = null;

/**
 * Get current feature flag state (mock vs real data)
 */
export function getUseMockService(): boolean {
  if (cachedUseMockService === null) {
    // Return default only if not yet loaded
    return process.env.REACT_APP_USE_MOCK_AUTH === 'true' && __DEV__;
  }
  return cachedUseMockService;
}

/**
 * Set feature flag state (called from Developer Settings)
 */
export function setUseMockService(value: boolean): void {
  if (cachedUseMockService !== value) {
    cachedUseMockService = value;
    // Persist to storage
    const key = 'zhtp_use_mock_service';
    if (value === (process.env.REACT_APP_USE_MOCK_AUTH === 'true' && __DEV__)) {
      // If setting back to default, remove from storage
      storage.removeItem(key).catch(err => console.warn('Failed to clear mock service setting:', err));
    } else {
      // Otherwise persist the override
      storage.setItem(key, JSON.stringify(value)).catch(err => console.warn('Failed to save mock service setting:', err));
    }
    // Notify all listeners
    notifyMockServiceListeners(value);
  }
}

/**
 * Subscribe to feature flag changes
 */
export function onMockServiceChange(listener: UseMockServiceListener): () => void {
  mockServiceListeners.add(listener);
  return () => {
    mockServiceListeners.delete(listener);
  };
}

/**
 * Notify listeners of mock service flag change
 */
function notifyMockServiceListeners(value: boolean): void {
  mockServiceListeners.forEach(listener => {
    listener(value);
  });
}

/**
 * Initialize the mock service flag from storage
 */
async function initializeMockServiceFlag(): Promise<void> {
  try {
    const stored = await storage.getItem('zhtp_use_mock_service');
    if (stored !== null) {
      const value = JSON.parse(stored);
      cachedUseMockService = value;
    } else {
      cachedUseMockService = process.env.REACT_APP_USE_MOCK_AUTH === 'true' && __DEV__;
    }
  } catch (err) {
    console.warn('Failed to load mock service setting, using default:', err);
    cachedUseMockService = process.env.REACT_APP_USE_MOCK_AUTH === 'true' && __DEV__;
  }
}

// Initialize on module load
initializeMockServiceFlag();

export interface AuthContextType {
  currentIdentity: Identity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isBootstrapping: boolean;
  migrationRequired: boolean;
  error: string | null;
  restoreWarning: string | null;
  signIn: (identity_id: string, password: string) => Promise<Identity>;
  createIdentity: (data: CreateIdentityData) => Promise<Identity>;
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  recoverIdentity: (method: string, data: string) => Promise<Identity>;
  migrateIdentityFromSeed: (displayName: string, seedPhrase: string) => Promise<{ identity: Identity; newSeedPhrase: string[] }>;
  forceCleanupAndSignOut: (reason?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  clearRestoreWarning: () => void;
  updateProfile: (displayName: string, avatar?: string) => Promise<void>;
  updatePassphrase: (newPassphrase: string) => Promise<void>;
  updateBiometric: (enabled: boolean) => Promise<void>;
  setCurrentIdentity: (identity: Identity) => Promise<void>;
  // On-demand identity loading (with biometric prompt when accessing protected features)
  loadIdentityOnDemand: () => Promise<Identity | null>;
  // SECURITY: Phase 3.1 - Biometric authentication methods
  isBiometricAvailable: () => Promise<boolean>;
  getBiometryType: () => Promise<string | null>;
  // Wallet seed management (server-generated, stored securely in Keychain)
  getMasterSeedPhrase: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth Provider Component
 * Wraps the app and provides auth state and methods to all children
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  // Carries password from createIdentity() across the async seed phrase confirmation
  // to setIdentity() where login credentials are persisted for local sign-in + OS autofill.
  const pendingPasswordRef = useRef<string | null>(null);

  const setMigrationRequiredFlag = useCallback(async (reason?: string) => {
    setMigrationRequired(true);
    await AsyncStorage.setItem(MIGRATION_REQUIRED_KEY, '1');
    if (reason) {
      await AsyncStorage.setItem(MIGRATION_REQUIRED_REASON_KEY, reason);
    }
  }, []);

  const clearMigrationRequiredFlag = useCallback(async () => {
    setMigrationRequired(false);
    await AsyncStorage.removeItem(MIGRATION_REQUIRED_KEY);
    await AsyncStorage.removeItem(MIGRATION_REQUIRED_REASON_KEY);
  }, []);

  /**
   * Restore identity from secure storage on app load
   * SECURITY: Uses Keychain-backed storage instead of plaintext AsyncStorage
   * Note: Does not require biometric on startup - user can unlock Keychain later when needed
   *
   * SECURITY: Also restores lib-client Identity to handle store for UHP signing
   */
  useEffect(() => {
    const restoreIdentity = async () => {
      try {
        const migrationFlag = await AsyncStorage.getItem(MIGRATION_REQUIRED_KEY);
        if (migrationFlag) {
          setMigrationRequired(true);
          await IdentityCleanup.cleanAllIdentities();
          setCurrentIdentity(null);
          return;
        }

        // Try to restore cached identity without biometric prompt on startup
        // This keeps user logged in between app sessions
        const identity = await SecureIdentityStorage.getIdentityIfAvailable(true);

        if (identity) {
          if (__DEV__) {
            console.log('✅ Restored identity from secure storage:', identity.displayName);
          }
          setCurrentIdentity(identity);

          // Restore lib-client Identity handle for signing (tokens, domains, UHP)
          if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
            try {
              const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
                identity.identityId
              );
              if (__DEV__) {
                console.log('[AuthContext.bootstrap] Handle store restore:', result?.status);
              }
            } catch (err) {
              console.warn('[AuthContext.bootstrap] Handle store restore failed:', err);
            }
          }
        }
      } catch (err) {
        console.error('Failed to restore cached identity:', err);
        // Continue with no identity if restore fails
      } finally {
        setIsBootstrapping(false);
      }
    };

    restoreIdentity();
  }, []);

  /**
   * Sign in with identity_id and password
   * SECURITY: Uses SecureIdentityStorage + rate limiting to prevent brute force
   */
  const signIn = useCallback(async (identity_id: string, password: string): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      const normalizedIdentityId = identity_id.trim();
      // SECURITY: Check rate limiting before attempting login
      const rateLimitStatus = rateLimiter.isBlocked(normalizedIdentityId);
      if (rateLimitStatus.blocked) {
        const errorMessage = rateLimitStatus.reason || 'Too many login attempts. Please try again later.';
        setError(errorMessage);
        throw new Error(errorMessage);
      }

      let identity: Identity;

      if (getUseMockService()) {
        identity = await MockAuthService.signIn({ did: normalizedIdentityId, passphrase: password });
      } else {
        identity = await RealAuthService!.signIn({ identity_id: normalizedIdentityId, password });
      }

      // Success: Clear rate limit attempts
      rateLimiter.clearAttempts(normalizedIdentityId);

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          if (result?.status === 'restored') {
            setRestoreWarning(null);
            console.log('[AuthContext.signIn] ✅ Identity restored to handle store:', result);
          } else if (result?.status === 'skipped') {
            const message = `Handle store restore skipped: ${result.reason}${
              result.error ? ` (${result.error})` : ''
            }`;
            setRestoreWarning(message);
            console.warn('[AuthContext.signIn] ⚠️ Handle store restore skipped:', result);
          } else {
            console.log('[AuthContext.signIn] ℹ️ Handle store restoration result:', result);
          }
        } catch (err) {
          console.error('[AuthContext.signIn] ⚠️ Failed to restore Identity to handle store:', err);
          setRestoreWarning('Handle store restore failed');
          // Non-fatal - continue anyway
        }
      }

      return identity;
    } catch (err: any) {
      // SECURITY: Record failed attempt for rate limiting
      rateLimiter.recordAttempt(identity_id.trim());

      const message = err.message || 'Sign in failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new identity
   */
  const createIdentity = useCallback(async (data: CreateIdentityData): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (getUseMockService()) {
        const identityType: 'citizen' | 'organization' | 'developer' | 'validator' =
          data.identity_type as 'citizen' | 'organization' | 'developer' | 'validator';

        identity = await MockAuthService.createIdentity({
          displayName: data.display_name,
          passphrase: data.password,
          identityType: identityType || 'citizen',
          username: data.display_name.toLowerCase().replaceAll(/\s+/g, '_'),
          acceptedTerms: true,
        });
      } else {
        identity = await RealAuthService!.createIdentity(data);
      }

      // Stash password for later storage when setIdentity() is called
      // after the user confirms their seed phrase
      pendingPasswordRef.current = data.password;

      // Don't save to storage or set as currentIdentity yet
      // The CreateIdentityScreen will show the master seed phrase first
      // Only save to storage after user confirms via SeedPhraseScreen
      return identity;
    } catch (err: any) {
      const message = err.message || 'Identity creation failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if a username is available
   */
  const checkUsernameAvailability = useCallback(async (username: string): Promise<boolean> => {
    if (getUseMockService()) {
      return MockAuthService.checkUsernameAvailability(username);
    }
    return RealAuthService.checkUsernameAvailability(username);
  }, []);

  /**
   * Recover identity using various methods
   */
  const recoverIdentity = useCallback(async (method: string, data: string): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (getUseMockService()) {
        if (method === 'seed') {
          identity = await MockAuthService.recoverWithSeed(data);
        } else if (method === 'backup') {
          const [fileContent, password] = data.split('|||');
          identity = await MockAuthService.recoverWithBackup(fileContent, password);
        } else if (method === 'social') {
          // Parse guardian IDs from JSON string
          const guardianIds = JSON.parse(data) as string[];
          identity = await MockAuthService.recoverWithSocial(guardianIds);
        } else {
          throw new Error('Unknown recovery method');
        }
      } else if (method === 'seed') {
        identity = await RealAuthService.recoverWithSeed(data);
      } else if (method === 'backup') {
        const [fileContent, password] = data.split('|||');
        identity = await RealAuthService.recoverWithBackup(fileContent, password);
      } else if (method === 'social') {
        // Parse guardian IDs from JSON string
        const guardianIds = JSON.parse(data) as string[];
        identity = await RealAuthService.recoverWithSocial(guardianIds);
      } else {
        throw new Error('Unknown recovery method');
      }

      if (method === 'seed' && RealAuthService.getLastSeedRecoveryNotFound()) {
        await setMigrationRequiredFlag('seed_recovery_not_found');
        setCurrentIdentity(null);
        throw new Error('MIGRATION_REQUIRED');
      }

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          if (result?.status === 'restored') {
            setRestoreWarning(null);
            console.log('[AuthContext.recoverIdentity] ✅ Identity restored to handle store:', result);
          } else if (result?.status === 'skipped') {
            const message = `Handle store restore skipped: ${result.reason}${
              result.error ? ` (${result.error})` : ''
            }`;
            setRestoreWarning(message);
            console.warn('[AuthContext.recoverIdentity] ⚠️ Handle store restore skipped:', result);
          } else {
            console.log('[AuthContext.recoverIdentity] ℹ️ Handle store restoration result:', result);
          }
        } catch (err) {
          console.error('[AuthContext.recoverIdentity] ⚠️ Failed to restore Identity to handle store:', err);
          setRestoreWarning('Handle store restore failed');
          // Non-fatal - continue anyway
        }
      }

      return identity;
    } catch (err: any) {
      const message = err.message || 'Identity recovery failed';
      if (message.includes('MIGRATION_REQUIRED')) {
        await setMigrationRequiredFlag('seed_recovery_not_found');
        setCurrentIdentity(null);
        setError(null);
        throw err;
      }
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setMigrationRequiredFlag]);

  /**
   * Manually set the current identity
   * Used after saving identity to storage (e.g., after seed phrase confirmation)
   * SECURITY: Uses SecureIdentityStorage instead of plaintext AsyncStorage
   * Also ensures lib-client Identity is available in handle store for signing
   */
  const setIdentity = useCallback(async (identity: Identity) => {
    try {
      if (__DEV__) {
        console.log('🔐 AuthContext.setIdentity: Saving identity:', maskIdentifier(identity.did));
      }
      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      // Save login credentials for local sign-in + OS autofill
      // Validate DID format first — react-native-keychain AES-CBC can silently corrupt on retrieval
      if (pendingPasswordRef.current && identity.did &&
          /^did:zhtp:[0-9a-f]{64}$/.test(identity.did)) {
        await SecureIdentityStorage.saveLoginCredentials(identity.did, pendingPasswordRef.current);
        pendingPasswordRef.current = null;
      }

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
        if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
          try {
            const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
              identity.identityId
            );
            if (result?.status === 'restored') {
              setRestoreWarning(null);
              console.log('[AuthContext.setIdentity] ✅ Identity restored to handle store:', result);
            } else if (result?.status === 'skipped') {
              const message = `Handle store restore skipped: ${result.reason}${
                result.error ? ` (${result.error})` : ''
              }`;
              setRestoreWarning(message);
              console.warn('[AuthContext.setIdentity] ⚠️ Handle store restore skipped:', result);
            } else {
              console.log('[AuthContext.setIdentity] ℹ️ Handle store restoration result:', result);
            }
          } catch (err) {
            console.error('[AuthContext.setIdentity] ⚠️ Failed to restore Identity to handle store:', err);
            setRestoreWarning('Handle store restore failed');
            // Non-fatal - continue anyway
          }
        }
    } catch (err: any) {
      const message = err.message || 'Failed to set identity';
      setError(message);
      throw err;
    }
  }, []);

  const migrateIdentityFromSeed = useCallback(async (
    displayName: string,
    seedPhrase: string
  ): Promise<{ identity: Identity; newSeedPhrase: string[] }> => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await RealAuthService.migrateIdentityFromSeed(displayName, seedPhrase);
      // Persist identity to secure storage but DON'T set currentIdentity yet.
      // MigrationSeedScreen navigates to SeedPhraseScreen which calls setCurrentIdentity
      // after the user confirms their seed phrase. Setting it here would trigger
      // navigation away from AuthNavigator before the user sees the seed.
      await SecureIdentityStorage.setIdentity(result.identity, { requireBiometric: false });
      await clearMigrationRequiredFlag();
      return result;
    } catch (err: any) {
      const message = err.message || 'Migration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [clearMigrationRequiredFlag]);

  /**
   * Update user profile (display name, avatar)
   */
  const updateProfile = useCallback(async (displayName: string, avatar?: string) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const updatedIdentity = {
        ...currentIdentity,
        displayName,
        avatar: avatar || currentIdentity.avatar,
      };

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(updatedIdentity);
      setCurrentIdentity(updatedIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update profile';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Update passphrase
   */
  const updatePassphrase = useCallback(async (_newPassphrase: string) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // In real app, this would hash and save to backend
      // For mock, we just update locally
      const updatedIdentity = {
        ...currentIdentity,
        // Mark that passphrase was updated (don't actually store it)
      };

      await storage.setItem('zhtp_identity', JSON.stringify(updatedIdentity));
      setCurrentIdentity(updatedIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update passphrase';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Update biometric setting
   * When enabled: Requires biometric (Face ID, Touch ID, etc.) to access private keys
   * When disabled: Only requires device unlock to access private keys
   */
  const updateBiometric = useCallback(async (enabled: boolean) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      console.log(`[AuthContext] ${enabled ? 'Enabling' : 'Disabling'} biometric protection`);

      // Re-save identity with new biometric setting
      // This triggers SecureIdentityStorage to update Keychain access control
      await SecureIdentityStorage.setIdentity(currentIdentity, {
        requireBiometric: enabled,
        accessibleAfterFirstUnlock: true,
      });

      console.log(`[AuthContext] ✅ Biometric ${enabled ? 'enabled' : 'disabled'}`);
      // Identity doesn't change, just storage settings
      setCurrentIdentity(currentIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update biometric setting';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Sign out (clear identity)
   * SECURITY: Clears both Keychain and AsyncStorage
   */
  const signOut = useCallback(async () => {
    setError(null);
    setRestoreWarning(null);
    setIsLoading(true);

    try {
      // Clear from secure storage (Keychain and AsyncStorage)
      await SecureIdentityStorage.clearIdentity();
      setCurrentIdentity(null);
    } catch (err: any) {
      const message = err.message || 'Sign out failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forceCleanupAndSignOut = useCallback(async (reason?: string) => {
    setError(null);
    setRestoreWarning(null);
    setIsLoading(true);
    try {
      await setMigrationRequiredFlag(reason);
      await IdentityCleanup.cleanAllIdentities();
      setCurrentIdentity(null);
    } catch (err: any) {
      const message = err.message || 'Cleanup failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setMigrationRequiredFlag]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearRestoreWarning = useCallback(() => {
    setRestoreWarning(null);
  }, []);

  /**
   * Load identity on-demand when user needs to access protected features
   * This shows biometric prompt at the time of access, not on app startup
   * If user denies biometric or Keychain access, returns null (user can retry)
   */
  const loadIdentityOnDemand = useCallback(async (): Promise<Identity | null> => {
    try {
      if (currentIdentity) {
        // Already loaded
        return currentIdentity;
      }

      console.log('[AuthContext] Loading identity on-demand (may prompt for biometric)...');
      const identity = await SecureIdentityStorage.getIdentity();
      if (identity) {
        console.log('[AuthContext] ✅ Identity loaded on-demand');
        setCurrentIdentity(identity);
        // Sync backup with latest identity (ensures backup stays current)
        await SecureIdentityStorage.syncBackup(identity).catch(() => {
          // Non-fatal - backup sync failure shouldn't block operation
        });
        return identity;
      }
      console.log('[AuthContext] ⚠️ No identity found');
      return null;
    } catch (err: any) {
      // User may have cancelled biometric prompt - this is not an error
      const errorMsg = err.message || String(err);
      if (errorMsg.includes('cancelled') || errorMsg.includes('denied') || errorMsg.includes('unavailable')) {
        console.log('[AuthContext] User cancelled biometric authentication:', errorMsg);
        return null;
      }
      console.error('[AuthContext] Failed to load identity on-demand:', err);
      return null;
    }
  }, [currentIdentity]);

  /**
   * SECURITY: Phase 3.1 - Check if biometric authentication is available
   * Returns true if device supports biometric (Face ID, Touch ID, Fingerprint, Iris, etc.)
   */
  const isBiometricAvailable = useCallback(async (): Promise<boolean> => {
    return SeedVaultService.enableBiometricAuth();
  }, []);

  /**
   * SECURITY: Phase 3.1 - Get the type of biometry available on device
   * Returns: 'FaceID', 'TouchID', 'Iris', 'Fingerprint', or null if unavailable
   */
  const getBiometryType = useCallback(async (): Promise<string | null> => {
    return SeedVaultService.getBiometryType();
  }, []);

  const getMasterSeedPhrase = useCallback(async (): Promise<string | null> => {
    try {
      let secureStorageUnavailable = false;

      // 1. Wallet keychain (identity-specific seed storage)
      if (currentIdentity?.identityId) {
        try {
          const stored = await walletKeychainService.retrieveMasterSeedPhrase(currentIdentity.identityId);
          if (stored) {
            return stored;
          }
        } catch (err) {
          secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(err);
        }
      }

      // 2. SeedVaultService (biometric-protected vault in react-native-keychain)
      try {
        const vault = await SeedVaultService.getSeedPhraseWithBiometric();
        if (vault) {
          return vault.join(' ');
        }
      } catch (err) {
        secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(err);
        if (!isSecureStorageUnavailableError(err)) {
          // Non-storage error (user cancelled biometric prompt, etc.) — re-throw
          throw err;
        }
        // Vault invalidated (keystore reset, biometrics changed) — fall through to native fallback
        console.warn('[AuthContext] Seed vault invalidated, trying native identity store fallback');
      }

      // 3. Native fallback: derive seed from identity stored in native secure storage
      //    Android: EncryptedSharedPreferences (AES-256-GCM via MasterKey — NOT affected by
      //             biometric vault invalidation, unlike react-native-keychain's AES-CBC vault)
      //    iOS: IdentityHandleStore / cached identities
      //
      //    This resolves the chicken-and-egg problem where the vault is invalidated
      //    but the user needs the seed to recover their identity.
      const identityIdOrDid = currentIdentity?.identityId
        || currentIdentity?.did
        || (NativeModules.NativeIdentityProvisioning
          ? await NativeModules.NativeIdentityProvisioning.getCurrentIdentityDid().catch(() => null)
          : null);

      if (identityIdOrDid) {
        // Android primary: getSeedPhraseFromStoredIdentity reads from EncryptedSharedPreferences
        if (Platform.OS === 'android') {
          try {
            const phrase = await nativeIdentityProvisioning.getSeedPhraseFromStoredIdentity(identityIdOrDid);
            if (phrase) {
              return phrase;
            }
          } catch (fallbackError) {
            console.warn('[AuthContext] getSeedPhraseFromStoredIdentity failed:', fallbackError);
            secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(fallbackError);
          }
        }

        // Cross-platform: getSeedPhraseForBackup from handle store / cached identities
        try {
          const phrase = await nativeIdentityProvisioning.getSeedPhraseForBackup(identityIdOrDid);
          if (phrase) {
            return phrase;
          }
        } catch (fallbackError) {
          console.warn('[AuthContext] getSeedPhraseForBackup failed:', fallbackError);
          secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(fallbackError);
        }
      }

      if (secureStorageUnavailable) {
        throw new Error(
          'Could not retrieve seed phrase from this device. '
          + 'If you have your 24-word seed phrase written down, enter it manually to recover.'
        );
      }

      return null;
    } catch (err: any) {
      console.error('[AuthContext] Failed to retrieve master seed phrase:', err);
      throw err;
    }
  }, [currentIdentity?.identityId]);

  const value = useMemo<AuthContextType>(() => ({
    currentIdentity,
    isAuthenticated: currentIdentity !== null,
    isLoading,
    isBootstrapping,
    migrationRequired,
    error,
    restoreWarning,
    signIn,
    createIdentity,
    checkUsernameAvailability,
    recoverIdentity,
    migrateIdentityFromSeed,
    forceCleanupAndSignOut,
    signOut,
    clearError,
    clearRestoreWarning,
    updateProfile,
    updatePassphrase,
    updateBiometric,
    setCurrentIdentity: setIdentity,
    loadIdentityOnDemand,
    isBiometricAvailable,
    getBiometryType,
    getMasterSeedPhrase,
  }), [
    currentIdentity,
    isLoading,
    isBootstrapping,
    migrationRequired,
    error,
    restoreWarning,
    signIn,
    createIdentity,
    checkUsernameAvailability,
    recoverIdentity,
    migrateIdentityFromSeed,
    forceCleanupAndSignOut,
    signOut,
    clearError,
    clearRestoreWarning,
    updateProfile,
    updatePassphrase,
    updateBiometric,
    setIdentity,
    loadIdentityOnDemand,
    isBiometricAvailable,
    getBiometryType,
    getMasterSeedPhrase,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
