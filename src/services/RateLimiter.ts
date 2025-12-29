/**
 * Rate Limiter Service
 * Prevents brute force attacks by limiting failed login attempts
 *
 * SECURITY: Implements OWASP authentication best practice
 * - Max 5 failed attempts per identity
 * - 15-minute window for attempt tracking
 * - 30-minute lockout after max attempts exceeded
 */

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
}

interface RateLimitStatus {
  blocked: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export class RateLimiter {
  private attempts = new Map<string, AttemptRecord>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly lockoutMs = 30 * 60 * 1000; // 30 minutes after max exceeded

  /**
   * Check if a login identifier is currently rate limited
   *
   * @param identifier - The identity DID or username
   * @returns Rate limit status with blocking reason and retry time if blocked
   */
  isBlocked(identifier: string): RateLimitStatus {
    const record = this.attempts.get(identifier);

    // No attempts recorded - not blocked
    if (!record) {
      return { blocked: false };
    }

    const now = Date.now();
    const timeSinceFirstAttempt = now - record.firstAttempt;
    const timeSinceLastAttempt = now - record.lastAttempt;

    // Reset if window has passed (15 minutes since first attempt)
    if (timeSinceFirstAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return { blocked: false };
    }

    // Check if locked out (exceeded max attempts)
    if (record.count >= this.maxAttempts) {
      const timeSinceLockout = now - record.lastAttempt;

      // Still in lockout period (30 minutes since last attempt)
      if (timeSinceLockout < this.lockoutMs) {
        const remainingSeconds = Math.ceil((this.lockoutMs - timeSinceLockout) / 1000);
        return {
          blocked: true,
          reason: `Too many login attempts. Please try again in ${remainingSeconds} seconds.`,
          retryAfterSeconds: remainingSeconds,
        };
      } else {
        // Lockout period expired, reset attempts
        this.attempts.delete(identifier);
        return { blocked: false };
      }
    }

    // Under max attempts but some failed attempts exist
    const remainingAttempts = this.maxAttempts - record.count;
    if (remainingAttempts <= 2) {
      return {
        blocked: false,
        reason: `Warning: ${remainingAttempts} login attempts remaining`,
      };
    }

    return { blocked: false };
  }

  /**
   * Record a failed login attempt for an identifier
   *
   * @param identifier - The identity DID or username
   */
  recordAttempt(identifier: string): void {
    const record = this.attempts.get(identifier);
    const now = Date.now();

    if (!record) {
      // First failed attempt
      this.attempts.set(identifier, {
        count: 1,
        firstAttempt: now,
        lastAttempt: now,
      });
    } else {
      // Update existing attempt record
      record.count++;
      record.lastAttempt = now;

      if (__DEV__) {
        console.warn(`⚠️ Rate Limiter: ${record.count}/${this.maxAttempts} failed attempts for ${identifier}`);
      }
    }
  }

  /**
   * Clear failed attempts for an identifier (successful login)
   *
   * @param identifier - The identity DID or username
   */
  clearAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Get remaining attempts before lockout
   *
   * @param identifier - The identity DID or username
   * @returns Number of remaining attempts, or 0 if blocked
   */
  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);

    if (!record) {
      return this.maxAttempts;
    }

    const now = Date.now();
    const timeSinceFirstAttempt = now - record.firstAttempt;

    // Reset if window has passed
    if (timeSinceFirstAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return this.maxAttempts;
    }

    return Math.max(0, this.maxAttempts - record.count);
  }

  /**
   * Get all attempt records (for debugging/monitoring)
   * NOTE: Only use in development - sensitive data
   */
  getAllAttempts(): Record<string, AttemptRecord> {
    if (!__DEV__) {
      return {};
    }

    return Object.fromEntries(this.attempts);
  }
}

/**
 * Global rate limiter instance
 * One instance shared across all auth attempts
 */
export const rateLimiter = new RateLimiter();

export default RateLimiter;
