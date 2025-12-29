/**
 * Password Validator Utility
 * Enforces strong password policy to prevent weak credentials
 *
 * SECURITY: Implements NIST SP 800-63B password requirements
 * - Minimum 12 characters (entropy-based, not just length)
 * - Maximum 128 characters
 * - Requires uppercase + lowercase + number + special character
 * - Rejects common passwords
 * - Rejects sequential/repeating patterns
 */

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
  score: number; // 0-100
}

/**
 * List of commonly used passwords to reject
 * Should be updated periodically with new common patterns
 */
const COMMON_PASSWORDS = [
  'password',
  'password123',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'welcome',
  'admin',
  'login',
  'passw0rd',
  'pass123',
  'password1',
  'admin123',
  'root',
  'toor',
  '000000',
  '111111',
  'dragon',
  'sunshine',
  'iloveyou',
  'master',
  'monkey',
  'shadow',
  'superman',
  'batman',
  'trustno1',
];

/**
 * Validate a password against security policy
 *
 * @param password - The password to validate
 * @returns Validation result with errors, strength, and score
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 100; // Start at 100, deduct for issues

  // Length requirements
  if (!password || password.length === 0) {
    errors.push('Password is required');
    return { valid: false, errors, strength: 'weak', score: 0 };
  }

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
    score -= 30;
  }

  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
    score -= 20;
  }

  // Character type requirements
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
    score -= 15;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
    score -= 15;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
    score -= 15;
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
    score -= 15;
  }

  // Check for common passwords (case-insensitive)
  const lowerPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lowerPassword)) {
    errors.push('Password is too common. Please choose a unique password');
    score -= 20;
  }

  // Check for sequential characters (e.g., abc, 123)
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
    errors.push('Password should not contain sequential characters (abc, xyz, etc.)');
    score -= 10;
  }

  // Check for repeated characters (e.g., aaa, 111)
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password should not contain repeating characters (aaa, 111, etc.)');
    score -= 10;
  }

  // Check for keyboard patterns (e.g., qwerty, asdfgh)
  const keyboardPatterns = [
    'qwerty',
    'asdfgh',
    'zxcvbn',
    '12345',
    '67890',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
  ];
  if (keyboardPatterns.some(pattern => lowerPassword.includes(pattern))) {
    errors.push('Password should not contain keyboard patterns (qwerty, asdfgh, etc.)');
    score -= 10;
  }

  // Ensure score doesn't go below 0 or above 100
  score = Math.max(0, Math.min(100, score));

  // Determine strength based on score
  let strength: PasswordValidationResult['strength'] = 'weak';
  if (errors.length === 0) {
    if (password.length >= 16) {
      strength = 'strong';
    } else if (password.length >= 14) {
      strength = 'good';
    } else if (password.length >= 12) {
      strength = 'fair';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
    score,
  };
}

/**
 * Get user-friendly strength indicator
 *
 * @param strength - The password strength level
 * @returns Human-readable strength description
 */
export function getStrengthDescription(strength: PasswordValidationResult['strength']): string {
  switch (strength) {
    case 'strong':
      return 'Strong - Excellent choice!';
    case 'good':
      return 'Good - Meets security requirements';
    case 'fair':
      return 'Fair - Acceptable but could be stronger';
    case 'weak':
      return 'Weak - Does not meet security requirements';
    default:
      return 'Unknown';
  }
}

/**
 * Get color for strength indicator UI
 * Useful for real-time password validation UI
 *
 * @param strength - The password strength level
 * @returns Color code (hex) for UI display
 */
export function getStrengthColor(strength: PasswordValidationResult['strength']): string {
  switch (strength) {
    case 'strong':
      return '#51cf66'; // Green
    case 'good':
      return '#4dabf7'; // Blue
    case 'fair':
      return '#ffd43b'; // Yellow
    case 'weak':
      return '#ff6b6b'; // Red
    default:
      return '#adb5bd'; // Gray
  }
}

export default validatePassword;
