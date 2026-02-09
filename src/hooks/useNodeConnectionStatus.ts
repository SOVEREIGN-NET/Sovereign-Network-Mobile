/**
 * useNodeConnectionStatus Hook
 * Manages node connection status and reachability checking
 */

import { useState, useEffect, useCallback } from 'react';
import { isQuicSupported, testQuicConnection } from '../services/quic';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../config';

export interface UseNodeConnectionStatusReturn {
  connectionStatus: 'idle' | 'checking' | 'connected' | 'disconnected';
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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>(
    () => (autoCheck ? 'checking' : 'idle')
  );
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Check QUIC node reachability (UDP-based, doesn't require full PQC handshake)
  const checkNodeConnection = useCallback(async () => {
    try {
      console.log('[🔗 HeaderBar:useNodeConnectionStatus] Starting node reachability check');
      console.log(`[🔗 HeaderBar:useNodeConnectionStatus] Target: ${DEFAULT_NODE_HOST}:${DEFAULT_NODE_PORT}`);

      // First check if QUIC is supported
      const supported = await isQuicSupported();
      console.log(`[🔗 HeaderBar:useNodeConnectionStatus] QUIC supported: ${supported}`);

      if (!supported) {
        console.warn('QUIC not supported on this device');
        setConnectionStatus('disconnected');
        return;
      }

      // Use QUIC connection test (full PQC handshake works)
      console.log('[🔗 HeaderBar:useNodeConnectionStatus] Calling testQuicConnection (full QUIC+PQC handshake)');
      setConnectionStatus('checking');
      const result = await testQuicConnection(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);
      console.log('[🔗 HeaderBar:useNodeConnectionStatus] testQuicConnection result:', result);

      if (result.success) {
        console.log(`[✅ HeaderBar:useNodeConnectionStatus] Connected! Latency: ${result.latencyMs}ms`);
        setConnectionStatus('connected');
        setLatencyMs(result.latencyMs ? Math.round(result.latencyMs) : null);
      } else {
        console.log('[❌ HeaderBar:useNodeConnectionStatus] Connection failed');
        setConnectionStatus('disconnected');
        setLatencyMs(null);
      }
    } catch (error) {
      console.error('[❌ HeaderBar:useNodeConnectionStatus] Node reachability check failed:', error);
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
