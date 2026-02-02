/**
 * useNodeConnectionStatus Hook
 * Manages node connection status and reachability checking
 */

import { useState, useEffect, useCallback } from 'react';
import QuicClient from '../services/QuicClient';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../config';

export interface UseNodeConnectionStatusReturn {
  connectionStatus: 'checking' | 'connected' | 'disconnected';
  latencyMs: number | null;
  checkNodeConnection: () => Promise<void>;
  isConnected: boolean;
}

/**
 * Hook to monitor node connection status
 * Periodically checks QUIC node reachability and latency
 *
 * @param autoCheck - Whether to automatically check connection on mount and periodically
 * @returns Connection status, latency, check function, and boolean flag
 */
export function useNodeConnectionStatus(
  autoCheck: boolean = true
): UseNodeConnectionStatusReturn {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>(
    'checking'
  );
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Check QUIC node reachability (UDP-based, doesn't require full PQC handshake)
  const checkNodeConnection = useCallback(async () => {
    try {
      // First check if QUIC is supported
      const supported = await QuicClient.isSupported();
      if (!supported) {
        if (__DEV__) console.warn('QUIC not supported on this device');
        setConnectionStatus('disconnected');
        return;
      }

      // Use cheap UDP reachability check instead of full PQC handshake
      setConnectionStatus('checking');
      const result = await QuicClient.checkReachability(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);

      if (result.reachable) {
        setConnectionStatus('connected');
        setLatencyMs(result.latencyMs ? Math.round(result.latencyMs) : null);
      } else {
        setConnectionStatus('disconnected');
        setLatencyMs(null);
      }
    } catch (error) {
      if (__DEV__) console.error('Node reachability check failed:', error);
      setConnectionStatus('disconnected');
      setLatencyMs(null);
    }
  }, []);

  // Check connection on mount and periodically
  useEffect(() => {
    if (!autoCheck) {
      return;
    }

    checkNodeConnection();

    // Re-check every 30 seconds
    const interval = setInterval(checkNodeConnection, 30000);
    return () => clearInterval(interval);
  }, [checkNodeConnection, autoCheck]);

  return {
    connectionStatus,
    latencyMs,
    checkNodeConnection,
    isConnected: connectionStatus === 'connected',
  };
}

export default useNodeConnectionStatus;
