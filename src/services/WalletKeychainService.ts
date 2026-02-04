/**
 * Wallet Keychain Service
 * Securely stores the master seed phrase in iOS Keychain
 * Uses native WalletKeychain module for secure Keychain storage
 */

import { NativeModules, Platform } from 'react-native';

class WalletKeychainService {
  private nativeModule: any;

  constructor() {
    if (Platform.OS === 'ios') {
      this.nativeModule = NativeModules.WalletKeychain;
      if (!this.nativeModule) {
        console.warn('[WalletKeychainService] ⚠️ WalletKeychain native module not found');
      } else {
        console.log('[WalletKeychainService] ✅ WalletKeychain native module initialized');
      }
    }
  }

  /**
   * Store master seed phrase in native iOS Keychain
   */
  async storeMasterSeedPhrase(
    seedPhrase: string,
    identityId: string
  ): Promise<boolean> {
    if (!this.nativeModule) {
      console.warn('[WalletKeychainService] Cannot store master seed - native module unavailable');
      return false;
    }

    const key = `master_seed_${identityId}`;
    try {
      const result = await this.nativeModule.storeSecureString(key, seedPhrase);
      console.log(`[WalletKeychainService] ✅ Stored master seed in Keychain`);
      return result === true;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to store master seed:', error.message);
      return false;
    }
  }

  /**
   * Retrieve master seed phrase from native iOS Keychain
   */
  async retrieveMasterSeedPhrase(identityId: string): Promise<string | null> {
    if (!this.nativeModule) {
      console.warn('[WalletKeychainService] Cannot retrieve master seed - native module unavailable');
      return null;
    }

    const key = `master_seed_${identityId}`;
    try {
      const seedPhrase = await this.nativeModule.getSecureString(key);
      if (seedPhrase) {
        console.log('[WalletKeychainService] ✅ Retrieved master seed from Keychain');
        return seedPhrase;
      }
      return null;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to retrieve master seed:', error.message);
      return null;
    }
  }

  /**
   * Delete master seed phrase for an identity (for logout/uninstall)
   */
  async deleteMasterSeedPhrase(identityId: string): Promise<boolean> {
    if (!this.nativeModule) {
      console.warn('[WalletKeychainService] Cannot delete master seed - native module unavailable');
      return false;
    }

    try {
      const key = `master_seed_${identityId}`;
      const result = await this.nativeModule.deleteSecureString(key);
      console.log(`[WalletKeychainService] ✅ Deleted master seed for identity ${identityId}`);
      return result === true;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to delete master seed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export const walletKeychainService = new WalletKeychainService();
