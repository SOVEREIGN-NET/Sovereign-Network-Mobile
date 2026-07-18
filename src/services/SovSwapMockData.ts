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

export const mockDAOs: SovDao[] = [];

export const welfareTokens: SovDao[] = [
  {
    id: 1,
    name: 'Food Hub',
    type: 'non-profit',
    tokenName: 'Food Token',
    tokenSymbol: 'FOOD',
    description: 'Community food security network. Funded via $SOV staking.',
    price: 1.0,
    priceChange: 0.0,
    supply: 1_000_000,
    daoAllocation: 0,
    treasuryAllocation: 1_000_000,
    volume: 50_000,
  },
  {
    id: 2,
    name: 'Health Hub',
    type: 'non-profit',
    tokenName: 'Health Token',
    tokenSymbol: 'HEAL',
    description: 'Decentralized healthcare access. Funded via $SOV staking.',
    price: 1.0,
    priceChange: 0.0,
    supply: 1_000_000,
    daoAllocation: 0,
    treasuryAllocation: 1_000_000,
    volume: 50_000,
  },
  {
    id: 3,
    name: 'Education Hub',
    type: 'non-profit',
    tokenName: 'Education Token',
    tokenSymbol: 'EDU',
    description: 'Open learning resources. Funded via $SOV staking.',
    price: 1.0,
    priceChange: 0.0,
    supply: 1_000_000,
    daoAllocation: 0,
    treasuryAllocation: 1_000_000,
    volume: 50_000,
  },
  {
    id: 4,
    name: 'Housing Hub',
    type: 'non-profit',
    tokenName: 'Housing Token',
    tokenSymbol: 'HOME',
    description: 'Affordable housing collective. Funded via $SOV staking.',
    price: 1.0,
    priceChange: 0.0,
    supply: 1_000_000,
    daoAllocation: 0,
    treasuryAllocation: 1_000_000,
    volume: 50_000,
  },
  {
    id: 5,
    name: 'Energy Hub',
    type: 'non-profit',
    tokenName: 'Energy Token',
    tokenSymbol: 'ENRG',
    description: 'Renewable energy sharing. Funded via $SOV staking.',
    price: 1.0,
    priceChange: 0.0,
    supply: 1_000_000,
    daoAllocation: 0,
    treasuryAllocation: 1_000_000,
    volume: 50_000,
  },
];

export const initialBalances: Record<string, number> = {
  SOV: 10_000,
  FOOD: 0,
  HEAL: 0,
  EDU: 0,
  HOME: 0,
  ENRG: 0,
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

/** Combined picker list: universal SOV first, then welfare tokens, then any custom DAOs. */
export const allSovTokens: SovDao[] = [sovToken, ...welfareTokens, ...mockDAOs];

export function findToken(symbol: string): SovDao | undefined {
  return allSovTokens.find(t => t.tokenSymbol === symbol);
}

export function findDao(id: number): SovDao | undefined {
  return [...welfareTokens, ...mockDAOs].find(d => d.id === id);
}
