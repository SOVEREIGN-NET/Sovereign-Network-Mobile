/**
 * DID (Decentralized Identifier) Validator
 * Validates Sovereign Network DID format and provides normalization utilities
 *
 * SECURITY: Enforces strict DID format validation to prevent invalid recipient addresses
 * Format: did:zhtp:<64-character-hex>
 * Example: did:zhtp:a1b2c3d4e5f6...
 */

/**
 * Validation result for DID validation
 */
export interface DidValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * DID parsing result
 */
export interface DidComponents {
  method: string;
  identifier: string;
}

/**
 * Validate Sovereign Network DID format
 * Expected format: did:zhtp:<64-character-hex>
 *
 * SECURITY: Use strict validation to prevent injection attacks
 *
 * @param did - The DID to validate
 * @returns Validation result with error message if invalid
 */
export function isValidDid(did: string): DidValidationResult {
  if (!did || typeof did !== 'string') {
    return { valid: false, error: 'DID must be a non-empty string' };
  }

  // Strict regex: exactly "did:zhtp:" followed by 64 hex characters
  const didRegex = /^did:zhtp:[a-f0-9]{64}$/i;

  if (!didRegex.test(did)) {
    return {
      valid: false,
      error: 'Invalid DID format. Expected: did:zhtp:<64-character-hex>',
    };
  }

  // Additional validation: verify hex characters only after prefix
  const hexPart = did.substring(9); // "did:zhtp:" = 9 characters
  if (!/^[a-f0-9]{64}$/i.test(hexPart)) {
    return {
      valid: false,
      error: 'DID contains invalid characters. Only hexadecimal allowed.',
    };
  }

  return { valid: true };
}

/**
 * Parse DID into components
 * Extracts the method (zhtp) and identifier (hex string)
 *
 * @param did - The DID to parse
 * @returns Object with method and identifier, or null if invalid
 */
export function parseDid(did: string): DidComponents | null {
  const match = did.match(/^did:(\w+):(.+)$/);
  if (!match) return null;

  return {
    method: match[1],
    identifier: match[2],
  };
}

/**
 * Normalize DID input (handle common user mistakes)
 * - Trims whitespace
 * - Converts to lowercase
 * - Handles bare hex strings by adding DID prefix
 *
 * SECURITY: Only auto-add prefix for valid 64-char hex to prevent ambiguity
 *
 * @param input - Raw user input
 * @returns Normalized DID string
 */
export function normalizeDid(input: string): string {
  let normalized = input.trim().toLowerCase();

  // If it's just a 64-character hex value (without DID prefix), add the prefix
  if (/^[a-f0-9]{64}$/.test(normalized)) {
    normalized = `did:zhtp:${normalized}`;
  }

  return normalized;
}

/**
 * Validate and normalize a recipient address in one step
 * Useful for form validation with automatic normalization
 *
 * @param input - Raw user input
 * @returns Object with normalized address (if valid) and validation result
 */
export function validateAndNormalizeDid(
  input: string
): DidValidationResult & { normalized?: string } {
  const normalized = normalizeDid(input);
  const validation = isValidDid(normalized);

  if (validation.valid) {
    return { ...validation, normalized };
  }

  return validation;
}

export default {
  isValidDid,
  parseDid,
  normalizeDid,
  validateAndNormalizeDid,
};
