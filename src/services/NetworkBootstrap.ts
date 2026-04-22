/**
 * NetworkBootstrap — validator discovery via public directory endpoint.
 *
 * Flow at app start (before any QUIC request dispatches):
 *   1. App boots with hardcoded validator + pin (from GeneratedConfig / .env).
 *   2. Fetch `GET /api/v1/network/directory` over public QUIC — no auth
 *      needed, no UHP handshake, works with the hardcoded pin.
 *   3. Parse validators; pick the healthiest / highest-staked one.
 *   4. If it differs from the hardcoded target, call native
 *      `setActiveValidator(host, port, spki_pin)` with the pin from the
 *      directory response. UHP handshakes now use the real pin.
 *
 * The `bootstrapReady` promise resolves when this flow settles (success,
 * failure, or timeout). Every QUIC request in `quic.ts` awaits it, so
 * nothing is dispatched to the old target.
 */

import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import networkDirectoryService from './NetworkDirectoryService';
import type { DirectoryValidator } from './NetworkDirectoryService';
import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  ZDNS_HOST,
  ZDNS_PORT,
  ZDNS_DIRECTORY_NAME,
  QUIC_PORT,
} from '../config';

interface NativeQuicModule {
  setActiveValidator(
    host: string,
    port: number,
    pinHex: string,
  ): Promise<{ host: string; port: number; pinHex: string }>;
  resolveDirectory(
    zdnsHost: string,
    port: number,
    name: string,
  ): Promise<string[]>;
}

const nativeQuic: NativeQuicModule | undefined =
  (NativeModules as Record<string, unknown>).NativeQuic as
    | NativeQuicModule
    | undefined;

const LAST_VALIDATOR_KEY = 'sov:active_validator_v1';
const BOOTSTRAP_TIMEOUT_MS = 3500;

/**
 * Resolve the validator IP set via ZDNS. Returns empty on any failure so
 * the caller can fall back to the hardcoded bootstrap target.
 * Server address + port + directory name are wired from .env via
 * GeneratedConfig — see `scripts/generate-config.js`.
 */
async function resolveValidatorIPs(): Promise<string[]> {
  if (!nativeQuic?.resolveDirectory) return [];
  try {
    const ips = await nativeQuic.resolveDirectory(
      ZDNS_HOST,
      ZDNS_PORT,
      ZDNS_DIRECTORY_NAME,
    );
    if (!Array.isArray(ips) || ips.length === 0) return [];
    console.log(`[NetworkBootstrap] ZDNS resolved ${ips.length} IP(s): ${ips.join(', ')}`);
    return ips;
  } catch (err) {
    console.warn('[NetworkBootstrap] ZDNS failed:', err);
    return [];
  }
}

interface PersistedValidator {
  host: string;
  port: number;
  pinHex: string;
  did: string;
  chosenAt: number;
}

// Current active target. Updated whenever `setActiveValidator` is invoked so
// health probes / UI indicators reflect the live endpoint instead of the
// hardcoded bootstrap.
let activeTarget = { host: DEFAULT_NODE_HOST, port: DEFAULT_NODE_PORT };

export function getActiveTarget(): { host: string; port: number } {
  return { ...activeTarget };
}

function splitEndpoint(endpoint: string): { host: string; port: number } | null {
  const colonIdx = endpoint.lastIndexOf(':');
  if (colonIdx <= 0) return null;
  const host = endpoint.slice(0, colonIdx).trim();
  const portStr = endpoint.slice(colonIdx + 1).trim();
  const port = Number(portStr);
  if (!host || !Number.isFinite(port) || port <= 0 || port >= 65536) return null;
  return { host, port };
}

function matchesCurrentBootstrap(v: DirectoryValidator): boolean {
  const split = splitEndpoint(v.endpoint);
  if (!split) return false;
  return split.host === DEFAULT_NODE_HOST && split.port === DEFAULT_NODE_PORT;
}

async function persistSelection(v: PersistedValidator): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_VALIDATOR_KEY, JSON.stringify(v));
  } catch (err) {
    console.warn('[NetworkBootstrap] failed to persist selection:', err);
  }
}

/**
 * Fetch the directory, pick the best validator, and call native to switch.
 * Returns the activated validator or null if we stayed on the bootstrap target.
 *
 * Flow:
 *   1. Ask ZDNS for `directory.sov` A records (IPs only, no pins).
 *   2. Dial the first ZDNS IP in public mode — no pin required — to fetch
 *      `/api/v1/network/directory`, which returns validators *with* pins.
 *   3. If ZDNS is unreachable, fall back to the hardcoded bootstrap target
 *      (still has its pin from `.env`) so the app doesn't break.
 *   4. Pick the best directory entry; swap to it with its real pin.
 */
export async function refreshActiveValidator(): Promise<DirectoryValidator | null> {
  if (!nativeQuic?.setActiveValidator) {
    return null;
  }

  // Step 1 + 2: try DNS → IP, use it for the directory fetch.
  const dnsIps = await resolveValidatorIPs();
  let directory = null;
  if (dnsIps.length > 0) {
    directory = await networkDirectoryService.fetchDirectory({
      host: dnsIps[0],
      port: QUIC_PORT,
    });
  }
  // Step 3: fall back to hardcoded bootstrap if DNS or first validator failed.
  if (!directory) {
    console.log('[NetworkBootstrap] falling back to hardcoded bootstrap for directory fetch');
    directory = await networkDirectoryService.fetchDirectory();
  }
  if (!directory) {
    console.log('[NetworkBootstrap] no directory — staying on bootstrap');
    return null;
  }

  const ranked = networkDirectoryService.rankValidators(directory.validators);
  if (ranked.length === 0) {
    console.warn('[NetworkBootstrap] directory has no healthy validators with pins');
    return null;
  }

  const best = ranked[0];
  if (matchesCurrentBootstrap(best)) {
    console.log(
      '[NetworkBootstrap] bootstrap validator is already the top pick — no switch',
    );
    return null;
  }

  const split = splitEndpoint(best.endpoint);
  if (!split) {
    console.warn('[NetworkBootstrap] malformed endpoint:', best.endpoint);
    return null;
  }

  try {
    await nativeQuic.setActiveValidator(split.host, split.port, best.spki_pin);
    activeTarget = { host: split.host, port: split.port };
    console.log(
      `[NetworkBootstrap] ✓ switched to ${best.did.substring(0, 20)}… at ${split.host}:${split.port}`,
    );
    await persistSelection({
      host: split.host,
      port: split.port,
      pinHex: best.spki_pin,
      did: best.did,
      chosenAt: Date.now(),
    });
    return best;
  } catch (err) {
    console.warn('[NetworkBootstrap] setActiveValidator failed:', err);
    return null;
  }
}

/**
 * Eager bootstrap promise — fires at module import. Never rejects.
 * `quic.ts` awaits this before dispatching any request.
 */
export const bootstrapReady: Promise<void> = (async () => {
  const start = Date.now();
  try {
    await Promise.race([
      refreshActiveValidator().catch(err => {
        console.warn('[NetworkBootstrap] refresh error:', err);
      }),
      new Promise<void>(res => {
        setTimeout(() => res(), BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    const elapsed = Date.now() - start;
    console.log(`[NetworkBootstrap] bootstrap settled in ${elapsed}ms`);
  }
})();
