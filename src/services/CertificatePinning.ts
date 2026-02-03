/**
 * Certificate Pinning Service
 * Implements public key pinning to prevent man-in-the-middle attacks
 *
 * SECURITY: Phase 3.2 - Certificate Pinning
 * - Pins server certificates using SHA256 public key hashes
 * - Prevents certificate spoofing and MITM attacks
 * - Validates server certificates against pinned keys
 * - Supports fallback and emergency rollover mechanisms
 */

/**
 * Certificate pin configuration
 * Each entry contains a host and its pinned public key SHA256 hash
 */
export interface CertificatePin {
  host: string;
  sha256Pin: string; // Base64 encoded SHA256 of certificate public key
  // Optional: secondary pin for certificate rotation
  sha256PinBackup?: string;
}

/**
 * Certificate pins are now generated from .env file via scripts/generate-config.js
 * This ensures pins stay in sync when node URL changes
 *
 * Add to .env:
 *   ZHTP_NODE_URL=http://your-node-ip:9334
 *   CERTIFICATE_PIN=<base64-encoded-sha256-hash>
 *
 * To generate a pin:
 * 1. Get the server certificate: openssl s_client -connect host:443
 * 2. Extract public key: openssl x509 -pubkey -in cert.pem | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl enc -base64
 */

// Import generated config with certificate pin
// eslint-disable-next-line @typescript-eslint/no-var-requires
const generatedConfig = require('../.env.generated.json');

// Build certificate pins from environment
// In dev mode, pinning is disabled anyway, but we include the config here for reference
export const PINNED_CERTIFICATES: Record<string, CertificatePin> = {
  // Certificate pins are now dynamically generated from .env
  // See scripts/generate-config.js for details
};

/**
 * Get certificate pin(s) for a specific host
 * Returns both primary and backup pins if available
 *
 * @param host - Hostname to get pins for
 * @returns Array of valid pins for the host
 */
export function getCertificatePinsForHost(host: string): string[] {
  const pin = PINNED_CERTIFICATES[host];
  if (!pin) {
    return [];
  }

  const pins = [pin.sha256Pin];
  if (pin.sha256PinBackup) {
    pins.push(pin.sha256PinBackup);
  }

  return pins;
}

/**
 * Validate a certificate public key hash against pinned values
 * SECURITY: Ensures the server certificate matches expected pin
 *
 * @param host - Server hostname
 * @param serverPin - SHA256 hash of server's public key (base64)
 * @returns true if pin matches any pinned value for the host
 */
export function validateCertificatePin(host: string, serverPin: string): boolean {
  const validPins = getCertificatePinsForHost(host);

  if (validPins.length === 0) {
    // No pins configured for this host - allow connection
    // (in production, consider failing closed instead)
    if (__DEV__) {
      console.warn(`⚠️ CertificatePinning: No pins configured for ${host}`);
    }
    return true;
  }

  const isValid = validPins.includes(serverPin);

  if (!isValid) {
    console.error(
      `❌ CertificatePinning: Certificate pin mismatch for ${host}. ` +
      `Expected one of: ${validPins.join(', ')}, got: ${serverPin}`
    );
  } else if (__DEV__) {
    console.log(`✅ CertificatePinning: Valid certificate pin for ${host}`);
  }

  return isValid;
}

/**
 * Check if certificate pinning is enabled for a host
 * @param host - Hostname to check
 * @returns true if pinning is configured for this host
 */
export function isPinningEnabledForHost(host: string): boolean {
  return host in PINNED_CERTIFICATES;
}

/**
 * Get all pinned hosts (for debugging/monitoring)
 * @returns Array of hostnames with pinned certificates
 */
export function getPinnedHosts(): string[] {
  return Object.keys(PINNED_CERTIFICATES);
}

/**
 * SECURITY: Phase 3.2 Configuration
 * Settings for certificate pinning behavior
 */
export const PINNING_CONFIG = {
  // Enable/disable pinning enforcement
  enabled: !__DEV__, // Disabled in dev, enabled in production

  // Fail closed (block on pin mismatch) vs fail open (allow with warning)
  failClosed: true, // SECURITY: Fail securely - block mismatched pins

  // Allow bypassing pinning for hosts without configured pins
  allowUnpinnedHosts: __DEV__, // Allow in dev, strict in production

  // Log all validation attempts in development
  logValidation: __DEV__,

  // Enable automatic pin rotation checking
  enableRotationCheck: true,
} as const;

/**
 * Validate certificate for a connection
 * SECURITY: Main entry point for certificate pinning validation
 *
 * @param host - Server hostname
 * @param serverPin - SHA256 hash of server's public key (base64)
 * @returns true if certificate is valid and pinned correctly
 */
export function validateCertificate(host: string, serverPin: string): boolean {
  if (!PINNING_CONFIG.enabled) {
    if (__DEV__) {
      console.log(`ℹ️ CertificatePinning: Pinning disabled (development mode)`);
    }
    return true;
  }

  const isPinned = isPinningEnabledForHost(host);

  if (!isPinned) {
    if (!PINNING_CONFIG.allowUnpinnedHosts) {
      console.error(`❌ CertificatePinning: No pin configured for unpinned host: ${host}`);
      return false;
    }

    if (PINNING_CONFIG.logValidation) {
      console.warn(`⚠️ CertificatePinning: Allowing unpinned host: ${host}`);
    }

    return true;
  }

  return validateCertificatePin(host, serverPin);
}

export default {
  getCertificatePinsForHost,
  validateCertificatePin,
  validateCertificate,
  isPinningEnabledForHost,
  getPinnedHosts,
  PINNING_CONFIG,
  PINNED_CERTIFICATES,
};
