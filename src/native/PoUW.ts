/**
 * PoUW React Native Bridge
 * Phase 4: React Native Bridge for Proof-of-Useful-Work
 *
 * STRICT BOUNDARY ENFORCEMENT:
 * - RN never passes URLs
 * - RN never sees keys
 * - RN never sees receipts or signatures
 * - RN never serializes protobuf
 * - RN never performs cryptography
 *
 * RN is a button + lifecycle trigger, nothing more.
 */

import { NativeModules, Platform } from 'react-native';

/**
 * Native module interface (internal - uses base64 strings for byte arrays)
 */
interface PoUWNativeModule {
  verifyContent(
    contentId: string,
    bytes: string,
    providerId?: string,
  ): Promise<void>;
  flush(): Promise<void>;
  getPendingCount(): Promise<number>;
  setNodeUrl(nodeUrl: string): Promise<string>;
  getChallenge(
    cap: string | null,
    maxBytes: number,
    maxReceipts: number,
  ): Promise<{
    token: string;
    expires_at: number;
  }>;
}

/**
 * Public PoUW interface exposed to React Native
 * All byte arrays are Uint8Array (base64-encoded at the boundary)
 */
export interface PoUWInterface {
  /**
   * Verify content integrity and create a receipt
   * @param contentId - The content identifier (CID digest)
   * @param bytes - The content bytes to verify
   * @param providerId - Optional provider that served the content
   */
  verifyContent(
    contentId: Uint8Array,
    bytes: Uint8Array,
    providerId?: Uint8Array,
  ): Promise<void>;

  /**
   * Flush pending receipts to the server
   */
  flush(): Promise<void>;

  /**
   * Get count of pending receipts waiting to be submitted
   */
  getPendingCount(): Promise<number>;

  /**
   * Set the node URL for PoUW operations
   */
  setNodeUrl(nodeUrl: string): Promise<string>;

  /**
   * Get a challenge token from the node
   */
  getChallenge(
    cap?: string,
    maxBytes?: number,
    maxReceipts?: number,
  ): Promise<{
    token: string;
    expires_at: number;
  }>;
}

// Access the native module
const PoUWNative: PoUWNativeModule = NativeModules.PoUW;

/**
 * Convert Uint8Array to base64 string
 */
function toBase64(bytes: Uint8Array): string {
  // Use Buffer in Node.js environments, btoa in browser/React Native
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  // Fallback for environments without Buffer
  const binary = bytes.reduce(
    (acc, byte) => acc + String.fromCharCode(byte),
    '',
  );
  return btoa(binary);
}

/**
 * PoUW API - strictly bounded interface for React Native
 *
 * Usage:
 * ```typescript
 * import { PoUW } from './native/PoUW';
 *
 * // Verify content
 * await PoUW.verifyContent(contentId, bytes, providerId);
 *
 * // Check pending count
 * const count = await PoUW.getPendingCount();
 *
 * // Flush receipts
 * await PoUW.flush();
 * ```
 */
export const PoUW: PoUWInterface = {
  /**
   * Verify content integrity and create a receipt
   *
   * All byte arrays are automatically converted to base64 for native transmission.
   * The native layer handles all cryptography, verification, and storage.
   */
  verifyContent(
    contentId: Uint8Array,
    bytes: Uint8Array,
    providerId?: Uint8Array,
  ): Promise<void> {
    if (!PoUWNative) {
      return Promise.reject(new Error('PoUW native module not available'));
    }

    // Validate inputs
    if (!contentId || contentId.length === 0) {
      return Promise.reject(new Error('contentId is required'));
    }
    if (!bytes || bytes.length === 0) {
      return Promise.reject(new Error('bytes is required'));
    }

    // Convert Uint8Array to base64 for native bridge
    const contentIdB64 = toBase64(contentId);
    const bytesB64 = toBase64(bytes);
    const providerIdB64 = providerId ? toBase64(providerId) : undefined;

    return PoUWNative.verifyContent(contentIdB64, bytesB64, providerIdB64);
  },

  /**
   * Flush pending receipts to the server
   *
   * This submits all queued receipts to the network node.
   * Call this periodically (e.g., on app background) or when
   * the pending count exceeds a threshold.
   */
  flush(): Promise<void> {
    if (!PoUWNative) {
      return Promise.reject(new Error('PoUW native module not available'));
    }

    return PoUWNative.flush();
  },

  /**
   * Get the count of pending receipts
   *
   * Returns the number of receipts waiting to be submitted.
   * Use this to show UI indicators or trigger automatic flushing.
   */
  getPendingCount(): Promise<number> {
    if (!PoUWNative) {
      return Promise.reject(new Error('PoUW native module not available'));
    }

    return PoUWNative.getPendingCount();
  },

  /**
   * Set the node URL for PoUW operations
   */
  setNodeUrl(nodeUrl: string): Promise<string> {
    if (!PoUWNative) {
      return Promise.reject(new Error('PoUW native module not available'));
    }

    return PoUWNative.setNodeUrl(nodeUrl);
  },

  /**
   * Get a challenge token from the node
   */
  getChallenge(
    cap?: string,
    maxBytes?: number,
    maxReceipts?: number,
  ): Promise<{ token: string; expires_at: number }> {
    if (!PoUWNative) {
      return Promise.reject(new Error('PoUW native module not available'));
    }

    return PoUWNative.getChallenge(
      cap ?? null,
      maxBytes ?? 0,
      maxReceipts ?? 0,
    );
  },
};

/**
 * Check if PoUW native module is available
 */
export function isPoUWAvailable(): boolean {
  return !!PoUWNative;
}

export default PoUW;
