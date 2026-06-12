/**
 * NetworkBootstrap — connects to a bootstrap gateway, verifies its on-chain
 * DID against the configured `BOOTSTRAP_GATEWAY[_2]_DID`, then fetches the
 * /api/v1/network/directory list to inform later routing decisions.
 *
 * Authenticity model (no SPKI):
 *   - The native QUIC layer (`NativeQuic.setActiveValidator`) holds an
 *     expected DID. The next time a request triggers the UHP-v2 handshake,
 *     the resulting `peer_did` must equal the expected DID — otherwise the
 *     handshake is rejected and no request is routed over the connection.
 *   - TLS itself is accept-any. Cert rotation on the gateway is a non-event.
 *
 * Bootstrap flow at app start (before any QUIC request dispatches):
 *   1. Read BOOTSTRAP_GATEWAYS from generated config (primary + fallback).
 *   2. For each gateway in order:
 *        - setActiveValidator(ip OR host, port, did, sni=host)
 *        - GET /api/v1/network/directory
 *        - if it answers AND directory.local_did matches expected → done
 *        - if mismatch or no answer → try next gateway
 *   3. If all gateways fail, leave the active validator on the last working
 *      one (or the primary if none worked) and let later requests retry.
 *
 * The `bootstrapReady` promise resolves when this flow settles (success,
 * failure, or timeout). Every QUIC request in `quic.ts` awaits it.
 */

import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import networkDirectoryService from './NetworkDirectoryService';
import type { DirectoryValidator, DirectoryView } from './NetworkDirectoryService';
import {
  BOOTSTRAP_GATEWAYS,
  QUIC_PORT,
} from '../config';

interface NativeQuicModule {
  setActiveValidator(
    host: string,
    port: number,
    expectedDid: string,
    sni: string,
  ): Promise<{ host: string; port: number; expectedDid: string; sni: string }>;
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
// Each gateway dial inside `tryBootstrapGateway` waits up to ~10 s for the
// QUIC connect (quinn-ffi default). With one fallback gateway, the worst
// case is ~22 s end-to-end. Anything shorter declares "settled" before the
// first connect has even had a chance to respond, which produced the log:
//   `[NetworkBootstrap] bootstrap settled in 4003ms`
// followed by a dozen requests firing against an unverified target.
const BOOTSTRAP_TIMEOUT_MS = 22000;

interface PersistedValidator {
  host: string;
  port: number;
  did: string;
  sni: string;
  chosenAt: number;
}

// Current active target. Updated whenever `setActiveValidator` is invoked so
// health probes / UI indicators reflect the live endpoint.
//
// `sni` is the cert hostname (used as TLS SNI); `host` is the dial target
// (IP). When dialing by IP we still need the hostname for SNI so the
// caller can pass it through `x-zhtp-sni` — see quic.ts `rawRequest`.
const initialTarget = (() => {
  const primary = BOOTSTRAP_GATEWAYS[0];
  if (!primary) {
    return { host: '', port: QUIC_PORT, sni: '' };
  }
  return {
    host: primary.ip || primary.host,
    port: QUIC_PORT,
    sni: primary.host,
  };
})();
let activeTarget = { ...initialTarget };

export function getActiveTarget(): { host: string; port: number; sni: string } {
  return { ...activeTarget };
}

async function persistSelection(v: PersistedValidator): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_VALIDATOR_KEY, JSON.stringify(v));
  } catch (err) {
    console.warn('[NetworkBootstrap] failed to persist selection:', err);
  }
}

/**
 * Try a single bootstrap gateway: pin the expected DID on the native layer,
 * fetch the directory, and confirm `this_node.did` matches expected.
 * Returns the DirectoryView on success, null otherwise.
 */
async function tryBootstrapGateway(
  host: string,
  ip: string,
  expectedDid: string,
): Promise<DirectoryView | null> {
  if (!nativeQuic?.setActiveValidator) return null;
  const dialHost = ip || host;
  const sni = host;
  try {
    await nativeQuic.setActiveValidator(dialHost, QUIC_PORT, expectedDid, sni);
    activeTarget = { host: dialHost, port: QUIC_PORT, sni };
  } catch (err) {
    console.warn(
      `[NetworkBootstrap] setActiveValidator(${dialHost}) failed:`,
      err,
    );
    return null;
  }

  const dir = await networkDirectoryService.fetchDirectory({
    host: dialHost,
    port: QUIC_PORT,
    sni,
  });
  if (!dir) return null;

  // Defence in depth: if the directory echoes a `this_node.did` and it
  // differs from `expectedDid`, treat it as a hostile / misrouted gateway
  // even if the handshake (which also enforces this) succeeded somehow.
  if (dir.local_did && dir.local_did !== expectedDid) {
    console.warn(
      `[NetworkBootstrap] gateway ${dialHost} returned wrong DID ` +
        `(${dir.local_did.substring(0, 24)}…, expected ${expectedDid.substring(0, 24)}…) — rejecting`,
    );
    return null;
  }
  return dir;
}

/**
 * Bootstrap against the configured gateway list. Returns the answering
 * gateway's directory entry (or null if no entry available). Falls back
 * to the second gateway on the first one's failure.
 */
export async function refreshActiveValidator(): Promise<DirectoryValidator | null> {
  if (!nativeQuic?.setActiveValidator) {
    return null;
  }
  if (BOOTSTRAP_GATEWAYS.length === 0) {
    console.warn(
      '[NetworkBootstrap] no bootstrap gateways configured — check .env BOOTSTRAP_GATEWAY_*',
    );
    return null;
  }

  for (const gw of BOOTSTRAP_GATEWAYS) {
    console.log(
      `[NetworkBootstrap] trying ${gw.host} (${gw.ip || 'dns'}) — expected did=${gw.did.substring(0, 24)}…`,
    );
    const dir = await tryBootstrapGateway(gw.host, gw.ip, gw.did);
    if (!dir) {
      console.log(`[NetworkBootstrap] ${gw.host} did not answer or DID mismatch — trying next`);
      continue;
    }
    console.log(`[NetworkBootstrap] ✓ bootstrap via ${gw.host}`);
    await persistSelection({
      host: gw.host,
      port: QUIC_PORT,
      did: gw.did,
      sni: gw.host,
      chosenAt: Date.now(),
    });

    // Find the directory entry for the gateway that answered (so callers
    // can rank it against the rest of the topology). It's fine if the
    // entry isn't there — the connection is still trusted by DID.
    const match = dir.validators.find(v => v.did === gw.did) ?? null;
    return match;
  }

  console.warn(
    '[NetworkBootstrap] all bootstrap gateways failed — staying on last-attempted target',
  );
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
