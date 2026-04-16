/**
 * useNodeConnectionStatus Hook
 * Manages node connection status and reachability checking.
 *
 * Uses a module-level singleton so multiple callers (HeaderBar,
 * DashboardScreen, etc.) share ONE polling loop instead of each
 * running their own QUIC health check.
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

// ---------------------------------------------------------------------------
// Module-level singleton — shared across all hook consumers
// ---------------------------------------------------------------------------

type Status = 'idle' | 'checking' | 'connected' | 'disconnected';
type Listener = () => void;

let _status: Status = 'idle';
let _latencyMs: number | null = null;
let _listeners: Set<Listener> = new Set();
let _refCount = 0;
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _appStateSub: { remove: () => void } | null = null;
let _checkInFlight = false;

function _notify() {
  _listeners.forEach(fn => fn());
}

async function _check() {
  if (_checkInFlight) return;
  _checkInFlight = true;

  try {
    const supported = await isQuicSupported();
    if (__DEV__) console.log('[NodeStatus] QUIC supported:', supported);
    if (!supported) {
      _status = 'disconnected';
      _notify();
      return;
    }

    _status = 'checking';
    _notify();
    if (__DEV__) console.log('[NodeStatus] Testing connection to', DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);
    const result = await testQuicConnection(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);
    if (__DEV__) console.log('[NodeStatus] testQuicConnection result:', JSON.stringify(result));

    if (result.success) {
      _status = 'connected';
      _latencyMs = result.latencyMs ? Math.round(result.latencyMs) : null;
      refreshFeeConfig().catch(err => {
        if (__DEV__) console.warn('[FeeConfig] Refresh failed:', err?.message || err);
      });
    } else {
      _status = 'disconnected';
      _latencyMs = null;
    }
  } catch {
    _status = 'disconnected';
    _latencyMs = null;
  } finally {
    _checkInFlight = false;
    _notify();
  }
}

function _startPolling() {
  if (_intervalId) return; // already running
  _check(); // immediate first check
  _intervalId = setInterval(_check, POLL_INTERVAL_MS);
  const handleAppState = (next: AppStateStatus) => {
    if (next === 'active') _check();
  };
  _appStateSub = AppState.addEventListener('change', handleAppState);
}

function _stopPolling() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }
}

// ---------------------------------------------------------------------------
// Hook — thin subscriber to the singleton
// ---------------------------------------------------------------------------

export function useNodeConnectionStatus(
  autoCheck: boolean = true,
): UseNodeConnectionStatusReturn {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!autoCheck) return;

    const listener = () => forceRender(n => n + 1);
    _listeners.add(listener);
    _refCount++;
    _startPolling();

    return () => {
      _listeners.delete(listener);
      _refCount--;
      if (_refCount <= 0) {
        _refCount = 0;
        _stopPolling();
      }
    };
  }, [autoCheck]);

  const checkNodeConnection = useCallback(async () => {
    await _check();
  }, []);

  return {
    connectionStatus: autoCheck ? _status : 'idle',
    latencyMs: _latencyMs,
    checkNodeConnection,
    isConnected: _status === 'connected',
  };
}

export default useNodeConnectionStatus;
