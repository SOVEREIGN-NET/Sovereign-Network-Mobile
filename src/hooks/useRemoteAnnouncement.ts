/**
 * useRemoteAnnouncement — subscribes to the remote announcement JSON,
 * filters out dismissed ones, and returns whatever should be displayed.
 *
 * Polling:
 *   - On mount.
 *   - Every `ANNOUNCEMENT_POLL_INTERVAL_MS`.
 *   - On AppState foreground transition.
 *
 * Dismissal:
 *   - When the user closes a banner, `dismiss()` records the id in
 *     AsyncStorage and clears the local state. The next poll re-checks
 *     and, if the same id is still up, the banner stays gone.
 *   - If the server publishes a fresh id (e.g. `rst-2026-06-12` →
 *     `rst-2026-06-13`), the new banner appears even though the user
 *     dismissed the previous one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  ANNOUNCEMENT_POLL_INTERVAL_MS,
  fetchAnnouncement,
  loadDismissedIds,
  recordDismissal,
  type RemoteAnnouncement,
} from '../services/RemoteAnnouncement';

export interface UseRemoteAnnouncementResult {
  announcement: RemoteAnnouncement | null;
  /** Refetch immediately (in addition to the scheduled poll). */
  refresh: () => void;
  /** Hide and persist a dismissal for the current banner. */
  dismiss: () => void;
}

export function useRemoteAnnouncement(): UseRemoteAnnouncementResult {
  const [announcement, setAnnouncement] = useState<RemoteAnnouncement | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  // Apply the dismissed-set filter — used everywhere we set state from a
  // fresh fetch.
  const applyFilter = useCallback((ann: RemoteAnnouncement | null) => {
    if (!ann) {
      setAnnouncement(null);
      return;
    }
    if (dismissedRef.current.has(ann.id)) {
      setAnnouncement(null);
      return;
    }
    setAnnouncement(ann);
  }, []);

  const refresh = useCallback(() => {
    void (async () => {
      const ann = await fetchAnnouncement();
      applyFilter(ann);
    })();
  }, [applyFilter]);

  // Load dismissed-ids cache once on mount, then kick the first fetch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = await loadDismissedIds();
      if (cancelled) return;
      dismissedRef.current = ids;
      refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Periodic refresh.
  useEffect(() => {
    const t = setInterval(refresh, ANNOUNCEMENT_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Refresh on foreground transition.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const dismiss = useCallback(() => {
    const current = announcement;
    if (!current) return;
    dismissedRef.current.add(current.id);
    setAnnouncement(null);
    void recordDismissal(current.id);
  }, [announcement]);

  return { announcement, refresh, dismiss };
}
