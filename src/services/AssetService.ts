/**
 * Sovereign Asset Service (DAO Launch M1 / M3)
 * Discovery + launch via /api/v1/assets* (not legacy /api/v1/token/*).
 */

import { quicRequest, publicQuicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';

/** blake3("SOV_DAO_TREASURY_V1") — default protocol treasury key_id at launch */
export const DEFAULT_DAO_TREASURY_KEY_ID_HEX =
  '6adb0279d2af625f4d292bafe0fcfe3e2020436478b0f90d98adaf820cac1547';

export interface SovereignAssetListItem {
  asset_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string | number;
  supply_mode?: string;
  module_bitmask?: number;
  dao_class?: string;
  burn_bps?: number;
  launched_at_height?: number | null;
  manifest_cid?: string | null;
  manifest_hash?: string | null;
  share_link?: string;
}

export interface SovereignAssetDetail extends SovereignAssetListItem {
  creator_key_id?: string;
  treasury_key_id?: string | null;
  interface?: Record<string, unknown>;
  manifest?: Record<string, unknown> | null;
  manifest_resolved?: boolean;
  governance_status?: Record<string, unknown>;
}

export interface AssetLaunchRequest {
  name: string;
  symbol: string;
  /** Whole-token initial supply (UI units; converted to atoms via decimals) */
  initialSupplyWhole: string | number;
  decimals?: number;
  /** 0 = FP, 1 = NP */
  daoClass?: number;
  burnBps?: number;
  chainId?: number;
  /** 64-char hex; defaults to protocol treasury derivation */
  treasuryKeyIdHex?: string;
  enforceDaoLaunchConstraints?: boolean;
}

export interface AssetLaunchResponse {
  success: boolean;
  asset_id: string;
  share_link?: string;
  name?: string;
  symbol?: string;
  creator_allocation?: string;
  treasury_allocation?: string;
  tx_status?: string;
  /** Alias for tracked storage / legacy screens */
  token_id?: string;
}

/** Split whole units × 10^decimals into u128 lo/hi (JS safe via BigInt). */
export function wholeSupplyToAtomsLoHi(
  whole: string | number,
  decimals: number,
): { lo: string; hi: string } {
  const wholeStr = String(whole).trim();
  if (!/^\d+(\.\d+)?$/.test(wholeStr)) {
    throw new Error('initial supply must be a non-negative number');
  }
  const [intPart, fracPart = ''] = wholeStr.split('.');
  if (fracPart.length > decimals) {
    throw new Error(`initial supply has more than ${decimals} decimal places`);
  }
  const fracPadded = fracPart.padEnd(decimals, '0');
  const atoms = BigInt(intPart + fracPadded);
  const mask = (1n << 64n) - 1n;
  const lo = atoms & mask;
  const hi = atoms >> 64n;
  return { lo: lo.toString(), hi: hi.toString() };
}

class AssetService {
  async listAssets(): Promise<SovereignAssetListItem[]> {
    const data = await publicQuicRequest<{
      assets?: SovereignAssetListItem[];
      count?: number;
    }>('/api/v1/assets');
    return data.assets || [];
  }

  async getAsset(assetId: string): Promise<SovereignAssetDetail> {
    const id = assetId.replace(/^0x/i, '');
    return publicQuicRequest<SovereignAssetDetail>(`/api/v1/assets/${id}`);
  }

  async getAssetInterface(
    assetId: string,
  ): Promise<{ asset_id: string; interface?: Record<string, unknown> }> {
    const id = assetId.replace(/^0x/i, '');
    return publicQuicRequest(`/api/v1/assets/${id}/interface`);
  }

  async checkSymbolAvailable(symbol: string): Promise<boolean> {
    const sym = symbol.trim().toUpperCase();
    const data = await publicQuicRequest<{
      symbol?: string;
      available?: boolean;
    }>(`/api/v1/assets/symbol/available/${encodeURIComponent(sym)}`);
    return Boolean(data.available);
  }

  async getBalancesForAddress(address: string): Promise<
    Array<{
      asset_id?: string;
      token_id?: string;
      name?: string;
      symbol?: string;
      balance?: string | number;
      decimals?: number;
      total_supply?: string | number;
    }>
  > {
    const addr = address.startsWith('did:zhtp:')
      ? address.substring('did:zhtp:'.length)
      : address;
    try {
      const data = await quicRequest<{
        balances?: Array<Record<string, unknown>>;
      }>(`/api/v1/assets/balances/${addr}`);
      return (data.balances || []) as Array<{
        asset_id?: string;
        token_id?: string;
        name?: string;
        symbol?: string;
        balance?: string | number;
        decimals?: number;
        total_supply?: string | number;
      }>;
    } catch {
      // Soft-fallback during SA-8 dual path
      const data = await quicRequest<{
        balances?: Array<Record<string, unknown>>;
      }>(`/api/v1/token/balances/${addr}`);
      return (data.balances || []) as Array<{
        asset_id?: string;
        token_id?: string;
        name?: string;
        symbol?: string;
        balance?: string | number;
        decimals?: number;
        total_supply?: string | number;
      }>;
    }
  }

  /**
   * Real on-chain DAO launch: sign AssetLaunch + POST /api/v1/assets/launch.
   */
  async launchAsset(request: AssetLaunchRequest): Promise<AssetLaunchResponse> {
    const decimals = request.decimals ?? 18;
    const symbol = request.symbol.trim().toUpperCase();
    const name = request.name.trim();
    const treasuryKeyIdHex = (
      request.treasuryKeyIdHex || DEFAULT_DAO_TREASURY_KEY_ID_HEX
    )
      .trim()
      .replace(/^0x/i, '');
    const chainId = request.chainId ?? 2;
    const daoClass = request.daoClass ?? 0;
    const burnBps = request.burnBps ?? 0;

    if (!/^[A-Z]+$/.test(symbol) || symbol.length < 1 || symbol.length > 6) {
      throw new Error('Symbol must be A–Z only, length 1–6 (DAO launch UI constraints)');
    }
    const wholeNum = Number(request.initialSupplyWhole);
    if (!Number.isFinite(wholeNum) || wholeNum < 1000) {
      throw new Error('Initial supply must be at least 1000 whole units');
    }

    try {
      const feeConfig = await publicQuicRequest<Record<string, unknown>>(
        '/api/v1/blockchain/fee-config',
      );
      await nativeIdentityProvisioning.setFeeConfig(JSON.stringify(feeConfig));
    } catch (err) {
      console.warn('[AssetService] Fee config refresh failed:', err);
    }

    const { lo, hi } = wholeSupplyToAtomsLoHi(request.initialSupplyWhole, decimals);

    const signingResult = await nativeIdentityProvisioning.signAssetLaunchTransaction({
      name,
      symbol,
      initialSupplyAtomsLo: lo,
      initialSupplyAtomsHi: hi,
      decimals,
      treasuryKeyIdHex,
      daoClass,
      burnBps,
      chainId,
    });

    const data = await quicRequest<AssetLaunchResponse>('/api/v1/assets/launch', {
      method: 'POST',
      body: JSON.stringify({
        signed_tx: signingResult.signed_tx,
        enforce_dao_launch_constraints:
          request.enforceDaoLaunchConstraints !== false,
      }),
    });

    if (!data.asset_id && data.token_id) {
      data.asset_id = data.token_id;
    }
    data.token_id = data.asset_id;
    return data;
  }
}

const assetServiceInstance = new AssetService();
export default assetServiceInstance;
export { AssetService };
