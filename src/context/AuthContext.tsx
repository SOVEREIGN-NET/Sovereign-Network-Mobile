/**
 * Authentication Context
 * Manages global auth state for the app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import MockAuthService, { Identity } from '../services/MockAuthService';
import type { CreateIdentityData } from '../services/RealAuthService';

// Toggle between mock and real auth service
// Set to false to use real API backend
// In development, set REACT_APP_USE_REAL_AUTH=true to use real service
const USE_REAL_AUTH = process.env.REACT_APP_USE_REAL_AUTH === 'true';
const USE_MOCK_SERVICE = !USE_REAL_AUTH && __DEV__;

// Import based on configuration
let RealAuthService: any = null;
if (USE_REAL_AUTH || !__DEV__) {
  RealAuthService = require('../services/RealAuthService').default;
}

// Use native storage on Android, AsyncStorage on iOS
const storage = Platform.OS === 'android' ? NativeStorage : AsyncStorage;

export interface AuthContextType {
  currentIdentity: Identity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (identity_id: string, password: string) => Promise<Identity>;
  createIdentity: (data: CreateIdentityData) => Promise<Identity>;
  recoverIdentity: (method: string, data: string) => Promise<Identity>;
  signOut: () => Promise<void>;
  clearError: () => void;
  updateProfile: (displayName: string, avatar?: string) => Promise<void>;
  updatePassphrase: (newPassphrase: string) => Promise<void>;
  updateBiometric: (enabled: boolean) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Restore identity from AsyncStorage on app load
   */
  useEffect(() => {
    const restoreIdentity = async () => {
      try {
        const saved = await storage.getItem('zhtp_identity');
        if (saved) {
          const identity = JSON.parse(saved);
          setCurrentIdentity(identity);
        }
      } catch (err) {
        console.error('Failed to restore identity:', err);
        // Continue with no identity if restoration fails
      } finally {
        setIsLoading(false);
      }
    };

    restoreIdentity();
  }, []);

  /**
   * Sign in with identity_id and password
   */
  const signIn = useCallback(async (identity_id: string, password: string): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (USE_MOCK_SERVICE) {
        identity = await MockAuthService.signIn({ did: identity_id, passphrase: password });
      } else {
        identity = await RealAuthService!.signIn({ identity_id, password });
      }

      // Save to storage
      await storage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
      return identity;
    } catch (err: any) {
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

      if (USE_MOCK_SERVICE) {
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
        identity = await RealAuthService.createIdentity(data);
      }

      // Save to storage
      await storage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
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

      if (USE_MOCK_SERVICE) {
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

      // Save to storage
      await storage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
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

      // Save to storage
      await storage.setItem('zhtp_identity', JSON.stringify(updatedIdentity));
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
   */
  const updateBiometric = useCallback(async (enabled: boolean) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const updatedIdentity = {
        ...currentIdentity,
        biometricHash: enabled ? 'mock_biometric_hash' : undefined,
      };

      await storage.setItem('zhtp_identity', JSON.stringify(updatedIdentity));
      setCurrentIdentity(updatedIdentity);
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
   */
  const signOut = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      await storage.removeItem('zhtp_identity');
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

  const value = useMemo<AuthContextType>(() => ({
    currentIdentity,
    isAuthenticated: currentIdentity !== null,
    isLoading,
    error,
    signIn,
    createIdentity,
    recoverIdentity,
    signOut,
    clearError,
    updateProfile,
    updatePassphrase,
    updateBiometric,
  }), [currentIdentity, isLoading, error, signIn, createIdentity, recoverIdentity, signOut, clearError, updateProfile, updatePassphrase, updateBiometric]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
