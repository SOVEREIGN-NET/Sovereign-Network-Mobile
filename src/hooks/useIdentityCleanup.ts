/**
 * useIdentityCleanup Hook
 * Provides identity cleanup utilities for debugging and testing
 */

import { useCallback, useState } from 'react';
import IdentityCleanup from '../services/IdentityCleanup';

export const useIdentityCleanup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const cleanAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await IdentityCleanup.cleanAllIdentities();
      setLastAction('All identities cleaned');
      console.log('✅ All identities cleaned');
    } catch (err: any) {
      const message = err.message || 'Failed to clean identities';
      setError(message);
      console.error('❌ Cleanup failed:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cleanSpecific = useCallback(async (identityId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await IdentityCleanup.cleanSpecificIdentity(identityId);
      setLastAction(`Identity ${identityId.substring(0, 8)}... cleaned`);
      console.log(`✅ Identity ${identityId} cleaned`);
    } catch (err: any) {
      const message = err.message || 'Failed to clean identity';
      setError(message);
      console.error('❌ Cleanup failed:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatus = useCallback(async () => {
    try {
      return await IdentityCleanup.getCleanupStatus();
    } catch (err) {
      console.error('❌ Failed to get cleanup status:', err);
      return null;
    }
  }, []);

  return {
    cleanAll,
    cleanSpecific,
    getStatus,
    isLoading,
    error,
    lastAction,
    clearError: () => setError(null),
  };
};

export default useIdentityCleanup;
