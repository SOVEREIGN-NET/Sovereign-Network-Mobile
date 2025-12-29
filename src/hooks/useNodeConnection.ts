/**
 * useNodeConnection Hook
 * Custom hook for detecting SOV node connectivity and protocol info
 */

import { useState, useCallback, useEffect } from 'react';
import RealAuthService from '../services/RealAuthService';
import { useTranslation } from '../i18n';

export interface ProtocolInfo {
  success?: boolean;
  protocol?: string;
  version?: string;
  features?: {
    quantum_resistant?: boolean;
    zk_privacy_enabled?: boolean;
    mesh_networking?: boolean;
    dao_fees_enabled?: boolean;
    pure_tcp?: boolean;
  };
  network?: {
    id?: string;
    consensus?: string;
    block_height?: number;
    peer_count?: number;
    healthy?: boolean;
  };
  node?: {
    status?: string;
    uptime?: number;
    latency?: number;
    synced?: boolean;
  };
  error?: string;
}

export interface UseNodeConnectionState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  protocolInfo: ProtocolInfo | null;
  nodeUrl: string | null;
}

export interface UseNodeConnectionReturn extends UseNodeConnectionState {
  checkConnection: () => Promise<void>;
  getProtocol: () => Promise<void>;
  ensureConnection: () => Promise<boolean>;
}

/**
 * Hook to check SOV node connectivity
 * Automatically checks on mount, provides manual refresh methods
 *
 * @param autoCheck - Whether to automatically check connection on mount (default: true)
 * @param pollingInterval - Polling interval in ms (default: 0 = disabled)
 * @returns Connection state and methods to check/update connectivity
 */
export function useNodeConnection(
  autoCheck: boolean = true,
  pollingInterval: number = 0,
): UseNodeConnectionReturn {
  const { t } = useTranslation();

  const [state, setState] = useState<UseNodeConnectionState>({
    isConnected: false,
    isLoading: true,
    error: null,
    protocolInfo: null,
    nodeUrl: RealAuthService.getNodeUrl(),
  });

  /**
   * Check basic connection to node
   * Hits /api/v1/protocol/health endpoint (no auth required)
   */
  const checkConnection = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const connected = await RealAuthService.testConnection();

      setState(prev => ({
        ...prev,
        isConnected: connected,
        isLoading: false,
        error: connected ? null : t.app.errors.nodeUnreachable,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isConnected: false,
        isLoading: false,
        error: message || t.app.errors.connectionCheckFailed,
      }));
    }
  }, [t]);

  /**
   * Get comprehensive protocol and node information
   * Hits /api/v1/protocol/health endpoint (no auth required)
   */
  const getProtocol = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const protocolInfo = await RealAuthService.getProtocolInfo();

      setState(prev => ({
        ...prev,
        protocolInfo: (protocolInfo as ProtocolInfo) || null,
        isConnected: true,
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message || t.app.errors.protocolInfoFailed,
      }));
    }
  }, [t]);

  /**
   * Ensure API is initialized and connected
   * Reinitializes config if connection was lost
   */
  const ensureConnection = useCallback(async (): Promise<boolean> => {
    try {
      const connected = await RealAuthService.ensureConnection();
      setState(prev => ({
        ...prev,
        isConnected: connected,
        error: connected ? null : t.app.errors.failedToEstablishConnection,
      }));
      return connected;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: message || t.app.errors.ensureConnectionFailed,
      }));
      return false;
    }
  }, [t]);

  /**
   * Initial check on mount
   */
  useEffect(() => {
    if (autoCheck) {
      checkConnection();
    }
  }, [autoCheck, checkConnection]);

  /**
   * Polling setup
   */
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const timer = setInterval(() => {
      checkConnection();
    }, pollingInterval);

    return () => clearInterval(timer);
  }, [pollingInterval, checkConnection]);

  return {
    ...state,
    checkConnection,
    getProtocol,
    ensureConnection,
  };
}

export default useNodeConnection;
