/**
 * Runtime Application Self-Protection (RASP)
 * Detects and prevents runtime security threats at the application level
 *
 * SECURITY: Phase 4.1 - Runtime Protection
 * - Detects code injection attempts
 * - Monitors for tampering indicators
 * - Validates critical function calls
 * - Prevents unsafe eval/exec
 */

/**
 * RASP threat detection results
 */
export interface RASPThreatDetection {
  detected: boolean;
  threatType?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  timestamp: number;
}

/**
 * Runtime protection service
 */
class RuntimeProtection {
  private detectedThreats: RASPThreatDetection[] = [];
  private readonly maxThreatsBeforeBlock = 5;
  private readonly threatTimeWindow = 60000; // 1 minute

  /**
   * Check if code injection is being attempted
   * SECURITY: Phase 4.1 - Code injection detection
   */
  detectCodeInjection(input: string): RASPThreatDetection {
    const injectionPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout.*eval/gi,
      /setInterval.*eval/gi,
      /exec\s*\(/gi,
      /spawn\s*\(/gi,
      /child_process/gi,
      /require\s*\(\s*["'].*["']\s*\)/gi,
    ];

    const isInjectionAttempt = injectionPatterns.some(pattern => pattern.test(input));

    const result: RASPThreatDetection = {
      detected: isInjectionAttempt,
      threatType: 'CODE_INJECTION',
      severity: isInjectionAttempt ? 'critical' : undefined,
      message: isInjectionAttempt
        ? '❌ Code injection attempt detected - request blocked'
        : undefined,
      timestamp: Date.now(),
    };

    if (isInjectionAttempt) {
      this.recordThreat(result);
      console.error(`🚨 RASP: ${result.message}`, input);
    }

    return result;
  }

  /**
   * Detect prototype pollution attempts
   * SECURITY: Phase 4.1 - Prototype pollution detection
   */
  detectPrototypePollution(obj: any): RASPThreatDetection {
    const prototypePollutionKeys = ['__proto__', 'constructor', 'prototype'];

    let isPollutionAttempt = false;

    try {
      if (typeof obj === 'object' && obj !== null) {
        isPollutionAttempt = prototypePollutionKeys.some(
          key => key in obj && typeof obj[key] === 'object'
        );
      }
    } catch (error) {
      console.warn('⚠️ RASP: Error checking prototype pollution:', error);
    }

    const result: RASPThreatDetection = {
      detected: isPollutionAttempt,
      threatType: 'PROTOTYPE_POLLUTION',
      severity: isPollutionAttempt ? 'high' : undefined,
      message: isPollutionAttempt
        ? '❌ Prototype pollution attempt detected'
        : undefined,
      timestamp: Date.now(),
    };

    if (isPollutionAttempt) {
      this.recordThreat(result);
      console.error(`🚨 RASP: ${result.message}`, obj);
    }

    return result;
  }

  /**
   * Detect cryptographic key tampering
   * SECURITY: Phase 4.1 - Key integrity checking
   */
  validateKeyIntegrity(key: string, expectedHash?: string): RASPThreatDetection {
    // Simple checksum validation - in production use crypto
    const checksum = this.simpleChecksum(key);

    const isTampered = expectedHash ? checksum !== expectedHash : false;

    const result: RASPThreatDetection = {
      detected: isTampered,
      threatType: 'KEY_TAMPERING',
      severity: isTampered ? 'critical' : undefined,
      message: isTampered
        ? '❌ Cryptographic key tampering detected'
        : undefined,
      timestamp: Date.now(),
    };

    if (isTampered) {
      this.recordThreat(result);
      console.error(`🚨 RASP: ${result.message}`);
    }

    return result;
  }

  /**
   * Check if attack threshold has been exceeded
   * SECURITY: Phase 4.1 - Behavioral analysis
   */
  isAttackInProgress(): boolean {
    const now = Date.now();
    const recentThreats = this.detectedThreats.filter(
      threat => now - threat.timestamp < this.threatTimeWindow
    );

    const criticalThreats = recentThreats.filter(t => t.severity === 'critical').length;
    const highThreats = recentThreats.filter(t => t.severity === 'high').length;

    // Escalate on critical threats or too many high threats
    if (criticalThreats > 0) {
      console.error(`🚨 RASP: CRITICAL threat detected - ${criticalThreats} in last minute`);
      return true;
    }

    if (highThreats > this.maxThreatsBeforeBlock) {
      console.error(`🚨 RASP: Attack pattern detected - ${highThreats} threats in last minute`);
      return true;
    }

    return false;
  }

  /**
   * Prevent unsafe global function calls
   * SECURITY: Phase 4.1 - Global function protection
   */
  preventUnsafeEval(): void {
    // Override global eval - prevent code execution
    const unsafeError = new Error(
      'eval() is disabled for security reasons'
    );

    // @ts-ignore - intentional global override
    global.eval = () => {
      this.recordThreat({
        detected: true,
        threatType: 'UNSAFE_EVAL',
        severity: 'critical',
        message: '❌ Attempt to call eval() blocked',
        timestamp: Date.now(),
      });
      throw unsafeError;
    };

    if (__DEV__) {
      console.log('✅ RASP: eval() protection enabled');
    }
  }

  /**
   * Validate JSON input for malicious content
   * SECURITY: Phase 4.1 - JSON validation
   */
  validateJSONInput(input: string): RASPThreatDetection {
    let hasMaliciousContent = false;

    try {
      const obj = JSON.parse(input);

      // Check for prototype pollution in parsed JSON
      const pollutionCheck = this.detectPrototypePollution(obj);
      if (pollutionCheck.detected) {
        return pollutionCheck;
      }

      // Check for large arrays (potential DOS)
      if (Array.isArray(obj) && obj.length > 100000) {
        hasMaliciousContent = true;
      }

      // Check for deeply nested objects (potential DOS)
      if (this.getMaxDepth(obj) > 50) {
        hasMaliciousContent = true;
      }
    } catch (error) {
      // Invalid JSON is not a security threat, just invalid
      return {
        detected: false,
        timestamp: Date.now(),
      };
    }

    const result: RASPThreatDetection = {
      detected: hasMaliciousContent,
      threatType: 'MALICIOUS_JSON',
      severity: hasMaliciousContent ? 'high' : undefined,
      message: hasMaliciousContent
        ? '❌ Malicious JSON structure detected'
        : undefined,
      timestamp: Date.now(),
    };

    if (hasMaliciousContent) {
      this.recordThreat(result);
      console.error(`🚨 RASP: ${result.message}`);
    }

    return result;
  }

  /**
   * Get threat history for monitoring
   */
  getThreatHistory(minutes: number = 5): RASPThreatDetection[] {
    const cutoff = Date.now() - minutes * 60000;
    return this.detectedThreats.filter(threat => threat.timestamp > cutoff);
  }

  /**
   * Clear threat history
   */
  clearThreatHistory(): void {
    this.detectedThreats = [];
  }

  /**
   * Private helpers
   */
  private recordThreat(threat: RASPThreatDetection): void {
    this.detectedThreats.push(threat);

    // Clean up old threats
    const cutoff = Date.now() - 5 * 60000; // 5 minutes
    this.detectedThreats = this.detectedThreats.filter(
      t => t.timestamp > cutoff
    );
  }

  private simpleChecksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private getMaxDepth(obj: any, currentDepth: number = 0): number {
    if (typeof obj !== 'object' || obj === null) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const depth = this.getMaxDepth(obj[key], currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }
}

/**
 * Global RASP instance
 */
export const runtimeProtection = new RuntimeProtection();

export default RuntimeProtection;
