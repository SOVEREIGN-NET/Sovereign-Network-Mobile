/**
 * Wallet Keychain Service
 * Securely stores wallet seed phrases in iOS Keychain
 * Each wallet type (primary, ubi, savings) stored separately encrypted
 *
 * Uses native WalletKeychain module for secure Keychain storage
 */

import { NativeModules, Platform } from 'react-native';

interface WalletSeeds {
  primary?: string;
  ubi?: string;
  savings?: string;
}

interface WalletIds {
  primary?: string;
  ubi?: string;
  savings?: string;
}

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
   * Store wallet seed phrase in native iOS Keychain
   * Seed is encrypted and stored with kSecAttrAccessibleWhenUnlockedThisDeviceOnly
   *
   * @param walletType - 'primary', 'ubi', or 'savings'
   * @param seedPhrase - 24-word BIP39 mnemonic
   * @param identityId - Owner identity ID (for key scoping)
   */
  async storeSeedPhrase(
    walletType: 'primary' | 'ubi' | 'savings',
    seedPhrase: string,
    identityId: string
  ): Promise<boolean> {
    if (!this.nativeModule) {
      console.warn(`[WalletKeychainService] Cannot store ${walletType} seed - native module unavailable`);
      return false;
    }

    const key = `wallet_${identityId}_${walletType}`;
    try {
      const result = await this.nativeModule.storeSecureString(key, seedPhrase);
      console.log(`[WalletKeychainService] ✅ Stored ${walletType} wallet seed in Keychain`);
      return result === true;
    } catch (error: any) {
      console.error(`[WalletKeychainService] ❌ Failed to store ${walletType} seed:`, error.message);
      return false;
    }
  }

  /**
   * Retrieve wallet seed phrase from native iOS Keychain
   * @param walletType - 'primary', 'ubi', or 'savings'
   * @param identityId - Owner identity ID
   */
  async retrieveSeedPhrase(
    walletType: 'primary' | 'ubi' | 'savings',
    identityId: string
  ): Promise<string | null> {
    if (!this.nativeModule) {
      console.warn(`[WalletKeychainService] Cannot retrieve ${walletType} seed - native module unavailable`);
      return null;
    }

    const key = `wallet_${identityId}_${walletType}`;
    try {
      const seedPhrase = await this.nativeModule.getSecureString(key);
      if (seedPhrase) {
        console.log(`[WalletKeychainService] ✅ Retrieved ${walletType} wallet seed from Keychain`);
        return seedPhrase;
      }
      return null;
    } catch (error: any) {
      console.error(`[WalletKeychainService] ❌ Failed to retrieve ${walletType} seed:`, error.message);
      return null;
    }
  }

  /**
   * Store all wallet seeds from server response in Keychain
   * @param seedPhrases - Object with primary, ubi, savings keys
   * @param identityId - Owner identity ID
   */
  async storeAllSeeds(seedPhrases: WalletSeeds, identityId: string): Promise<boolean> {
    try {
      const results = await Promise.all([
        seedPhrases.primary ? this.storeSeedPhrase('primary', seedPhrases.primary, identityId) : Promise.resolve(true),
        seedPhrases.ubi ? this.storeSeedPhrase('ubi', seedPhrases.ubi, identityId) : Promise.resolve(true),
        seedPhrases.savings ? this.storeSeedPhrase('savings', seedPhrases.savings, identityId) : Promise.resolve(true),
      ]);

      const success = results.every(r => r === true);
      console.log(`[WalletKeychainService] ${success ? '✅' : '⚠️'} Stored wallet seeds for identity ${identityId}`);
      return success;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to store all seeds:', error.message);
      return false;
    }
  }

  /**
   * Retrieve all wallet seeds for an identity from Keychain
   * @param identityId - Owner identity ID
   */
  async retrieveAllSeeds(identityId: string): Promise<WalletSeeds> {
    try {
      const [primary, ubi, savings] = await Promise.all([
        this.retrieveSeedPhrase('primary', identityId),
        this.retrieveSeedPhrase('ubi', identityId),
        this.retrieveSeedPhrase('savings', identityId),
      ]);

      const seeds: WalletSeeds = {
        ...(primary && { primary }),
        ...(ubi && { ubi }),
        ...(savings && { savings }),
      };

      console.log(`[WalletKeychainService] ✅ Retrieved ${Object.keys(seeds).length} wallet seeds`);
      return seeds;
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to retrieve all seeds:', error.message);
      return {};
    }
  }

  /**
   * Delete wallet seeds for an identity (for logout/uninstall)
   * @param identityId - Owner identity ID
   */
  async deleteSeedsForIdentity(identityId: string): Promise<boolean> {
    if (!this.nativeModule) {
      console.warn('[WalletKeychainService] Cannot delete seeds - native module unavailable');
      return false;
    }

    try {
      const walletTypes = ['primary', 'ubi', 'savings'] as const;
      const results = await Promise.all(
        walletTypes.map(type => {
          const key = `wallet_${identityId}_${type}`;
          return this.nativeModule.deleteSecureString(key);
        })
      );

      console.log(`[WalletKeychainService] ✅ Deleted all wallet seeds for identity ${identityId}`);
      return results.every(r => r === true);
    } catch (error: any) {
      console.error('[WalletKeychainService] ❌ Failed to delete seeds:', error.message);
      return false;
    }
  }

  /**
   * Check if seed phrase exists for a wallet in Keychain
   * @param walletType - 'primary', 'ubi', or 'savings'
   * @param identityId - Owner identity ID
   */
  async hasSeedPhrase(
    walletType: 'primary' | 'ubi' | 'savings',
    identityId: string
  ): Promise<boolean> {
    const seed = await this.retrieveSeedPhrase(walletType, identityId);
    const exists = !!seed;
    console.log(`[WalletKeychainService] ${exists ? '✅' : '❌'} ${walletType} wallet seed ${exists ? 'exists' : 'not found'}`);
    return exists;
  }
}

// Export singleton instance
export const walletKeychainService = new WalletKeychainService();

export type { WalletSeeds, WalletIds };
