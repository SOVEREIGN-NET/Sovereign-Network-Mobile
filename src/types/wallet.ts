/**
 * Wallet types for node API responses
 */

export interface WalletListResponse {
  identity_id: string;
  total_balance: number;
  wallets: Array<{
    wallet_id?: string;
    id?: string;
    summary?: {
      id?: string[];
    };
    name?: string;
    wallet_type: string;
    available_balance: number;
    staked_balance: number;
    pending_rewards: number;
    total_balance?: number;
    balance?: number;
    permissions?: Record<string, unknown>;
    created_at?: number;
    description?: string;
  }>;
}
