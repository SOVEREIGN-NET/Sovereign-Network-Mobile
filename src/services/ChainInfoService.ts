/**
 * Chain Info Service
 *
 * Fetches chain metadata from the connected node.
 * Used by the re-registration flow to detect chain changes.
 */

import { publicQuicRequest } from './quic';

export interface ChainInfo {
  status: string;
  chain_id: number;
  network: string;
  height: number;
  head_hash: string;
  genesis_hash: string;
  validator_count: number;
  identity_count: number;
}

export async function fetchChainInfo(): Promise<ChainInfo> {
  return publicQuicRequest<ChainInfo>('/api/v1/chain/info');
}
