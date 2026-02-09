/**
 * Identity types — single source of truth
 *
 * Identity = app-facing shape (used by AuthContext, screens, hooks)
 * NodeIdentityResponse = raw API wire shape from the node (snake_case)
 */

export interface WalletInfo {
  id: string;
  wallet_type: string;
  name: string;
  balance: number;
  staked_balance: number;
  pending_rewards: number;
}

/** App-facing identity shape — used by AuthContext, screens, and hooks */
export interface Identity {
  did: string;
  /** Server-assigned identity ID (hex, without did:zhtp: prefix) */
  identityId?: string;
  displayName: string;
  username?: string;
  identityType: 'citizen' | 'human' | 'organization' | 'developer' | 'validator';
  avatar?: string;
  createdAt?: string | number;
  citizenship?: boolean;
  publicKey?: string;
  biometricHash?: string;
  deviceId?: string;
  wallets?: {
    primary: WalletInfo;
    ubi: WalletInfo;
    savings: WalletInfo;
  };
  daoMembership?: {
    votingPower: number;
    soulboundNftIssued: boolean;
  };
  masterSeedPhrase?: string;
  votingPower?: number;
  ubiEarned?: number;
}

/** Raw identity response from node API (snake_case wire format) */
export interface NodeIdentityResponse {
  identity_id: string;
  did: string;
  display_name: string;
  identity_type: string;
  device_id?: string;
  created_at?: number;
  wallet_seed_phrases?: {
    master_seed_phrase?: string;
  };
}
