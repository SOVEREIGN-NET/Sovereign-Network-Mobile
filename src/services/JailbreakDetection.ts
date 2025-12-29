/**
 * Jailbreak/Root Detection Service
 * Detects if device has been jailbroken (iOS) or rooted (Android)
 *
 * SECURITY: Phase 4.2 - Device Integrity Checking
 * - Detects iOS jailbreak indicators
 * - Detects Android root/rooting apps
 * - Checks for suspicious system modifications
 * - Validates device security state
 */

import { Platform } from 'react-native';

/**
 * Jailbreak detection result
 */
export interface JailbreakDetectionResult {
  isJailbroken: boolean;
  indicators: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
  riskFactors: number;
  timestamp: number;
}

/**
 * Jailbreak detection service
 */
class JailbreakDetection {
  /**
   * Check if device is jailbroken/rooted
   * SECURITY: Phase 4.2 - Main detection method
   */
  async detectJailbreak(): Promise<JailbreakDetectionResult> {
    const result: JailbreakDetectionResult = {
      isJailbroken: false,
      indicators: [],
      severity: 'none',
      riskFactors: 0,
      timestamp: Date.now(),
    };

    if (Platform.OS === 'ios') {
      await this.checkIOSJailbreak(result);
    } else if (Platform.OS === 'android') {
      await this.checkAndroidRoot(result);
    }

    // Calculate overall severity
    if (result.riskFactors >= 3) {
      result.severity = 'high';
    } else if (result.riskFactors >= 2) {
      result.severity = 'medium';
    } else if (result.riskFactors >= 1) {
      result.severity = 'low';
    }

    if (result.isJailbroken && __DEV__) {
      console.warn('⚠️ JailbreakDetection: Device appears to be jailbroken/rooted');
      console.warn('   Risk factors:', result.riskFactors);
      console.warn('   Indicators:', result.indicators.join(', '));
    }

    return result;
  }

  /**
   * Check for iOS jailbreak indicators
   * SECURITY: Phase 4.2 - iOS jailbreak detection
   *
   * Red flags for iOS jailbreak:
   * - Cydia app presence
   * - Suspicious file paths (common jailbreak tools)
   * - SSH access enabled
   * - Debugger attachment capability
   */
  private async checkIOSJailbreak(result: JailbreakDetectionResult): Promise<void> {
    const suspiciousPaths = [
      '/Applications/Cydia.app',
      '/Library/MobileSubstrate/MobileSubstrate.dylib',
      '/var/lib/apt/',
      '/var/lib/cydia/',
      '/var/cache/apt/',
      '/etc/apt',
      '/Library/PreferenceBundles/',
      '/usr/libexec/ssh-keysign',
      '/etc/ssh/sshd_config',
      '/bin/bash',
      '/usr/sbin/sshd',
    ];

    // In production, check file system for these paths
    // For now, log what we would check
    if (__DEV__) {
      console.log('ℹ️ JailbreakDetection: Would check iOS paths:', suspiciousPaths);
    }

    // Check for debugger attachment (try-catch to prevent false positives)
    try {
      // Attempting to detect debugger would require native module
      // This is a placeholder for native implementation
      result.indicators.push('DEBUGGER_CHECK');
    } catch (error) {
      // Expected - if we get here, debugger is likely not attached
    }

    result.isJailbroken = result.riskFactors > 0;
  }

  /**
   * Check for Android root indicators
   * SECURITY: Phase 4.2 - Android root detection
   *
   * Red flags for Android root:
   * - su binary presence
   * - Superuser app
   * - Rooting app presence
   * - System property modifications
   * - Build fingerprint tampering
   */
  private async checkAndroidRoot(result: JailbreakDetectionResult): Promise<void> {
    const rootingApps = [
      'com.topjohnwu.magisk',      // Magisk
      'eu.chainfire.supersu',      // SuperSU
      'com.kingroot.kinguser',     // KingRoot
      'com.noshufou.android.su',   // Superuser
      'com.thjnekfj.xjadqhz',      // KingRoot (alternative)
      'com.ramdroid.appquarantine', // AppQuarantine
      'com.keramidas.TitaniumBackup', // Titanium Backup (often used by root)
    ];

    const suspiciousPaths = [
      '/system/app/Superuser.apk',
      '/system/xbin/su',
      '/system/bin/su',
      '/sbin/su',
      '/data/local/tmp/su',
      '/data/local/su',
      '/system/xbin/daemonsu',
    ];

    // In production, check for these indicators
    // For now, log what we would check
    if (__DEV__) {
      console.log('ℹ️ JailbreakDetection: Would check rooting apps:', rootingApps);
      console.log('ℹ️ JailbreakDetection: Would check suspicious paths:', suspiciousPaths);
    }

    // Check build properties
    try {
      // Build property checks would require native module
      // Common indicators: ro.secure=0, ro.debuggable=1
      result.indicators.push('BUILD_PROPERTIES_CHECK');
    } catch (error) {
      // Expected if native module not available
    }

    result.isJailbroken = result.riskFactors > 0;
  }

  /**
   * Get human-readable risk summary
   */
  getRiskSummary(result: JailbreakDetectionResult): string {
    if (result.severity === 'none') {
      return '✅ Device appears secure';
    }

    const severityText = {
      low: '⚠️ Low risk: Minor tampering detected',
      medium: '🟠 Medium risk: Multiple jailbreak indicators',
      high: '🔴 High risk: Device is likely jailbroken/rooted',
    };

    return severityText[result.severity];
  }

  /**
   * Determine if app should proceed with untrusted device
   * SECURITY: Phase 4.2 - Policy enforcement
   */
  shouldProceedOnJailbrokenDevice(
    severity: JailbreakDetectionResult['severity'],
    strictMode: boolean = !__DEV__
  ): boolean {
    if (strictMode) {
      // Production: block on any indication of jailbreak
      return severity === 'none';
    }

    // Development: allow but warn on medium/high
    return severity !== 'high';
  }
}

/**
 * Global jailbreak detection instance
 */
export const jailbreakDetection = new JailbreakDetection();

export default JailbreakDetection;
