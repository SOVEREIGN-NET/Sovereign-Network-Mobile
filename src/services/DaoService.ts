/**
 * DaoService — welfare DAO staking / unstaking.
 *
 * Flow for stake:
 *   1. Resolve SOV token_id from the token registry
 *   2. Fetch nonce for (SOV token_id, staker wallet) via TokenService
 *   3. Ask the native bridge to build + sign the DAO stake tx (returns hex)
 *   4. POST { signed_tx } to /api/v1/dao/stake
 *
 * Flow for queryStakes:
 *   GET /api/v1/dao/stakes/{staker_key_id_hex}
 */
import { WELFARE_DAOS, type WelfareDaoId } from '../constants';
import { resolveTokenBySymbol } from '../hooks/useTokenRegistry';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import { quicRequest } from './quic';
import tokenService from './TokenService';

const NSOV_PER_SOV = 1_000_000_000;

export interface DaoStakeTxResponse {
  status: string;
  tx_hash: string;
  staker: string;
  sector_dao_key_id: string;
  amount: number;
  lock_blocks: number;
  message?: string;
}

class DaoService {
  /**
   * Stake SOV into a welfare DAO.
   * @param daoId one of the WELFARE_DAOS ids (food, health, education, housing, energy)
   * @param amountSov human-readable SOV amount (e.g. 10 for 10 SOV)
   * @param lockBlocks lock duration in blocks (~12 s/block, 216_000 = 30 days)
   * @param stakerWalletId 32-byte hex key_id used as the SOV sender + nonce address
   */
  async stakeDao(
    daoId: WelfareDaoId,
    amountSov: number,
    lockBlocks: number,
    stakerWalletId: string,
  ): Promise<DaoStakeTxResponse> {
    console.log(
      '[DaoService] stakeDao called',
      { daoId, amountSov, lockBlocks, stakerWalletId },
    );

    const dao = WELFARE_DAOS.find(d => d.id === daoId);
    if (!dao) {
      throw new Error(`Unknown welfare DAO id: ${daoId}`);
    }

    if (!Number.isFinite(amountSov) || amountSov <= 0) {
      throw new Error('amountSov must be a positive number');
    }
    if (!Number.isFinite(lockBlocks) || lockBlocks <= 0) {
      throw new Error('lockBlocks must be > 0');
    }
    if (!stakerWalletId || stakerWalletId.length !== 64) {
      throw new Error('stakerWalletId must be a 64-char hex string (32 bytes)');
    }

    // 1. Resolve SOV token_id (needed only for the nonce lookup — the FFI
    //    itself doesn't take a token_id, DAO stake always moves SOV).
    const sovToken = await resolveTokenBySymbol('SOV');
    if (!sovToken?.token_id) {
      throw new Error('SOV token_id not available from registry');
    }

    // 2. Fresh nonce for (SOV, staker)
    const nonce = await tokenService.getTokenNonce(
      sovToken.token_id,
      stakerWalletId,
    );
    console.log('[DaoService] fresh nonce', nonce);

    // 3. Human SOV → nSOV atoms (u64)
    const amountNsov = Math.round(amountSov * NSOV_PER_SOV);
    if (amountNsov <= 0) {
      throw new Error('amountSov converts to zero nSOV');
    }

    // 4. Build + sign via native
    const signingResult =
      await nativeIdentityProvisioning.signDaoStakeTransaction({
        sectorDaoKeyId: dao.wallet,
        amount: amountNsov,
        nonce,
        lockBlocks,
      });
    console.log(
      '[DaoService] signed_tx length:',
      signingResult.signed_tx.length,
    );

    // 5. POST
    const data = await quicRequest<DaoStakeTxResponse>('/api/v1/dao/stake', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log('[DaoService] stake accepted:', data.tx_hash);
    return data;
  }
}

export default new DaoService();
