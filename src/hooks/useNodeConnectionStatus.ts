/**
 * useNodeConnectionStatus Hook
 * Manages node connection status and reachability checking
 *
 * Checks on mount, on foreground resume, and every 120s as a fallback.
 * Each check does a full QUIC+TLS connect/close via quinn-ffi, so
 * keeping the interval high avoids resource accumulation in the Rust runtime.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { isQuicSupported, testQuicConnection } from '../services/quic';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../config';
import { refreshFeeConfig } from '../services/FeeConfigService';

const POLL_INTERVAL_MS = 120_000; // 120 seconds

export interface UseNodeConnectionStatusReturn {
  connectionStatus: 'idle' | 'checking' | 'connected' | 'disconnected';
  latencyMs: number | null;
  checkNodeConnection: () => Promise<void>;
  isConnected: boolean;
}

export function useNodeConnectionStatus(
  autoCheck: boolean = true
): UseNodeConnectionStatusReturn {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>(
    () => (autoCheck ? 'checking' : 'idle')
  );
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const checkInFlightRef = useRef(false);

  const checkNodeConnection = useCallback(async () => {
    // Prevent overlapping checks — if one is already running, skip
    if (checkInFlightRef.current) {
      return;
    }
    checkInFlightRef.current = true;

    try {
      const supported = await isQuicSupported();
      if (!supported) {
        setConnectionStatus('disconnected');
        return;
      }

      setConnectionStatus('checking');
      const result = await testQuicConnection(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);

      if (result.success) {
        setConnectionStatus('connected');
        setLatencyMs(result.latencyMs ? Math.round(result.latencyMs) : null);
        // Refresh fee config whenever node is reachable
        refreshFeeConfig().catch(err => {
          if (__DEV__) {
            console.warn('[FeeConfig] Refresh failed:', err?.message || err);
          }
        });
      } else {
        setConnectionStatus('disconnected');
        setLatencyMs(null);
      }
    } catch {
      setConnectionStatus('disconnected');
      setLatencyMs(null);
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!autoCheck) {
      return;
    }

    // Check once on mount
    checkNodeConnection();

    // Re-check every 120 seconds (was 30s — too aggressive for a full QUIC+TLS round-trip)
    const interval = setInterval(checkNodeConnection, POLL_INTERVAL_MS);

    // Re-check when app returns to foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkNodeConnection();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkNodeConnection, autoCheck]);

  return {
    connectionStatus,
    latencyMs,
    checkNodeConnection,
    isConnected: connectionStatus === 'connected',
  };
}

export default useNodeConnectionStatus;
