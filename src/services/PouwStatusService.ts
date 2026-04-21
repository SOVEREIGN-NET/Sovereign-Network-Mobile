/**
 * PoUW Status — public endpoint exposing the current reward epoch,
 * lifetime budget utilization, and per-proof-type multipliers.
 *
 * Endpoint:  GET /api/v1/pouw/status   (public, no UHP)
 * Transport: QUIC (reuses the same ALPN / session as oracle prices)
 * Cadence:   60s polling (see `useOracleData`)
 *
 * All amount fields are serialized as decimal u128 STRINGS (atoms with
 * 18 decimals). Parse with BigInt — never `Number`. Helpers here keep
 * the bigint math out of screen code.
 */

import { publicQuicRequest } from './quic';

export interface PouwStatusResponse {
  epoch: {
    current: number;
    duration_secs: number;
    started_at: number;
    ends_at: number;
    remaining_secs: number;
  };
  budget: {
    pouw_total_budget: string;
    pouw_total_paid: string;
    pouw_remaining: string;
    pouw_utilization_pct: number;
    dev_grant_pool_ceiling: string;
    budget_state: 'active' | 'exhausted' | string;
  };
  epoch_pool: {
    base_pool: string;
    per_node_cap: string;
    /**
     * Protocol constant — the node count the per-node cap is sized
     * against. This is a ceiling used for math, NOT a live metric.
     */
    expected_active_nodes: number;
    /**
     * Live count of distinct DIDs that have submitted PoUW work in
     * the current epoch. May exceed or fall below
     * `expected_active_nodes`; both fields are authoritative for
     * their respective purpose (target vs actual).
     */
    active_nodes: number;
  };
  multipliers: {
    hash: number;
    merkle: number;
    signature: number;
    web4_manifest_route: number;
    web4_content_served: number;
    base_reward_unit: string;
  };
  stats: {
    total_rewards_calculated: number;
    total_rewards_paid: number;
    total_rewards_pending: number;
    total_rewards_failed: number;
    total_sov_distributed: string;
    suspicious_dids: number;
    unique_earners: number;
  };
  payout: {
    interval_secs: number;
  };
  eligibility: {
    min_identity_age_secs: number;
  };
}

/**
 * Fetch the current PoUW status. Safe to call on a 60s poll — the
 * node-side payload is inexpensive to compute and doesn't require UHP.
 */
export function fetchPouwStatus(): Promise<PouwStatusResponse> {
  return publicQuicRequest<PouwStatusResponse>('/api/v1/pouw/status');
}
