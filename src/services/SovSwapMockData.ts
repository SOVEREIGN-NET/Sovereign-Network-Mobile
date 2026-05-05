/**
 * SovSwap mock dataset — direct port of /Sov-Swap-Dapp/lib/data.ts.
 *
 * Six fixture DAOs (3 for-profit, 3 non-profit) plus the universal
 * $SOV token. The data drives the registry list, marketplace cards,
 * detail screens and the swap chart.
 */

import type { SovDao, SovOrgType, SovChartSeries } from '../types/sovSwap';

export const INITIAL_SUPPLY = 1_000_000;
export const FOR_PROFIT_DAO_ALLOCATION = 0.8;
export const FOR_PROFIT_TREASURY_ALLOCATION = 0.2;
export const NON_PROFIT_DAO_ALLOCATION = 0;
export const NON_PROFIT_TREASURY_ALLOCATION = 1;

export const sovToken: SovDao = {
  id: 0,
  name: 'Sovereign',
  type: 'universal',
  tokenName: 'Sovereign Token',
  tokenSymbol: 'SOV',
  description:
    'The universal stable currency of the Sovereign network. Can swap with all tokens.',
  price: 1.0,
  priceChange: 0.0,
  supply: 10_000_000,
  daoAllocation: 0,
  treasuryAllocation: 0,
  volume: 1_000_000,
};

export const mockDAOs: SovDao[] = [
  {
    id: 1,
    name: 'TechVentures DAO',
    type: 'for-profit',
    tokenName: 'TechVentures Token',
    tokenSymbol: 'TECH',
    description:
      'Empowering tech startups through decentralized funding and governance. We invest in innovative technology companies.',
    price: 12.5,
    priceChange: 5.2,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * FOR_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * FOR_PROFIT_TREASURY_ALLOCATION,
    volume: 125_000,
  },
  {
    id: 2,
    name: 'Green Earth Foundation',
    type: 'non-profit',
    tokenName: 'Green Earth Token',
    tokenSymbol: 'GRNE',
    description:
      'Fighting climate change through community-driven environmental projects. 100% funded via $SOV staking.',
    price: 8.75,
    priceChange: 2.1,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * NON_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * NON_PROFIT_TREASURY_ALLOCATION,
    volume: 87_500,
  },
  {
    id: 3,
    name: 'Crypto Ventures Inc',
    type: 'for-profit',
    tokenName: 'Crypto Ventures Token',
    tokenSymbol: 'CRYP',
    description:
      'Leading blockchain investment firm focused on DeFi and Web3 infrastructure projects.',
    price: 25.0,
    priceChange: -1.8,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * FOR_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * FOR_PROFIT_TREASURY_ALLOCATION,
    volume: 250_000,
  },
  {
    id: 4,
    name: 'Education For All',
    type: 'non-profit',
    tokenName: 'Education Token',
    tokenSymbol: 'EDU',
    description:
      'Providing free education resources to underserved communities worldwide. Powered by community staking.',
    price: 5.5,
    priceChange: 3.5,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * NON_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * NON_PROFIT_TREASURY_ALLOCATION,
    volume: 55_000,
  },
  {
    id: 5,
    name: 'HealthTech Solutions',
    type: 'for-profit',
    tokenName: 'HealthTech Token',
    tokenSymbol: 'HLTH',
    description:
      'Revolutionizing healthcare through blockchain technology and telemedicine platforms.',
    price: 18.25,
    priceChange: 7.3,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * FOR_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * FOR_PROFIT_TREASURY_ALLOCATION,
    volume: 182_500,
  },
  {
    id: 6,
    name: 'Open Source Coalition',
    type: 'non-profit',
    tokenName: 'Open Source Token',
    tokenSymbol: 'OPEN',
    description:
      'Supporting open source developers and projects that benefit the global community.',
    price: 4.0,
    priceChange: 1.2,
    supply: INITIAL_SUPPLY,
    daoAllocation: INITIAL_SUPPLY * NON_PROFIT_DAO_ALLOCATION,
    treasuryAllocation: INITIAL_SUPPLY * NON_PROFIT_TREASURY_ALLOCATION,
    volume: 40_000,
  },
];

export const initialBalances: Record<string, number> = {
  SOV: 10_000,
  TECH: 500,
  GRNE: 300,
  CRYP: 200,
  EDU: 400,
  HLTH: 150,
  OPEN: 250,
};

/**
 * Two tokens may swap when one is the universal $SOV token, or when
 * both are the same org type. A for-profit can never swap directly
 * with a non-profit — $SOV must be the bridge.
 */
export function canSwap(fromType: SovOrgType, toType: SovOrgType): boolean {
  if (fromType === 'universal' || toType === 'universal') return true;
  return fromType === toType;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toString();
}

/**
 * Synthesise a deterministic-feeling random walk for the price chart.
 * Mock-only — wire to oracle history when the API is available.
 */
export function generateChartData(
  basePrice: number,
  days: number = 30,
): SovChartSeries {
  const data: number[] = [];
  const labels: string[] = [];
  let price = basePrice;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    labels.push(
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    );
    price = price * (1 + (Math.random() - 0.5) * 0.1);
    data.push(parseFloat(price.toFixed(2)));
  }
  return { labels, data };
}

/** Combined picker list: universal SOV first, then DAOs. */
export const allSovTokens: SovDao[] = [sovToken, ...mockDAOs];

export function findToken(symbol: string): SovDao | undefined {
  return allSovTokens.find(t => t.tokenSymbol === symbol);
}

export function findDao(id: number): SovDao | undefined {
  return mockDAOs.find(d => d.id === id);
}
