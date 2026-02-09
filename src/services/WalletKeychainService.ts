/**
 * Wallet Keychain Service
 * Securely stores the master seed phrase.
 *
 * - iOS: prefers the native WalletKeychain module when available
 * - Android (and iOS fallback): uses react-native-keychain
 */

import { NativeModules, Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';

class WalletKeychainService {
  private nativeModule: any;

  constructor() {
    this.nativeModule = NativeModules.WalletKeychain;
    if (Platform.OS === 'ios') {
      if (!this.nativeModule) {
        console.warn('[WalletKeychainService] ⚠️ WalletKeychain native module not found; using Keychain fallback');
      } else {
        console.log('[WalletKeychainService] ✅ WalletKeychain native module initialized');
      }
    }
  }

  private keychainOptionsFor(key: string): Keychain.Options {
    // Use per-key service names so multiple identities can coexist.
    return {
      service: `WalletKeychain:${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    };
  }

  /**
   * Store master seed phrase in native iOS Keychain
   */
  async storeMasterSeedPhrase(
    seedPhrase: string,
    identityId: string
  ): Promise<boolean> {
    const key = `master_seed_${identityId}`;
    try {
      if (this.nativeModule?.storeSecureString) {
        const result = await this.nativeModule.storeSecureString(key, seedPhrase);
        console.log('[WalletKeychainService] ✅ Stored master seed via native module');
        return result === true;
      }

      // Cross-platform fallback.
      const opts = this.keychainOptionsFor(key);
      await Keychain.setGenericPassword('seed', seedPhrase, opts);
      console.log('[WalletKeychainService] ✅ Stored master seed via react-native-keychain');
      return true;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to store master seed:', error.message);
      return false;
    }
  }

  /**
   * Retrieve master seed phrase from native iOS Keychain
   */
  async retrieveMasterSeedPhrase(identityId: string): Promise<string | null> {
    const key = `master_seed_${identityId}`;
    try {
      if (this.nativeModule?.getSecureString) {
        const seedPhrase = await this.nativeModule.getSecureString(key);
        if (seedPhrase) {
          console.log('[WalletKeychainService] ✅ Retrieved master seed via native module');
          return seedPhrase;
        }
        return null;
      }

      const opts = this.keychainOptionsFor(key);
      const credentials = await Keychain.getGenericPassword(opts);
      if (!credentials) {
        return null;
      }
      console.log('[WalletKeychainService] ✅ Retrieved master seed via react-native-keychain');
      return credentials.password || null;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to retrieve master seed:', error.message);
      return null;
    }
  }

  /**
   * Delete master seed phrase for an identity (for logout/uninstall)
   */
  async deleteMasterSeedPhrase(identityId: string): Promise<boolean> {
    const key = `master_seed_${identityId}`;
    try {
      if (this.nativeModule?.deleteSecureString) {
        const result = await this.nativeModule.deleteSecureString(key);
        console.log(`[WalletKeychainService] ✅ Deleted master seed via native module for identity ${identityId}`);
        return result === true;
      }

      const opts = this.keychainOptionsFor(key);
      await Keychain.resetGenericPassword(opts);
      console.log(`[WalletKeychainService] ✅ Deleted master seed via react-native-keychain for identity ${identityId}`);
      return true;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to delete master seed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export const walletKeychainService = new WalletKeychainService();
