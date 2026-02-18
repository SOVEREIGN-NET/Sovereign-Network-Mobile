/**
 * usePoUW React Hook
 * Phase 4: React Native Bridge for Proof-of-Useful-Work
 * 
 * A React hook that provides a clean interface to the PoUW native module.
 * 
 * STRICT BOUNDARY ENFORCEMENT:
 * - No URL handling
 * - No key exposure
 * - No receipt/signature visibility
 * - No protobuf serialization
 * - No cryptography
 * 
 * Usage:
 * ```typescript
 * function MyComponent() {
 *   const { verifyContent, flush, getPendingCount, isAvailable, error } = usePoUW();
 *   
 *   const handleVerify = async (contentId: Uint8Array, bytes: Uint8Array) => {
 *     try {
 *       await verifyContent(contentId, bytes);
 *       console.log('Content verified and receipt created');
 *     } catch (e) {
 *       console.error('Verification failed:', e);
 *     }
 *   };
 *   
 *   return (
 *     <View>
 *       <Button title="Verify" onPress={handleVerify} disabled={!isAvailable} />
 *       <Button title="Flush" onPress={flush} />
 *     </View>
 *   );
 * }
 * ```
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { PoUW, isPoUWAvailable } from '../native/PoUW';

export interface UsePoUWResult {
  /**
   * Verify content integrity and create a receipt
   * @param contentId - The content identifier (CID digest)
   * @param bytes - The content bytes
   * @param providerId - Optional provider identifier
   */
  verifyContent: (
    contentId: Uint8Array,
    bytes: Uint8Array,
    providerId?: Uint8Array
  ) => Promise<void>;
  
  /**
   * Flush pending receipts to the server
   */
  flush: () => Promise<void>;
  
  /**
   * Get count of pending receipts
   */
  getPendingCount: () => Promise<number>;
  
  /**
   * Whether PoUW native module is available
   */
  isAvailable: boolean;
  
  /**
   * Error if native module is not available
   */
  error: Error | null;
  
  /**
   * Whether an operation is in progress
   */
  isLoading: boolean;
}

/**
 * React hook for PoUW operations
 */
export function usePoUW(): UsePoUWResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Use ref to track mounted state
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    // Check availability on mount
    const available = isPoUWAvailable();
    setIsAvailable(available);
    
    if (!available) {
      setError(new Error('PoUW native module is not available'));
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  /**
   * Verify content with loading state management
   */
  const verifyContent = useCallback(async (
    contentId: Uint8Array,
    bytes: Uint8Array,
    providerId?: Uint8Array
  ): Promise<void> => {
    if (!isPoUWAvailable()) {
      throw new Error('PoUW native module is not available');
    }
    
    setIsLoading(true);
    try {
      await PoUW.verifyContent(contentId, bytes, providerId);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);
  
  /**
   * Flush with loading state management
   */
  const flush = useCallback(async (): Promise<void> => {
    if (!isPoUWAvailable()) {
      throw new Error('PoUW native module is not available');
    }
    
    setIsLoading(true);
    try {
      await PoUW.flush();
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);
  
  /**
   * Get pending count
   */
  const getPendingCount = useCallback(async (): Promise<number> => {
    if (!isPoUWAvailable()) {
      throw new Error('PoUW native module is not available');
    }
    
    return PoUW.getPendingCount();
  }, []);
  
  return {
    verifyContent,
    flush,
    getPendingCount,
    isAvailable,
    error,
    isLoading
  };
}

export default usePoUW;
