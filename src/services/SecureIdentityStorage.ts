/**
 * Secure Identity Storage Service
 * Stores identity securely using device Keychain (encrypted)
 * Only non-sensitive DID stored in AsyncStorage for quick lookup
 *
 * SECURITY: This replaces plaintext AsyncStorage storage of Identity
 * Implements OWASP Mobile Top 10 - M2 (Insecure Data Storage) remediation
 */

import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Identity } from './MockAuthService';

const IDENTITY_KEYCHAIN_SERVICE = 'sovnet_identity_secure';
const IDENTITY_ID_ASYNC_STORAGE = 'sovnet_identity_id'; // Non-sensitive, used for UI state only

interface SecureIdentityStorageOptions {
  requireBiometric?: boolean;
  accessibleAfterFirstUnlock?: boolean;
}

/**
 * Secure Identity Storage Module
 * All sensitive identity data stored in Keychain (encrypted by OS)
 * Only DID stored in AsyncStorage (non-sensitive, used for quick UI lookup)
 */
export const SecureIdentityStorage = {
  /**
   * Store identity securely in device Keychain
   * Only stores essential identity fields, excludes passwords/keys
   *
   * @param identity - Identity object to store
   * @param options - Storage options (biometric requirement, accessibility)
   * @throws Error if storage fails
   */
  async setIdentity(
    identity: Identity,
    options: SecureIdentityStorageOptions = {}
  ): Promise<void> {
    if (!identity || !identity.did) {
      throw new Error('Invalid identity: missing required fields');
    }

    const {
      requireBiometric = true,
      accessibleAfterFirstUnlock = true
    } = options;

    try {
      // 1. Prepare identity data for Keychain storage
      // Only store essential fields, exclude passwords, private keys, etc.
      const identityData = JSON.stringify({
        did: identity.did,
        displayName: identity.displayName,
        identityType: identity.identityType,
        avatar: identity.avatar,
        createdAt: identity.createdAt,
        citizenship: identity.citizenship,
        identityId: identity.identityId, // Server-returned identity ID for authenticated requests
      });

      // 2. Configure Keychain access control
      const keychainOptions: Keychain.Options = {
        service: IDENTITY_KEYCHAIN_SERVICE,
        accessible: accessibleAfterFirstUnlock
          ? Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
          : Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      };

      // 3. Require biometric or device passcode if enabled
      if (requireBiometric) {
        keychainOptions.accessControl = Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE;
      }

      // 4. Store encrypted identity in Keychain
      await Keychain.setGenericPassword(
        'identity_data',
        identityData,
        keychainOptions
      );

      // 5. Store only DID in AsyncStorage for quick, non-authenticated UI state
      // This allows checking if user is logged in without unlocking Keychain
      await AsyncStorage.setItem(IDENTITY_ID_ASYNC_STORAGE, identity.did);

      if (__DEV__) {
        console.log('✅ Identity stored securely in Keychain');
      }
    } catch (error) {
      console.error('❌ Failed to store identity securely:', error);
      throw new Error('Failed to store identity in secure storage');
    }
  },

  /**
   * Retrieve identity from device Keychain
   * Requires device unlock (Keychain access control enforced by OS)
   * May prompt for biometric authentication if configured
   *
   * @returns Identity object or null if not found
   */
  async getIdentity(): Promise<Identity | null> {
    try {
      console.log('[SecureIdentityStorage] 🔐 getIdentity() called - showing biometric prompt');

      // Request identity from Keychain with authentication prompt
      const credentials = await Keychain.getGenericPassword({
        service: IDENTITY_KEYCHAIN_SERVICE,
        authenticationPrompt: {
          title: 'Authenticate',
          subtitle: 'Required to access your identity',
          description: 'Use biometric or device passcode',
        },
      });

      console.log('[SecureIdentityStorage] 🔐 Biometric prompt resolved');

      // Return null if no credentials found
      if (!credentials) {
        console.log('[SecureIdentityStorage] ⚠️ No credentials found in Keychain');
        return null;
      }

      // Parse and return identity
      const identity = JSON.parse(credentials.password) as Identity;

      console.log('✅ Identity retrieved from Keychain');

      return identity;
    } catch (error: any) {
      if (error.message?.includes('cancelled') || error.userInfo?.['NSDebugDescription']?.includes('cancelled')) {
        console.log('[SecureIdentityStorage] ℹ️ Biometric authentication cancelled by user');
        return null;
      }

      // If decryption failed (Android Keystore reset, fingerprint changed, etc),
      // clear the corrupted identity data so user can create a new one
      if (error.message?.includes('Decryption failed') ||
          error.message?.includes('Authentication tag verification failed') ||
          error.message?.includes('Signature/MAC verification failed')) {
        console.error('[SecureIdentityStorage] 🔄 Decryption failed - clearing corrupted identity', error?.message);
        try {
          await this.clearIdentity();
        } catch (clearError) {
          console.error('[SecureIdentityStorage] Failed to clear corrupted identity:', clearError);
        }
        return null;
      }

      console.error('[SecureIdentityStorage] ❌ Failed to retrieve identity:', error?.message || error);
      return null;
    }
  },

  /**
   * Clear stored identity (called on sign out)
   * Removes both Keychain and AsyncStorage entries
   *
   * @throws Error if clearing fails
   */
  async clearIdentity(): Promise<void> {
    try {
      // Remove from Keychain
      await Keychain.resetGenericPassword({
        service: IDENTITY_KEYCHAIN_SERVICE
      });

      // Remove DID from AsyncStorage
      await AsyncStorage.removeItem(IDENTITY_ID_ASYNC_STORAGE);

      if (__DEV__) {
        console.log('✅ Identity cleared from secure storage');
      }
    } catch (error) {
      console.error('❌ Failed to clear identity:', error);
      throw error;
    }
  },

  /**
   * Check if identity is stored (non-blocking)
   * Only checks AsyncStorage to avoid unlocking Keychain
   *
   * @returns true if DID exists in AsyncStorage
   */
  async hasIdentity(): Promise<boolean> {
    try {
      const did = await AsyncStorage.getItem(IDENTITY_ID_ASYNC_STORAGE);
      return !!did;
    } catch (error) {
      console.error('❌ Failed to check if identity exists:', error);
      return false;
    }
  },

  /**
   * Get cached DID without Keychain access
   * Used for quick UI checks without authentication
   * Does NOT return full identity - only DID for checking login state
   *
   * @returns DID string or null if not found
   */
  async getCachedDidOnly(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(IDENTITY_ID_ASYNC_STORAGE);
    } catch (error) {
      console.error('❌ Failed to get cached DID:', error);
      return null;
    }
  },

  /**
   * Get identity ID for use in authenticated request headers
   * Does NOT require biometric - uses cached value from AsyncStorage
   * Used to add X-Zhtp-Identity header to UHP authenticated requests
   *
   * @returns identity_id string or null if not found
   */
  async getIdentityId(): Promise<string | null> {
    try {
      // Get cached DID from AsyncStorage without requiring biometric
      const cachedDid = await this.getCachedDidOnly();
      if (!cachedDid) {
        console.warn('[SecureIdentityStorage] ⚠️ No cached identity ID found');
        return null;
      }
      console.log('[SecureIdentityStorage] ✓ Retrieved identity_id for authenticated request (cached, no biometric needed)');
      return cachedDid;
    } catch (error) {
      console.error('[SecureIdentityStorage] ❌ Failed to get identity ID:', error);
      return null;
    }
  },

  /**
   * Get identity with optional biometric prompt suppression
   * Used for background operations that should not interrupt user
   * @param suppressBiometric If true, attempts to get identity without prompting
   * @returns Identity or null if not available
   */
  async getIdentityIfAvailable(suppressBiometric?: boolean): Promise<Identity | null> {
    try {
      if (suppressBiometric) {
        // Just check if it exists in cache without prompting
        return await this.getCachedDidOnly() ? await this.getIdentity().catch(() => null) : null;
      }
      return await this.getIdentity();
    } catch (error) {
      if (__DEV__) {
        console.log('[SecureIdentityStorage] Identity not available (may require authentication):', error);
      }
      return null;
    }
  },
};

export default SecureIdentityStorage;
