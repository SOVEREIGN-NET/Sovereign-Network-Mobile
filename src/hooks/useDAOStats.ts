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
  members: { start: 12, target: 847, increment: 3 },
  activeProposals: { start: 1, target: 5, increment: 1 },
  totalProposals: { start: 4, target: 23, increment: 1 },
  treasury: { start: 1250, target: 45720, increment: 150 },
};

const UPDATE_INTERVAL = 5000; // Update every 5 seconds

/**
 * Simulates slowly growing DAO statistics
 */
export const useDAOStats = (): DAOStatsData => {
  const [stats, setStats] = useState<DAOStatsData>({
    members: STATS_CONFIG.members.start,
    activeProposals: STATS_CONFIG.activeProposals.start,
    totalProposals: STATS_CONFIG.totalProposals.start,
    treasury: STATS_CONFIG.treasury.start,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => {
        const newStats = { ...prev };

        // Update each stat with some randomness
        (Object.keys(STATS_CONFIG) as Array<keyof DAOStatsData>).forEach((key) => {
          const config = STATS_CONFIG[key];
          if (prev[key] < config.target) {
            const randomFactor = 0.5 + Math.random();
            const increment = Math.ceil(config.increment * randomFactor);
            newStats[key] = Math.min(prev[key] + increment, config.target);
          }
        });

        return newStats;
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return stats;
};

export const formatTreasury = (value: number): string => {
  return `${value.toLocaleString()} SOV`;
};
