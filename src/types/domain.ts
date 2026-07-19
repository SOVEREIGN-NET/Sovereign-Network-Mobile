/**
 * Domain Operations - Type Definitions
 * Types for registering, managing .sov domains via QUIC
 * Matched against blockchain validation rules from lib-blockchain
 */

// ============ DOMAIN REGISTRATION ============

export interface DomainRegisterRequest {
  domain: string;
  // Hex (64 chars) wallet_id of the owner's Primary wallet. The 10 SOV
  // registration fee is debited from this wallet; lib-client signs the
  // TokenTransfer to the DAO treasury and attaches it as fee_payment_tx.
  primary_wallet_id: string;
  /**
   * Optional 32-byte sovereign asset id as 64 hex chars (optional `0x` prefix
   * is stripped). When set, DomainRegistrationPayload is V3-bound to the
   * asset (DAO M4).
   */
  asset_id?: string | null;
  content_mappings?: Record<
    string,
    {
      content: string;
      content_type: string;
    }
  >;
}

export interface DomainRegisterResponse {
  success: boolean;
  domain: string;
  owner: string; // DID
  // Unix seconds; server sets `registered_at` and the chain enforces a
  // 365-day expiry off it (see zhtp/src/api/handlers/web4/domains.rs).
  // The register response does NOT include an explicit `expires_at` — the
  // mobile computes it as `registered_at + 365 * 86400`.
  registered_at: number;
  // Optional blockchain hash when the chain deploy succeeded. May be
  // absent (e.g. registration accepted but chain deploy failed / pending).
  blockchain_transaction?: string;
  // Optional flag mirroring `blockchain_transaction` presence.
  contract_deployed?: boolean;
  fees_charged?: number;
  message?: string;
}

/** Seconds in 365 days — matches zhtp::handlers::web4::domains.rs:633 expiry calc. */
export const DOMAIN_REGISTRATION_DURATION_SECS = 365 * 86400;

// ============ DOMAIN INFO ============

export interface DomainInfo {
  domain: string;
  owner: string;
  expires_at: string;
  content_cid?: string;
  classification: 'commercial' | 'welfare_delegated' | 'reserved_welfare' | 'reserved_meta';
}

export interface DomainListResponse {
  domains: DomainInfo[];
  count: number;
}

// ============ DOMAIN AVAILABILITY ============

export interface DomainAvailabilityResult {
  available: boolean;
  classification?: string;
  reason?: string;
  registrar_fee?: number;
}

// ============ DOMAIN STATUS ============

export interface DomainStatusResponse {
  domain: string;
  available: boolean;
  owner?: string;
  expires_at?: number | string;
  classification: 'commercial' | 'welfare_delegated' | 'reserved_welfare' | 'reserved_meta';
  registrar_fee?: number;
}

// ============ DOMAIN HISTORY ============

export interface DomainHistoryEntry {
  timestamp: number;
  action: 'register' | 'update' | 'transfer' | 'renewal' | 'rollback';
  actor: string;
  details: Record<string, any>;
}

export interface DomainHistoryResponse {
  domain: string;
  history: DomainHistoryEntry[];
}

// ============ DOMAIN UPDATE ============

export interface DomainUpdateRequest {
  domain: string;
  new_manifest_cid: string;
  expected_previous_manifest_cid: string;
}

export interface DomainUpdateResponse {
  success: boolean;
  domain: string;
  content_cid: string;
  tx_hash: string;
}

// ============ DOMAIN ROLLBACK ============

export interface DomainRollbackRequest {
  domain: string;
  version: number;
}

export interface DomainRollbackResponse {
  success: boolean;
  domain: string;
  rolled_back_to_version: number;
  tx_hash: string;
}

// ============ UNION TYPES ============

export type DomainResponse =
  | DomainRegisterResponse
  | DomainStatusResponse
  | DomainListResponse
  | DomainHistoryResponse
  | DomainUpdateResponse
  | DomainRollbackResponse;
