/**
 * Token Operations - Type Definitions
 * Types for creating, minting, transferring tokens via QUIC
 * Matched against API specification
 */

// ============ CREATE TOKEN ============

export interface TokenCreateRequest {
  name: string;
  symbol: string;
  initial_supply: string | number; // String to preserve exact value (no float precision loss)
  decimals: number;
  max_supply: string | number | null; // String to preserve exact value
  creator_identity?: string; // Auto-derived from authenticated session, not client-supplied
}

export interface TokenCreateResponse {
  success: boolean;
  token_id: string;
  name: string;
  symbol: string;
  initial_supply: string;
  decimals: number;
  treasury_allocation_bps: number;
  treasury_recipient: string;
  creator_allocation: string;
  treasury_allocation: string;
  tx_status: string;
}

// ============ MINT TOKEN ============

export interface TokenMintRequest {
  token_id: string;
  amount: string | number; // String to preserve exact value (no float precision loss)
  to: string; // Recipient DID
  creator_identity?: string; // Auto-derived from authenticated session, not client-supplied
}

export interface TokenMintResponse {
  success: boolean;
  amount_minted: string;
  to: string;
  new_total_supply: string;
}

// ============ TRANSFER TOKEN ============

export interface TokenTransferRequest {
  token_id: string;
  from?: string; // Auto-derived from authenticated session, not client-supplied
  to: string; // Recipient DID
  amount: string | number; // String to preserve exact value (no float precision loss)
  nonce?: number; // Optional: fetch from /api/v1/token/nonce/{token_id}/{address}
}

export interface TokenTransferResponse {
  success: boolean;
  amount: string;
  from: string;
  to: string;
  from_balance: string;
  to_balance: string;
}

// ============ SOV WALLET TRANSFER ============

export interface SovTransferRequest {
  from_wallet_id: string; // 64 hex chars (32 bytes)
  to_wallet_id: string; // 64 hex chars (32 bytes)
  amount: string | number; // Atomic units string
  nonce?: number; // Optional: fetch from /api/v1/token/nonce/{token_id}/{wallet_id}
  token_id: string; // SOV token_id (from balances response)
}

export interface SovTransferResponse {
  success: boolean;
  amount: string;
  from_wallet_id: string;
  to_wallet_id: string;
  from_balance: string;
  to_balance: string;
  tx_hash?: string;
  tx_status?: string;
}

// ============ GET TOKEN INFO ============

export interface TokenInfoResponse {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  max_supply: string | null;
  creator: string;
  is_deflationary: boolean;
  created_at_block: number;
}

// ============ GET TOKEN BALANCE ============

export interface TokenBalanceResponse {
  token_id: string;
  balance: string;
  decimals: number;
  symbol: string;
  name: string;
  is_creator?: boolean;
}

// ============ BURN TOKEN ============

export interface TokenBurnRequest {
  token_id: string;
  amount: string;
}

export interface TokenBurnResponse {
  success: boolean;
  amount_burned: string;
  remaining_balance: string;
}

// ============ LIST TOKENS ============

export interface TokenListItem {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
}

export interface TokenListResponse {
  tokens: TokenListItem[];
  count: number;
}

// ============ UNION TYPES ============

export type TokenResponse =
  | TokenCreateResponse
  | TokenMintResponse
  | TokenTransferResponse
  | SovTransferResponse
  | TokenBurnResponse
  | TokenInfoResponse
  | TokenBalanceResponse
  | TokenListResponse;
