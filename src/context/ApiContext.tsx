/**
 * API Context
 * Manages global API client instance and initialization
 */

import React, { createContext, useEffect, useState, useMemo } from 'react';
import { ZhtpApi } from '@sovereign-net/api-client';
import { ReactNativeConfigProvider } from '@sovereign-net/api-client/react-native';

export interface ApiContextType {
  api: ZhtpApi | null;
  isInitialized: boolean;
  error: string | null;
}

export const ApiContext = createContext<ApiContextType | undefined>(undefined);

interface ApiConfig {
  zhtpNodeUrl: string;
  networkType: 'testnet' | 'mainnet';
  debugMode: boolean;
  enableBiometrics: boolean;
}

interface ConfigProvider {
  getConfig(): Promise<ApiConfig>;
  updateConfig(config: Partial<ApiConfig>): Promise<void>;
  clearCache(): Promise<void>;
}

/**
 * Wrapper for ReactNativeConfigProvider that prioritizes constructor params over cache
 * Fixes issue where cached config takes precedence over passed parameters
 */
class PriorityConfigProvider implements ConfigProvider {
  private readonly innerProvider: ReactNativeConfigProvider;
  private readonly envVars: Record<string, any>;

  constructor(envVars: Record<string, any>, asyncStorage?: any) {
    this.envVars = envVars;
    this.innerProvider = new ReactNativeConfigProvider(envVars, asyncStorage);
  }

  async getConfig(): Promise<ApiConfig> {
    // Get config from inner provider (which may be cached)
    const config = await this.innerProvider.getConfig();

    // Override with explicitly provided envVars to ensure they take precedence
    const result = {
      ...config,
      zhtpNodeUrl: this.envVars.ZHTP_NODE_URL ?? config.zhtpNodeUrl,
      networkType: (this.envVars.NETWORK_TYPE as 'testnet' | 'mainnet') ?? config.networkType,
      debugMode: this.envVars.DEBUG_MODE ?? config.debugMode,
      enableBiometrics: this.envVars.ENABLE_BIOMETRICS ?? config.enableBiometrics,
    };

    console.log('PriorityConfigProvider.getConfig():', {
      envVarsUrl: this.envVars.ZHTP_NODE_URL,
      cachedUrl: config.zhtpNodeUrl,
      finalUrl: result.zhtpNodeUrl,
    });

    return result;
  }

  async updateConfig(config: Partial<ApiConfig>): Promise<void> {
    return this.innerProvider.updateConfig(config);
  }

  async clearCache(): Promise<void> {
    return this.innerProvider.clearCache();
  }
}

interface ApiProviderProps {
  children: React.ReactNode;
  zhtpNodeUrl?: string;
  networkType?: 'testnet' | 'mainnet';
}

/**
 * API Provider Component
 * Initializes ZhtpApi with ReactNativeConfigProvider and provides it to all children
 */
export const ApiProvider: React.FC<ApiProviderProps> = ({
  children,
  zhtpNodeUrl = 'http://192.168.1.31:9333',
  networkType = 'testnet',
}) => {
  const [api, setApi] = useState<ZhtpApi | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApi = async () => {
      try {
        const configProvider = new PriorityConfigProvider({
          ZHTP_NODE_URL: zhtpNodeUrl,
          NETWORK_TYPE: networkType,
          DEBUG_MODE: __DEV__,
          ENABLE_BIOMETRICS: true,
        });

        const apiInstance = new ZhtpApi(configProvider);
        await apiInstance.ensureInitialized();

        setApi(apiInstance);
        setIsInitialized(true);
      } catch (err: any) {
        const message = err.message || 'Failed to initialize API';
        console.error('API initialization error:', message);
        setError(message);
        setIsInitialized(true); // Set to true even on error so UI can handle it
      }
    };

    initializeApi();
  }, [zhtpNodeUrl, networkType]);

  const value = useMemo<ApiContextType>(() => ({
    api,
    isInitialized,
    error,
  }), [api, isInitialized, error]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export default ApiContext;
