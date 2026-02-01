/**
 * Token Operations - Type Definitions
 * Types for creating, minting, transferring tokens via QUIC
 * Matched against API specification
 */

// ============ CREATE TOKEN ============

export interface TokenCreateRequest {
  name: string;
  symbol: string;
  initial_supply: number;
  decimals: number;
  max_supply: number | null;
  creator_identity?: string; // Auto-derived from authenticated session, not client-supplied
}

export interface TokenCreateResponse {
  success: boolean;
  token_id: string;
  name: string;
  symbol: string;
  total_supply: number;
  creator: string; // DID format
  tx_hash: string;
}

// ============ MINT TOKEN ============

export interface TokenMintRequest {
  token_id: string;
  amount: number;
  to: string; // Recipient DID
  creator_identity?: string; // Auto-derived from authenticated session, not client-supplied
}

export interface TokenMintResponse {
  success: boolean;
  amount_minted: number;
  to: string;
  new_total_supply: number;
}

// ============ TRANSFER TOKEN ============

export interface TokenTransferRequest {
  token_id: string;
  from?: string; // Auto-derived from authenticated session, not client-supplied
  to: string; // Recipient DID
  amount: number;
}

export interface TokenTransferResponse {
  success: boolean;
  amount: number;
  from: string;
  to: string;
  from_balance: number;
  to_balance: number;
}

// ============ GET TOKEN INFO ============

export interface TokenInfoResponse {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: number;
  max_supply: number | null;
  creator: string;
  is_deflationary: boolean;
  created_at_block: number;
}

// ============ GET TOKEN BALANCE ============

export interface TokenBalanceResponse {
  token_id: string;
  balance: number;
  decimals: number;
  symbol: string;
  name: string;
  is_creator?: boolean;
}

// ============ BURN TOKEN ============

export interface TokenBurnRequest {
  token_id: string;
  amount: number;
}

export interface TokenBurnResponse {
  success: boolean;
  amount_burned: number;
  remaining_balance: number;
}

// ============ LIST TOKENS ============

export interface TokenListItem {
  token_id: string;
  name: string;
  symbol: string;
  total_supply: number;
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
  | TokenBurnResponse
  | TokenInfoResponse
  | TokenBalanceResponse
  | TokenListResponse;
