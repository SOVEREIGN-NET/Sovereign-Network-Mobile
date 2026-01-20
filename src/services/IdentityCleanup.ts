/**
 * Identity Cleanup Service
 * Removes all stored identity data via native iOS implementation
 * - Documents/keystore directory (identity materials)
 * - Keychain entries (private keys, metadata)
 * - AsyncStorage cached DID
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SecureIdentityStorage from './SecureIdentityStorage';

const IDENTITY_ID_ASYNC_STORAGE = 'sovnet_identity_id';

export const IdentityCleanup = {
  /**
   * Clean ALL identity data from device
   * Calls native code to clean Documents/keystore + Keychain, then cleans AsyncStorage
   */
  async cleanAllIdentities(): Promise<void> {
    try {
      console.log('[IdentityCleanup] 🧹 Cleaning all identity data...');

      // Call native cleanup first (handles Documents/keystore + Keychain)
      if (Platform.OS === 'ios') {
        const result = await NativeModules.NativeIdentityProvisioning.cleanKeystoreDirectory();
        console.log('[IdentityCleanup]', result);
      }

      // Clean AsyncStorage and SecureIdentityStorage
      await AsyncStorage.removeItem(IDENTITY_ID_ASYNC_STORAGE);
      await SecureIdentityStorage.clearIdentity().catch(() => {
        // May not be set, that's fine
      });

      console.log('[IdentityCleanup] ✅ All identity data cleaned successfully');
    } catch (error) {
      console.error('[IdentityCleanup] ❌ Cleanup failed:', error);
      throw error;
    }
  },

  /**
   * Clean specific identity by ID
   * Calls native code to clean specific identity directory + private key from Keychain
   */
  async cleanSpecificIdentity(identityId: string): Promise<void> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    try {
      console.log(`[IdentityCleanup] 🧹 Cleaning identity: ${identityId}`);

      // Call native cleanup for specific identity
      if (Platform.OS === 'ios') {
        const result = await NativeModules.NativeIdentityProvisioning.cleanKeystoreDirectoryForId(identityId);
        console.log('[IdentityCleanup]', result);
      }

      // Clean AsyncStorage if this was the current identity
      const cachedDid = await AsyncStorage.getItem(IDENTITY_ID_ASYNC_STORAGE);
      if (cachedDid?.includes(identityId)) {
        await AsyncStorage.removeItem(IDENTITY_ID_ASYNC_STORAGE);
      }

      console.log(`[IdentityCleanup] ✅ Identity cleaned: ${identityId}`);
    } catch (error) {
      console.error('[IdentityCleanup] ❌ Cleanup failed:', error);
      throw error;
    }
  },
};

export default IdentityCleanup;
