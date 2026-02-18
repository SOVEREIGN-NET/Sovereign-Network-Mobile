/**
 * ExplorerService
 * Blockchain explorer API calls via QUIC transport
 */

import { publicQuicRequest } from './quic';

// --- Response types ---

export interface StatsResponse {
  status: string;
  latest_height: number;
  latest_block_time: number | null;
  total_transactions: number;
  avg_block_time_secs: number | null;
  total_supply: number;
  total_ubi_distributed: number;
  active_validators: number;
  mempool_size: number;
}

export interface BlockSummary {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
}

export interface BlocksResponse {
  status: string;
  blocks: BlockSummary[];
}

export interface TxSummary {
  hash: string;
  transaction_type: string;
  fee: number;
  timestamp: number;
}

export interface TransactionsResponse {
  status: string;
  transactions: TxSummary[];
}

export interface BlockDetailResponse {
  status: string;
  height: number;
  hash: string;
  previous_hash: string;
  timestamp: number;
  transaction_count: number;
  merkle_root: string;
  nonce: number;
}

export interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  transaction_type: string;
  timestamp: number;
  size: number;
}

export interface TransactionDetailResponse {
  status: string;
  transaction: TransactionInfo | null;
  block_height: number | null;
  confirmations: number | null;
  in_mempool: boolean;
}

export interface IdentityResponse {
  status: string;
  did?: string;
  display_name?: string;
  identity_type?: string;
  registration_fee?: number;
  created_at?: number;
  controlled_nodes?: string[];
  owned_wallets?: string[];
  message?: string;
}

export interface WalletInfo {
  wallet_id: string;
  wallet_name?: string;
  wallet_type?: string;
  alias?: string;
  owner_identity_id?: string;
  capabilities?: string[];
  created_at?: number;
}

export interface WalletsResponse {
  status: string;
  wallet_count: number;
  wallets: WalletInfo[];
}

export interface SearchResponse {
  status: string;
  query: string;
  result_type?: string;
  result?: any;
  message?: string;
}

// --- API functions ---

export function fetchStats(): Promise<StatsResponse> {
  return publicQuicRequest<StatsResponse>('/api/v1/blockchain/stats');
}

export function fetchBlocks(limit: number = 10): Promise<BlocksResponse> {
  return publicQuicRequest<BlocksResponse>(`/api/v1/blockchain/blocks?limit=${limit}`);
}

export function fetchTransactions(limit: number = 10): Promise<TransactionsResponse> {
  return publicQuicRequest<TransactionsResponse>(`/api/v1/blockchain/transactions?limit=${limit}`);
}

export function fetchBlock(hashOrHeight: string): Promise<BlockDetailResponse> {
  return publicQuicRequest<BlockDetailResponse>(`/api/v1/blockchain/block/${hashOrHeight}`);
}

export function fetchTransaction(hash: string): Promise<TransactionDetailResponse> {
  return publicQuicRequest<TransactionDetailResponse>(`/api/v1/blockchain/transaction/${hash}`);
}

export function fetchIdentity(did: string): Promise<IdentityResponse> {
  return publicQuicRequest<IdentityResponse>(`/api/v1/blockchain/identities/${did}`);
}

export function fetchWallets(ownerId?: string): Promise<WalletsResponse> {
  const query = ownerId ? `?owner_identity=${ownerId}` : '';
  return publicQuicRequest<WalletsResponse>(`/api/v1/blockchain/wallets${query}`);
}

export function searchBlockchain(query: string): Promise<SearchResponse> {
  return publicQuicRequest<SearchResponse>(`/api/v1/blockchain/search?q=${encodeURIComponent(query)}`);
}
