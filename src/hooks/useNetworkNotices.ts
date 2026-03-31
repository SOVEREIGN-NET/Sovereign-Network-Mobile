/**
 * useNetworkNotices
 * Aggregates two notice sources:
 *  1. Auto-derived: from node connection status (no network call needed)
 *  2. Operator-pushed: fetched from a static GitHub JSON once per session
 *
 * Returns the highest-severity active notice + a dismiss() function.
 * Dismissed notices are forgotten on app restart (in-memory only).
 */

import { useEffect, useRef, useState } from 'react';
import { useNodeConnectionStatus } from './useNodeConnectionStatus';
import { fetchOperatorNotices, NetworkNotice } from '../services/NoticesService';

type NoticeLevel = NetworkNotice['level'];

const LEVEL_PRIORITY: Record<NoticeLevel, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

function isExpired(notice: NetworkNotice): boolean {
  if (!notice.expires_at) return false;
  return new Date(notice.expires_at).getTime() < Date.now();
}

export interface UseNetworkNoticesReturn {
  activeNotice: NetworkNotice | null;
  dismiss: (id: string) => void;
}

export function useNetworkNotices(): UseNetworkNoticesReturn {
  const { connectionStatus, latencyMs } = useNodeConnectionStatus(true);
  const [operatorNotices, setOperatorNotices] = useState<NetworkNotice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchOperatorNotices().then(setOperatorNotices).catch(() => {});
  }, []);

  // --- Auto-derived notices from QUIC node status ---
  const autoNotices: NetworkNotice[] = [];

  if (connectionStatus === 'disconnected') {
    autoNotices.push({
      id: '__node_disconnected',
      level: 'error',
      message:
        'Cannot reach the Sovereign Network node. Some features may be unavailable.',
    });
  } else if (
    connectionStatus === 'connected' &&
    latencyMs !== null &&
    latencyMs > 800
  ) {
    autoNotices.push({
      id: '__node_slow',
      level: 'warning',
      message: `Node response is slow (${latencyMs}ms). Transactions may take longer than usual.`,
    });
  }

  const allNotices = [
    ...autoNotices,
    ...operatorNotices.filter(n => !isExpired(n)),
  ];

  const activeNotice =
    allNotices
      .filter(n => !dismissed.has(n.id))
      .sort((a, b) => LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level])[0] ??
    null;

  const dismiss = (id: string) =>
    setDismissed(prev => new Set(prev).add(id));

  return { activeNotice, dismiss };
}
