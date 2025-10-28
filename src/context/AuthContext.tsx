/**
 * Authentication Context
 * Manages global auth state for the app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAuthService, { Identity } from '../services/MockAuthService';

export interface AuthContextType {
  currentIdentity: Identity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (did: string, passphrase: string) => Promise<void>;
  createIdentity: (data: any) => Promise<void>;
  recoverIdentity: (method: string, data: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
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
        const saved = await AsyncStorage.getItem('zhtp_identity');
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
   * Sign in with DID and passphrase
   */
  const signIn = useCallback(async (did: string, passphrase: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const identity = await MockAuthService.signIn({ did, passphrase });

      // Save to AsyncStorage
      await AsyncStorage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
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
  const createIdentity = useCallback(async (data: any) => {
    setError(null);
    setIsLoading(true);

    try {
      const identity = await MockAuthService.createIdentity(data);

      // Save to AsyncStorage
      await AsyncStorage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
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
  const recoverIdentity = useCallback(async (method: string, data: string) => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (method === 'seed') {
        identity = await MockAuthService.recoverWithSeed(data);
      } else if (method === 'backup') {
        // For backup, data is JSON string + password
        const [fileContent, password] = data.split('|||');
        identity = await MockAuthService.recoverWithBackup(fileContent, password);
      } else if (method === 'social') {
        identity = await MockAuthService.recoverWithSocial(data);
      } else {
        throw new Error('Unknown recovery method');
      }

      // Save to AsyncStorage
      await AsyncStorage.setItem('zhtp_identity', JSON.stringify(identity));

      setCurrentIdentity(identity);
    } catch (err: any) {
      const message = err.message || 'Identity recovery failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Sign out (clear identity)
   */
  const signOut = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      await AsyncStorage.removeItem('zhtp_identity');
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
  }), [currentIdentity, isLoading, error, signIn, createIdentity, recoverIdentity, signOut, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
