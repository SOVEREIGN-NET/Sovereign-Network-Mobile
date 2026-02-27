/**
 * Bonding Curve Token API - Type Definitions
 * Types for deploying, trading, and managing tokens with bonding curve pricing
 */

export type TokenPhase = 'curve' | 'graduated' | 'amm';
export type CurveType = 'linear' | 'exponential' | 'sigmoid';
export type ThresholdType =
  | 'reserve_amount'
  | 'supply_amount'
  | 'time_and_reserve'
  | 'time_and_supply';
export type PriceSource =
  | 'curve_linear'
  | 'curve_exponential'
  | 'curve_sigmoid'
  | 'amm_spot'
  | 'amm_twap'
  | 'srv';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type TxStatus =
  | 'confirmed'
  | 'submitted_to_mempool'
  | 'ready_for_execution';

export interface LinearCurveParams {
  type: 'linear';
  base_price: string | number;
  slope: string | number;
}

export interface ExponentialCurveParams {
  type: 'exponential';
  base_price: string | number;
  growth_rate_bps: string | number;
}

export interface SigmoidCurveParams {
  type: 'sigmoid';
  max_price: string | number;
  midpoint_supply: string | number;
  steepness: string | number;
}

export type CurveTypeParams =
  | LinearCurveParams
  | ExponentialCurveParams
  | SigmoidCurveParams;

export interface ReserveThreshold {
  type: 'reserve_amount';
  min_reserve: string | number;
}

export interface SupplyThreshold {
  type: 'supply_amount';
  min_supply: string | number;
}

export interface TimeAndReserveThreshold {
  type: 'time_and_reserve';
  min_time_seconds: string | number;
  min_reserve: string | number;
}

export interface TimeAndSupplyThreshold {
  type: 'time_and_supply';
  min_time_seconds: string | number;
  min_supply: string | number;
}

export type ThresholdParams =
  | ReserveThreshold
  | SupplyThreshold
  | TimeAndReserveThreshold
  | TimeAndSupplyThreshold;

export interface CurveDeployRequest {
  name: string;
  symbol: string;
  curve_type: CurveTypeParams;
  threshold: ThresholdParams;
  sell_enabled: boolean;
}

export interface CurveDeployResponse {
  success: boolean;
  token_id: string;
  name: string;
  symbol: string;
  phase: TokenPhase;
  tx_status: TxStatus;
}

export interface CurveBuyRequest {
  token_id: string;
  stable_amount: string | number;
}

export interface CurveBuyResponse {
  success: boolean;
  token_id: string;
  stable_paid: string | number;
  tokens_received: string | number;
  auto_graduated: boolean;
  tx_status: TxStatus;
}

export interface CurveSellRequest {
  token_id: string;
  token_amount: string | number;
}

export interface CurveSellResponse {
  success: boolean;
  token_id: string;
  tokens_sold: string | number;
  stable_received: string | number;
  tx_status: TxStatus;
}

export interface TokenListItem {
  token_id: string;
  name: string;
  symbol: string;
  phase: TokenPhase;
  current_price: string | number;
  total_supply?: string | number;
  reserve_balance?: string | number;
}

export interface CurveListResponse {
  tokens: TokenListItem[];
  total_count: number;
  curve_count: number;
  graduated_count: number;
  amm_count: number;
}

export interface CurveListByPhaseResponse {
  tokens: TokenListItem[];
  count: number;
}

export interface TokenInfoResponse {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  phase: TokenPhase;
  total_supply: string | number;
  reserve_balance: string | number;
  current_price: string | number;
  curve_type: CurveType;
  sell_enabled: boolean;
  can_graduate: boolean;
  graduation_progress_percent: number;
  creator: string;
  deployed_at: number;
  amm_pool_id: string | null;
}

export interface TokenStatsResponse {
  token_id: string;
  total_supply: string | number;
  reserve_balance: string | number;
  current_price: string | number;
  total_trades: number;
  total_volume_stable: string | number;
  unique_holders: number;
  phase: TokenPhase;
}

export interface TokenPriceResponse {
  token_id: string;
  price_usd_cents: string | number;
  source: PriceSource;
  phase: TokenPhase;
}

export interface GraduationEligibilityResponse {
  token_id: string;
  can_graduate: boolean;
  reason: string;
  current_reserve?: string | number;
  threshold_reserve?: string | number;
  current_supply?: string | number;
  threshold_supply?: string | number;
  progress_percent: number;
}

export interface ReadyToGraduateResponse {
  tokens: {
    token_id: string;
    name: string;
    symbol: string;
    current_reserve: string | number;
    threshold_reserve: string | number;
  }[];
  count: number;
}

export interface SwapRequest {
  token_id: string;
  pool_id: string;
  amount_in: string | number;
  min_amount_out: string | number;
  token_to_sov: boolean;
}

export interface SwapResponse {
  success: boolean;
  token_id: string;
  pool_id: string;
  amount_in: string | number;
  amount_out: string | number;
  price_impact_bps: string | number;
  tx_status: TxStatus;
}

export interface AddLiquidityRequest {
  token_id: string;
  pool_id: string;
  token_amount: string | number;
  sov_amount: string | number;
}

export interface AddLiquidityResponse {
  success: boolean;
  token_id: string;
  pool_id: string;
  token_amount: string | number;
  sov_amount: string | number;
  lp_tokens_minted: string | number;
  tx_status: TxStatus;
}

export interface RemoveLiquidityRequest {
  token_id: string;
  pool_id: string;
  lp_amount: string | number;
}

export interface RemoveLiquidityResponse {
  success: boolean;
  token_id: string;
  pool_id: string;
  lp_tokens_burned: string | number;
  token_amount_received: string | number;
  sov_amount_received: string | number;
  tx_status: TxStatus;
}

export interface PoolInfoResponse {
  exists: boolean;
  pool_id: string | null;
  token_id: string | null;
  token_symbol: string | null;
  phase: TokenPhase | null;
  total_liquidity_token: string | number;
  total_liquidity_sov: string | number;
  lp_token_supply: string | number;
  fee_bps: number;
  k: string;
  initialized: boolean;
}

export interface TokenValuationResponse {
  token_id: string;
  price_usd_cents: string | number;
  source: PriceSource;
  confidence_level: ConfidenceLevel;
  phase: TokenPhase;
}

export interface PriceQueryResponse {
  token_id: string;
  price: string | number;
  price_type: 'spot' | 'twap';
  timestamp: number;
}

export interface BatchValuationRequest {
  token_ids: string[];
}

export interface BatchValuationResponse {
  valuations: TokenValuationResponse[];
}

export interface ApiError {
  error: boolean;
  status: number;
  message: string;
  code: string;
}
