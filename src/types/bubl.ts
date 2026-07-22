/**
 * BUBL rewards — the on-chain token a member earns for using the app.
 *
 * These types mirror the server's BUBL Rewards API contract verbatim.
 * `RewardsService` is the binding; the Bubl-tab mini-wallet and the
 * rewards screen are the consumers.
 *
 * All token amounts arrive as u128 atomic units serialised as decimal
 * strings — never representable as a JS number. We never do the math
 * client-side: every payload also carries a `*_display` string, and
 * that is the only thing the UI ever renders. The raw `amount` /
 * `total_earned` atoms are treated as opaque.
 */

/** Ticker shown next to a BUBL amount. */
export const BUBL_SYMBOL = 'BUBL';

/**
 * BUBL token id on chain. 32-byte hex, no `0x` prefix — hard-coded in
 * the server at `zhtp/src/api/handlers/rewards/mod.rs:67`.
 *
 * The wallet renders a member's BUBL holdings via the existing token
 * endpoints, addressing the user by the bare 64-hex of their
 * `did:zhtp:<64hex>` (`normalizeIdentityId` already does that strip):
 *   GET /api/v1/token/{BUBL_TOKEN_ID}             — metadata
 *   GET /api/v1/token/{BUBL_TOKEN_ID}/balance/{x} — user's BUBL balance
 *   GET /api/v1/token/balances/{x}                — every token they hold
 */
export const BUBL_TOKEN_ID =
  'f5aff42a31e17656ecab4b01cc2aea15025d813a3109c98b8f1a55378802f82d';

/** Events claimable through `POST /rewards/claim`. */
export type RewardEvent = 'welcome' | 'daily_checkin' | 'active_session';

/** Every event that can appear in the history feed — the three
 *  claimable events plus `new_partner` (earned via `/conversation`). */
export type RewardKind = RewardEvent | 'new_partner';

/** Per-kind accent hue for the bubble glyph on each reward row. Fixed
 *  hex — mid-tone "bubble" colours legible on charcoal and cream. */
export const BUBL_KIND_COLOR: Record<RewardKind, string> = {
  welcome: '#4FC3F7', // sky
  daily_checkin: '#FFB74D', // amber
  active_session: '#4DD0A0', // mint
  new_partner: '#BA8CFF', // lavender
};

/** Human label for a reward kind. */
export const BUBL_KIND_LABEL: Record<RewardKind, string> = {
  welcome: 'Welcome bonus',
  daily_checkin: 'Daily check-in',
  active_session: 'Active session',
  new_partner: 'New chat partner',
};

// ─── Claim responses (POST /rewards/claim, POST /rewards/conversation) ──

export interface RewardAwardedResponse {
  awarded: true;
  amount: string;
  amount_display: string;
  event: RewardKind;
  /** daily_checkin only — 1-indexed consecutive day. */
  streak_day?: number;
  /** new_partner only — 1..=5. */
  partners_this_week?: number;
  tx_hash: string;
  /** unix seconds; omitted for welcome. */
  next_eligible_at?: number;
}

export interface RewardSkippedResponse {
  awarded: false;
  amount: '0';
  /** e.g. `welcome_already_claimed`, `weekly_partner_cap_reached`,
   *  `InsufficientRewardLiquidity` (post-80k underfunded spend delegate). */
  reason: string;
  /** Present when reason is InsufficientRewardLiquidity (atom strings). */
  have?: string;
  need?: string;
  next_eligible_at?: number;
  partners_this_week?: number;
}

export type RewardClaimResponse =
  | RewardAwardedResponse
  | RewardSkippedResponse;

// ─── GET /rewards/balance/{did} ────────────────────────────────────────

export interface RewardsBalance {
  did: string;
  total_earned: string;
  total_earned_display: string;
  counts: {
    welcome_claimed: boolean;
    checkin_count: number;
    session_count: number;
    partner_count: number;
    current_streak: number;
    longest_streak: number;
  };
}

// ─── GET /rewards/status/{did} ─────────────────────────────────────────

export interface RewardsStatus {
  did: string;
  /** Server unix seconds — use for relative-time UI to dodge clock skew. */
  now: number;
  claimable: {
    welcome: { available: boolean; amount_display: string };
    daily_checkin: {
      available: boolean;
      amount_display: string;
      next_streak_day: number;
      next_eligible_at?: number;
    };
    active_session: {
      available: boolean;
      amount_display: string;
      next_eligible_at?: number;
    };
    new_partner: {
      partners_this_week: number;
      weekly_cap: 5;
      remaining: number;
      amount_display_per_partner: string;
    };
  };
  current_streak: number;
  longest_streak: number;
}

// ─── GET /rewards/history/{did} ────────────────────────────────────────

export interface RewardsHistoryEvent {
  at: number;
  /** Monotonic per-server seq — half of the pagination cursor. */
  seq: number;
  event: RewardKind;
  amount: string;
  amount_display: string;
  meta?: {
    streak_day?: number;
    peer_did?: string;
  };
  tx_hash: string;
}

export interface RewardsHistoryPage {
  did: string;
  events: RewardsHistoryEvent[];
  has_more: boolean;
  /** Opaque `<at>:<seq>` cursor — pass as `?cursor=` for the next page.
   *  Absent when `has_more` is false. */
  next_cursor?: string;
}
