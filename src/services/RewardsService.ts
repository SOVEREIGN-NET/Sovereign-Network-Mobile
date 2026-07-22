/**
 * RewardsService — binding for the chain-native rewards API
 * (`/api/v1/rewards/*`, Path C / N2–N3).
 *
 * Two halves:
 *  1. A typed client for claim, conversation, balance, status, history.
 *  2. Auto-fire triggers (`fire*`) wired into the app lifecycle —
 *     welcome on identity activation, daily check-in on launch /
 *     foreground, active session on the messages tab, conversation on
 *     opening a chat. These never throw: the server is idempotent and
 *     the authority on every cap, so a missed call is simply retried by
 *     the next trigger.
 *
 * g1 pinning: claim POSTs need a hot delegate keystore (g1 today).
 * Reads work on any node with `rewards_activation.toml`. Routing through
 * `rewardsGet` / `rewardsPost` keeps the pin even if general API traffic
 * later moves onto failover routing.
 *
 * Errors (do not conflate):
 *  - HTTP **503** → activation missing / claim on read-only replica
 *  - body `reason: InsufficientRewardLiquidity` → funded activation but
 *    underfunded spend delegate (have/need atoms); not a 503
 */

import { quicRequest } from './quic';
import type {
  RewardClaimResponse,
  RewardEvent,
  RewardsBalance,
  RewardsHistoryPage,
  RewardsStatus,
} from '../types/bubl';

// The rewards endpoints are served by g1 only. Kept as an explicit
// constant so the pin survives any future change to general routing.
const REWARDS_HOST = 'g1.thesovereignnetwork.org';
const REWARDS_PORT = 9334;

const BASE = '/api/v1/rewards';

// ─── Typed client ──────────────────────────────────────────────────────

function rewardsGet<T>(path: string): Promise<T> {
  return quicRequest<T>(path, {
    method: 'GET',
    host: REWARDS_HOST,
    port: REWARDS_PORT,
  });
}

function rewardsPost<T>(path: string, body: unknown): Promise<T> {
  return quicRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    host: REWARDS_HOST,
    port: REWARDS_PORT,
  });
}

/** True when the claim body says the spend delegate lacks liquidity
 *  (post-80k). This is a successful HTTP response with awarded:false —
 *  not a transport error and not a 503. */
export function isInsufficientRewardLiquidity(
  response: RewardClaimResponse | null | undefined,
): boolean {
  if (!response || response.awarded) return false;
  return response.reason === 'InsufficientRewardLiquidity';
}

/** Claim a fixed-shape event. Idempotent server-side — a repeat call
 *  returns `awarded: false` rather than erroring. */
export function claimReward(
  did: string,
  event: RewardEvent,
): Promise<RewardClaimResponse> {
  return rewardsPost<RewardClaimResponse>(`${BASE}/claim`, { did, event });
}

/** Report a conversation with a peer. Server dedups by
 *  `(did, peer_did, ISO week)` and caps at 5 partners/week. */
export function reportConversation(
  did: string,
  peerDid: string,
): Promise<RewardClaimResponse> {
  return rewardsPost<RewardClaimResponse>(`${BASE}/conversation`, {
    did,
    peer_did: peerDid,
  });
}

/** Lifetime earned stats for a DID (chain-backed rewards module). */
export function getRewardsBalance(did: string): Promise<RewardsBalance> {
  return rewardsGet<RewardsBalance>(
    `${BASE}/balance/${encodeURIComponent(did)}`,
  );
}

/** What's claimable right now for a DID. */
export function getRewardsStatus(did: string): Promise<RewardsStatus> {
  return rewardsGet<RewardsStatus>(
    `${BASE}/status/${encodeURIComponent(did)}`,
  );
}

/** One page of the reward history, newest first. Pass `cursor` from a
 *  previous page's `next_cursor` to page backwards. */
export function getRewardsHistory(
  did: string,
  opts?: { limit?: number; cursor?: string },
): Promise<RewardsHistoryPage> {
  // Query string built by hand — the RN URLSearchParams polyfill has
  // incomplete typings. `cursor` is an opaque `<at>:<seq>`, so encode it.
  const params: string[] = [];
  if (opts?.limit) params.push(`limit=${opts.limit}`);
  if (opts?.cursor) params.push(`cursor=${encodeURIComponent(opts.cursor)}`);
  const suffix = params.length > 0 ? `?${params.join('&')}` : '';
  return rewardsGet<RewardsHistoryPage>(
    `${BASE}/history/${encodeURIComponent(did)}${suffix}`,
  );
}

/**
 * True when a failure means "rewards aren't available here" rather than
 * a transient blip — the documented 503 from a node without
 * `rewards_activation.toml` / no hot keystore on claim path, or any
 * transport failure that left us without a response.
 *
 * Do **not** use this for `InsufficientRewardLiquidity` (that is a
 * successful claim body with awarded:false — see
 * `isInsufficientRewardLiquidity`).
 */
export function isRewardsUnavailable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (status === 503) return true;
  // No HTTP status at all → the request never reached a responding
  // node (endpoint not deployed, connection refused, timeout).
  return status === undefined;
}

/**
 * Human-readable note for a claim response that did not award.
 * Returns null when the response was successful or is a routine skip.
 */
export function claimSkipMessage(
  response: RewardClaimResponse,
): string | null {
  if (response.awarded) return null;
  if (isInsufficientRewardLiquidity(response)) {
    return 'Rewards pool is temporarily underfunded. Try again later.';
  }
  return null;
}

/** Group the integer part of a `*_display` amount with thousands
 *  separators, locale-independently. `"1234.5"` → `"1,234.5"`. */
export function formatBublDisplay(display: string): string {
  const [intPart, frac] = display.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

// ─── Auto-fire triggers ────────────────────────────────────────────────
//
// All of these are fire-and-forget. They swallow every error: the
// rewards node may be unreachable or the endpoint not yet deployed, and
// a dropped claim costs nothing — the server is idempotent and the next
// trigger (or the next launch) re-asserts it.

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** UTC calendar day, `YYYY-MM-DD` — the server's check-in / session
 *  reset boundary. */
function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// In-memory trigger guards. Reset on app restart — that's fine, the
// server enforces every real cap; these only spare redundant calls
// within a single launch.
let welcomeFired = false;
let lastCheckinUtcDay: string | null = null;
let activeSessionFired = false;
const conversationsReported = new Set<string>();

/**
 * Claim the one-time welcome bonus. Fired on identity activation.
 *
 * A just-created identity may not be committed on-chain yet, so the
 * UHP-v2 auth on the rewards endpoint can reject the first attempts —
 * hence the backoff. If every attempt fails the claim is simply left
 * for the next app launch (the bonus is lifetime-idempotent).
 */
export async function fireWelcomeClaim(
  did: string | null | undefined,
): Promise<void> {
  if (!did || welcomeFired) return;
  welcomeFired = true;
  const backoffMs = [0, 8_000, 24_000];
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt] > 0) await sleep(backoffMs[attempt]);
    try {
      await claimReward(did, 'welcome');
      return;
    } catch {
      // Keep retrying; the last failure falls through and is dropped.
    }
  }
}

/**
 * Claim the daily check-in. Fired on cold start and on every
 * foreground; the in-memory guard collapses repeats within one UTC day,
 * and a UTC-midnight rollover naturally re-arms it.
 */
export async function fireDailyCheckin(
  did: string | null | undefined,
): Promise<void> {
  if (!did) return;
  const today = utcDayKey();
  if (lastCheckinUtcDay === today) return;
  lastCheckinUtcDay = today;
  try {
    await claimReward(did, 'daily_checkin');
  } catch {
    // Re-arm so the next foreground retries.
    lastCheckinUtcDay = null;
  }
}

/**
 * Claim the active-session reward. Fired once per launch when the user
 * reaches the messages tab; the server enforces once per UTC day.
 */
export async function fireActiveSession(
  did: string | null | undefined,
): Promise<void> {
  if (!did || activeSessionFired) return;
  activeSessionFired = true;
  try {
    await claimReward(did, 'active_session');
  } catch {
    activeSessionFired = false; // retry on the next messages-tab visit
  }
}

/**
 * Report a conversation with a peer. Fired once per `(did, peer)` per
 * launch when a chat is opened; the server dedups by ISO week and
 * enforces the 5-partner cap, so calling optimistically is safe.
 */
export async function fireConversation(
  did: string | null | undefined,
  peerDid: string | null | undefined,
): Promise<void> {
  if (!did || !peerDid || did === peerDid) return;
  const key = `${did}|${peerDid}`;
  if (conversationsReported.has(key)) return;
  conversationsReported.add(key);
  try {
    await reportConversation(did, peerDid);
  } catch {
    conversationsReported.delete(key); // retry next time the chat opens
  }
}
