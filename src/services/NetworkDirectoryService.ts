/**
 * NetworkDirectoryService — validator directory over public QUIC.
 *
 * Endpoint (shipped on all validators as of 2026-04-21):
 *   GET /api/v1/network/directory    (public, no auth)
 *
 * Response:
 *   {
 *     validators: [
 *       { did, endpoint: "host:port", stake, healthy, spki_pin: "<64 hex>" },
 *       ...
 *     ],
 *     local_spki_pin?: "...",
 *     chain_height?: 28046
 *   }
 *
 * This call runs during app bootstrap, before `bootstrapReady` has resolved.
 * To avoid a deadlock (rawRequest gates on bootstrapReady), we go straight
 * to the native bridge instead of through `publicQuicRequest`.
 */

import { NativeModules } from 'react-native';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT, QUIC_CONFIG } from '../config';

const { NativeQuic } = NativeModules;
const DIRECTORY_PATH = '/api/v1/network/directory';

export interface DirectoryValidator {
  did: string;
  /** "host:port" string */
  endpoint: string;
  stake: number;
  healthy: boolean;
  /** SHA-256 of SubjectPublicKeyInfo, hex-encoded (64 chars) */
  spki_pin: string;
}

export interface NetworkDirectoryResponse {
  validators: DirectoryValidator[];
  local_spki_pin?: string;
  chain_height?: number;
}

function isValidValidator(v: unknown): v is DirectoryValidator {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.did === 'string' &&
    typeof o.endpoint === 'string' &&
    typeof o.spki_pin === 'string' &&
    typeof o.stake === 'number' &&
    typeof o.healthy === 'boolean'
  );
}

class NetworkDirectoryService {
  /**
   * Fetch the directory directly via the native bridge — bypasses the
   * `bootstrapReady` gate so the bootstrap itself doesn't deadlock.
   *
   * @param target optional `{ host, port }` to dial. If omitted, falls back
   * to the hardcoded `DEFAULT_NODE_HOST:DEFAULT_NODE_PORT`. Callers that
   * have DNS-resolved IPs should pass them explicitly so the very first
   * connect of the app is NOT to the hardcoded target.
   */
  async fetchDirectory(
    target?: { host: string; port: number },
  ): Promise<NetworkDirectoryResponse | null> {
    if (!NativeQuic?.request) {
      console.warn('[NetworkDirectory] native bridge unavailable');
      return null;
    }
    const host = target?.host ?? DEFAULT_NODE_HOST;
    const port = target?.port ?? DEFAULT_NODE_PORT;
    const url = `quic://${host}:${port}${DIRECTORY_PATH}`;
    try {
      const raw = await NativeQuic.request(url, {
        method: 'GET',
        headers: {},
        alpn: 'public',
        timeout: QUIC_CONFIG.defaultTimeout,
      });
      if (!raw?.ok) {
        console.warn(
          '[NetworkDirectory] fetch returned non-OK:',
          raw?.status,
          raw?.body?.substring?.(0, 200),
        );
        return null;
      }
      const parsed = JSON.parse(raw.body);
      if (!parsed || !Array.isArray(parsed.validators)) {
        console.warn('[NetworkDirectory] response missing validators array');
        return null;
      }
      // Dump the first validator's raw keys/values so field-name mismatches
      // become obvious (e.g. node returning `pin` instead of `spki_pin`).
      if (parsed.validators[0]) {
        console.log(
          '[NetworkDirectory] first validator raw keys:',
          Object.keys(parsed.validators[0]).join(','),
        );
        console.log(
          '[NetworkDirectory] first validator raw body:',
          JSON.stringify(parsed.validators[0]).substring(0, 500),
        );
      }
      const sanitized: NetworkDirectoryResponse = {
        validators: parsed.validators.filter(isValidValidator),
        local_spki_pin:
          typeof parsed.local_spki_pin === 'string'
            ? parsed.local_spki_pin
            : undefined,
        chain_height:
          typeof parsed.chain_height === 'number'
            ? parsed.chain_height
            : undefined,
      };
      console.log(
        `[NetworkDirectory] got ${sanitized.validators.length} validator(s), chain_height=${sanitized.chain_height ?? 'n/a'}`,
      );
      // Debug-log each validator's filter-relevant fields so we can see why
      // rankValidators might drop them all.
      sanitized.validators.forEach(v => {
        console.log(
          `  • ${v.endpoint} healthy=${v.healthy} stake=${v.stake} ` +
            `pin_len=${v.spki_pin?.length ?? 0} did=${v.did?.substring(0, 20)}…`,
        );
      });
      return sanitized;
    } catch (err) {
      console.warn('[NetworkDirectory] fetch failed:', err);
      return null;
    }
  }

  /**
   * Rank validators for selection.
   *
   * Must-haves: non-empty SPKI pin (required for UHP handshake) and a
   * parseable endpoint — without either we can't use the entry.
   *
   * Preferences (soft): `healthy === true`, then higher `stake`. We do NOT
   * filter out unhealthy validators entirely — if the node marks every
   * entry `healthy=false` (e.g. during warmup, before the first health
   * sweep completes), we'd otherwise stay stuck on the hardcoded target
   * forever. Unhealthy-with-pin is still strictly better than "hit g1
   * with its pin and don't swap."
   */
  rankValidators(validators: DirectoryValidator[]): DirectoryValidator[] {
    return [...validators]
      .filter(v => !!v.spki_pin && v.endpoint.includes(':'))
      .sort((a, b) => {
        // Healthy outranks unhealthy.
        if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
        // Then higher stake wins.
        if (b.stake !== a.stake) return b.stake - a.stake;
        return a.endpoint.localeCompare(b.endpoint);
      });
  }
}

const networkDirectoryService = new NetworkDirectoryService();
export default networkDirectoryService;
export { NetworkDirectoryService };
