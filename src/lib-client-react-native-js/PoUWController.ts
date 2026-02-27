import { identityProvisioning } from '../services/NativeIdentityProvisioning';
import { publicQuicRequest } from '../services/quic';

const POUW_VERSION = 1;
const DEFAULT_BATCH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_BATCH_SIZE = 20;
const MIN_BYTES_PER_RECEIPT = 1024;

export type ProofType =
  | 'hash'
  | 'merkle'
  | 'signature'
  | 'web4manifestroute'
  | 'web4contentserved';

export interface Receipt {
  version: number;
  task_id: string;
  client_did: string;
  client_node_id: string;
  provider_id: string;
  content_id: string;
  proof_type: ProofType;
  bytes_verified: number;
  result_ok: boolean;
  started_at: number;
  finished_at: number;
  receipt_nonce: string;
  challenge_nonce: string;
  aux?: string;
}

export interface SignedReceipt {
  receipt: Receipt;
  sig_scheme: string;
  signature: string;
}

export interface ReceiptBatch {
  version: number;
  client_did: string;
  receipts: SignedReceipt[];
}

export interface SubmitResponse {
  accepted: string[];
  rejected: Array<{ receipt_nonce: string; reason: string }>;
  server_time: number;
}

export interface ChallengeToken {
  version: number;
  node_id: string;
  task_id: string;
  challenge_nonce: string;
  issued_at: number;
  expires_at: number;
  policy: {
    max_receipts: number;
    max_bytes_total: number;
    min_bytes_per_receipt: number;
    allowed_proof_types: ProofType[];
  };
  node_signature: string;
}

export interface PoUWControllerConfig {
  nodeApiBase: string;
  batchIntervalMs?: number;
  maxBatchSize?: number;
}

function randomBytes(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function randomHex(byteLength: number): string {
  return bytesToHex(randomBytes(byteLength));
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(normalizeBase64(b64), 'base64'));
  }
  const binary = atob(normalizeBase64(b64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64ToHex(b64: string): string {
  return bytesToHex(base64ToBytes(b64));
}

function parseChallengeFromToken(tokenB64: string): ChallengeToken {
  const tokenBytes = base64ToBytes(tokenB64);
  const tokenJson =
    typeof Buffer !== 'undefined'
      ? Buffer.from(tokenBytes).toString('utf-8')
      : String.fromCharCode(...Array.from(tokenBytes));
  return JSON.parse(tokenJson) as ChallengeToken;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('utf-8');
  }
  return String.fromCharCode(...Array.from(bytes));
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'utf-8'));
  }
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function isHexString(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

function decodeHexMaybe(value: string): Uint8Array | null {
  const trimmed = value.trim();
  const noPrefix =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? trimmed.slice(2)
      : trimmed;
  if (!isHexString(noPrefix)) return null;
  return hexToBytes(noPrefix);
}

function normalizeIdentifier(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noPrefix =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? trimmed.slice(2)
      : trimmed;
  if (isHexString(noPrefix)) return noPrefix.toLowerCase();
  const decodedB64 = (() => {
    try {
      return base64ToBytes(noPrefix);
    } catch {
      return null;
    }
  })();
  return decodedB64 && decodedB64.length > 0 ? bytesToHex(decodedB64) : null;
}

function findStringValue(
  value: unknown,
  keys: Set<string>,
): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringValue(item, keys);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (keys.has(k) && typeof v === 'string') return v;
    }
    for (const v of Object.values(obj)) {
      const found = findStringValue(v, keys);
      if (found) return found;
    }
  }
  return null;
}

function readVarint(bytes: Uint8Array, start: number): [number, number] | null {
  let value = 0;
  let shift = 0;
  let index = start;
  while (index < bytes.length && shift <= 63) {
    const b = bytes[index];
    index += 1;
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return [value, index];
    }
    shift += 7;
  }
  return null;
}

function parseChallengeTokenProtobuf(
  bytes: Uint8Array,
): { task_id: string; challenge_nonce: string } | null {
  let index = 0;
  let taskIdBytes: Uint8Array | null = null;
  let challengeNonceBytes: Uint8Array | null = null;

  while (index < bytes.length) {
    const keyRes = readVarint(bytes, index);
    if (!keyRes) return null;
    const [key, keyNext] = keyRes;
    index = keyNext;

    const fieldNumber = key >> 3;
    const wireType = key & 0x07;

    if (wireType === 0) {
      const skip = readVarint(bytes, index);
      if (!skip) return null;
      index = skip[1];
      continue;
    }
    if (wireType === 1) {
      if (index + 8 > bytes.length) return null;
      index += 8;
      continue;
    }
    if (wireType === 2) {
      const lenRes = readVarint(bytes, index);
      if (!lenRes) return null;
      const [len, lenNext] = lenRes;
      index = lenNext;
      if (len < 0 || index + len > bytes.length) return null;
      const value = bytes.slice(index, index + len);
      index += len;
      if (fieldNumber === 3) taskIdBytes = value;
      if (fieldNumber === 4) challengeNonceBytes = value;
      continue;
    }
    if (wireType === 5) {
      if (index + 4 > bytes.length) return null;
      index += 4;
      continue;
    }
    return null;
  }

  if (!taskIdBytes?.length || !challengeNonceBytes?.length) return null;
  return {
    task_id: bytesToHex(taskIdBytes),
    challenge_nonce: bytesToHex(challengeNonceBytes),
  };
}

function parseDecodedTokenPayload(
  payload: Uint8Array,
  depth: number,
  requestedProofs: ProofType[],
): ChallengeToken | null {
  try {
    const parsedJson = JSON.parse(decodeUtf8(payload)) as Record<string, unknown>;
    const parsedObj = parseChallengeObject(parsedJson, requestedProofs);
    if (parsedObj) return parsedObj;
  } catch {}

  const parsedProto = parseChallengeTokenProtobuf(payload);
  if (parsedProto) {
    return parseChallengeObject(parsedProto, requestedProofs);
  }

  if (depth < 2) {
    const innerText = decodeUtf8(payload).trim();
    if (innerText) {
      try {
        const innerB64 = base64ToBytes(innerText);
        const nested = parseDecodedTokenPayload(
          innerB64,
          depth + 1,
          requestedProofs,
        );
        if (nested) return nested;
      } catch {}

      const innerHex = decodeHexMaybe(innerText);
      if (innerHex) {
        const nested = parseDecodedTokenPayload(
          innerHex,
          depth + 1,
          requestedProofs,
        );
        if (nested) return nested;
      }
    }
  }

  return null;
}

function parseChallengeObject(
  candidate: Record<string, unknown>,
  requestedProofs: ProofType[],
): ChallengeToken | null {
  const taskRaw =
    findStringValue(
      candidate,
      new Set(['task_id', 'taskId', 'task', 'task_id_hex', 'taskHex']),
    ) ?? undefined;
  const nonceRaw =
    findStringValue(
      candidate,
      new Set([
        'challenge_nonce',
        'challengeNonce',
        'nonce',
        'challenge_nonce_hex',
        'nonceHex',
      ]),
    ) ?? undefined;
  const taskId = taskRaw ? normalizeIdentifier(taskRaw) : null;
  const challengeNonce = nonceRaw ? normalizeIdentifier(nonceRaw) : null;
  if (!taskId || !challengeNonce) return null;

  const issuedAt =
    typeof candidate.issued_at === 'number'
      ? candidate.issued_at
      : Math.floor(Date.now() / 1000);
  const expiresAt =
    typeof candidate.expires_at === 'number'
      ? candidate.expires_at
      : issuedAt + 60;

  const normalizeProofType = (value: string): ProofType | null => {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'hash':
        return 'hash';
      case 'merkle':
        return 'merkle';
      case 'signature':
        return 'signature';
      case 'web4manifestroute':
        return 'web4manifestroute';
      case 'web4contentserved':
        return 'web4contentserved';
      default:
        return null;
    }
  };

  const rawPolicy =
    typeof candidate.policy === 'object' && candidate.policy !== null
      ? (candidate.policy as Record<string, unknown>)
      : {};
  const allowedFromPolicy = Array.isArray(rawPolicy.allowed_proof_types)
    ? rawPolicy.allowed_proof_types
        .filter((p): p is string => typeof p === 'string')
        .map(normalizeProofType)
        .filter((p): p is ProofType => p !== null)
    : [];

  return {
    version: typeof candidate.version === 'number' ? candidate.version : 1,
    node_id: typeof candidate.node_id === 'string' ? candidate.node_id : '',
    task_id: taskId,
    challenge_nonce: challengeNonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
    policy: {
      max_receipts:
        typeof rawPolicy.max_receipts === 'number' ? rawPolicy.max_receipts : 64,
      max_bytes_total:
        typeof rawPolicy.max_bytes_total === 'number'
          ? rawPolicy.max_bytes_total
          : 10 * 1024 * 1024,
      min_bytes_per_receipt:
        typeof rawPolicy.min_bytes_per_receipt === 'number'
          ? rawPolicy.min_bytes_per_receipt
          : MIN_BYTES_PER_RECEIPT,
      allowed_proof_types:
        allowedFromPolicy.length > 0
          ? allowedFromPolicy
          : Array.from(new Set<ProofType>(['hash', ...requestedProofs])),
    },
    node_signature:
      typeof candidate.node_signature === 'string' ? candidate.node_signature : '',
  };
}

function parseChallengeAny(
  response: Record<string, unknown>,
  requestedProofs: ProofType[],
): ChallengeToken | null {
  const direct = parseChallengeObject(response, requestedProofs);
  if (direct) return direct;

  const nestedCandidates: Array<Record<string, unknown>> = [];
  if (typeof response.data === 'object' && response.data !== null) {
    nestedCandidates.push(response.data as Record<string, unknown>);
  }
  if (typeof response.result === 'object' && response.result !== null) {
    nestedCandidates.push(response.result as Record<string, unknown>);
  }
  for (const nested of nestedCandidates) {
    const parsed = parseChallengeObject(nested, requestedProofs);
    if (parsed) return parsed;
  }

  const tokenCandidates: string[] = [];
  const tokenKeys = new Set([
    'token',
    'challenge',
    'challenge_token',
    'challengeToken',
    'raw_token',
    'rawToken',
  ]);
  const collectTokenStrings = (value: unknown): void => {
    if (typeof value === 'string') {
      tokenCandidates.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collectTokenStrings);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (tokenKeys.has(k)) {
          collectTokenStrings(v);
        }
      }
    }
  };
  collectTokenStrings(response);
  nestedCandidates.forEach(collectTokenStrings);

  for (const token of tokenCandidates) {
    // 1) Raw JSON payload.
    const rawJson = parseDecodedTokenPayload(
      encodeUtf8(token),
      0,
      requestedProofs,
    );
    if (rawJson) return rawJson;

    // 2) Decode as base64/base64url and parse JSON/protobuf.
    try {
      const decoded = base64ToBytes(token);
      const parsed = parseDecodedTokenPayload(decoded, 0, requestedProofs);
      if (parsed) return parsed;
    } catch {}

    // 2b) Decode as hex payload and parse JSON/protobuf.
    const hexDecoded = decodeHexMaybe(token);
    if (hexDecoded) {
      const parsed = parseDecodedTokenPayload(hexDecoded, 0, requestedProofs);
      if (parsed) return parsed;
    }

    // 3) JWT-like token (try payload segment, then first segment)
    const parts = token.split('.');
    const jwtSegments = parts.length >= 2 ? [parts[1], parts[0]] : [];
    for (const seg of jwtSegments) {
      try {
        const parsed = parseDecodedTokenPayload(
          base64ToBytes(seg),
          0,
          requestedProofs,
        );
        if (parsed) return parsed;
      } catch {}
    }
  }

  return null;
}

export class PoUWController {
  private static instance: PoUWController | null = null;
  private config: Required<PoUWControllerConfig>;
  private pendingReceipts: SignedReceipt[] = [];
  private activeChallenge: ChallengeToken | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private clientDid: string | null = null;
  private clientNodeId: string | null = null;
  private isRunning = false;

  private constructor(config: PoUWControllerConfig) {
    this.config = {
      nodeApiBase: config.nodeApiBase,
      batchIntervalMs: config.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    };
  }

  static getInstance(config?: PoUWControllerConfig): PoUWController {
    if (!PoUWController.instance) {
      if (!config) {
        throw new Error(
          'PoUWController must be initialized with config on first call',
        );
      }
      PoUWController.instance = new PoUWController(config);
    }
    return PoUWController.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const identity = await identityProvisioning.getPublicIdentity();
    this.clientDid = identity.did;
    this.clientNodeId = base64ToHex(identity.nodeId);

    await this.refreshChallenge(['web4manifestroute', 'web4contentserved']);

    this.batchTimer = setInterval(() => {
      this.submitBatch().catch(() => {});
    }, this.config.batchIntervalMs);

    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    await this.submitBatch();
    this.isRunning = false;
  }

  async flush(): Promise<SubmitResponse | null> {
    return this.submitBatch();
  }

  async recordWeb4ManifestRoute(opts: {
    manifestCid: string;
    domain: string;
    routeHops: number;
    manifestSizeBytes: number;
    quicSessionId: Uint8Array;
  }): Promise<void> {
    const bytes = Math.max(opts.manifestSizeBytes, MIN_BYTES_PER_RECEIPT);
    const aux = JSON.stringify({
      manifest_cid: opts.manifestCid,
      domain: opts.domain,
      route_hops: opts.routeHops,
      quic_session_id: bytesToHex(opts.quicSessionId.slice(0, 8)),
    });
    await this.createAndQueueReceipt('web4manifestroute', bytes, aux);
  }

  async recordWeb4ContentServed(opts: {
    manifestCid: string;
    domain: string;
    contentSizeBytes: number;
    servedFromCache: boolean;
    quicSessionId: Uint8Array;
  }): Promise<void> {
    const bytes = Math.max(opts.contentSizeBytes, MIN_BYTES_PER_RECEIPT);
    const aux = JSON.stringify({
      manifest_cid: opts.manifestCid,
      domain: opts.domain,
      served_from_cache: opts.servedFromCache,
      quic_session_id: bytesToHex(opts.quicSessionId.slice(0, 8)),
    });
    await this.createAndQueueReceipt('web4contentserved', bytes, aux);
  }

  get pendingCount(): number {
    return this.pendingReceipts.length;
  }

  get running(): boolean {
    return this.isRunning;
  }

  private async createAndQueueReceipt(
    proofType: ProofType,
    bytesVerified: number,
    aux: string,
  ): Promise<void> {
    await this.ensureChallenge([proofType]);
    if (!this.activeChallenge || !this.clientDid || !this.clientNodeId) return;
    const allowed = this.activeChallenge.policy.allowed_proof_types;
    if (!allowed.includes(proofType)) {
      if (__DEV__) {
        console.warn('[PoUWController] receipt blocked: proof_type not allowed by challenge policy', {
          challenge_nonce: this.activeChallenge.challenge_nonce,
          requested: proofType,
          allowed,
        });
      }
      throw new Error('Challenge policy does not allow requested proof_type');
    }

    const now = nowSecs();
    const receipt: Receipt = {
      version: POUW_VERSION,
      task_id: this.activeChallenge.task_id,
      client_did: this.clientDid,
      client_node_id: this.clientNodeId,
      provider_id: '',
      content_id: randomHex(32),
      proof_type: proofType,
      bytes_verified: bytesVerified,
      result_ok: true,
      started_at: now - 1,
      finished_at: now,
      receipt_nonce: randomHex(32),
      challenge_nonce: this.activeChallenge.challenge_nonce,
      aux,
    };

    const signed = await this.signReceipt(receipt);
    this.pendingReceipts.push(signed);
    if (__DEV__) {
      console.log('[PoUWController] queued receipt', {
        proof_type: proofType,
        pending: this.pendingReceipts.length,
      });
    }

    if (this.pendingReceipts.length >= this.config.maxBatchSize) {
      await this.submitBatch();
    }
  }

  private async signReceipt(receipt: Receipt): Promise<SignedReceipt> {
    const receiptJson = JSON.stringify(
      receipt,
      Object.keys(receipt).sort((a, b) => a.localeCompare(b)),
    );
    const sigB64 = await identityProvisioning.signPouwReceipt(receiptJson);
    return {
      receipt,
      sig_scheme: 'dilithium5',
      signature: base64ToHex(sigB64),
    };
  }

  private async submitBatch(): Promise<SubmitResponse | null> {
    if (this.pendingReceipts.length === 0 || !this.clientDid) return null;

    const toSubmit = this.pendingReceipts.splice(0, this.config.maxBatchSize);
    const batch: ReceiptBatch = {
      version: POUW_VERSION,
      client_did: this.clientDid,
      receipts: toSubmit,
    };

    try {
      const response = await publicQuicRequest<SubmitResponse>(
        '/api/v1/pouw/submit',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(batch),
        },
      );
      return response;
    } catch {
      this.pendingReceipts.unshift(...toSubmit);
      return null;
    }
  }

  private async ensureChallenge(proofTypes: ProofType[]): Promise<void> {
    if (!this.isChallengeValidForProofs(this.activeChallenge, proofTypes)) {
      await this.refreshChallenge(proofTypes);
      if (!this.isChallengeValidForProofs(this.activeChallenge, proofTypes)) {
        if (__DEV__) {
          console.warn('[PoUWController] challenge invalid after refresh', {
            requested: proofTypes,
            challenge_nonce: this.activeChallenge?.challenge_nonce ?? null,
            returned:
              this.activeChallenge?.policy.allowed_proof_types ?? [],
          });
        }
        throw new Error('No compatible PoUW challenge for requested proof types');
      }
    }
  }

  private isChallengeValidForProofs(
    challenge: ChallengeToken | null,
    proofTypes: ProofType[],
  ): boolean {
    if (!challenge) return false;
    const now = nowSecs();
    if (challenge.expires_at <= now + 30) return false;
    return proofTypes.every(pt =>
      challenge.policy.allowed_proof_types.includes(pt),
    );
  }

  private async refreshChallenge(proofTypes: ProofType[]): Promise<void> {
    const cap = proofTypes.join(',');
    let failureReason: 'parse' | 'policy' | 'network' = 'network';
    try {
      const response = await publicQuicRequest<Record<string, unknown>>(
        `/api/v1/pouw/challenge?cap=${encodeURIComponent(cap)}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
        },
      );
      const parsed = parseChallengeAny(response, proofTypes);
      if (!parsed) {
        failureReason = 'parse';
        throw new Error('unparseable challenge response');
      }
      if (!proofTypes.every(pt => parsed.policy.allowed_proof_types.includes(pt))) {
        failureReason = 'policy';
        if (__DEV__) {
          console.warn('[PoUWController] challenge rejected: missing requested proof types', {
            challenge_nonce: parsed.challenge_nonce,
            requested: proofTypes,
            returned: parsed.policy.allowed_proof_types,
          });
        }
        throw new Error('challenge policy missing requested proof types');
      }
      this.activeChallenge = parsed;
      if (__DEV__) {
        console.log('[PoUWController] challenge ready', {
          expires_at: this.activeChallenge.expires_at,
          has_policy: Boolean(this.activeChallenge.policy),
        });
      }
    } catch {
      // Backward-compat fallback: some nodes reject unknown cap values.
      try {
        const response = await publicQuicRequest<Record<string, unknown>>(
          '/api/v1/pouw/challenge',
          {
            method: 'GET',
            headers: { accept: 'application/json' },
          },
        );
        const parsed = parseChallengeAny(response, proofTypes);
        if (parsed && proofTypes.every(pt => parsed.policy.allowed_proof_types.includes(pt))) {
          this.activeChallenge = parsed;
        } else {
          this.activeChallenge = null;
          failureReason = parsed ? 'policy' : 'parse';
          if (__DEV__ && parsed) {
            console.warn('[PoUWController] fallback challenge rejected: missing requested proof types', {
              challenge_nonce: parsed.challenge_nonce,
              requested: proofTypes,
              returned: parsed.policy.allowed_proof_types,
            });
          }
        }
        if (this.activeChallenge && __DEV__) {
          console.log('[PoUWController] challenge ready (fallback)', {
            expires_at: this.activeChallenge.expires_at,
            has_policy: Boolean(this.activeChallenge.policy),
          });
        }
      } catch {
        this.activeChallenge = null;
        failureReason = 'network';
      }
    }
    if (!this.activeChallenge && __DEV__) {
      if (failureReason === 'policy') {
        console.warn('[PoUWController] challenge incompatible with requested proof types');
      } else if (failureReason === 'parse') {
        console.warn('[PoUWController] challenge parse failed');
      } else {
        console.warn('[PoUWController] challenge fetch failed');
      }
    }
  }
}

export default PoUWController;
