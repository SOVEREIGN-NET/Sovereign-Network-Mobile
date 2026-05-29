/**
 * Username validation — mirrors the server's `validate_username` rules
 * so bad input is rejected before any network call. Shared by the
 * username-claim modal and the registration flow.
 */

/** Names the server refuses regardless of availability. */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'root',
  'system',
  'node',
  'validator',
  'council',
  'treasury',
  'null',
  'undefined',
  'test',
  'zhtp',
  'sovereign',
]);

/**
 * Validate a username against the network rules. Returns an error
 * message string, or `null` when the username is well-formed.
 */
export function validateUsername(input: string): string | null {
  const u = input.trim();
  if (u.length < 3) return 'At least 3 characters.';
  if (u.length > 32) return 'Maximum 32 characters.';
  if (!/^[a-z0-9_]+$/.test(u)) {
    return 'Only lowercase letters, digits, and underscore.';
  }
  if (u.startsWith('_') || u.endsWith('_')) {
    return 'Cannot start or end with underscore.';
  }
  if (RESERVED_USERNAMES.has(u)) return 'That name is reserved.';
  return null;
}
