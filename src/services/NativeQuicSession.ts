/**
 * NativeQuicSession — typed wrapper around the RN bridge for the
 * persistent QUIC session FFI (lib-client `zhtp_quic_session_*`).
 *
 * Underlying native modules:
 *   - iOS    : `ios/NativeQuicSession.swift` (wraps `QuicSession.swift`)
 *   - Android: `android/.../NativeQuicSessionModule.kt` (TBD)
 *
 * One session per identity is opened once after sign-in and kept
 * alive for the signed-in lifetime. RPCs multiplex over the same
 * connection; the messaging inbound stream rides its own long-lived
 * server-push channel so envelopes arrive without polling.
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

/** Wire-format ALPN selector — matches the lib-client FFI byte. */
export const QuicAlpn = {
  Public: 0, // zhtp-public/1
  Uhp: 1, // zhtp-uhp/2 (authenticated)
} as const;
export type QuicAlpnValue = (typeof QuicAlpn)[keyof typeof QuicAlpn];

export interface QuicRpcResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string; // UTF-8; callers that need binary should base64-decode it
  ok: boolean;
}

interface NativeQuicSessionShape {
  openSession(
    identityDid: string,
    host: string,
    port: number,
    alpn: number,
    sni: string | null,
    spkiPinHex: string | null,
  ): Promise<string>;

  closeSession(sessionId: string): void;

  rpc(
    sessionId: string,
    method: string,
    path: string,
    headersJson: string | null,
    bodyB64: string | null,
  ): Promise<QuicRpcResponse>;

  openInbound(sessionId: string, path: string): Promise<string>;
  closeInbound(streamId: string): void;
}

const Native = NativeModules.NativeQuicSession as
  | NativeQuicSessionShape
  | undefined;

/**
 * `true` when the bridge is wired on the current platform. JS callers
 * gate the new transport path off this and fall back to the legacy
 * one-shot `NativeQuic.request` when missing (e.g. Android before its
 * bridge ships).
 */
export const isNativeQuicSessionAvailable: boolean =
  !!Native && typeof Native.openSession === 'function';

// One-shot boot log so it's obvious whether the persistent session
// path is wired or we're on the legacy one-shot fallback.
console.log(
  '[NativeQuicSession] bridge available =',
  isNativeQuicSessionAvailable,
);

function ensure(): NativeQuicSessionShape {
  if (!Native) {
    throw new Error(
      'NativeQuicSession bridge not registered — rebuild the app after ' +
        'adding the QUIC session FFI.',
    );
  }
  return Native;
}

// ─── Inbound stream events ────────────────────────────────────────────
//
// The native side emits three events keyed by streamId. We expose a
// per-stream subscribe helper that filters on streamId so callers can
// own their stream without worrying about cross-talk.

interface NativeFrameEvent {
  streamId: string;
  frameB64: string;
}
interface NativeClosedEvent {
  streamId: string;
}
interface NativeErrorEvent {
  streamId: string;
  error: string;
}

export interface InboundSubscriber {
  onFrame: (frameB64: string) => void;
  onClosed?: () => void;
  onError?: (message: string) => void;
}

// ─── Global event listener ────────────────────────────────────────────
//
// A SINGLE global listener registers at module load and dispatches
// events to per-stream subscribers via the `subscribersByStreamId`
// map. This is structurally necessary because the native reader
// thread starts (and can fire events) the moment `openInbound`
// resolves the streamId back to JS — there's a tick of dispatcher
// latency before the caller can attach a per-stream listener. If
// we attached a fresh `addListener` per `subscribeInbound` call,
// any event fired in that window would land on an empty emitter
// and surface as "no listeners registered" + a silently-dropped
// frame or close.
//
// With the global dispatch model: even if the reader fires a
// `QuicInboundClosed` before the JS caller calls subscribeInbound,
// the event hits the dispatcher (which always has a listener),
// gets recorded into the per-stream buffer, and is replayed the
// instant subscribeInbound runs.

const subscribersByStreamId = new Map<string, InboundSubscriber>();
const bufferedEventsByStreamId = new Map<
  string,
  Array<
    | { kind: 'frame'; frameB64: string }
    | { kind: 'closed' }
    | { kind: 'error'; error: string }
  >
>();

function dispatchOrBuffer(
  streamId: string,
  event:
    | { kind: 'frame'; frameB64: string }
    | { kind: 'closed' }
    | { kind: 'error'; error: string },
): void {
  const sub = subscribersByStreamId.get(streamId);
  if (sub) {
    if (event.kind === 'frame') sub.onFrame(event.frameB64);
    else if (event.kind === 'closed') sub.onClosed?.();
    else sub.onError?.(event.error);
    return;
  }
  // Buffer events that arrive before the JS caller can wire its
  // subscriber up — flushed on the next `subscribeInbound` call
  // for this streamId.
  const existing = bufferedEventsByStreamId.get(streamId) ?? [];
  existing.push(event);
  bufferedEventsByStreamId.set(streamId, existing);
}

if (Native) {
  const emitter = new NativeEventEmitter(Native as unknown as undefined);
  emitter.addListener('QuicInboundFrame', (e: NativeFrameEvent) => {
    dispatchOrBuffer(e.streamId, { kind: 'frame', frameB64: e.frameB64 });
  });
  emitter.addListener('QuicInboundClosed', (e: NativeClosedEvent) => {
    dispatchOrBuffer(e.streamId, { kind: 'closed' });
  });
  emitter.addListener('QuicInboundError', (e: NativeErrorEvent) => {
    dispatchOrBuffer(e.streamId, { kind: 'error', error: e.error });
  });
}

export const NativeQuicSession = {
  get available(): boolean {
    return isNativeQuicSessionAvailable;
  },

  openSession: (
    identityDid: string,
    host: string,
    port: number,
    alpn: QuicAlpnValue,
    sni: string | null = null,
    spkiPinHex: string | null = null,
  ): Promise<string> =>
    ensure().openSession(identityDid, host, port, alpn, sni, spkiPinHex),

  closeSession: (sessionId: string): void => {
    ensure().closeSession(sessionId);
  },

  rpc: (
    sessionId: string,
    method: string,
    path: string,
    headersJson: string | null,
    bodyB64: string | null,
  ): Promise<QuicRpcResponse> =>
    ensure().rpc(sessionId, method, path, headersJson, bodyB64),

  openInbound: (sessionId: string, path: string): Promise<string> =>
    ensure().openInbound(sessionId, path),

  closeInbound: (streamId: string): void => {
    ensure().closeInbound(streamId);
  },

  /**
   * Register a per-stream subscriber. Unlike a fresh
   * `addListener` per call, this races-free because the global
   * dispatcher (set up at module load) buffers events fired
   * before the subscriber registers and flushes them
   * synchronously here.
   *
   * Callers MUST still call `closeInbound(streamId)` separately
   * to free the native handle — unregistering here just stops
   * delivering events to the supplied callbacks.
   */
  subscribeInbound(
    streamId: string,
    sub: InboundSubscriber,
  ): () => void {
    if (!Native) return () => {};
    subscribersByStreamId.set(streamId, sub);

    // Flush any events fired during the openInbound → subscribe
    // window. Order is preserved.
    const buffered = bufferedEventsByStreamId.get(streamId);
    if (buffered) {
      bufferedEventsByStreamId.delete(streamId);
      for (const e of buffered) {
        if (e.kind === 'frame') sub.onFrame(e.frameB64);
        else if (e.kind === 'closed') sub.onClosed?.();
        else sub.onError?.(e.error);
      }
    }

    return () => {
      subscribersByStreamId.delete(streamId);
      bufferedEventsByStreamId.delete(streamId);
    };
  },
};

export default NativeQuicSession;
