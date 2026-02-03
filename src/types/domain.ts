/**
 * Domain Operations - Type Definitions
 * Types for registering, managing .sov domains via QUIC
 * Matched against blockchain validation rules from lib-blockchain
 */

// ============ DOMAIN REGISTRATION ============

export interface DomainRegisterRequest {
  domain: string;
  owner: string;
  fee_amount: number;
  content_mappings?: Record<string, string>;
}

export interface DomainRegisterResponse {
  success: boolean;
  domain: string;
  expires_at: string;
  owner: string; // DID
  tx_hash: string;
}

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
  expires_at?: string;
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
  content_cid: string;
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
