/**
 * SovSwap data types — ported 1:1 from /Sov-Swap-Dapp/types/index.ts.
 *
 * The mobile experience is a pixel-different skin over the same
 * domain model so swap math, allocation arithmetic and chart series
 * line up. When the web Dapp evolves these shapes, mirror it here
 * before adapting screens.
 */

export type SovOrgType = 'for-profit' | 'non-profit' | 'universal';

export interface SovDao {
  id: number;
  name: string;
  type: SovOrgType;
  tokenName: string;
  tokenSymbol: string;
  description: string;
  /** Quoted in $SOV. */
  price: number;
  /** 24h change in percent — positive or negative. */
  priceChange: number;
  supply: number;
  daoAllocation: number;
  treasuryAllocation: number;
  /** 24h volume in $SOV. */
  volume: number;
  createdAt?: Date;
}

export interface SovUserBalance {
  [tokenSymbol: string]: number;
}

export interface SovChartSeries {
  labels: string[];
  data: number[];
}

export interface SovSwapParams {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
}
