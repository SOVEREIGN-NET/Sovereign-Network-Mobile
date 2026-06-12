/**
 * Authentication Context
 * Manages global auth state for the app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import SeedVaultService from '../services/SeedVaultService';
import { rateLimiter } from '../services/RateLimiter';
import MockAuthService from '../services/MockAuthService';
import type { Identity } from '../types/identity';
import type { CreateIdentityData } from '../services/RealAuthService';
import { walletKeychainService } from '../services/WalletKeychainService';
import { nativeIdentityProvisioning } from '../services/NativeIdentityProvisioning';
import IdentityCleanup from '../services/IdentityCleanup';
import {
  claimUsername as claimUsernameOnChain,
  fetchIdentityRecord,
} from '../services/RealAuthService';
import { publishKyberKeyBestEffort } from '../services/KyberKeyService';
import {
  ingestEnvelopes,
  receivePending,
  resumeInboundOnForeground,
  setSelfDid as setMessagingSelfDid,
  stopInboundSubscription,
} from '../services/MessagingService';
import {
  bindIdentity as bindQuicIdentity,
} from '../services/QuicSessionManager';
import { isNativeQuicSessionAvailable } from '../services/NativeQuicSession';
import { resubscribeIfOptedIn } from '../services/NotificationsService';
import {
  fireDailyCheckin,
  fireWelcomeClaim,
} from '../services/RewardsService';
import {
  opaqueLogin,
  opaqueRegisterBegin,
  opaqueRegisterCancel,
  opaqueRegisterComplete,
} from '../services/LobbyAuthService';
import {
  clearLobbySession,
  loadLobbySession,
  saveLobbySession,
} from '../services/LobbySessionStore';
import type { LobbySession } from '../types/lobby';
import { maskIdentifier } from '../utils/maskIdentifier';
import { isValidDid } from '../utils/didValidator';

// Always import RealAuthService, use it when node is available
import RealAuthServiceModule from '../services/RealAuthService';

// Use real auth service instance
const RealAuthService = RealAuthServiceModule;

// Use native storage on Android, AsyncStorage on iOS
const storage = Platform.OS === 'android' ? NativeStorage : AsyncStorage;
const MIGRATION_REQUIRED_KEY = 'sovnet_migration_required';
const MIGRATION_REQUIRED_REASON_KEY = 'sovnet_migration_required_reason';

function isSecureStorageUnavailableError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();

  // Heuristic match for common secure storage failures (device not secured, keystore reset, etc).
  return (
    message.includes('cryptofailedexception') ||
    message.includes('keystore') ||
    message.includes('strongbox') ||
    message.includes('secure hardware') ||
    message.includes('authentication tag verification failed') ||
    message.includes('user not authenticated') ||
    message.includes('biometry') ||
    message.includes('biometric') ||
    (message.includes('keychain') && message.includes('unavailable'))
  );
}

// Create context for feature flag management
type UseMockServiceListener = (useMock: boolean) => void;
const mockServiceListeners = new Set<UseMockServiceListener>();

let cachedUseMockService: boolean | null = null;

/**
 * Get current feature flag state (mock vs real data)
 */
export function getUseMockService(): boolean {
  if (cachedUseMockService === null) {
    return false;
  }
  return cachedUseMockService;
}

/**
 * Set feature flag state (called from Developer Settings)
 */
export function setUseMockService(_value: boolean): void {
  // Mock mode is disabled across all builds.
  const enforcedValue = false;
  if (cachedUseMockService !== enforcedValue) {
    cachedUseMockService = enforcedValue;
    storage.removeItem('zhtp_use_mock_service').catch(err =>
      console.warn('Failed to clear mock service setting:', err),
    );
    notifyMockServiceListeners(enforcedValue);
  }
}

/**
 * Subscribe to feature flag changes
 */
export function onMockServiceChange(listener: UseMockServiceListener): () => void {
  mockServiceListeners.add(listener);
  return () => {
    mockServiceListeners.delete(listener);
  };
}

/**
 * Notify listeners of mock service flag change
 */
function notifyMockServiceListeners(value: boolean): void {
  mockServiceListeners.forEach(listener => {
    listener(value);
  });
}

/**
 * Initialize the mock service flag from storage
 */
async function initializeMockServiceFlag(): Promise<void> {
  try {
    // Clear stale mock flag — mock is now opt-in only via Settings
    await storage.removeItem('zhtp_use_mock_service');
    cachedUseMockService = false;
  } catch (err) {
    console.warn('Failed to initialize mock service setting:', err);
    cachedUseMockService = false;
  }
}

// Initialize on module load
initializeMockServiceFlag();

export interface AuthContextType {
  currentIdentity: Identity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isBootstrapping: boolean;
  migrationRequired: boolean;
  error: string | null;
  restoreWarning: string | null;
  signIn: (identity_id: string, password: string) => Promise<Identity>;
  createIdentity: (data: CreateIdentityData) => Promise<Identity>;
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  recoverIdentity: (method: string, data: string) => Promise<Identity>;
  migrateIdentityFromSeed: (displayName: string, seedPhrase: string) => Promise<{ identity: Identity; newSeedPhrase: string[] }>;
  forceCleanupAndSignOut: (reason?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  clearRestoreWarning: () => void;
  updateProfile: (displayName: string, avatar?: string) => Promise<void>;
  updatePassphrase: (newPassphrase: string) => Promise<void>;
  updateBiometric: (enabled: boolean) => Promise<void>;
  setCurrentIdentity: (identity: Identity) => Promise<void>;
  // On-demand identity loading (with biometric prompt when accessing protected features)
  loadIdentityOnDemand: () => Promise<Identity | null>;
  // SECURITY: Phase 3.1 - Biometric authentication methods
  isBiometricAvailable: () => Promise<boolean>;
  getBiometryType: () => Promise<string | null>;
  // Wallet seed management (server-generated, stored securely in Keychain)
  getMasterSeedPhrase: () => Promise<string | null>;
  // Username claim — one-shot, surfaced via `needsUsernameClaim`.
  // `claimUsername` POSTs `/api/v1/identity/claim-username` and, on
  // success, mirrors the new username + display_name into the local
  // identity. Throws QuicError on validation / conflict errors so the
  // modal can surface them.
  needsUsernameClaim: boolean;
  claimUsername: (username: string) => Promise<void>;
  // ─── OPAQUE username/password auth ─────────────────────────────────
  // The OPAQUE credential is the mandatory online login. The wallet
  // (DID + Dilithium key) is created alongside it at registration and
  // restored from the seed phrase on a new device.
  /** The active OPAQUE password session, or null when signed out. */
  lobbySession: LobbySession | null;
  /**
   * Full registration: OPAQUE register (username/password) + wallet
   * creation + login. Returns the identity + seed words for the backup
   * screen, which finishes by calling `setCurrentIdentity`.
   */
  registerAccount: (
    displayName: string,
    password: string,
    identityType: string,
  ) => Promise<{ identity: Identity; seedPhrases: string[] }>;
  /**
   * Sign in with username + password (OPAQUE login). Returns the wallet
   * identity when its key is on this device (and sets it as current);
   * returns null when the key is absent — the caller routes to
   * `RecoverIdentity` to restore it from the seed phrase.
   */
  passwordSignIn: (
    username: string,
    password: string,
  ) => Promise<Identity | null>;
  /**
   * Migrate a legacy (argon2id) account: re-register its OPAQUE
   * credential against the existing on-device wallet, then sign in.
   */
  upgradeLegacyAccount: (
    username: string,
    password: string,
  ) => Promise<Identity | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth Provider Component
 * Wraps the app and provides auth state and methods to all children
 */
/**
 * Pull `display_name` (and `username`) from the on-chain identity
 * registry and merge into the cached identity. Called after the auth
 * flow has bound the QUIC session — `fetchIdentityRecord` is an
 * authenticated call. Persists the merged identity so the next launch
 * starts from the right name; returns the merged identity for the
 * caller to push into React state.
 *
 * Best-effort: a network failure or absent `display_name` leaves the
 * identity untouched. Never throws.
 */
async function hydrateIdentityFromChain(identity: Identity): Promise<Identity> {
  if (!identity?.did) return identity;
  const record = await fetchIdentityRecord(identity.did);
  if (!record) return identity;

  const next: Identity = { ...identity };
  let dirty = false;

  if (
    typeof record.display_name === 'string' &&
    record.display_name.length > 0 &&
    record.display_name !== identity.displayName
  ) {
    next.displayName = record.display_name;
    dirty = true;
  }

  // Mirror the chain's `username` so the modal can detect a missing
  // claim. `username` is set once via `/api/v1/identity/claim-username`
  // and immutable; chain-empty means the user still needs to claim.
  if (record.username !== identity.username) {
    next.username = record.username;
    dirty = true;
  }

  if (!dirty) return identity;

  try {
    await SecureIdentityStorage.setIdentity(next, { requireBiometric: false });
  } catch (e) {
    console.warn('[AuthContext] Failed to persist hydrated identity:', e);
    // Return the in-memory updated identity anyway — UI shows the
    // right name even if persistence failed.
  }
  return next;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null);
  const [lobbySession, setLobbySession] = useState<LobbySession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  // Carries password from createIdentity() across the async seed phrase confirmation
  // to setIdentity() where login credentials are persisted for local sign-in + OS autofill.
  const pendingPasswordRef = useRef<string | null>(null);

  const setMigrationRequiredFlag = useCallback(async (reason?: string) => {
    setMigrationRequired(true);
    await AsyncStorage.setItem(MIGRATION_REQUIRED_KEY, '1');
    if (reason) {
      await AsyncStorage.setItem(MIGRATION_REQUIRED_REASON_KEY, reason);
    }
  }, []);

  const clearMigrationRequiredFlag = useCallback(async () => {
    setMigrationRequired(false);
    await AsyncStorage.removeItem(MIGRATION_REQUIRED_KEY);
    await AsyncStorage.removeItem(MIGRATION_REQUIRED_REASON_KEY);
  }, []);

  /**
   * Restore identity from secure storage on app load
   * SECURITY: Uses Keychain-backed storage instead of plaintext AsyncStorage
   * Note: Does not require biometric on startup - user can unlock Keychain later when needed
   *
   * SECURITY: Also restores lib-client Identity to handle store for UHP signing
   */
  useEffect(() => {
    const restoreIdentity = async () => {
      try {
        const migrationFlag = await AsyncStorage.getItem(MIGRATION_REQUIRED_KEY);
        if (migrationFlag) {
          setMigrationRequired(true);
          await IdentityCleanup.cleanAllIdentities();
          setCurrentIdentity(null);
          return;
        }

        // Restore the OPAQUE password session so a signed-in user stays
        // signed in across launches.
        try {
          const lobby = await loadLobbySession();
          if (lobby) {
            setLobbySession(lobby);
            if (__DEV__) {
              console.log('[AuthContext.bootstrap] OPAQUE session restored');
            }
          }
        } catch (e) {
          console.warn('[AuthContext.bootstrap] session restore failed:', e);
        }

        // Try to restore cached identity without biometric prompt on startup
        // This keeps user logged in between app sessions
        const identity = await SecureIdentityStorage.getIdentityIfAvailable(true);

        if (identity) {
          // Reject a malformed DID before it taints every downstream
          // URL builder (wallet/list/{did}, token/balances/{did}, etc).
          // Older versions of this app wrote display-form strings
          // (e.g. `did:zhtp:abc...def`) into Keychain during failed
          // recover paths; any such entry blows the server's hex
          // parser with "Odd number of digits". Forced-clean lets
          // the user re-recover from a clean slate.
          const didCheck = isValidDid(identity.did);
          if (!didCheck.valid) {
            console.warn(
              '[AuthContext.bootstrap] Stored identity has invalid DID:',
              didCheck.error,
              '— wiping and forcing sign-in',
            );
            try {
              await SecureIdentityStorage.clearIdentity();
            } catch (e) {
              console.warn(
                '[AuthContext.bootstrap] clearIdentity failed:',
                e,
              );
            }
            setCurrentIdentity(null);
            return;
          }
          if (__DEV__) {
            console.log('✅ Restored identity from secure storage:', identity.displayName);
          }
          setCurrentIdentity(identity);

          // Restore lib-client Identity handle for signing (tokens, domains, UHP)
          if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
            try {
              const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
                identity.identityId
              );
              if (__DEV__) {
                console.log('[AuthContext.bootstrap] Handle store restore:', result?.status);
              }
            } catch (err) {
              console.warn('[AuthContext.bootstrap] Handle store restore failed:', err);
            }
          }

          // Refresh display_name from the chain on every cold start.
          // Cached identity in Keychain can be days/weeks old — the
          // user's on-chain name may have been corrected (e.g. they
          // re-registered or migrated) since the last cache write.
          // Best-effort, fire-and-forget so the bootstrap finishes
          // promptly even if the hydration call hangs on slow QUIC.
          (async () => {
            try {
              const hydrated = await hydrateIdentityFromChain(identity);
              if (hydrated !== identity) {
                setCurrentIdentity(hydrated);
              }
            } catch (e) {
              console.warn('[AuthContext.bootstrap] Hydration failed:', e);
            }
          })();

          // TODO(messaging-chain-stall): remove once the chain
          // reliably commits IdentityUpdate transactions. Right now
          // the chain on g1 is stalled, so a single publish during
          // recovery sits in mempool and never persists to
          // identity_registry. Re-firing on every cold-start keeps
          // the server's in-memory state warm enough that
          // /msg/session/init can resolve our kyber_pk between
          // sessions. Costs one auth'd POST per launch — drop this
          // call (and the matching one in signIn below) once the
          // chain advances past height 898 and the original publish
          // commits.
          void publishKyberKeyBestEffort('rotate');
        }
      } catch (err) {
        console.error('Failed to restore cached identity:', err);
        // Continue with no identity if restore fails
      } finally {
        setIsBootstrapping(false);
      }
    };

    restoreIdentity();
  }, []);

  /**
   * Sign in with identity_id and password
   * SECURITY: Uses SecureIdentityStorage + rate limiting to prevent brute force
   */
  const signIn = useCallback(async (identity_id: string, password: string): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      const normalizedIdentityId = identity_id.trim();
      // SECURITY: Check rate limiting before attempting login
      const rateLimitStatus = rateLimiter.isBlocked(normalizedIdentityId);
      if (rateLimitStatus.blocked) {
        const errorMessage = rateLimitStatus.reason || 'Too many login attempts. Please try again later.';
        setError(errorMessage);
        throw new Error(errorMessage);
      }

      let identity: Identity;
      const useMock = getUseMockService();
      console.log(`[AuthContext.signIn] Using ${useMock ? 'MOCK' : 'REAL'} auth service`);

      if (useMock) {
        identity = await MockAuthService.signIn({ did: normalizedIdentityId, passphrase: password });
      } else {
        identity = await RealAuthService!.signIn({ identity_id: normalizedIdentityId, password });
      }

      // Success: Clear rate limit attempts
      rateLimiter.clearAttempts(normalizedIdentityId);

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          if (result?.status === 'restored') {
            setRestoreWarning(null);
            console.log('[AuthContext.signIn] ✅ Identity restored to handle store:', result);
          } else if (result?.status === 'skipped') {
            const message = `Handle store restore skipped: ${result.reason}${
              result.error ? ` (${result.error})` : ''
            }`;
            setRestoreWarning(message);
            console.warn('[AuthContext.signIn] ⚠️ Handle store restore skipped:', result);
          } else {
            console.log('[AuthContext.signIn] ℹ️ Handle store restoration result:', result);
          }
        } catch (err) {
          console.error('[AuthContext.signIn] ⚠️ Failed to restore Identity to handle store:', err);
          setRestoreWarning('Handle store restore failed');
          // Non-fatal - continue anyway
        }
      }

      // Refresh display_name from the on-chain identity record. Has
      // to fire after handle store + setIdentity so the auth-injected
      // QUIC call is properly bound. Updates state + persists if the
      // chain has a different (or non-empty) name.
      const hydrated = await hydrateIdentityFromChain(identity);
      if (hydrated !== identity) {
        setCurrentIdentity(hydrated);
        identity = hydrated;
      }

      // TODO(messaging-chain-stall): see matching comment in the
      // bootstrap effect above. Republish kyber_pk on every sign-in
      // to keep messaging working while the chain is stalled at
      // height 898 and the original publish from recovery sits in
      // mempool. Remove once the chain advances and the registry
      // entry persists across sessions.
      void publishKyberKeyBestEffort('rotate');

      return identity;
    } catch (err: any) {
      // SECURITY: Record failed attempt for rate limiting
      rateLimiter.recordAttempt(identity_id.trim());

      const message = err.message || 'Sign in failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new identity
   */
  const createIdentity = useCallback(async (data: CreateIdentityData): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (getUseMockService()) {
        const identityType: 'citizen' | 'organization' | 'developer' | 'validator' =
          data.identity_type as 'citizen' | 'organization' | 'developer' | 'validator';

        identity = await MockAuthService.createIdentity({
          displayName: data.display_name,
          passphrase: data.password,
          identityType: identityType || 'citizen',
          username: data.display_name.toLowerCase().replaceAll(/\s+/g, '_'),
          acceptedTerms: true,
        });
      } else {
        identity = await RealAuthService!.createIdentity(data);
      }

      // Stash password for later storage when setIdentity() is called
      // after the user confirms their seed phrase
      pendingPasswordRef.current = data.password;

      // Don't save to storage or set as currentIdentity yet
      // The CreateIdentityScreen will show the master seed phrase first
      // Only save to storage after user confirms via SeedPhraseScreen
      return identity;
    } catch (err: any) {
      const message = err.message || 'Identity creation failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if a username is available
   */
  const checkUsernameAvailability = useCallback(async (username: string): Promise<boolean> => {
    if (getUseMockService()) {
      return MockAuthService.checkUsernameAvailability(username);
    }
    return RealAuthService.checkUsernameAvailability(username);
  }, []);

  /**
   * Recover identity using various methods
   */
  const recoverIdentity = useCallback(async (method: string, data: string): Promise<Identity> => {
    setError(null);
    setIsLoading(true);

    try {
      let identity: Identity;

      if (getUseMockService()) {
        if (method === 'seed') {
          identity = await MockAuthService.recoverWithSeed(data);
        } else if (method === 'backup') {
          const [fileContent, password] = data.split('|||');
          identity = await MockAuthService.recoverWithBackup(fileContent, password);
        } else if (method === 'social') {
          // Parse guardian IDs from JSON string
          const guardianIds = JSON.parse(data) as string[];
          identity = await MockAuthService.recoverWithSocial(guardianIds);
        } else {
          throw new Error('Unknown recovery method');
        }
      } else if (method === 'seed') {
        identity = await RealAuthService.recoverWithSeed(data);
      } else if (method === 'backup') {
        const [fileContent, password] = data.split('|||');
        identity = await RealAuthService.recoverWithBackup(fileContent, password);
      } else if (method === 'social') {
        // Parse guardian IDs from JSON string
        const guardianIds = JSON.parse(data) as string[];
        identity = await RealAuthService.recoverWithSocial(guardianIds);
      } else {
        throw new Error('Unknown recovery method');
      }

      if (method === 'seed' && RealAuthService.getLastSeedRecoveryNotFound()) {
        await setMigrationRequiredFlag('seed_recovery_not_found');
        setCurrentIdentity(null);
        throw new Error('MIGRATION_REQUIRED');
      }

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
      if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
        try {
          const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
            identity.identityId
          );
          if (result?.status === 'restored') {
            setRestoreWarning(null);
            console.log('[AuthContext.recoverIdentity] ✅ Identity restored to handle store:', result);
          } else if (result?.status === 'skipped') {
            const message = `Handle store restore skipped: ${result.reason}${
              result.error ? ` (${result.error})` : ''
            }`;
            setRestoreWarning(message);
            console.warn('[AuthContext.recoverIdentity] ⚠️ Handle store restore skipped:', result);
          } else {
            console.log('[AuthContext.recoverIdentity] ℹ️ Handle store restoration result:', result);
          }
        } catch (err) {
          console.error('[AuthContext.recoverIdentity] ⚠️ Failed to restore Identity to handle store:', err);
          setRestoreWarning('Handle store restore failed');
          // Non-fatal - continue anyway
        }
      }

      // Publish the freshly-derived Kyber pk on-chain. Has to fire
      // here (not inside RealAuthService.recoverWithSeed) because the
      // /update-kyber-key call is auth'd — the identity_id cache it
      // depends on isn't populated until SecureIdentityStorage.setIdentity
      // above has resolved AND the handle store has the matching
      // Identity. Best-effort: failure logs a warning and doesn't
      // block the recovery flow.
      void publishKyberKeyBestEffort('recover');

      // Pull the on-chain display_name. Recovery from seed restores
      // crypto only — the username lives in the chain registry, so
      // we fetch it explicitly and update + persist if it differs.
      const hydrated = await hydrateIdentityFromChain(identity);
      if (hydrated !== identity) {
        setCurrentIdentity(hydrated);
        identity = hydrated;
      }

      return identity;
    } catch (err: any) {
      const message = err.message || 'Identity recovery failed';
      if (message.includes('MIGRATION_REQUIRED')) {
        await setMigrationRequiredFlag('seed_recovery_not_found');
        setCurrentIdentity(null);
        setError(null);
        throw err;
      }
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setMigrationRequiredFlag]);

  /**
   * Manually set the current identity
   * Used after saving identity to storage (e.g., after seed phrase confirmation)
   * SECURITY: Uses SecureIdentityStorage instead of plaintext AsyncStorage
   * Also ensures lib-client Identity is available in handle store for signing
   */
  const setIdentity = useCallback(async (identity: Identity) => {
    try {
      if (__DEV__) {
        console.log('🔐 AuthContext.setIdentity: Saving identity:', maskIdentifier(identity.did));
      }
      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(identity, { requireBiometric: false });

      // Save login credentials for local sign-in + OS autofill
      // Validate DID format first — react-native-keychain AES-CBC can silently corrupt on retrieval
      if (pendingPasswordRef.current && identity.did &&
          /^did:zhtp:[0-9a-f]{64}$/.test(identity.did)) {
        await SecureIdentityStorage.saveLoginCredentials(identity.did, pendingPasswordRef.current);
        pendingPasswordRef.current = null;
      }

      setCurrentIdentity(identity);

      // SECURITY: Restore lib-client Identity to handle store for UHP signing
        if (identity.identityId && NativeModules.NativeIdentityProvisioning) {
          try {
            const result = await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
              identity.identityId
            );
            if (result?.status === 'restored') {
              setRestoreWarning(null);
              console.log('[AuthContext.setIdentity] ✅ Identity restored to handle store:', result);
            } else if (result?.status === 'skipped') {
              const message = `Handle store restore skipped: ${result.reason}${
                result.error ? ` (${result.error})` : ''
              }`;
              setRestoreWarning(message);
              console.warn('[AuthContext.setIdentity] ⚠️ Handle store restore skipped:', result);
            } else {
              console.log('[AuthContext.setIdentity] ℹ️ Handle store restoration result:', result);
            }
          } catch (err) {
            console.error('[AuthContext.setIdentity] ⚠️ Failed to restore Identity to handle store:', err);
            setRestoreWarning('Handle store restore failed');
            // Non-fatal - continue anyway
          }
        }

      // Publish the Kyber pk on-chain — this hook covers the
      // create-identity path (post-seed-confirmation, which lands here
      // via the seed-phrase confirmation screen). Sign-in calls
      // SecureIdentityStorage.setIdentity directly and skips this
      // function, so it won't fire on every login. Best-effort.
      void publishKyberKeyBestEffort('register');

      // Hydrate display_name from the chain. For freshly-registered
      // identities the chain row has the name we just sent in the
      // create flow, so this is usually a no-op — but it covers the
      // case where the registration race set a different on-chain
      // name (e.g. the user's previous identity_registry record from
      // a prior install was preserved).
      const hydrated = await hydrateIdentityFromChain(identity);
      if (hydrated !== identity) {
        setCurrentIdentity(hydrated);
      }
    } catch (err: any) {
      const message = err.message || 'Failed to set identity';
      setError(message);
      throw err;
    }
  }, []);

  const migrateIdentityFromSeed = useCallback(async (
    displayName: string,
    seedPhrase: string
  ): Promise<{ identity: Identity; newSeedPhrase: string[] }> => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await RealAuthService.migrateIdentityFromSeed(displayName, seedPhrase);
      // Persist identity to secure storage but DON'T set currentIdentity yet.
      // MigrationSeedScreen navigates to SeedPhraseScreen which calls setCurrentIdentity
      // after the user confirms their seed phrase. Setting it here would trigger
      // navigation away from AuthNavigator before the user sees the seed.
      await SecureIdentityStorage.setIdentity(result.identity, { requireBiometric: false });
      await clearMigrationRequiredFlag();
      return result;
    } catch (err: any) {
      const message = err.message || 'Migration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [clearMigrationRequiredFlag]);

  /**
   * Update user profile (display name, avatar)
   */
  const updateProfile = useCallback(async (displayName: string, avatar?: string) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const updatedIdentity = {
        ...currentIdentity,
        displayName,
        avatar: avatar || currentIdentity.avatar,
      };

      // Save to secure storage (Keychain) instead of plaintext AsyncStorage
      await SecureIdentityStorage.setIdentity(updatedIdentity);
      setCurrentIdentity(updatedIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update profile';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Update passphrase
   */
  const updatePassphrase = useCallback(async (_newPassphrase: string) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // In real app, this would hash and save to backend
      // For mock, we just update locally
      const updatedIdentity = {
        ...currentIdentity,
        // Mark that passphrase was updated (don't actually store it)
      };

      await storage.setItem('zhtp_identity', JSON.stringify(updatedIdentity));
      setCurrentIdentity(updatedIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update passphrase';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Update biometric setting
   * When enabled: Requires biometric (Face ID, Touch ID, etc.) to access private keys
   * When disabled: Only requires device unlock to access private keys
   */
  const updateBiometric = useCallback(async (enabled: boolean) => {
    if (!currentIdentity) {
      setError('No identity to update');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      console.log(`[AuthContext] ${enabled ? 'Enabling' : 'Disabling'} biometric protection`);

      // Re-save identity with new biometric setting
      // This triggers SecureIdentityStorage to update Keychain access control
      await SecureIdentityStorage.setIdentity(currentIdentity, {
        requireBiometric: enabled,
        accessibleAfterFirstUnlock: true,
      });

      console.log(`[AuthContext] ✅ Biometric ${enabled ? 'enabled' : 'disabled'}`);
      // Identity doesn't change, just storage settings
      setCurrentIdentity(currentIdentity);
    } catch (err: any) {
      const message = err.message || 'Failed to update biometric setting';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentIdentity]);

  /**
   * Sign out (clear identity)
   * SECURITY: Clears both Keychain and AsyncStorage
   */
  const signOut = useCallback(async () => {
    setError(null);
    setRestoreWarning(null);
    setIsLoading(true);

    try {
      // Clear from secure storage (Keychain and AsyncStorage)
      await SecureIdentityStorage.clearIdentity();
      setCurrentIdentity(null);
      // Also end the OPAQUE password session.
      await clearLobbySession();
      setLobbySession(null);
    } catch (err: any) {
      const message = err.message || 'Sign out failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forceCleanupAndSignOut = useCallback(async (reason?: string) => {
    setError(null);
    setRestoreWarning(null);
    setIsLoading(true);
    try {
      await setMigrationRequiredFlag(reason);
      await IdentityCleanup.cleanAllIdentities();
      setCurrentIdentity(null);
    } catch (err: any) {
      const message = err.message || 'Cleanup failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setMigrationRequiredFlag]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearRestoreWarning = useCallback(() => {
    setRestoreWarning(null);
  }, []);

  /**
   * Load identity on-demand when user needs to access protected features
   * This shows biometric prompt at the time of access, not on app startup
   * If user denies biometric or Keychain access, returns null (user can retry)
   */
  const loadIdentityOnDemand = useCallback(async (): Promise<Identity | null> => {
    try {
      if (currentIdentity) {
        // Already loaded
        return currentIdentity;
      }

      console.log('[AuthContext] Loading identity on-demand (may prompt for biometric)...');
      const identity = await SecureIdentityStorage.getIdentity();
      if (identity) {
        console.log('[AuthContext] ✅ Identity loaded on-demand');
        setCurrentIdentity(identity);
        // Sync backup with latest identity (ensures backup stays current)
        await SecureIdentityStorage.syncBackup(identity).catch(() => {
          // Non-fatal - backup sync failure shouldn't block operation
        });
        return identity;
      }
      console.log('[AuthContext] ⚠️ No identity found');
      return null;
    } catch (err: any) {
      // User may have cancelled biometric prompt - this is not an error
      const errorMsg = err.message || String(err);
      if (errorMsg.includes('cancelled') || errorMsg.includes('denied') || errorMsg.includes('unavailable')) {
        console.log('[AuthContext] User cancelled biometric authentication:', errorMsg);
        return null;
      }
      console.error('[AuthContext] Failed to load identity on-demand:', err);
      return null;
    }
  }, [currentIdentity]);

  /**
   * SECURITY: Phase 3.1 - Check if biometric authentication is available
   * Returns true if device supports biometric (Face ID, Touch ID, Fingerprint, Iris, etc.)
   */
  const isBiometricAvailable = useCallback(async (): Promise<boolean> => {
    return SeedVaultService.enableBiometricAuth();
  }, []);

  /**
   * SECURITY: Phase 3.1 - Get the type of biometry available on device
   * Returns: 'FaceID', 'TouchID', 'Iris', 'Fingerprint', or null if unavailable
   */
  const getBiometryType = useCallback(async (): Promise<string | null> => {
    return SeedVaultService.getBiometryType();
  }, []);

  const getMasterSeedPhrase = useCallback(async (): Promise<string | null> => {
    try {
      let secureStorageUnavailable = false;

      // 1. Wallet keychain (identity-specific seed storage)
      if (currentIdentity?.identityId) {
        try {
          const stored = await walletKeychainService.retrieveMasterSeedPhrase(currentIdentity.identityId);
          if (stored) {
            return stored;
          }
        } catch (err) {
          secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(err);
        }
      }

      // 2. SeedVaultService (biometric-protected vault in react-native-keychain)
      try {
        const vault = await SeedVaultService.getSeedPhraseWithBiometric();
        if (vault) {
          return vault.join(' ');
        }
      } catch (err) {
        secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(err);
        if (!isSecureStorageUnavailableError(err)) {
          // Non-storage error (user cancelled biometric prompt, etc.) — re-throw
          throw err;
        }
        // Vault invalidated (keystore reset, biometrics changed) — fall through to native fallback
        console.warn('[AuthContext] Seed vault invalidated, trying native identity store fallback');
      }

      // 3. Native fallback: derive seed from identity stored in native secure storage
      //    Android: EncryptedSharedPreferences (AES-256-GCM via MasterKey — NOT affected by
      //             biometric vault invalidation, unlike react-native-keychain's AES-CBC vault)
      //    iOS: IdentityHandleStore / cached identities
      //
      //    This resolves the chicken-and-egg problem where the vault is invalidated
      //    but the user needs the seed to recover their identity.
      const identityIdOrDid = currentIdentity?.identityId
        || currentIdentity?.did
        || (NativeModules.NativeIdentityProvisioning
          ? await NativeModules.NativeIdentityProvisioning.getCurrentIdentityDid().catch(() => null)
          : null);

      if (identityIdOrDid) {
        // Android primary: getSeedPhraseFromStoredIdentity reads from EncryptedSharedPreferences
        if (Platform.OS === 'android') {
          try {
            const phrase = await nativeIdentityProvisioning.getSeedPhraseFromStoredIdentity(identityIdOrDid);
            if (phrase) {
              return phrase;
            }
          } catch (fallbackError) {
            console.warn('[AuthContext] getSeedPhraseFromStoredIdentity failed:', fallbackError);
            secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(fallbackError);
          }
        }

        // Cross-platform: getSeedPhraseForBackup from handle store / cached identities
        try {
          const phrase = await nativeIdentityProvisioning.getSeedPhraseForBackup(identityIdOrDid);
          if (phrase) {
            return phrase;
          }
        } catch (fallbackError) {
          console.warn('[AuthContext] getSeedPhraseForBackup failed:', fallbackError);
          secureStorageUnavailable = secureStorageUnavailable || isSecureStorageUnavailableError(fallbackError);
        }
      }

      if (secureStorageUnavailable) {
        throw new Error(
          'Could not retrieve seed phrase from this device. '
          + 'If you have your 24-word seed phrase written down, enter it manually to recover.'
        );
      }

      return null;
    } catch (err: any) {
      console.error('[AuthContext] Failed to retrieve master seed phrase:', err);
      throw err;
    }
  }, [currentIdentity?.identityId]);

  // ─── Messaging plumbing ──────────────────────────────────────────────
  //
  // The messaging service keeps a "live self DID" used by every
  // REST call (session/init, send). It also hydrates the
  // encrypted-at-rest store keyed by that DID. Wiring it here means
  // the inbox is ready by the time the user opens the Bubl tab,
  // and a sign-out properly tears the store down.
  useEffect(() => {
    setMessagingSelfDid(currentIdentity?.did ?? null);
    bindQuicIdentity(currentIdentity?.did ?? null);
  }, [currentIdentity?.did]);

  // Defensive re-subscribe to release announcements. The notifications
  // subscriber list is per-validator and not replicated, so a member
  // who opted in on the Bubl tab can quietly fall off the list after a
  // validator failover or a launch that lands on a different node.
  // Firing here — once per identity activation, i.e. effectively once
  // per launch — silently re-asserts the subscription if (and only if)
  // this device previously opted in with the active DID. Idempotent,
  // best-effort, never throws.
  useEffect(() => {
    void resubscribeIfOptedIn(currentIdentity?.did ?? null);
  }, [currentIdentity?.did]);

  // BUBL rewards — auto-fire the lifecycle claims. `welcome` runs once
  // per launch on identity activation (the service backs off and
  // retries, since a just-created identity may not be on-chain yet);
  // `daily_checkin` runs on activation and on every foreground, with
  // the service collapsing repeats within a UTC day. Both are
  // best-effort and never throw — the rewards node is the authority.
  useEffect(() => {
    const did = currentIdentity?.did;
    if (!did) return;
    void fireWelcomeClaim(did);
    void fireDailyCheckin(did);
    const sub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next === 'active') void fireDailyCheckin(did);
      },
    );
    return () => sub.remove();
  }, [currentIdentity?.did]);

  // Server-push inbound stream — one long-lived `/msg/inbound`
  // subscription rides the persistent QUIC session, replacing the
  // legacy 5 s `/msg/receive` poll. Server pushes envelope frames
  // the moment they're routable, so messages arrive without
  // polling latency and without burning a PQC handshake per tick.
  //
  // Lifecycle: open once when the identity is set. We deliberately
  // do NOT close on background transitions — the server's
  // `register_subscriber` overwrites prior subscribers, so a
  // close-on-background / reopen-on-foreground cycle would race
  // the new openInbound against the OS resuming us and produce a
  // dead stream half the time. The QUIC connection survives short
  // backgrounds; if iOS / Android actually tears it down, the
  // reader thread will emit `QuicInboundClosed` and the
  // MessagingService onClosed callback resets state so the next
  // `startInboundSubscription` call reopens. The bridge layer in
  // `MessagingService` coalesces concurrent calls.
  //
  // On foreground we still kick a one-shot `/msg/receive` drain
  // in case something landed in the deposit store while we were
  // away (the inbound stream couldn't deliver, server fell back
  // to deposit). The drain is idempotent — `ingestEnvelopes`
  // de-dupes by `(timestamp, sequence)` per sender.
  useEffect(() => {
    const did = currentIdentity?.did;
    if (!did) return;

    let cancelled = false;
    const drainAndResume = (forceCycle: boolean) => {
      if (cancelled) return;
      void (async () => {
        try {
          const r = await receivePending();
          if (r.count > 0) {
            console.log(
              '[AuthContext] one-shot deposit drain got',
              r.count,
              'envelopes',
            );
            await ingestEnvelopes(r.messages);
          }
        } catch (e) {
          console.warn('[AuthContext] deposit drain failed:', e);
        }
        // Subscription itself is owned by messaging screens via
        // `registerInboundConsumer` — AuthContext no longer kicks the
        // persistent push stream on startup, so an unmounted messaging
        // UI doesn't spam `getSession failed: openFailed` while the
        // upstream handshake bug remains. Foreground transitions
        // still resume any active consumer's subscription (force=true
        // path) so a backgrounded chat keeps working.
        if (!cancelled && isNativeQuicSessionAvailable && forceCycle) {
          resumeInboundOnForeground();
        }
      })();
    };

    drainAndResume(false);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      // On foreground we drain the deposit store AND resume the push
      // stream (if any consumer is registered) so we're not stuck on a
      // phantom subscriber the OS tore down during suspension. The
      // brief no-subscriber window between the cycle and the new
      // register is covered by the drain above — anything that lands
      // then sits in deposit.
      if (next === 'active') drainAndResume(true);
    });

    return () => {
      cancelled = true;
      stopInboundSubscription();
      sub.remove();
    };
  }, [currentIdentity?.did]);

  // ─── Username claim ─────────────────────────────────────────────────
  //
  // Show the claim modal only when the user has NEITHER a chain
  // `username` NOR any `displayName` set. Existing users who picked
  // a display name through the legacy create-identity flow still
  // have a usable on-screen name even without a `username` —
  // forcing them through the modal would block them from their app.
  // The modal is reserved for genuinely-unnamed identities (e.g.
  // freshly-recovered with no chain display_name).
  const hasUsername =
    currentIdentity?.username != null && currentIdentity.username !== '';
  const hasDisplayName =
    currentIdentity?.displayName != null && currentIdentity.displayName !== '';
  const needsUsernameClaim =
    currentIdentity !== null && !hasUsername && !hasDisplayName;

  const claimUsername = useCallback(
    async (username: string): Promise<void> => {
      const id = currentIdentity;
      if (!id) throw new Error('No signed-in identity');
      const result = await claimUsernameOnChain(username);
      // Server response is canonical for the claimed username AND
      // updates display_name. Mirror both locally.
      const next: Identity = {
        ...id,
        username: result.username,
        displayName: result.username,
      };
      try {
        await SecureIdentityStorage.setIdentity(next, { requireBiometric: false });
      } catch (e) {
        console.warn(
          '[AuthContext] Failed to persist identity after username claim:',
          e,
        );
      }
      setCurrentIdentity(next);
    },
    [currentIdentity],
  );

  // ─── OPAQUE username/password auth ───────────────────────────────────

  /** Persist + activate a freshly established OPAQUE session. */
  const adoptLobbySession = useCallback(async (session: LobbySession) => {
    await saveLobbySession(session);
    setLobbySession(session);
  }, []);

  /**
   * Load the wallet identity for `did` from this device's native
   * stores. Returns null when the key is not present (a new device) —
   * the caller then restores it from the seed phrase.
   */
  const loadLocalWallet = useCallback(
    async (did: string, username: string): Promise<Identity | null> => {
      const local = await nativeIdentityProvisioning
        .getLocalIdentity(did)
        .catch(() => null);
      if (
        !local ||
        local.status !== 'found' ||
        !local.identity_id ||
        !local.did
      ) {
        return null;
      }
      return {
        identityId: local.identity_id,
        did: local.did,
        displayName: username,
        identityType: (local.identity_type ||
          'human') as Identity['identityType'],
        deviceId: local.device_id,
        createdAt: local.created_at,
      };
    },
    [],
  );

  const registerAccount = useCallback(
    async (
      displayName: string,
      password: string,
      identityType: string,
    ): Promise<{ identity: Identity; seedPhrases: string[] }> => {
      setError(null);
      setIsLoading(true);
      const username = displayName
        .trim()
        .toLowerCase()
        .replaceAll(/\s+/g, '_');
      // Reserve the username + run the OPAQUE first leg before creating
      // a wallet — a taken name fails here, leaving nothing behind.
      const handle = await opaqueRegisterBegin({ username, password });
      // Track the wallet so we can roll it back fully if OPAQUE
      // register/finish or login fails. Without this, a failure
      // mid-registration leaves the native wallet + Keychain
      // identity behind, and the next launch's bootstrap restores
      // a "signed in" account with no server-side credential.
      let createdIdentity: Identity | null = null;
      try {
        const identity = await createIdentity({
          display_name: displayName.trim(),
          password,
          identity_type: identityType,
        });
        createdIdentity = identity;
        // register/finish rides the authenticated ALPN, so the wallet
        // identity must be in SecureIdentityStorage (DID cache) before
        // it runs. `createIdentity` populates only the native stores.
        await SecureIdentityStorage.setIdentity(identity, {
          requireBiometric: false,
        });
        // Wire the QUIC session manager to the freshly-created
        // identity. We can't set `currentIdentity` yet — the user
        // still needs to confirm the seed phrase, and setting it
        // here would short-circuit the navigation to SeedPhrase.
        // But register/finish is an authenticated call, so without
        // this explicit bind it errors with "no identity bound".
        // `setCurrentIdentity` later will see the same DID and
        // re-bind is a no-op.
        bindQuicIdentity(identity.did);
        // Make sure the lib-client Identity handle is in the
        // platform handle store — UHP signing on the authenticated
        // request needs it. `createIdentity` usually leaves the
        // handle live, but restore is idempotent and cheap.
        if (
          identity.identityId &&
          NativeModules.NativeIdentityProvisioning
        ) {
          try {
            await NativeModules.NativeIdentityProvisioning.restoreIdentityToHandleStore(
              identity.identityId,
            );
          } catch (e) {
            console.warn(
              '[AuthContext.registerAccount] handle store restore failed:',
              e,
            );
          }
        }
        await opaqueRegisterComplete(handle, password, identity.did);
        const session = await opaqueLogin({ username, password });
        await adoptLobbySession(session);
        // Persist the username on-chain too, so the claim modal never
        // fires for a freshly-registered account. Best-effort.
        try {
          await claimUsernameOnChain(username);
        } catch (e) {
          console.warn(
            '[AuthContext] claim-username after register failed:',
            e,
          );
        }
        const seedPhrases = (identity.masterSeedPhrase ?? '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        return { identity, seedPhrases };
      } catch (err: any) {
        await opaqueRegisterCancel(handle).catch(() => {});
        // Roll the wallet back too if `createIdentity` already ran.
        // Otherwise the native wallet + Keychain identity survive
        // the failure and the next bootstrap restores a half-
        // registered account (no OPAQUE credential on the server).
        if (createdIdentity) {
          bindQuicIdentity(null);
          await SecureIdentityStorage.clearIdentity().catch(() => {});
          await SecureIdentityStorage.clearLoginCredentials().catch(
            () => {},
          );
          if (createdIdentity.identityId) {
            await IdentityCleanup.cleanSpecificIdentity(
              createdIdentity.identityId,
            ).catch((cleanupErr) => {
              console.warn(
                '[AuthContext.registerAccount] rollback cleanup failed:',
                cleanupErr,
              );
            });
          }
        }
        setError(err?.message || 'Registration failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createIdentity, adoptLobbySession],
  );

  const passwordSignIn = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<Identity | null> => {
      setError(null);
      setIsLoading(true);
      try {
        const normalized = username.trim().toLowerCase();
        const session = await opaqueLogin({
          username: normalized,
          password,
        });
        await adoptLobbySession(session);
        const identity = await loadLocalWallet(
          session.did,
          session.username,
        );
        if (identity) {
          await setIdentity(identity);
          return identity;
        }
        // OPAQUE-authenticated, but the wallet key is not on this
        // device — caller routes to seed-phrase recovery.
        return null;
      } catch (err: any) {
        setError(err?.message || 'Sign-in failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [adoptLobbySession, loadLocalWallet, setIdentity],
  );

  const upgradeLegacyAccount = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<Identity | null> => {
      setError(null);
      setIsLoading(true);
      try {
        // Upgrading a legacy account re-registers its OPAQUE credential
        // against the existing wallet DID — which must be on this
        // device for register/finish to authenticate.
        const did = await SecureIdentityStorage.getIdentityId();
        if (!did) {
          throw new Error(
            'Restore your wallet on this device before upgrading this account.',
          );
        }
        const normalized = username.trim().toLowerCase();
        const handle = await opaqueRegisterBegin({
          username: normalized,
          password,
        });
        try {
          await opaqueRegisterComplete(handle, password, did);
        } catch (err) {
          await opaqueRegisterCancel(handle);
          throw err;
        }
        // Credential re-registered — sign in normally.
        const session = await opaqueLogin({
          username: normalized,
          password,
        });
        await adoptLobbySession(session);
        const identity = await loadLocalWallet(
          session.did,
          session.username,
        );
        if (identity) {
          await setIdentity(identity);
          return identity;
        }
        return null;
      } catch (err: any) {
        setError(err?.message || 'Account upgrade failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [adoptLobbySession, loadLocalWallet, setIdentity],
  );

  const value = useMemo<AuthContextType>(() => ({
    currentIdentity,
    isAuthenticated: currentIdentity !== null,
    isLoading,
    isBootstrapping,
    migrationRequired,
    error,
    restoreWarning,
    signIn,
    createIdentity,
    checkUsernameAvailability,
    recoverIdentity,
    migrateIdentityFromSeed,
    forceCleanupAndSignOut,
    signOut,
    clearError,
    clearRestoreWarning,
    updateProfile,
    updatePassphrase,
    updateBiometric,
    setCurrentIdentity: setIdentity,
    loadIdentityOnDemand,
    isBiometricAvailable,
    getBiometryType,
    getMasterSeedPhrase,
    needsUsernameClaim,
    claimUsername,
    lobbySession,
    registerAccount,
    passwordSignIn,
    upgradeLegacyAccount,
  }), [
    currentIdentity,
    isLoading,
    isBootstrapping,
    migrationRequired,
    error,
    restoreWarning,
    signIn,
    createIdentity,
    checkUsernameAvailability,
    recoverIdentity,
    migrateIdentityFromSeed,
    forceCleanupAndSignOut,
    signOut,
    clearError,
    clearRestoreWarning,
    updateProfile,
    updatePassphrase,
    updateBiometric,
    setIdentity,
    loadIdentityOnDemand,
    isBiometricAvailable,
    getBiometryType,
    getMasterSeedPhrase,
    needsUsernameClaim,
    claimUsername,
    lobbySession,
    registerAccount,
    passwordSignIn,
    upgradeLegacyAccount,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
