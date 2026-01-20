/**
 * Authentication Context
 * Manages global auth state for the app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import SeedVaultService from '../services/SeedVaultService';
import { rateLimiter } from '../services/RateLimiter';
import MockAuthService, { Identity } from '../services/MockAuthService';
import type { CreateIdentityData } from '../services/RealAuthService';
import { walletKeychainService } from '../services/WalletKeychainService';

// Always import RealAuthService, use it when node is available
import RealAuthServiceModule from '../services/RealAuthService';

// Use real auth service instance
const RealAuthService = RealAuthServiceModule;

// Use native storage on Android, AsyncStorage on iOS
const storage = Platform.OS === 'android' ? NativeStorage : AsyncStorage;

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
  error: string | null;
  signIn: (identity_id: string, password: string) => Promise<Identity>;
  createIdentity: (data: CreateIdentityData) => Promise<Identity>;
  recoverIdentity: (method: string, data: string) => Promise<Identity>;
  signOut: () => Promise<void>;
  clearError: () => void;
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
  getWalletSeedPhrase: (walletType: 'primary' | 'ubi' | 'savings') => Promise<string | null>;
  getAllWalletSeeds: () => Promise<{ primary?: string; ubi?: string; savings?: string }>;
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
        // Try to restore cached identity without biometric prompt on startup
        // This keeps user logged in between app sessions
        const identity = await SecureIdentityStorage.getIdentityIfAvailable(true);

        if (identity) {
          if (__DEV__) {
            console.log('✅ Restored identity from secure storage:', identity.displayName);
          }
          setCurrentIdentity(identity);

          // SECURITY: Restore lib-client Identity to handle store for UHP signing
          if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
            try {
              const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
                identity.identityId
              );
              if (result?.status === 'restored') {
                console.log('[AuthContext] ✅ Identity restored to handle store during bootstrap');
              } else if (result?.status === 'skipped') {
                console.log('[AuthContext] ℹ️ Identity restoration skipped (reason:', result.reason + ')');
                console.log('[AuthContext] 💡 UhpHandshake will use Keychain fallback');
              } else {
                console.log('[AuthContext] ℹ️ Handle store restoration result:', result);
              }
            } catch (err) {
              console.error('[AuthContext] ⚠️ Failed to restore Identity to handle store:', err);
              // Non-fatal - continue anyway
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
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: true });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          console.log('[AuthContext.signIn] ✅ Identity restored to handle store:', result);
        } catch (err) {
          console.error('[AuthContext.signIn] ⚠️ Failed to restore Identity to handle store:', err);
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

      // Don't save to storage or set as currentIdentity yet
      // The CreateIdentityScreen will show seed phrases first
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

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: true });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          console.log('[AuthContext.recoverIdentity] ✅ Identity restored to handle store:', result);
        } catch (err) {
          console.error('[AuthContext.recoverIdentity] ⚠️ Failed to restore Identity to handle store:', err);
          // Non-fatal - continue anyway
        }
      }

      return identity;
    } catch (err: any) {
      const message = err.message || 'Identity recovery failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Manually set the current identity
   * Used after saving identity to storage (e.g., after seed phrase confirmation)
   * SECURITY: Uses SecureIdentityStorage instead of plaintext AsyncStorage
   * Also ensures lib-client Identity is available in handle store for signing
   */
  const setIdentity = useCallback(async (identity: Identity) => {
    try {
      if (__DEV__) {
        console.log('🔐 AuthContext.setIdentity: Saving identity:', identity.did);
      }
      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity);
      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          console.log('[AuthContext.setIdentity] ✅ Identity restored to handle store:', result);
        } catch (err) {
          console.error('[AuthContext.setIdentity] ⚠️ Failed to restore Identity to handle store:', err);
          // Non-fatal - continue anyway
        }
      }
    } catch (err: any) {
      const message = err.message || 'Failed to set identity';
      setError(message);
      throw err;
    }
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

  // Wallet seed management - retrieve from Keychain (server-generated)
  const getWalletSeedPhrase = useCallback(async (walletType: 'primary' | 'ubi' | 'savings'): Promise<string | null> => {
    if (!currentIdentity?.identityId) {
      console.warn('[AuthContext] Cannot retrieve wallet seed - no current identity');
      return null;
    }
    try {
      const seed = await walletKeychainService.retrieveSeedPhrase(walletType, currentIdentity.identityId);
      return seed;
    } catch (error: any) {
      console.error(`[AuthContext] Failed to retrieve ${walletType} wallet seed:`, error);
      return null;
    }
  }, [currentIdentity?.identityId]);

  const getAllWalletSeeds = useCallback(async () => {
    if (!currentIdentity?.identityId) {
      console.warn('[AuthContext] Cannot retrieve wallet seeds - no current identity');
      return {};
    }
    try {
      const seeds = await walletKeychainService.retrieveAllSeeds(currentIdentity.identityId);
      return seeds;
    } catch (error: any) {
      console.error('[AuthContext] Failed to retrieve all wallet seeds:', error);
      return {};
    }
  }, [currentIdentity?.identityId]);

  const value = useMemo<AuthContextType>(() => ({
    currentIdentity,
    isAuthenticated: currentIdentity !== null,
    isLoading,
    isBootstrapping,
    error,
    signIn,
    createIdentity,
    recoverIdentity,
    signOut,
    clearError,
    updateProfile,
    updatePassphrase,
    updateBiometric,
    setCurrentIdentity: setIdentity,
    loadIdentityOnDemand,
    isBiometricAvailable,
    getBiometryType,
    getWalletSeedPhrase,
    getAllWalletSeeds,
  }), [currentIdentity, isLoading, isBootstrapping, error, signIn, createIdentity, recoverIdentity, signOut, clearError, updateProfile, updatePassphrase, updateBiometric, setIdentity, loadIdentityOnDemand, isBiometricAvailable, getBiometryType, getWalletSeedPhrase, getAllWalletSeeds]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
