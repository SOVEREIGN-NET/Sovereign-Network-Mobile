/**
 * Remote announcement service — fetches a single JSON document from a
 * GitHub-raw URL so the project owner can publish testnet-restart /
 * intervention / update banners without shipping an app update.
 *
 * Publishing flow:
 *   1. Edit the JSON file in the announcements repo (GitHub web UI works).
 *   2. Commit to the `main` branch — `raw.githubusercontent.com` reflects
 *      the change within ~30 s (Fastly edge cache).
 *   3. App fetches on launch + every `POLL_INTERVAL_MS`, and on AppState
 *      foreground transitions. Banner appears in <30 s globally.
 *
 * JSON shape (all fields except `id` and `message` are optional):
 *   {
 *     "id": "rst-2026-06-12",
 *     "message": "Testnet restart at 21:00 UTC tonight",
 *     "severity": "info" | "warning" | "critical",
 *     "dismissable": true,
 *     "expires_at": 1781308800        // Unix seconds; null/missing = no expiry
 *   }
 *
 * To clear the banner: replace the file with `{}` (no `message` field).
 *
 * Dismissal: when the user closes a dismissable banner, the `id` is
 * stored in AsyncStorage and that exact announcement is suppressed.
 * Changing `id` makes the banner re-appear even if the message body is
 * otherwise the same — so use a fresh id per real publication.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the announcement JSON lives. Set this to point at the repo + branch + path you control. */
export const ANNOUNCEMENT_URL =
  'https://raw.githubusercontent.com/SOVEREIGN-NET/sov-announcements/main/announcement.json';

/** Polling cadence. Banner-class changes are not time-critical — minutes is fine. */
export const ANNOUNCEMENT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Fetch timeout — short. We never want this to delay app rendering. */
const FETCH_TIMEOUT_MS = 6_000;

/** AsyncStorage key for the set of dismissed announcement ids. */
const DISMISSED_KEY = 'sov:dismissed_announcements';

export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

export interface RemoteAnnouncement {
  id: string;
  message: string;
  severity?: AnnouncementSeverity;
  dismissable?: boolean;
  /** Unix seconds. Past expiry → banner is hidden. */
  expires_at?: number;
}

/**
 * Parse a JSON blob into a RemoteAnnouncement, returning null for any
 * shape that doesn't validate. We're permissive on extra fields and
 * strict on the required ones — anything that ships a bad JSON gets a
 * no-op instead of a crash.
 */
function parseAnnouncement(raw: unknown): RemoteAnnouncement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  if (typeof r.message !== 'string' || r.message.length === 0) return null;
  const severity =
    r.severity === 'info' || r.severity === 'warning' || r.severity === 'critical'
      ? r.severity
      : undefined;
  return {
    id: r.id,
    message: r.message,
    severity,
    dismissable: typeof r.dismissable === 'boolean' ? r.dismissable : undefined,
    expires_at:
      typeof r.expires_at === 'number' && Number.isFinite(r.expires_at)
        ? r.expires_at
        : undefined,
  };
}

/**
 * Fetch the announcement JSON. Returns null on:
 *   - network error (offline, DNS, timeout)
 *   - non-2xx response
 *   - JSON parse failure
 *   - missing required fields
 *   - past expiry
 *
 * Never throws — caller treats null as "no banner".
 */
export async function fetchAnnouncement(): Promise<RemoteAnnouncement | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(ANNOUNCEMENT_URL, {
        method: 'GET',
        // GitHub raw responds with `application/json` already, but a
        // mismatched mime won't stop us from parsing.
        headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      // 404 is the "no announcement file present" case — silent. Other
      // statuses might be transient; log for diagnosis but don't shout.
      if (res.status !== 404) {
        console.warn(
          '[RemoteAnnouncement] fetch returned',
          res.status,
          res.statusText,
        );
      }
      return null;
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed === '{}') return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      console.warn('[RemoteAnnouncement] JSON parse failed:', e);
      return null;
    }
    const ann = parseAnnouncement(parsed);
    if (!ann) return null;
    if (ann.expires_at != null) {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (nowSecs >= ann.expires_at) return null;
    }
    return ann;
  } catch (e) {
    // AbortError + network errors land here. Silent — banner just stays
    // empty until the next poll.
    if (__DEV__) {
      console.log('[RemoteAnnouncement] fetch failed (will retry):', e);
    }
    return null;
  }
}

/** Read the dismissed-id set from AsyncStorage. Returns empty on any read failure. */
export async function loadDismissedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Append an id to the dismissed set and persist. Bounded to the most
 * recent 50 ids so the set can't grow unbounded over the years.
 */
export async function recordDismissal(id: string): Promise<void> {
  try {
    const current = await loadDismissedIds();
    if (current.has(id)) return;
    current.add(id);
    const arr = Array.from(current).slice(-50);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  } catch (e) {
    // Non-fatal — banner will reappear next launch, that's acceptable.
    console.warn('[RemoteAnnouncement] failed to persist dismissal:', e);
  }
}
