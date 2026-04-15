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

// Mock dataset — exercises every welfare DAO plus a mix of locked / unlocked,
// short / long durations. Amounts are in nSOV (1 SOV = 1e9 nSOV).
const MOCK_CURRENT_HEIGHT = 23_105;

const MOCK_STAKES: DaoStake[] = [
  {
    sector: 'health',
    sector_dao_key_id: WELFARE_DAOS[1].wallet,
    amount: 5_000_000_000, // 5 SOV
    staked_at_height: 23_000,
    locked_until: 23_000 + 30 * BLOCKS_PER_DAY,
    unlocked: false,
    blocks_remaining: 23_000 + 30 * BLOCKS_PER_DAY - MOCK_CURRENT_HEIGHT,
  },
  {
    sector: 'education',
    sector_dao_key_id: WELFARE_DAOS[2].wallet,
    amount: 25_000_000_000, // 25 SOV
    staked_at_height: 12_500,
    locked_until: 12_500 + 90 * BLOCKS_PER_DAY,
    unlocked: false,
    blocks_remaining: 12_500 + 90 * BLOCKS_PER_DAY - MOCK_CURRENT_HEIGHT,
  },
  {
    sector: 'food',
    sector_dao_key_id: WELFARE_DAOS[0].wallet,
    amount: 100_000_000_000, // 100 SOV
    staked_at_height: 1_200,
    locked_until: 1_200 + 30 * BLOCKS_PER_DAY,
    unlocked: true,
    blocks_remaining: 0,
  },
];

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
