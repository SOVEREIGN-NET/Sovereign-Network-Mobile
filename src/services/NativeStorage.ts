import { NativeModules, Platform } from 'react-native';

const NativeStorageModule = NativeModules.NativeStorage;

export const NativeStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'android' && NativeStorageModule) {
      await NativeStorageModule.setItem(key, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'android' && NativeStorageModule) {
      return await NativeStorageModule.getItem(key);
    }
    return null;
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'android' && NativeStorageModule) {
      await NativeStorageModule.removeItem(key);
    }
  },
};
