/**
 * DAO stakes hook — mock implementation
 *
 * Mirrors the shape of `GET /api/v1/dao/stakes/{staker_key_id_hex}`:
 *   {
 *     staker, current_height, total_staked,
 *     stakes: [{ sector, sector_dao_key_id, amount,
 *                staked_at_height, locked_until, unlocked, blocks_remaining }]
 *   }
 *
 * Swap the mock body for a `quicRequest(...)` call once the endpoint is wired.
 */
import { useMemo } from 'react';
import { WELFARE_DAOS } from '../constants';

export interface DaoStake {
  sector: string;
  sector_dao_key_id: string;
  amount: number; // nSOV atoms
  staked_at_height: number;
  locked_until: number;
  unlocked: boolean;
  blocks_remaining: number;
}

export interface DaoStakesResponse {
  staker: string;
  current_height: number;
  stakes: DaoStake[];
  total_staked: number;
}

const BLOCKS_PER_DAY = 7_200;

// Mock dataset — starts empty so dev/demo begins from a clean slate.
// Amounts are in nSOV (1 SOV = 1e9 nSOV).
const MOCK_CURRENT_HEIGHT = 23_105;

const MOCK_STAKES: DaoStake[] = [];

export const useDaoStakes = (
  _stakerKeyId?: string | null,
): DaoStakesResponse => {
  return useMemo(
    () => ({
      staker: _stakerKeyId ?? '',
      current_height: MOCK_CURRENT_HEIGHT,
      stakes: MOCK_STAKES,
      total_staked: MOCK_STAKES.reduce((sum, s) => sum + s.amount, 0),
    }),
    [_stakerKeyId],
  );
};
