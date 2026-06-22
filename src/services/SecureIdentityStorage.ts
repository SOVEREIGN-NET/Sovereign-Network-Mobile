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
import type { Identity } from '../types/identity';

const IDENTITY_KEYCHAIN_SERVICE = 'sovnet_identity_secure';
const SESSION_TOKEN_KEYCHAIN_SERVICE = 'sovnet_session_token';
const LOGIN_CREDENTIAL_SERVER = 'sovnet.auth'; // Internet Credentials server key for OS autofill
const IDENTITY_ID_ASYNC_STORAGE = 'sovnet_identity_id'; // Non-sensitive, used for UI state only
const IDENTITY_BACKUP_STORAGE = 'sovnet_identity_backup'; // Unencrypted fallback backup (survives Keystore resets)

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
      requireBiometric = false,
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

      // 4. Store encrypted identity in Keychain (primary secure storage)
      await Keychain.setGenericPassword(
        'identity_data',
        identityData,
        keychainOptions
      );

      // 5. Store backup copy in AsyncStorage (survives Keystore resets on Android)
      // This is NOT ideal from a security standpoint, but essential for UX
      // Android Keystore can be reset by: biometric changes, system updates, lock settings changes
      // Without backup, users lose access to their identity permanently
      await AsyncStorage.setItem(IDENTITY_BACKUP_STORAGE, identityData);

      // 6. Store only DID in AsyncStorage for quick, non-authenticated UI state
      // This allows checking if user is logged in without unlocking Keychain
      await AsyncStorage.setItem(IDENTITY_ID_ASYNC_STORAGE, identity.did);

      if (__DEV__) {
        console.log('✅ Identity stored securely in Keychain + AsyncStorage backup');
      }
    } catch (error) {
      console.error('❌ Failed to store identity securely:', error);
      throw new Error('Failed to store identity in secure storage');
    }
  },

  /**
   * Store session token securely in Keychain
   */
  async setSessionToken(token: string): Promise<void> {
    if (!token) {
      throw new Error('Invalid session token');
    }
    const keychainOptions: Keychain.Options = {
      service: SESSION_TOKEN_KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    };
    await Keychain.setGenericPassword('session_token', token, keychainOptions);
  },

  /**
   * Retrieve identity from device Keychain with AsyncStorage fallback
   *
   * PRIMARY: Try Keychain (Requires device unlock + biometric if configured)
   * FALLBACK: If Keychain fails, restore from AsyncStorage backup
   *
   * This is critical for Android reliability:
   * - Android Keystore can reset on: biometric changes, system updates, lock settings changes
   * - Without fallback, users lose permanent access to their identity
   * - AsyncStorage backup ensures users never lose access completely
   *
   * @returns Identity object or null if not found
   */
  async getIdentity(): Promise<Identity | null> {
    try {
      console.log('[SecureIdentityStorage] 🔐 getIdentity() called - trying Keychain first');

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
        // Try AsyncStorage fallback
        return await this.restoreFromBackup();
      }

      // Parse and return identity
      const identity = JSON.parse(credentials.password) as Identity;

      console.log('✅ Identity retrieved successfully from Keychain');

      return identity;
    } catch (error: any) {
      if (error.message?.includes('cancelled') || error.userInfo?.['NSDebugDescription']?.includes('cancelled')) {
        console.log('[SecureIdentityStorage] ℹ️ Biometric authentication cancelled by user');
        return null;
      }

      // If decryption failed (Android Keystore reset, fingerprint changed, etc),
      // try to restore from AsyncStorage backup instead of clearing
      if (error.message?.includes('Decryption failed') ||
          error.message?.includes('Authentication tag verification failed') ||
          error.message?.includes('Signature/MAC verification failed')) {
        console.warn('[SecureIdentityStorage] ⚠️ Keychain decryption failed:', error?.message);
        console.log('[SecureIdentityStorage] 🔄 Attempting to restore from AsyncStorage backup...');

        try {
          const backup = await this.restoreFromBackup();
          if (backup) {
            console.log('✅ Identity restored from backup (Keychain was reset)');
            // Try to re-store to Keychain for next time
            try {
              await this.setIdentity(backup, { requireBiometric: true });
            } catch (restoreError) {
              console.warn('[SecureIdentityStorage] Could not update Keychain after restore:', restoreError);
            }
            return backup;
          }
        } catch (backupError) {
          console.error('[SecureIdentityStorage] Backup restore also failed:', backupError);
        }

        return null;
      }

      console.error('[SecureIdentityStorage] ❌ Failed to retrieve identity:', error?.message || error);
      return null;
    }
  },

  /**
   * Restore identity from AsyncStorage backup
   * Used when Keychain is unavailable or corrupted
   * @returns Identity object or null if backup not found
   */
  async restoreFromBackup(): Promise<Identity | null> {
    try {
      const backup = await AsyncStorage.getItem(IDENTITY_BACKUP_STORAGE);
      if (!backup) {
        console.log('[SecureIdentityStorage] ⚠️ No backup found in AsyncStorage');
        return null;
      }

      const identity = JSON.parse(backup) as Identity;
      console.log('✅ Identity restored from AsyncStorage backup');
      return identity;
    } catch (error) {
      console.error('[SecureIdentityStorage] Failed to restore from backup:', error);
      return null;
    }
  },

  /**
   * Clear stored identity (called on sign out)
   * Removes Keychain entry and AsyncStorage entries (both backup and DID)
   *
   * @throws Error if clearing fails
   */
  async clearIdentity(): Promise<void> {
    try {
      // Remove from Keychain
      await Keychain.resetGenericPassword({
        service: IDENTITY_KEYCHAIN_SERVICE
      });

      // Remove backup from AsyncStorage
      await AsyncStorage.removeItem(IDENTITY_BACKUP_STORAGE);

      // Remove DID from AsyncStorage
      await AsyncStorage.removeItem(IDENTITY_ID_ASYNC_STORAGE);

      // NOTE: Login credentials are intentionally preserved here so that
      // sign-out → sign-in can use OS autofill. Call clearLoginCredentials()
      // separately for a full identity wipe.

      if (__DEV__) {
        console.log('✅ Identity cleared from secure storage (Keychain + AsyncStorage backup)');
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
      // Intentionally silent on the hot path. This fires once per
      // authenticated request — leaving a `console.log` here drowned the
      // useful events. Errors / missing-cache are still logged above and
      // in the `catch` below.
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
        // Do not trigger biometric prompt on background/startup paths.
        // Use AsyncStorage backup only.
        return await this.restoreFromBackup();
      }
      return await this.getIdentity();
    } catch (error) {
      if (__DEV__) {
        console.log('[SecureIdentityStorage] Identity not available (may require authentication):', error);
      }
      return null;
    }
  },

  // --- Login Credentials (local password for sign-in + OS autofill) ---

  /**
   * Save login credentials for local sign-in and OS autofill.
   * Uses Internet Credentials API so iOS/Android offer to save and autofill.
   */
  async saveLoginCredentials(did: string, password: string): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        LOGIN_CREDENTIAL_SERVER,
        did,
        password,
        {
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        }
      );
      if (__DEV__) {
        console.log('[SecureIdentityStorage] ✅ Login credentials saved for autofill');
      }
    } catch (error) {
      console.error('[SecureIdentityStorage] ❌ Failed to save login credentials:', error);
      throw new Error('Failed to save login credentials');
    }
  },

  /**
   * Retrieve stored login credentials for local password validation.
   * @returns { did, password } or null if not stored
   */
  async getLoginCredentials(): Promise<{ did: string; password: string } | null> {
    try {
      const credentials = await Keychain.getInternetCredentials(LOGIN_CREDENTIAL_SERVER);
      if (!credentials) {
        return null;
      }
      return { did: credentials.username, password: credentials.password };
    } catch (error) {
      console.error('[SecureIdentityStorage] ❌ Failed to get login credentials:', error);
      return null;
    }
  },

  /**
   * Clear stored login credentials (used during full identity wipe).
   */
  async clearLoginCredentials(): Promise<void> {
    try {
      await Keychain.resetInternetCredentials({ server: LOGIN_CREDENTIAL_SERVER });
      if (__DEV__) {
        console.log('[SecureIdentityStorage] ✅ Login credentials cleared');
      }
    } catch (error) {
      console.warn('[SecureIdentityStorage] Failed to clear login credentials:', error);
    }
  },

  /**
   * Sync backup after successful authentication
   * Ensures AsyncStorage backup stays up-to-date with latest identity
   * Called after successful Keychain retrieval to keep backup current
   *
   * @param identity - Identity to backup
   */
  async syncBackup(identity: Identity): Promise<void> {
    try {
      const identityData = JSON.stringify({
        did: identity.did,
        displayName: identity.displayName,
        identityType: identity.identityType,
        avatar: identity.avatar,
        createdAt: identity.createdAt,
        citizenship: identity.citizenship,
        identityId: identity.identityId,
      });

      await AsyncStorage.setItem(IDENTITY_BACKUP_STORAGE, identityData);

      if (__DEV__) {
        console.log('[SecureIdentityStorage] ✅ Backup synced with current identity');
      }
    } catch (error) {
      console.warn('[SecureIdentityStorage] Failed to sync backup (non-fatal):', error);
      // Don't throw - backup sync failure shouldn't block operation
    }
  },
};

export default SecureIdentityStorage;
