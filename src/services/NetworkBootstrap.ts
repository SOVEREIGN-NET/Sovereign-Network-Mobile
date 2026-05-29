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
import type { DirectoryValidator, DirectoryView } from './NetworkDirectoryService';
import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  NODE_REGISTRY,
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
 * Apply the "should we swap validators?" policy after a directory came
 * back. Same conservative rule as before — we only swap if the
 * top-ranked validator is the one that *answered* the directory call
 * (since that's the only node we have a fresh SPKI pin for).
 */
async function maybeSwapAndReturn(
  directory: DirectoryView,
): Promise<DirectoryValidator | null> {
  if (!nativeQuic?.setActiveValidator) return null;

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

  const answeringPin = directory.local_spki_pin;
  const answeringDid = directory.local_did;
  const canSwapToBest =
    !!answeringPin &&
    answeringPin.length === 64 &&
    best.did === answeringDid;
  if (!canSwapToBest) {
    console.log(
      `[NetworkBootstrap] would switch to ${best.did.substring(0, 20)}… at ${best.host}:${best.port}, ` +
        'but the new directory contract does not carry a per-validator SPKI pin — staying',
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
 * Fetch the directory and decide whether to swap the active validator.
 * Returns the activated validator or null if we stayed on the bootstrap
 * target.
 *
 * The retry walk has two phases:
 *
 *   Phase A — every IP returned by ZDNS, dialed with the currently
 *     active pin/SNI (bootstrap by default). These are expected to be
 *     load-balanced backends of the bootstrap gateway; the same pin
 *     should match all of them.
 *
 *   Phase B — every entry from `NODE_REGISTRY` (configured in `.env`
 *     as `ZHTP_NODE_REGISTRY`), each with its own per-host pin. We
 *     call `setActiveValidator(host, port, pin)` before each attempt
 *     so SNI + pin line up with the host we're dialing.
 *
 * First gateway that answers wins. If everything fails, we restore the
 * bootstrap as the active target so subsequent QUIC requests don't get
 * pinned to whichever gateway happened to be tried last.
 */
export async function refreshActiveValidator(): Promise<DirectoryValidator | null> {
  if (!nativeQuic?.setActiveValidator) {
    return null;
  }

  const bootstrapEntry = NODE_REGISTRY.find(
    n => n.host === DEFAULT_NODE_HOST && n.port === DEFAULT_NODE_PORT,
  );

  // ── Phase A: ZDNS-resolved IPs, current pin/SNI ──
  const dnsIps = await resolveValidatorIPs();
  for (const ip of dnsIps) {
    console.log(`[NetworkBootstrap] phase-A: trying ${ip}:${QUIC_PORT}`);
    const dir = await networkDirectoryService.fetchDirectory({
      host: ip,
      port: QUIC_PORT,
    });
    if (dir) {
      console.log(`[NetworkBootstrap] phase-A: ${ip} answered`);
      return await maybeSwapAndReturn(dir);
    }
  }

  // ── Phase B: known gateways from the registry, bootstrap first ──
  const phaseB =
    bootstrapEntry !== undefined
      ? [bootstrapEntry, ...NODE_REGISTRY.filter(n => n !== bootstrapEntry)]
      : [...NODE_REGISTRY];
  for (const gw of phaseB) {
    console.log(`[NetworkBootstrap] phase-B: trying ${gw.host}:${gw.port}`);
    try {
      await nativeQuic.setActiveValidator(gw.host, gw.port, gw.pin);
      activeTarget = { host: gw.host, port: gw.port };
    } catch (err) {
      console.warn(`[NetworkBootstrap] setActiveValidator(${gw.host}) failed:`, err);
      continue;
    }
    const dir = await networkDirectoryService.fetchDirectory({
      host: gw.host,
      port: gw.port,
    });
    if (dir) {
      console.log(`[NetworkBootstrap] phase-B: ${gw.host} answered`);
      // If we landed on a non-bootstrap gateway, persist the choice so
      // the next launch can prefer it.
      if (gw.host !== DEFAULT_NODE_HOST || gw.port !== DEFAULT_NODE_PORT) {
        await persistSelection({
          host: gw.host,
          port: gw.port,
          pinHex: gw.pin,
          did: dir.local_did ?? '',
          chosenAt: Date.now(),
        });
      }
      return await maybeSwapAndReturn(dir);
    }
  }

  // ── All attempts failed: restore bootstrap as the active target ──
  // Without this, the last-tried Phase-B gateway would remain set as
  // the active validator and every later QUIC request would point at
  // a known-unreachable host.
  if (bootstrapEntry) {
    try {
      await nativeQuic.setActiveValidator(
        bootstrapEntry.host,
        bootstrapEntry.port,
        bootstrapEntry.pin,
      );
      activeTarget = { host: bootstrapEntry.host, port: bootstrapEntry.port };
    } catch (err) {
      console.warn('[NetworkBootstrap] restore-bootstrap failed:', err);
    }
  } else {
    console.warn(
      `[NetworkBootstrap] bootstrap ${DEFAULT_NODE_HOST}:${DEFAULT_NODE_PORT} not in NODE_REGISTRY — ` +
        'cannot restore active validator after retry walk',
    );
  }
  console.log('[NetworkBootstrap] no gateway answered — staying on bootstrap');
  return null;
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
