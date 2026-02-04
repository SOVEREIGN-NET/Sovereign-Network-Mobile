/**
 * useTokenOperations Hook
 * Provides easy access to token creation, minting, transferring via QUIC
 */

import { useState, useCallback } from 'react';
import tokenService from '../services/TokenService';
import {
  TokenCreateRequest,
  TokenCreateResponse,
  TokenMintRequest,
  TokenMintResponse,
  TokenTransferRequest,
  TokenTransferResponse,
  TokenBurnRequest,
  TokenBurnResponse,
  TokenInfoResponse,
  TokenBalanceResponse,
  TokenListResponse,
} from '../types/token';

export interface TokenOperationState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseTokenOperationsReturn {
  createToken: (request: TokenCreateRequest) => Promise<TokenCreateResponse>;
  createTokenState: TokenOperationState<TokenCreateResponse>;

  mintToken: (request: TokenMintRequest) => Promise<TokenMintResponse>;
  mintTokenState: TokenOperationState<TokenMintResponse>;

  transferToken: (request: TokenTransferRequest) => Promise<TokenTransferResponse>;
  transferTokenState: TokenOperationState<TokenTransferResponse>;

  burnToken: (request: TokenBurnRequest) => Promise<TokenBurnResponse>;
  burnTokenState: TokenOperationState<TokenBurnResponse>;

  getTokenInfo: (tokenId: string) => Promise<TokenInfoResponse>;
  getTokenInfoState: TokenOperationState<TokenInfoResponse>;

  getTokenBalance: (tokenId: string, address: string) => Promise<TokenBalanceResponse>;
  getTokenBalanceState: TokenOperationState<TokenBalanceResponse>;

  getUserTokenBalances: (address: string) => Promise<TokenBalanceResponse[]>;
  getUserTokenBalancesState: TokenOperationState<TokenBalanceResponse[]>;

  listTokens: () => Promise<TokenListResponse>;
  listTokensState: TokenOperationState<TokenListResponse>;
}

export const useTokenOperations = (): UseTokenOperationsReturn => {
  // Create Token State
  const [createTokenState, setCreateTokenState] = useState<TokenOperationState<TokenCreateResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Mint Token State
  const [mintTokenState, setMintTokenState] = useState<TokenOperationState<TokenMintResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Transfer Token State
  const [transferTokenState, setTransferTokenState] = useState<TokenOperationState<TokenTransferResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Burn Token State
  const [burnTokenState, setBurnTokenState] = useState<TokenOperationState<TokenBurnResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Get Token Info State
  const [getTokenInfoState, setGetTokenInfoState] = useState<TokenOperationState<TokenInfoResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Get Token Balance State
  const [getTokenBalanceState, setGetTokenBalanceState] = useState<TokenOperationState<TokenBalanceResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Get User Token Balances State
  const [getUserTokenBalancesState, setGetUserTokenBalancesState] = useState<TokenOperationState<TokenBalanceResponse[]>>({
    data: null,
    loading: false,
    error: null,
  });

  // List Tokens State
  const [listTokensState, setListTokensState] = useState<TokenOperationState<TokenListResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // Create Token
  const createToken = useCallback(async (request: TokenCreateRequest): Promise<TokenCreateResponse> => {
    setCreateTokenState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.createToken(request);
      setCreateTokenState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setCreateTokenState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Mint Token
  const mintToken = useCallback(async (request: TokenMintRequest): Promise<TokenMintResponse> => {
    setMintTokenState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.mintToken(request);
      setMintTokenState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setMintTokenState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Transfer Token
  const transferToken = useCallback(async (request: TokenTransferRequest): Promise<TokenTransferResponse> => {
    setTransferTokenState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.transferToken(request);
      setTransferTokenState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setTransferTokenState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Burn Token
  const burnToken = useCallback(async (request: TokenBurnRequest): Promise<TokenBurnResponse> => {
    setBurnTokenState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.burnToken(request);
      setBurnTokenState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setBurnTokenState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Get Token Info
  const getTokenInfo = useCallback(async (tokenId: string): Promise<TokenInfoResponse> => {
    setGetTokenInfoState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.getTokenInfo(tokenId);
      setGetTokenInfoState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setGetTokenInfoState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Get Token Balance
  const getTokenBalance = useCallback(async (tokenId: string, address: string): Promise<TokenBalanceResponse> => {
    setGetTokenBalanceState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.getTokenBalance(tokenId, address);
      setGetTokenBalanceState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setGetTokenBalanceState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // Get User Token Balances
  const getUserTokenBalances = useCallback(async (address: string): Promise<TokenBalanceResponse[]> => {
    setGetUserTokenBalancesState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.getUserTokenBalances(address);
      setGetUserTokenBalancesState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setGetUserTokenBalancesState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  // List Tokens
  const listTokens = useCallback(async (): Promise<TokenListResponse> => {
    setListTokensState({ data: null, loading: true, error: null });
    try {
      const result = await tokenService.listTokens();
      setListTokensState({ data: result, loading: false, error: null });
      return result;
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      setListTokensState({ data: null, loading: false, error: err });
      throw err;
    }
  }, []);

  return {
    createToken,
    createTokenState,
    mintToken,
    mintTokenState,
    transferToken,
    transferTokenState,
    burnToken,
    burnTokenState,
    getTokenInfo,
    getTokenInfoState,
    getTokenBalance,
    getTokenBalanceState,
    getUserTokenBalances,
    getUserTokenBalancesState,
    listTokens,
    listTokensState,
  };
};
