/**
 * NetworkBootstrap — validator discovery via public directory endpoint.
 *
 * Flow at app start (before any QUIC request dispatches):
 *   1. App boots with hardcoded validator + pin (from GeneratedConfig / .env).
 *   2. Try ZDNS to resolve the validator IP set; use the first IP for a
 *      public-mode directory fetch. Fall back to the hardcoded target
 *      if ZDNS is unreachable.
 *   3. Parse `topology.validators`. Policy:
 *        - if the bootstrap target is still the best pick → no-op.
 *        - otherwise, we can't safely swap: the 2026-04-24 directory
 *          contract removed per-validator `spki_pin` entries, so there
 *          is no pin to hand to the native UHP handshake. We log a
 *          "would switch" note and stay on the current validator, and
 *          a future revision that either (a) adds pins back, or (b)
 *          moves gateways behind publicly-trusted certs can flip this
 *          branch to actually call `setActiveValidator`.
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

function matchesCurrentBootstrap(v: DirectoryValidator): boolean {
  return v.host === DEFAULT_NODE_HOST && v.port === DEFAULT_NODE_PORT;
}

async function persistSelection(v: PersistedValidator): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_VALIDATOR_KEY, JSON.stringify(v));
  } catch (err) {
    console.warn('[NetworkBootstrap] failed to persist selection:', err);
  }
}

/**
 * Fetch the directory and decide whether to swap the active validator.
 * Returns the activated validator or null if we stayed on the bootstrap
 * target. The 2026-04-24 directory contract dropped per-validator
 * `spki_pin`, so the swap branch here is intentionally conservative:
 * we only have a pin for the node that *answered* us. Swapping to a
 * different validator without a pin would break the pinned UHP
 * handshake native requires, so in that case we log and stay put.
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
    console.warn('[NetworkBootstrap] directory returned no usable validators');
    return null;
  }

  const best = ranked[0];
  if (matchesCurrentBootstrap(best)) {
    console.log(
      '[NetworkBootstrap] bootstrap validator is already the top pick — no switch',
    );
    return null;
  }

  // New directory shape: no per-validator SPKI pins. The only pin we
  // have is `local_spki_pin` — the cert of whichever node answered
  // this very call. If the top-ranked pick happens to be THAT node,
  // we can swap onto it safely; otherwise we stay put and flag the
  // situation. Callers reach validators via the existing hardcoded
  // path until the contract either re-adds pins or the validator
  // fleet is served over publicly-trusted certs.
  const answeringPin = directory.local_spki_pin;
  const answeringDid = directory.local_did;
  const canSwapToBest =
    !!answeringPin &&
    answeringPin.length === 64 &&
    best.did === answeringDid;

  if (!canSwapToBest) {
    console.log(
      `[NetworkBootstrap] would switch to ${best.did.substring(0, 20)}… at ${best.host}:${best.port}, ` +
        'but the new directory contract does not carry a per-validator SPKI pin — staying on bootstrap',
    );
    return null;
  }

  try {
    await nativeQuic.setActiveValidator(best.host, best.port, answeringPin);
    activeTarget = { host: best.host, port: best.port };
    console.log(
      `[NetworkBootstrap] ✓ switched to ${best.did.substring(0, 20)}… at ${best.host}:${best.port}`,
    );
    await persistSelection({
      host: best.host,
      port: best.port,
      pinHex: answeringPin,
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
