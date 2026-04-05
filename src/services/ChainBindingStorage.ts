/**
 * Chain Binding Storage
 *
 * Persists the chain binding — the record of which chain this device's
 * identity is currently registered on. Used to detect chain resets /
 * migrations and trigger transparent re-registration.
 *
 * Stored in AsyncStorage (not Keychain) because chain_id is not sensitive.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAIN_BINDING_KEY = 'sovnet_chain_binding';

export interface LocalChainBinding {
  chainId: number;
  registeredHeight: number;
  identityId: string;
  primaryWalletId: string;
  ubiWalletId: string;
  savingsWalletId: string;
}

export const ChainBindingStorage = {
  async get(): Promise<LocalChainBinding | null> {
    try {
      const raw = await AsyncStorage.getItem(CHAIN_BINDING_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as LocalChainBinding;
    } catch (err) {
      console.warn('[ChainBindingStorage] Failed to read binding:', err);
      return null;
    }
  },

  async set(binding: LocalChainBinding): Promise<void> {
    await AsyncStorage.setItem(CHAIN_BINDING_KEY, JSON.stringify(binding));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(CHAIN_BINDING_KEY);
  },
};

export default ChainBindingStorage;
