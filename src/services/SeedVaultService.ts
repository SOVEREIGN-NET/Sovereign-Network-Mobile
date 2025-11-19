import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';

const VAULT_SERVICE = 'SeedVault';
const VAULT_USERNAME = 'seed_phrase';

const BASE_SECURE_OPTIONS: Keychain.Options = {
  service: VAULT_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  accessControl:
    Platform.OS === 'ios'
      ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
      : Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
  securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
};

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

  await Keychain.setGenericPassword(VAULT_USERNAME, payload, BASE_SECURE_OPTIONS);
}

async function getSeedPhrase(): Promise<string[] | null> {
  const credentials = await Keychain.getGenericPassword({
    ...BASE_SECURE_OPTIONS,
    authenticationPrompt: AUTH_PROMPT,
    authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
  });

  if (!credentials) {
    return null;
  }

  return deserialize(credentials.password);
}

async function clearSeedPhrase(): Promise<void> {
  await Keychain.resetGenericPassword({ service: VAULT_SERVICE });
}

const SeedVaultService = {
  isSecureStorageAvailable,
  saveSeedPhrase,
  getSeedPhrase,
  clearSeedPhrase,
};

export default SeedVaultService;
