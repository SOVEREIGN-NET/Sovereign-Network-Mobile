/**
 * Security Event Logger
 * Logs and monitors security-related events for detection of attacks
 *
 * SECURITY: Phase 4.3 - Security Monitoring
 * - Logs authentication events
 * - Tracks failed attempts and attacks
 * - Records security policy violations
 * - Provides audit trail for compliance
 */

/**
 * Security event types
 */
export type SecurityEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILED'
  | 'AUTH_BLOCKED'
  | 'PASSWORD_POLICY_VIOLATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'JAILBREAK_DETECTED'
  | 'CERTIFICATE_VALIDATION_FAILED'
  | 'CODE_INJECTION_ATTEMPT'
  | 'KEY_ACCESS_DENIED'
  | 'BIOMETRIC_FAILED'
  | 'BIOMETRIC_ENROLLED'
  | 'DEVICE_BINDING_FAILED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'SECURITY_POLICY_VIOLATION'
  | 'API_SECURITY_ERROR';

/**
 * Security event severity levels
 */
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Security event record
 */
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: EventSeverity;
  timestamp: number;
  userId?: string;
  deviceId?: string;
  details: Record<string, any>;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
  };
}

/**
 * Security event logger service
 */
class SecurityEventLogger {
  private events: SecurityEvent[] = [];
  private readonly maxStoredEvents = 1000;
  private eventCallbacks: Array<(event: SecurityEvent) => void> = [];

  /**
   * Log a security event
   * SECURITY: Phase 4.3 - Core logging function
   */
  logEvent(
    type: SecurityEventType,
    severity: EventSeverity,
    details: Record<string, any>,
    userId?: string,
    deviceId?: string
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type,
      severity,
      timestamp: Date.now(),
      userId,
      deviceId,
      details,
    };

    // Add to in-memory log
    this.events.push(event);

    // Keep memory usage reasonable
    if (this.events.length > this.maxStoredEvents) {
      this.events.shift();
    }

    // Log based on severity
    this.logToConsole(event);

    // Notify listeners (for real-time monitoring)
    this.notifyListeners(event);

    // Persist critical events
    if (severity === 'critical' || severity === 'error') {
      this.persistEvent(event);
    }

    return event;
  }

  /**
   * Log authentication success
   */
  logAuthSuccess(userId: string, method: string, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'AUTH_SUCCESS',
      'info',
      { method, timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Log authentication failure
   */
  logAuthFailure(userId: string, reason: string, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'AUTH_FAILED',
      'warning',
      { reason, timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Log blocked authentication attempt (rate limiting)
   */
  logAuthBlocked(userId: string, reason: string, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'AUTH_BLOCKED',
      'error',
      { reason, attemptCount: 'multiple', timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Log password policy violation
   */
  logPasswordViolation(userId: string, violation: string, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'PASSWORD_POLICY_VIOLATION',
      'warning',
      { violation, timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Log jailbreak detection
   */
  logJailbreakDetected(severity: string, indicators: string[], deviceId?: string): SecurityEvent {
    return this.logEvent(
      'JAILBREAK_DETECTED',
      'critical',
      { severity, indicators, timestamp: Date.now() },
      undefined,
      deviceId
    );
  }

  /**
   * Log certificate validation failure
   */
  logCertificateValidationFailure(
    host: string,
    reason: string,
    deviceId?: string
  ): SecurityEvent {
    return this.logEvent(
      'CERTIFICATE_VALIDATION_FAILED',
      'critical',
      { host, reason, timestamp: Date.now() },
      undefined,
      deviceId
    );
  }

  /**
   * Log code injection attempt
   */
  logCodeInjectionAttempt(attempt: string, source?: string): SecurityEvent {
    return this.logEvent(
      'CODE_INJECTION_ATTEMPT',
      'critical',
      { attempt, source, timestamp: Date.now() },
      undefined,
      undefined
    );
  }

  /**
   * Log biometric authentication failure
   */
  logBiometricFailure(userId: string, reason: string, attempts: number, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'BIOMETRIC_FAILED',
      attempts > 3 ? 'error' : 'warning',
      { reason, attempts, timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(activity: string, details: Record<string, any>, userId?: string, deviceId?: string): SecurityEvent {
    return this.logEvent(
      'SUSPICIOUS_ACTIVITY',
      'warning',
      { activity, ...details, timestamp: Date.now() },
      userId,
      deviceId
    );
  }

  /**
   * Get events for analysis
   */
  getEvents(
    type?: SecurityEventType,
    severity?: EventSeverity,
    hoursBack: number = 24
  ): SecurityEvent[] {
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;

    return this.events.filter(event => {
      if (event.timestamp < cutoff) return false;
      if (type && event.type !== type) return false;
      if (severity && event.severity !== severity) return false;
      return true;
    });
  }

  /**
   * Get event summary statistics
   */
  getEventsSummary(hoursBack: number = 24): Record<string, number> {
    const events = this.getEvents(undefined, undefined, hoursBack);
    const summary: Record<string, number> = {};

    events.forEach(event => {
      summary[event.type] = (summary[event.type] || 0) + 1;
    });

    return summary;
  }

  /**
   * Get critical events
   */
  getCriticalEvents(hoursBack: number = 24): SecurityEvent[] {
    return this.getEvents(undefined, 'critical', hoursBack);
  }

  /**
   * Subscribe to security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): () => void {
    this.eventCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Export events for audit
   */
  exportEvents(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.events, null, 2);
    }

    // CSV format
    const headers = ['ID', 'Type', 'Severity', 'Timestamp', 'User', 'Device', 'Details'];
    const rows = this.events.map(event => [
      event.id,
      event.type,
      event.severity,
      new Date(event.timestamp).toISOString(),
      event.userId || '-',
      event.deviceId || '-',
      JSON.stringify(event.details),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }

  /**
   * Private helpers
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logToConsole(event: SecurityEvent): void {
    const emojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    const prefix = `${emojis[event.severity]} [${event.type}]`;

    if (event.severity === 'critical') {
      console.error(prefix, event.details);
    } else if (event.severity === 'error') {
      console.error(prefix, event.details);
    } else if (event.severity === 'warning') {
      console.warn(prefix, event.details);
    } else {
      if (__DEV__) {
        console.log(prefix, event.details);
      }
    }
  }

  private notifyListeners(event: SecurityEvent): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in security event callback:', error);
      }
    });
  }

  private persistEvent(event: SecurityEvent): void {
    // In production, this would persist to secure storage or a logging service
    if (__DEV__) {
      console.log('📊 SecurityEventLogger: Would persist event to secure storage', event);
    }
  }
}

/**
 * Global security event logger instance
 */
export const securityEventLogger = new SecurityEventLogger();

export default SecurityEventLogger;
