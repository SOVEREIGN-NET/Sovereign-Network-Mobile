/**
 * Fee Config Service
 * Fetches governance-controlled fee parameters from the server
 * and passes them to Rust for cached fee computation.
 */

import { publicQuicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';

let lastUpdatedAt = 0;
let lastChainHeight = 0;

/** Fetch fee config from server and pass to Rust. */
export async function refreshFeeConfig(): Promise<void> {
  const json = await publicQuicRequest<unknown>('/api/v1/blockchain/fee-config');
  const configStr = JSON.stringify(json);
  const result = await nativeIdentityProvisioning.setFeeConfig(configStr);
  lastUpdatedAt = result.updatedAt;
  lastChainHeight = result.chainHeight;
  console.log('[FeeConfig] Updated:', { updatedAt: lastUpdatedAt, chainHeight: lastChainHeight });
}

/** Check if fee config should be refreshed based on chain height delta. */
export function shouldRefresh(currentHeight: number): boolean {
  if (lastChainHeight === 0) return true;
  return (currentHeight - lastChainHeight) >= 50;
}

/** Get last known fee config state. */
export function getFeeState() {
  return { updatedAt: lastUpdatedAt, chainHeight: lastChainHeight };
}
