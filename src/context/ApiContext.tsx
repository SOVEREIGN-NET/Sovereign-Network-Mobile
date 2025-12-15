/**
 * API Context
 * Manages global API client instance and initialization
 */

import React, { createContext, useEffect, useState, useMemo } from 'react';
import { ZhtpApi } from '@sovereign-net/api-client';
import { ReactNativeConfigProvider } from '@sovereign-net/api-client/react-native';
import { createQuicFetchAdapterSync } from '../services/QuicFetchAdapter';
import { DEFAULT_SOV_NODE_URL, DEFAULT_NETWORK_TYPE, QUIC_CONFIG, APP_DEFAULTS } from '../config';

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
  private readonly asyncStorage: any;

  constructor(envVars: Record<string, any>, asyncStorage?: any) {
    this.envVars = envVars;
    this.asyncStorage = asyncStorage;
    this.innerProvider = new ReactNativeConfigProvider(envVars, asyncStorage);
  }

  async getConfig(): Promise<ApiConfig> {
    // Get config from inner provider (which may be cached)
    const config = await this.innerProvider.getConfig();

    // Force node URL from env/defaults to avoid stale cached localhost values
    // Check both ZHTP_NODE_URL (library key) and SOV_NODE_URL (our key) for compatibility
    const resolvedNodeUrl = this.envVars.ZHTP_NODE_URL || this.envVars.SOV_NODE_URL || DEFAULT_SOV_NODE_URL;

    // Override with explicitly provided envVars to ensure they take precedence
    const result = {
      ...config,
      zhtpNodeUrl: resolvedNodeUrl,
      networkType: (this.envVars.NETWORK_TYPE as 'testnet' | 'mainnet') ?? config.networkType,
      debugMode: this.envVars.DEBUG_MODE ?? config.debugMode,
      enableBiometrics: this.envVars.ENABLE_BIOMETRICS ?? config.enableBiometrics,
    };

    if (__DEV__) {
      console.log('[PriorityConfigProvider] getConfig():', {
        envVarsZhtp: this.envVars.ZHTP_NODE_URL,
        envVarsSov: this.envVars.SOV_NODE_URL,
        innerProviderUrl: config.zhtpNodeUrl,
        resolvedUrl: result.zhtpNodeUrl,
      });
    }

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
  zhtpNodeUrl = DEFAULT_SOV_NODE_URL,
  networkType = DEFAULT_NETWORK_TYPE,
}) => {
  const [api, setApi] = useState<ZhtpApi | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApi = async () => {
      try {
        const configProvider = new PriorityConfigProvider(
          {
            ZHTP_NODE_URL: zhtpNodeUrl, // Key must match api-client's expected envVar name
            SOV_NODE_URL: zhtpNodeUrl,  // Keep for PriorityConfigProvider fallback
            NETWORK_TYPE: networkType,
            DEBUG_MODE: __DEV__,
            ENABLE_BIOMETRICS: true,
          },
          // Pass AsyncStorage so the provider honors the supplied SOV_NODE_URL
          // instead of any stale cached value
          undefined
        );

        // Create QUIC fetch adapter for native QUIC transport
        const quicFetchAdapter = createQuicFetchAdapterSync({
          insecure: QUIC_CONFIG.insecure,
          timeout: QUIC_CONFIG.defaultTimeout,
          fallbackToHttp: QUIC_CONFIG.fallbackToHttp,
        });

        const apiInstance = new ZhtpApi(configProvider, quicFetchAdapter);
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
