/**
 * NoticesService
 * Fetches operator-pushed notices from a static JSON hosted on GitHub.
 * Cached in-memory for CACHE_TTL_MS to avoid hammering on every render.
 *
 * Operators update messages by editing public/notices.json in the repo.
 * The URL is intentionally kept outside the node so notices still work
 * when the ZHTP node itself is experiencing issues.
 */

const NOTICES_URL =
  'https://raw.githubusercontent.com/SOVEREIGN-NET/SovereignNetworkMobile/main/public/notices.json';

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

export interface NetworkNotice {
  /** Stable unique ID — used for per-session dismissal tracking */
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  /** ISO 8601. When omitted the notice never expires. */
  expires_at?: string;
}

interface NoticesFile {
  notices: NetworkNotice[];
}

let _cache: NetworkNotice[] = [];
let _lastFetchAt = 0;

export async function fetchOperatorNotices(): Promise<NetworkNotice[]> {
  const now = Date.now();
  if (now - _lastFetchAt < CACHE_TTL_MS) {
    return _cache;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NOTICES_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: NoticesFile = await res.json();
    _cache = Array.isArray(json.notices) ? json.notices : [];
    _lastFetchAt = now;
  } catch {
    // Intentional: keep stale cache on any failure.
    // Notices are best-effort; never block the UI.
  } finally {
    clearTimeout(timer);
  }

  return _cache;
}
