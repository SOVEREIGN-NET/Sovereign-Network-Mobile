/**
 * API Context (Deprecated)
 *
 * This context is no longer actively used. API calls are now handled through:
 * - Native modules (NativeZhtpApi) for authentication
 * - AppService for wallet/identity queries
 *
 * Kept for backwards compatibility and potential future use.
 */

import React, { createContext, useMemo } from 'react';

export interface ApiContextType {
  isInitialized: boolean;
  error: string | null;
}

export const ApiContext = createContext<ApiContextType | undefined>(undefined);

interface ApiProviderProps {
  children: React.ReactNode;
}

/**
 * API Provider Component (Minimal)
 * Provides initialization status only. Real API calls use:
 * - NativeZhtpApi via RealAuthService for auth
 * - AppService for data queries
 */
export const ApiProvider: React.FC<ApiProviderProps> = ({
  children,
}) => {
  const value = useMemo<ApiContextType>(() => ({
    isInitialized: true,
    error: null,
  }), []);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export default ApiContext;
