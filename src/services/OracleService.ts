/**
 * OracleService
 * Oracle API calls via QUIC transport — all endpoints are public read-only
 */

import { publicQuicRequest } from './quic';

// --- Param types ---

export type OraclePair = 'SOV/USD' | 'CBE/USD';
export type VariationPeriod = '1h' | '24h' | '7d';

// --- Price response ---

export interface SovPriceResponse {
  pair: 'SOV/USD';
  source: 'oracle_finalized';
  epoch_id: number;
  price_atomic: string;
  price: number;
  oracle_price_scale: string;
  current_epoch: number;
  epochs_since_finalization: number;
  is_fresh: boolean;
  max_price_staleness_epochs: number;
  pricing_mode?: string;
  cbe_usd_price_atomic?: string;
  cbe_usd_price?: number;
}

export interface CbePriceResponse {
  pair: 'CBE/USD';
  source: 'bonding_curve';
  token_id: string;
  phase: string;
  price_atomic: string;
  price: number;
  price_scale: string;
  total_supply: number;
  reserve_balance: number;
  current_epoch: number;
}

export type OraclePriceResponse = SovPriceResponse | CbePriceResponse;

// --- Variation response ---

export interface SovVariationResponse {
  pair: 'SOV/USD';
  source: 'oracle_finalized';
  period_secs: number;
  period_start_epoch: number;
  period_end_epoch: number;
  latest_price: number;
  reference_price: number;
  absolute_change: number;
  percent_change: number;
  high: number;
  low: number;
  mean: number;
  stdev: number;
  sample_count: number;
}

export interface CbeVariationResponse {
  pair: 'CBE/USD';
  source: 'bonding_curve_model';
  note: string;
  period_secs: number;
  token_id: string;
  phase: string;
  current_price: number;
  base_price: number;
  absolute_change_since_base: number;
  percent_change_since_base: number;
  reserve_balance: number;
  total_supply: number;
  graduation_progress_percent: number;
  can_graduate: boolean;
}

export type OracleVariationResponse = SovVariationResponse | CbeVariationResponse;

// --- Status / Config (unchanged) ---

export interface LatestFinalizedPrice {
  epoch_id: number;
  sov_usd_price_atomic: string;
  sov_usd_price: number;
  cbe_usd_price_atomic?: string;
  cbe_usd_price?: number;
}

export interface OracleStatusResponse {
  current_epoch: number;
  epoch_duration_secs: number;
  committee_size: number;
  committee_threshold: number;
  committee_members: string[];
  finalized_prices_count: number;
  latest_finalized_price: LatestFinalizedPrice | null;
  oracle_price_scale: string;
  pricing_mode?: string;
  onramp_vwap_cbe_usd_atomic?: string | null;
  onramp_vwap_cbe_usd?: number | null;
  onramp_window_trade_count?: number;
  onramp_window_usdc_volume_atomic?: string;
  onramp_min_trades_required?: number;
  onramp_min_volume_usdc_atomic?: string;
}

export interface PendingCommitteeUpdate {
  activate_at_epoch: number;
  new_members: string[];
  new_size: number;
  new_threshold: number;
}

export interface PendingConfigUpdate {
  activate_at_epoch: number;
  epoch_duration_secs: number;
  max_source_age_secs: number;
  max_deviation_bps: number;
  max_price_staleness_epochs: number;
  price_scale: number;
}

export interface OracleConfigResponse {
  epoch_duration_secs: number;
  max_source_age_secs: number;
  max_deviation_bps: number;
  max_deviation_pct: number;
  max_price_staleness_epochs: number;
  price_scale: string;
  committee_size: number;
  committee_threshold: number;
  committee_members: string[];
  pending_committee_update: PendingCommitteeUpdate | null;
  pending_config_update: PendingConfigUpdate | null;
}

// --- Helpers ---

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
}

// --- API functions ---

export function fetchOraclePrice(pair?: OraclePair): Promise<OraclePriceResponse> {
  const qs = buildQuery({ pair });
  return publicQuicRequest<OraclePriceResponse>(`/api/v1/oracle/price${qs}`);
}

export function fetchOracleVariation(
  pair?: OraclePair,
  period?: VariationPeriod,
): Promise<OracleVariationResponse> {
  const qs = buildQuery({ pair, period });
  return publicQuicRequest<OracleVariationResponse>(`/api/v1/oracle/variation${qs}`);
}

export function fetchOracleStatus(): Promise<OracleStatusResponse> {
  return publicQuicRequest<OracleStatusResponse>('/api/v1/oracle/status');
}

export function fetchOracleConfig(): Promise<OracleConfigResponse> {
  return publicQuicRequest<OracleConfigResponse>('/api/v1/oracle/config');
}
