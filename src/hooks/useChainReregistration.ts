/**
 * useChainReregistration Hook
 *
 * Detects chain changes on node connect and transparently re-registers
 * the existing on-device identity. The user sees nothing except a brief
 * "Syncing your account..." status during the 2-5 second re-registration.
 *
 * Detection logic (runs on every connect + foreground resume):
 *   1. Fetch GET /api/v1/chain/info from node
 *   2. Load LocalChainBinding from storage
 *   3. Compare chain_id (exact numeric match)
 *      a. Match  -> no action
 *      b. No stored binding -> first time, save binding (no re-reg needed)
 *      c. Mismatch -> trigger re-registration
 *
 * Re-registration uses the EXISTING keypair on device. No new keys generated.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchChainInfo } from '../services/ChainInfoService';
import { ChainBindingStorage } from '../services/ChainBindingStorage';
import RealAuthService from '../services/RealAuthService';
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import type { Identity } from '../types/identity';

export type ChainReregStatus =
  | 'idle'
  | 'checking'
  | 'syncing'
  | 'done'
  | 'error';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export interface UseChainReregistrationReturn {
  status: ChainReregStatus;
  errorMessage: string | null;
  retry: () => void;
}

export function useChainReregistration(
  isConnected: boolean,
  currentIdentity: Identity | null,
  onIdentityUpdated?: (identity: Identity) => void,
): UseChainReregistrationReturn {
  const [status, setStatus] = useState<ChainReregStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const runningRef = useRef(false);
  const retryCountRef = useRef(0);

  const checkAndReregister = useCallback(async () => {
    if (runningRef.current) return;
    if (!isConnected || !currentIdentity?.identityId) return;

    runningRef.current = true;
    setStatus('checking');
    setErrorMessage(null);

    try {
      // 1. Fetch chain info from node
      const chainInfo = await fetchChainInfo();

      // 2. Load stored binding
      const binding = await ChainBindingStorage.get();

      // 3a. No stored binding — first launch with an existing identity
      //     (registered before chain binding was implemented).
      //     Save current chain as the baseline. No re-registration needed.
      if (!binding) {
        await ChainBindingStorage.set({
          chainId: chainInfo.chain_id,
          registeredHeight: chainInfo.height,
          identityId: currentIdentity.identityId,
          primaryWalletId: '',
          ubiWalletId: '',
          savingsWalletId: '',
        });
        setStatus('done');
        return;
      }

      // 3b. Chain matches — normal flow
      if (binding.chainId === chainInfo.chain_id) {
        setStatus('done');
        return;
      }

      // 3c. Chain mismatch — re-register
      console.log(
        `[ChainRereg] Chain changed: ${binding.chainId} -> ${chainInfo.chain_id}. Re-registering...`,
      );
      setStatus('syncing');

      const newBinding = await RealAuthService.reRegisterExistingIdentity(
        currentIdentity,
        chainInfo.chain_id,
        chainInfo.height,
      );

      // Update app-layer identity if identityId changed
      if (newBinding.identityId !== currentIdentity.identityId) {
        const updatedIdentity: Identity = {
          ...currentIdentity,
          identityId: newBinding.identityId,
        };
        await SecureIdentityStorage.setIdentity(updatedIdentity, { requireBiometric: false });
        onIdentityUpdated?.(updatedIdentity);
      }

      retryCountRef.current = 0;
      setStatus('done');
      console.log('[ChainRereg] Re-registration complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChainRereg] Failed:', msg);

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCountRef.current] || 4000;
        retryCountRef.current += 1;
        console.log(`[ChainRereg] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
        setStatus('syncing');
        setTimeout(() => {
          runningRef.current = false;
          checkAndReregister();
        }, delay);
        return;
      }

      setErrorMessage(msg);
      setStatus('error');
    } finally {
      runningRef.current = false;
    }
  }, [isConnected, currentIdentity, onIdentityUpdated]);

  // Run on connect + identity available
  useEffect(() => {
    if (isConnected && currentIdentity?.identityId) {
      checkAndReregister();
    }
  }, [isConnected, currentIdentity?.identityId, checkAndReregister]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    runningRef.current = false;
    checkAndReregister();
  }, [checkAndReregister]);

  return { status, errorMessage, retry };
}

export default useChainReregistration;
