import { useEffect, useRef, useState } from 'react';

export interface DAOStatsData {
  members: number;
  activeProposals: number;
  totalProposals: number;
  treasury: number;
}

interface StatConfig {
  start: number;
  target: number;
  increment: number;
}

const STATS_CONFIG: Record<keyof DAOStatsData, StatConfig> = {
  members: { start: 0, target: 0, increment: 0 },
  activeProposals: { start: 5, target: 5, increment: 0 },
  totalProposals: { start: 5, target: 5, increment: 0 },
  treasury: { start: 0, target: 0, increment: 0 },
};

const UPDATE_INTERVAL = 10000;

/**
 * Provides static DAO statistics as requested.
 */
export const useDAOStats = (): DAOStatsData => {
  const [stats] = useState<DAOStatsData>({
    members: STATS_CONFIG.members.start,
    activeProposals: STATS_CONFIG.activeProposals.start,
    totalProposals: STATS_CONFIG.totalProposals.start,
    treasury: STATS_CONFIG.treasury.start,
  });

  // Empty effect to preserve hook order during development hot-reloads
  useEffect(() => {}, []);

  return stats;
};

export const formatTreasury = (value: number): string => {
  return `${value.toLocaleString()} SOV`;
};
