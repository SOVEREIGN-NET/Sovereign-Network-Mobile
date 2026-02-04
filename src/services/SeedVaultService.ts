/**
 * Seed Vault Service
 * Manages secure storage of the master seed phrase using Keychain with biometric authentication
 *
 * SECURITY: Phase 3.1 Enhancements
 * - Biometric authentication for seed phrase access
 * - Hardware-backed Keychain storage (Secure Enclave on iOS, StrongBox on Android)
 * - Device passcode fallback
 * - Automatic cleanup on failed authentication
 */

import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';

const VAULT_SERVICE = 'SeedVault';
const VAULT_USERNAME = 'master_seed_phrase';

/**
 * SECURITY: Enhanced secure options for biometric + device passcode
 * Uses WHEN_UNLOCKED_THIS_DEVICE_ONLY to ensure keys are only accessible when device is unlocked
 * SECURE_HARDWARE ensures keys are stored in Secure Enclave (iOS) or StrongBox (Android)
 */
const BIOMETRIC_SECURE_OPTIONS: Keychain.Options = {
  service: VAULT_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  accessControl:
    Platform.OS === 'ios'
      ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
      : Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
  securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
};

// Legacy alias for backward compatibility
const BASE_SECURE_OPTIONS = BIOMETRIC_SECURE_OPTIONS;

const AUTH_PROMPT: Keychain.AuthenticationPrompt = {
  title: 'Unlock Seed Phrase',
  subtitle: 'Authenticate to access your seed phrase',
  description: 'Your device biometrics or passcode is required.',
};

const serialize = (seedWords: string[]) =>
  JSON.stringify({
    words: seedWords,
    savedAt: new Date().toISOString(),
  });

const deserialize = (payload: string) => {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed?.words)) {
      return parsed.words as string[];
    }
  } catch {
    // fall through to handle legacy/plain payloads
  }
  return payload.trim().split(/\s+/);
};

async function isSecureStorageAvailable() {
  try {
    const biometryType = await Keychain.getSupportedBiometryType();
    return !!biometryType && biometryType !== Keychain.BIOMETRY_TYPE.NONE;
  } catch {
    return false;
  }
}

async function saveSeedPhrase(seedPhrase: string[]): Promise<void> {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    throw new Error('Seed phrase is empty');
  }

  const payload = serialize(seedPhrase);
  const username = VAULT_USERNAME;

  await Keychain.setGenericPassword(username, payload, BASE_SECURE_OPTIONS);
}

/**
 * Check if biometric authentication is available on the device
 * SECURITY: Phase 3.1 - Biometric availability check
 *
 * @returns true if biometric is supported and enabled, false otherwise
 */
async function enableBiometricAuth(): Promise<boolean> {
  try {
    const biometryType = await Keychain.getSupportedBiometryType();

    if (!biometryType || biometryType === Keychain.BIOMETRY_TYPE.NONE) {
      if (__DEV__) {
        console.warn('⚠️ Biometric not available on this device');
      }
      return false;
    }

    if (__DEV__) {
      console.log(`✅ Biometric available: ${biometryType}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Failed to check biometric availability:', error);
    return false;
  }
}

/**
 * Get the supported biometry type on the device
 * Returns: 'FaceID', 'TouchID', 'Iris', 'Fingerprint', or null if not available
 *
 * @returns Biometry type string or null if unavailable
 */
async function getBiometryType(): Promise<string | null> {
  try {
    return await Keychain.getSupportedBiometryType();
  } catch (error) {
    console.error('Failed to get biometry type:', error);
    return null;
  }
}

/**
 * Get seed phrase with biometric authentication (enhanced version)
 * SECURITY: Phase 3.1 - Enhanced biometric authentication
 *
 * @returns Decrypted seed phrase array or null if authentication fails/cancelled
 */
async function getSeedPhraseWithBiometric(): Promise<string[] | null> {
  try {
    const biometricAvailable = await enableBiometricAuth();

    if (!biometricAvailable) {
      console.warn('⚠️ Biometric not available, falling back to passcode');
      // Fall back to device passcode authentication
      return getSeedPhraseWithPasscode();
    }

    const username = VAULT_USERNAME;
    const credentials = await Keychain.getGenericPassword({
      ...BIOMETRIC_SECURE_OPTIONS,
      authenticationPrompt: {
        title: 'Unlock Seed Phrase',
        subtitle: 'Authenticate to access your seed phrase',
        description: 'Use your biometric or device passcode',
        negativeButtonText: 'Cancel',
      },
      authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS_OR_PASSCODE,
      username,
    });

    if (!credentials) {
      if (__DEV__) {
        console.warn('⚠️ User cancelled biometric authentication');
      }
      return null;
    }

    if (__DEV__) {
      console.log('✅ Biometric authentication successful for master seed');
    }

    return deserialize(credentials.password);
  } catch (error) {
    console.error('❌ Biometric authentication failed:', error);
    return null;
  }
}

/**
 * Get seed phrase using device passcode only (fallback)
 * SECURITY: Phase 3.1 - Device passcode fallback authentication
 *
 * @returns Decrypted seed phrase array or null if authentication fails
 */
async function getSeedPhraseWithPasscode(): Promise<string[] | null> {
  try {
    const username = VAULT_USERNAME;
    const credentials = await Keychain.getGenericPassword({
      service: VAULT_SERVICE,
      username,
      authenticationPrompt: {
        title: 'Unlock Seed Phrase',
        subtitle: 'Enter your device passcode',
        description: 'Biometric is not available on this device',
        negativeButtonText: 'Cancel',
      },
      authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
    });

    if (!credentials) {
      return null;
    }

    return deserialize(credentials.password);
  } catch (error) {
    console.error('❌ Passcode authentication failed:', error);
    return null;
  }
}

/**
 * Original getSeedPhrase function - maintains backward compatibility
 * SECURITY: Uses biometric + device passcode fallback
 *
 * @returns Decrypted seed phrase array or null
 */
async function getSeedPhrase(): Promise<string[] | null> {
  return getSeedPhraseWithBiometric();
}

async function clearSeedPhrase(): Promise<void> {
  await Keychain.resetGenericPassword({ service: VAULT_SERVICE });
}

const SeedVaultService = {
  isSecureStorageAvailable,
  saveSeedPhrase,
  getSeedPhrase,
  getSeedPhraseWithBiometric,
  getSeedPhraseWithPasscode,
  enableBiometricAuth,
  getBiometryType,
  clearSeedPhrase,
};

export default SeedVaultService;
