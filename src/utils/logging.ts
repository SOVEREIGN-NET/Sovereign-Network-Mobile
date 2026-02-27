/**
 * Install runtime logging safeguards.
 * - Release builds: silence console output to avoid leaking runtime data.
 * - Dev builds: keep logs, but redact known sensitive fields.
 */
export function installLogGuard(): void {
  const noop = () => undefined;
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    trace: console.trace.bind(console),
  };

  if (!__DEV__) {
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.warn = noop;
    console.error = noop;
    console.trace = noop;
    return;
  }

  const fullRedactKeyPattern =
    /(seed|mnemonic|private|secret|password|passphrase|signature|authorization|token|session|keystore|master)/i;
  const partialMaskKeyPattern =
    /(did|identity_id|wallet_id|from_wallet|to_address|tx_hash|hash|public_key|node_id)/i;

  const maskMiddle = (value: string, head = 8, tail = 6): string => {
    if (value.length <= head + tail + 3) return '[REDACTED]';
    return `${value.slice(0, head)}...${value.slice(-tail)}`;
  };

  const redactString = (value: string): string => {
    let redacted = value;

    // DID format
    redacted = redacted.replace(
      /did:zhtp:[a-f0-9]{16,}/gi,
      match => `did:zhtp:${maskMiddle(match.replace(/^did:zhtp:/i, ''), 6, 4)}`,
    );

    // Long hex identifiers (identity IDs, wallet IDs, hashes, signatures)
    redacted = redacted.replace(
      /\b[a-f0-9]{32,}\b/gi,
      match => maskMiddle(match, 8, 6),
    );

    // Long base64-like blobs (tokens/signatures)
    redacted = redacted.replace(
      /\b[A-Za-z0-9+/=]{48,}\b/g,
      match => maskMiddle(match, 8, 6),
    );

    return redacted;
  };

  const sanitizeValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
    if (value == null) return value;

    if (typeof value === 'string') {
      return redactString(value);
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactString(value.message),
        stack: value.stack ? redactString(value.stack) : undefined,
      };
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item, seen));
    }

    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (fullRedactKeyPattern.test(key)) {
        output[key] = '[REDACTED]';
      } else if (partialMaskKeyPattern.test(key)) {
        const raw = typeof val === 'string' ? val : String(val ?? '');
        output[key] = raw ? maskMiddle(redactString(raw), 8, 6) : raw;
      } else {
        output[key] = sanitizeValue(val, seen);
      }
    });

    return output;
  };

  const patch = (
    level: 'log' | 'info' | 'debug' | 'warn' | 'error' | 'trace',
  ) => {
    return (...args: unknown[]) => {
      const safeArgs = args.map(arg => sanitizeValue(arg));
      originalConsole[level](...safeArgs);
    };
  };

  console.log = patch('log');
  console.info = patch('info');
  console.debug = patch('debug');
  console.warn = patch('warn');
  console.error = patch('error');
  console.trace = patch('trace');
}
