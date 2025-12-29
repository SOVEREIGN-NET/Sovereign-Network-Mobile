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
        // Use ReactNativeConfigProvider directly - no caching to .env only
        const configProvider = new ReactNativeConfigProvider(
          {
            ZHTP_NODE_URL: zhtpNodeUrl, // Key must match api-client's expected envVar name
            NETWORK_TYPE: networkType,
            DEBUG_MODE: __DEV__,
            ENABLE_BIOMETRICS: true,
          },
          // Don't pass AsyncStorage - force read-only config from .env only
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
