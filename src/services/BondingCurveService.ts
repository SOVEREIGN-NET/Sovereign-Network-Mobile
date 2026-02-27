/**
 * Bonding Curve Token Service
 * API client for deploying, trading, and managing tokens with bonding curve pricing
 */

import { quicRequest, publicQuicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import type {
  CurveDeployRequest,
  CurveDeployResponse,
  CurveBuyRequest,
  CurveBuyResponse,
  CurveSellRequest,
  CurveSellResponse,
  CurveListResponse,
  CurveListByPhaseResponse,
  TokenInfoResponse,
  TokenStatsResponse,
  TokenPriceResponse,
  GraduationEligibilityResponse,
  ReadyToGraduateResponse,
  SwapRequest,
  SwapResponse,
  AddLiquidityRequest,
  AddLiquidityResponse,
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  PoolInfoResponse,
  TokenValuationResponse,
  PriceQueryResponse,
  BatchValuationRequest,
  BatchValuationResponse,
  TokenPhase,
  LinearCurveParams,
  ExponentialCurveParams,
  SigmoidCurveParams,
} from '../types/bondingCurve';

class BondingCurveService {
  async deployToken(request: CurveDeployRequest): Promise<CurveDeployResponse> {
    console.log('[BondingCurveService] Deploying token:', request.name);

    const curve = request.curve_type as
      | LinearCurveParams
      | ExponentialCurveParams
      | SigmoidCurveParams;
    const threshold = request.threshold;

    const signingResult =
      await nativeIdentityProvisioning.signBondingCurveDeployTransaction({
        name: request.name,
        symbol: request.symbol,
        curveType: curve.type,
        basePrice:
          curve.type === 'linear' || curve.type === 'exponential'
            ? String(curve.base_price)
            : null,
        slope: curve.type === 'linear' ? String(curve.slope) : null,
        growthRateBps:
          curve.type === 'exponential' ? String(curve.growth_rate_bps) : null,
        maxPrice: curve.type === 'sigmoid' ? String(curve.max_price) : null,
        midpointSupply:
          curve.type === 'sigmoid' ? String(curve.midpoint_supply) : null,
        steepness: curve.type === 'sigmoid' ? String(curve.steepness) : null,
        thresholdType: threshold.type,
        minReserve:
          'min_reserve' in threshold ? String(threshold.min_reserve) : null,
        minSupply:
          'min_supply' in threshold ? String(threshold.min_supply) : null,
        minTimeSeconds:
          'min_time_seconds' in threshold
            ? String(threshold.min_time_seconds)
            : null,
        sellEnabled: request.sell_enabled,
      });
    console.log(
      '[BondingCurveService] Deploy transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<CurveDeployResponse>(
      '/api/v1/curve/deploy',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log('[BondingCurveService] Token deployed:', data.token_id);
    return data;
  }

  async buyTokens(request: CurveBuyRequest): Promise<CurveBuyResponse> {
    console.log('[BondingCurveService] Buying tokens:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signBondingCurveBuyTransaction({
        tokenId: request.token_id,
        stableAmount: String(request.stable_amount),
      });
    console.log(
      '[BondingCurveService] Buy transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<CurveBuyResponse>('/api/v1/curve/buy', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log('[BondingCurveService] Tokens bought:', data.tokens_received);
    return data;
  }

  async sellTokens(request: CurveSellRequest): Promise<CurveSellResponse> {
    console.log('[BondingCurveService] Selling tokens:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signBondingCurveSellTransaction({
        tokenId: request.token_id,
        tokenAmount: String(request.token_amount),
      });
    console.log(
      '[BondingCurveService] Sell transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<CurveSellResponse>('/api/v1/curve/sell', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log('[BondingCurveService] Tokens sold:', data.tokens_sold);
    return data;
  }

  async listTokens(): Promise<CurveListResponse> {
    console.log('[BondingCurveService] Listing all tokens');
    const data = await publicQuicRequest<CurveListResponse>(
      '/api/v1/curve/list',
      {
        method: 'GET',
      },
    );
    console.log('[BondingCurveService] Found', data.total_count, 'tokens');
    return data;
  }

  async listTokensByPhase(
    phase: TokenPhase,
  ): Promise<CurveListByPhaseResponse> {
    console.log('[BondingCurveService] Listing tokens by phase:', phase);
    const data = await publicQuicRequest<CurveListByPhaseResponse>(
      `/api/v1/curve/list/${phase}`,
      {
        method: 'GET',
      },
    );
    console.log(
      '[BondingCurveService] Found',
      data.count,
      'tokens in phase:',
      phase,
    );
    return data;
  }

  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse> {
    console.log('[BondingCurveService] Getting token info:', tokenId);
    const data = await publicQuicRequest<TokenInfoResponse>(
      `/api/v1/curve/${tokenId}`,
      {
        method: 'GET',
      },
    );
    console.log('[BondingCurveService] Token info retrieved:', data.name);
    return data;
  }

  async getTokenStats(tokenId: string): Promise<TokenStatsResponse> {
    console.log('[BondingCurveService] Getting token stats:', tokenId);
    const data = await publicQuicRequest<TokenStatsResponse>(
      `/api/v1/curve/${tokenId}/stats`,
      {
        method: 'GET',
      },
    );
    console.log(
      '[BondingCurveService] Token stats retrieved:',
      data.total_trades,
      'trades',
    );
    return data;
  }

  async getTokenPrice(tokenId: string): Promise<TokenPriceResponse> {
    console.log('[BondingCurveService] Getting token price:', tokenId);
    const data = await publicQuicRequest<TokenPriceResponse>(
      `/api/v1/curve/${tokenId}/price`,
      {
        method: 'GET',
      },
    );
    console.log('[BondingCurveService] Token price:', data.price_usd_cents);
    return data;
  }

  async canGraduate(tokenId: string): Promise<GraduationEligibilityResponse> {
    console.log(
      '[BondingCurveService] Checking graduation eligibility:',
      tokenId,
    );
    const data = await publicQuicRequest<GraduationEligibilityResponse>(
      `/api/v1/curve/${tokenId}/can-graduate`,
      { method: 'GET' },
    );
    console.log('[BondingCurveService] Can graduate:', data.can_graduate);
    return data;
  }

  async getReadyToGraduate(): Promise<ReadyToGraduateResponse> {
    console.log('[BondingCurveService] Getting ready-to-graduate tokens');
    const data = await publicQuicRequest<ReadyToGraduateResponse>(
      '/api/v1/curve/ready-to-graduate',
      {
        method: 'GET',
      },
    );
    console.log(
      '[BondingCurveService] Found',
      data.count,
      'ready-to-graduate tokens',
    );
    return data;
  }

  async executeSwap(request: SwapRequest): Promise<SwapResponse> {
    console.log('[BondingCurveService] Executing swap:', request.token_id);
    const signingResult = await nativeIdentityProvisioning.signSwapTransaction({
      tokenId: request.token_id,
      poolId: request.pool_id,
      amountIn: String(request.amount_in),
      minAmountOut: String(request.min_amount_out),
      tokenToSov: request.token_to_sov,
    });
    console.log(
      '[BondingCurveService] Swap transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<SwapResponse>('/api/v1/swap', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log(
      '[BondingCurveService] Swap executed, amount out:',
      data.amount_out,
    );
    return data;
  }

  async addLiquidity(
    request: AddLiquidityRequest,
  ): Promise<AddLiquidityResponse> {
    console.log('[BondingCurveService] Adding liquidity:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signAddLiquidityTransaction({
        tokenId: request.token_id,
        poolId: request.pool_id,
        tokenAmount: String(request.token_amount),
        sovAmount: String(request.sov_amount),
      });
    console.log(
      '[BondingCurveService] Add liquidity transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<AddLiquidityResponse>(
      '/api/v1/swap/liquidity/add',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log(
      '[BondingCurveService] Liquidity added, LP tokens:',
      data.lp_tokens_minted,
    );
    return data;
  }

  async removeLiquidity(
    request: RemoveLiquidityRequest,
  ): Promise<RemoveLiquidityResponse> {
    console.log('[BondingCurveService] Removing liquidity:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signRemoveLiquidityTransaction({
        tokenId: request.token_id,
        poolId: request.pool_id,
        lpAmount: String(request.lp_amount),
      });
    console.log(
      '[BondingCurveService] Remove liquidity transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<RemoveLiquidityResponse>(
      '/api/v1/swap/liquidity/remove',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log(
      '[BondingCurveService] Liquidity removed, LP burned:',
      data.lp_tokens_burned,
    );
    return data;
  }

  async getPoolInfo(tokenId: string): Promise<PoolInfoResponse> {
    console.log('[BondingCurveService] Getting pool info:', tokenId);
    const data = await publicQuicRequest<PoolInfoResponse>(
      `/api/v1/swap/pools/${tokenId}`,
      {
        method: 'GET',
      },
    );
    console.log('[BondingCurveService] Pool exists:', data.exists);
    return data;
  }

  async getTokenValuation(tokenId: string): Promise<TokenValuationResponse> {
    console.log('[BondingCurveService] Getting token valuation:', tokenId);
    const data = await publicQuicRequest<TokenValuationResponse>(
      `/api/v1/valuation/${tokenId}`,
      {
        method: 'GET',
      },
    );
    console.log(
      '[BondingCurveService] Valuation:',
      data.price_usd_cents,
      'cents',
    );
    return data;
  }

  async getTokenPriceSimple(
    tokenId: string,
    priceType: 'spot' | 'twap' = 'twap',
  ): Promise<PriceQueryResponse> {
    console.log('[BondingCurveService] Getting simple price:', tokenId);
    const data = await publicQuicRequest<PriceQueryResponse>(
      `/api/v1/price/${tokenId}?price_type=${priceType}`,
      { method: 'GET' },
    );
    console.log('[BondingCurveService] Price:', data.price);
    return data;
  }

  async getBatchValuation(
    request: BatchValuationRequest,
  ): Promise<BatchValuationResponse> {
    console.log(
      '[BondingCurveService] Getting batch valuation for',
      request.token_ids.length,
      'tokens',
    );
    const data = await publicQuicRequest<BatchValuationResponse>(
      '/api/v1/valuation/batch',
      { method: 'POST', body: JSON.stringify(request) },
    );
    console.log('[BondingCurveService] Batch valuation retrieved');
    return data;
  }
}

export default new BondingCurveService();
