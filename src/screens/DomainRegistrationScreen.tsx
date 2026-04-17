/**
 * Domain Registration Screen
 * Register new .sov domains via QUIC endpoints
 * Minimal, elegant design consistent with TokenCreatorScreen
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, FormField, Text, LoadingView } from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import domainService from '../services/DomainService';
import { useAuth } from '../hooks/useAuth';
import {
  validateDomainFormat,
  validateDomainDuration,
  yearsToDays,
} from '../utils/domainValidation';

// Storage keys
const REGISTERED_DOMAINS_KEY = 'sov:registered_domains';

interface RegisterFormErrors {
  domain?: string;
  years?: string;
}

interface SubmitStatus {
  type: 'success' | 'error' | null;
  message: string;
}

interface DomainRegistrationScreenProps {
  onClose?: () => void;
}

const DomainRegistrationScreen: React.FC<DomainRegistrationScreenProps> = ({
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { currentIdentity, isBootstrapping, loadIdentityOnDemand } = useAuth();

  // FORM STATE
  const [domain, setDomain] = useState('');
  const [years, setYears] = useState('1');
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>({
    type: null,
    message: '',
  });
  const [availabilityStatus, setAvailabilityStatus] = useState<{
    available: boolean | null;
    checking: boolean;
    registrarFee?: number;
  }>({
    available: null,
    checking: false,
  });
  const [durationPickerVisible, setDurationPickerVisible] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [hasExistingDomain, setHasExistingDomain] = useState(false);
  const [resolvedIdentityDid, setResolvedIdentityDid] = useState<string | null>(
    currentIdentity?.did ?? null,
  );
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const identityLoadAttemptedRef = useRef(false);

  useEffect(() => {
    setResolvedIdentityDid(currentIdentity?.did ?? null);
  }, [currentIdentity?.did]);

  const ensureIdentityAvailable = useCallback(async (): Promise<string | null> => {
    if (isBootstrapping || resolvedIdentityDid) {
      return resolvedIdentityDid;
    }

    setIdentityLoading(true);
    setIdentityError(null);
    try {
      const identity = await loadIdentityOnDemand();
      if (identity?.did) {
        setResolvedIdentityDid(identity.did);
        return identity.did;
      } else {
        setIdentityError('Unlock identity to register domain');
      }
    } catch (error) {
      console.warn('[DomainRegistrationScreen] Failed to load identity:', error);
      setIdentityError('Unable to access identity');
    } finally {
      setIdentityLoading(false);
    }
    return null;
  }, [isBootstrapping, loadIdentityOnDemand, resolvedIdentityDid]);

  useEffect(() => {
    if (identityLoadAttemptedRef.current) {
      return;
    }
    if (isBootstrapping || resolvedIdentityDid) {
      return;
    }

    identityLoadAttemptedRef.current = true;
    ensureIdentityAvailable();
  }, [ensureIdentityAvailable, isBootstrapping, resolvedIdentityDid]);

  useEffect(() => {
    const loadExisting = async () => {
      try {
        if (!resolvedIdentityDid) {
          setHasExistingDomain(false);
          return;
        }
        const storedDomainsJson = await AsyncStorage.getItem(
          REGISTERED_DOMAINS_KEY,
        );
        const storedDomains = storedDomainsJson
          ? JSON.parse(storedDomainsJson)
          : [];
        const hasOwned = storedDomains.some(
          (d: DomainData) => d.owner === resolvedIdentityDid,
        );
        setHasExistingDomain(hasOwned);
      } catch {
        setHasExistingDomain(false);
      }
    };
    loadExisting();
  }, [resolvedIdentityDid]);

  // Validate registration form
  const validateForm = (): boolean => {
    const newErrors: RegisterFormErrors = {};

    if (!domain.trim()) {
      newErrors.domain = 'Domain name is required';
    } else {
      const fullDomain = `${domain}.sov`;
      const domainValidation = validateDomainFormat(fullDomain);
      if (!domainValidation.valid) {
        newErrors.domain =
          domainValidation.errors[0] || 'Invalid domain format';
      }
    }

    const durationValidation = validateDomainDuration(parseInt(years, 10));
    if (!durationValidation.valid) {
      newErrors.years = durationValidation.error || 'Invalid duration';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check domain availability
  const checkDomainAvailability = useCallback(async (domainToCheck: string) => {
    if (!domainToCheck.trim()) {
      setAvailabilityStatus({ available: null, checking: false });
      return;
    }

    setAvailabilityStatus(prev => ({ ...prev, checking: true }));

    try {
      const result = await domainService.checkAvailability(domainToCheck);
      setAvailabilityStatus({
        available: result.available,
        checking: false,
        registrarFee: result.registrar_fee,
      });
      console.log(
        `[DomainRegistrationScreen] Domain "${domainToCheck}" is ${
          result.available ? 'available' : 'taken'
        }`,
      );
    } catch (error) {
      console.warn(
        '[DomainRegistrationScreen] Failed to check domain availability:',
        error,
      );
      setAvailabilityStatus({ available: null, checking: false });
    }
  }, []);

  // Handle domain input change
  const handleDomainChange = (text: string) => {
    let normalizedText = text.toLowerCase().trim();

    // Remove .sov suffix if user types it
    if (normalizedText.endsWith('.sov')) {
      normalizedText = normalizedText.slice(0, -4);
    }

    // Allow only letters (a-z) and hyphens (-), no dots, numbers, or special characters
    normalizedText = normalizedText.replace(/[^a-z-]/g, '');

    // Remove leading hyphens
    normalizedText = normalizedText.replace(/^-+/, '');

    // Remove trailing hyphens
    normalizedText = normalizedText.replace(/-+$/, '');

    setDomain(normalizedText);
    setErrors(prev => ({ ...prev, domain: undefined }));

    // Debounce availability check
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (normalizedText) {
      const timer = setTimeout(() => {
        checkDomainAvailability(`${normalizedText}.sov`);
      }, 300);
      setDebounceTimer(timer);
    }
  };

  // Handle domain blur
  const handleDomainBlur = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (domain) {
      checkDomainAvailability(`${domain}.sov`);
    }
  };

  // Handle registration
  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    const ownerDid = resolvedIdentityDid ?? (await ensureIdentityAvailable());
    if (!ownerDid) {
      setStatus({
        type: 'error',
        message: 'Unlock identity to register domain',
      });
      return;
    }
    if (availabilityStatus.available === false) {
      setStatus({
        type: 'error',
        message: 'Domain is not available',
      });
      return;
    }

    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      const fullDomain = `${domain}.sov`;
      const durationDays = yearsToDays(parseInt(years, 10));
      const feeAmount = 10;
      const contentMappings = {
        '/': {
          content: `<html><body>${fullDomain}</body></html>`,
          content_type: 'text/html',
        },
      };

      console.log('[DomainRegistrationScreen] Registering domain:', {
        domain: fullDomain,
        durationDays,
        feeAmount,
      });

      setStatus({
        type: null,
        message: 'Signing transaction...',
      });

      const response = await domainService.registerDomain({
        domain: fullDomain,
        owner: ownerDid,
        fee: feeAmount,
        content_mappings: contentMappings,
      });

      console.log(
        '[DomainRegistrationScreen] Domain registered:',
        response.tx_hash,
      );

      // Store domain
      const storedDomainsJson = await AsyncStorage.getItem(
        REGISTERED_DOMAINS_KEY,
      );
      const storedDomains = storedDomainsJson
        ? JSON.parse(storedDomainsJson)
        : [];

      const newDomain = {
        domain: response.domain,
        owner: response.owner,
        expires_at: response.expires_at,
        tx_hash: response.tx_hash,
        registered_at: new Date().toISOString(),
      };

      storedDomains.push(newDomain);
      await AsyncStorage.setItem(
        REGISTERED_DOMAINS_KEY,
        JSON.stringify(storedDomains),
      );
      setHasExistingDomain(true);

      setStatus({
        type: 'success',
        message: `Domain registered. Expires: ${new Date(
          response.expires_at,
        ).toLocaleDateString()}`,
      });

      setDomain('');
      setYears('1');
      setErrors({});

      setTimeout(() => {
        onClose?.();
      }, 2000);
    } catch (error: any) {
      console.error('[DomainRegistrationScreen] Registration failed:', error);
      setStatus({
        type: 'error',
        message: error.message || 'Failed to register domain',
      });
    } finally {
      setLoading(false);
    }
  };

  const fullDomainForValidation = domain ? `${domain}.sov` : '';
  const validationResult = validateDomainFormat(fullDomainForValidation);
  const isReserved = validationResult.isReserved;

  if (isBootstrapping || identityLoading) {
    return <LoadingView />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg_darkest }}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            paddingTop: insets.top + spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: typography.size.lg,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
            }}
          >
            Register Domain
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                color: colors.text_secondary,
                fontWeight: typography.weight.light,
              }}
            >
              ✕
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl * 2,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status Message */}
          {identityError && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: `${colors.warning}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.warning,
                }}
              >
                {identityError}
              </Text>
              <TouchableOpacity
                onPress={ensureIdentityAvailable}
                style={{ marginTop: spacing.sm }}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.primary,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  Unlock Identity
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {status.message && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor:
                  status.type === 'success'
                    ? `${colors.success}15`
                    : status.type === 'error'
                    ? `${colors.error}15`
                    : `${colors.primary}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color:
                    status.type === 'success'
                      ? colors.success
                      : status.type === 'error'
                      ? colors.error
                      : colors.primary,
                }}
              >
                {status.message}
              </Text>
            </View>
          )}

          {/* Information Card */}
          <View
            style={{
              marginBottom: spacing.lg,
              padding: spacing.md,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.md,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
                lineHeight: 20,
              }}
            >
              Register a .sov domain to establish your web4 presence. Domains
              are yours for the selected duration and can be renewed.
            </Text>
          </View>
          {hasExistingDomain && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: `${colors.warning}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.warning,
                  fontWeight: typography.weight.semibold,
                }}
              >
                Limit: 1 domain per identity
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  marginTop: spacing.xs,
                }}
              >
                This identity already has a registered domain. Creating more is
                not allowed on mobile.
              </Text>
            </View>
          )}

          {/* Domain Input */}
          <FormField
            label="Domain Name"
            placeholder="example"
            value={domain}
            onChangeText={handleDomainChange}
            onBlur={handleDomainBlur}
            error={errors.domain}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            rightIcon={
              <Text
                style={{
                  fontSize: typography.size.md,
                  color: colors.text_secondary,
                  fontWeight: typography.weight.semibold,
                }}
              >
                .sov
              </Text>
            }
          />

          {/* Availability Status */}
          {domain && availabilityStatus.checking && (
            <View
              style={{
                marginBottom: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.text_secondary,
                }}
              >
                Checking availability...
              </Text>
            </View>
          )}

          {domain &&
            !availabilityStatus.checking &&
            availabilityStatus.available !== null && (
              <View
                style={{
                  marginBottom: spacing.lg,
                  padding: spacing.md,
                  backgroundColor: availabilityStatus.available
                    ? `${colors.success}15`
                    : `${colors.error}15`,
                  borderRadius: borderRadius.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: availabilityStatus.available
                      ? colors.success
                      : colors.error,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  {availabilityStatus.available
                    ? '✓ Available'
                    : '✗ Not available'}
                </Text>
              </View>
            )}

          {/* Reserved Domain Warning */}
          {isReserved && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: `${colors.warning}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.warning,
                  fontWeight: typography.weight.semibold,
                }}
              >
                ⚠ Reserved domain
              </Text>
              {validationResult.errors[0] && (
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.warning,
                    marginTop: spacing.xs,
                  }}
                >
                  {validationResult.errors[0]}
                </Text>
              )}
            </View>
          )}

          {/* Duration Selector */}
          <View style={{ marginBottom: spacing.lg }}>
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
                marginBottom: spacing.sm,
                fontWeight: typography.weight.semibold,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Duration
            </Text>
            <TouchableOpacity
              onPress={() => !loading && setDurationPickerVisible(true)}
              disabled={loading}
            >
              <Card style={{ marginHorizontal: 0 }}>
                <View
                  style={{
                    padding: spacing.md,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      color: colors.text_primary,
                    }}
                  >
                    {years === '1' ? '1 Year' : `${years} Years`}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                    }}
                  >
                    ▼
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
            {errors.years && (
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.error,
                  marginTop: spacing.sm,
                }}
              >
                {errors.years}
              </Text>
            )}
          </View>

          {/* Duration Options Modal */}
          {durationPickerVisible && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                justifyContent: 'flex-end',
                zIndex: 1000,
              }}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => setDurationPickerVisible(false)}
              />
              <View
                style={{
                  backgroundColor: colors.bg_dark,
                  borderTopLeftRadius: borderRadius.lg,
                  borderTopRightRadius: borderRadius.lg,
                  paddingBottom: insets.bottom + spacing.md,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    Select Duration
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDurationPickerVisible(false)}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.lg,
                        color: colors.text_secondary,
                        fontWeight: typography.weight.light,
                      }}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ gap: spacing.xs, padding: spacing.md }}>
                  {[
                    { value: '1', label: '1 Year' },
                    {
                      value: '2',
                      label: '2 Years (Coming soon)',
                      disabled: true,
                    },
                    {
                      value: '3',
                      label: '3 Years (Coming soon)',
                      disabled: true,
                    },
                    {
                      value: '5',
                      label: '5 Years (Coming soon)',
                      disabled: true,
                    },
                    {
                      value: '10',
                      label: '10 Years (Coming soon)',
                      disabled: true,
                    },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      disabled={option.disabled}
                      onPress={() => {
                        if (!option.disabled) {
                          setYears(option.value);
                          setErrors(prev => ({ ...prev, years: undefined }));
                          setDurationPickerVisible(false);
                        }
                      }}
                    >
                      <View
                        style={{
                          padding: spacing.md,
                          borderRadius: borderRadius.md,
                          backgroundColor:
                            years === option.value
                              ? colors.primary
                              : option.disabled
                              ? colors.bg_darker
                              : colors.bg_darkest,
                          opacity: option.disabled ? 0.5 : 1,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.md,
                            color:
                              years === option.value
                                ? colors.text_primary
                                : option.disabled
                                ? colors.text_secondary
                                : colors.text_primary,
                            fontWeight:
                              years === option.value
                                ? typography.weight.semibold
                                : typography.weight.normal,
                          }}
                        >
                          {option.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Register Button */}
          <Button
            onPress={handleRegister}
            disabled={
              loading ||
              hasExistingDomain ||
              availabilityStatus.available === false ||
              !domain ||
              !resolvedIdentityDid
            }
            style={{
              backgroundColor:
                loading ||
                hasExistingDomain ||
                availabilityStatus.available === false ||
                !domain ||
                !resolvedIdentityDid
                  ? colors.text_secondary
                  : colors.primary,
            }}
          >
            {loading
              ? 'Registering...'
              : hasExistingDomain
              ? 'Limit: 1 domain per identity'
              : !resolvedIdentityDid
              ? 'Unlock Identity to Register'
              : 'Register Domain'}
          </Button>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

export default DomainRegistrationScreen;
