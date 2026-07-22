/**
 * Token Creator Screen
 * Create new tokens via QUIC endpoints
 * Minimal, elegant design
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  FormField,
  Text,
  LoadingView,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import tokenService from '../services/TokenService';
import assetService from '../services/AssetService';
import { useAuth } from '../hooks/useAuth';
import { TokenCreateRequest } from '../types/token';

// Storage keys
const TRACKED_TOKENS_KEY = 'sov:tracked_tokens';
const LEGACY_CREATED_TOKENS_KEY = 'sov:created_tokens';

interface CreateFormErrors {
  name?: string;
  symbol?: string;
  initial_supply?: string;
  decimals?: string;
  max_supply?: string;
}

interface SubmitStatus {
  type: 'success' | 'error' | null;
  message: string;
}

interface TokenCreatorScreenProps {
  onClose?: () => void;
}

const TokenCreatorScreen: React.FC<TokenCreatorScreenProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { currentIdentity } = useAuth();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigation.goBack();
    }
  };

  // FORM STATE
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [initialSupply, setInitialSupply] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [maxSupply, setMaxSupply] = useState('');
  const [errors, setErrors] = useState<CreateFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>({ type: null, message: '' });
  const [symbolStatus, setSymbolStatus] = useState<{ available: boolean | null; checking: boolean }>({
    available: null,
    checking: false,
  });

  // Validate create form
  const validateForm = (): boolean => {
    const newErrors: CreateFormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Token name is required';
    } else if (name.trim().length < 3) {
      newErrors.name = 'Token name must be at least 3 characters';
    }

    if (!symbol.trim()) {
      newErrors.symbol = 'Token symbol is required';
    } else if (!/^[A-Z]+$/.test(symbol.toUpperCase())) {
      newErrors.symbol = 'Symbol must be A–Z only (DAO launch)';
    } else if (symbol.trim().length < 1 || symbol.trim().length > 6) {
      newErrors.symbol = 'Symbol must be 1–6 characters';
    }

    if (!initialSupply.trim()) {
      newErrors.initial_supply = 'Initial supply is required';
    } else {
      const supply = Number.parseFloat(initialSupply);
      if (Number.isNaN(supply) || supply < 1000) {
        newErrors.initial_supply = 'Initial supply must be at least 1000';
      }
    }

    if (decimals) {
      const dec = Number.parseInt(decimals, 10);
      if (Number.isNaN(dec) || dec < 0 || dec > 18) {
        newErrors.decimals = 'Decimals must be between 0 and 18';
      }
    }

    if (maxSupply.trim()) {
      const max = Number.parseFloat(maxSupply);
      const initial = Number.parseFloat(initialSupply);
      if (Number.isNaN(max) || max <= 0) {
        newErrors.max_supply = 'Max supply must be a positive number';
      } else if (max < initial) {
        newErrors.max_supply = 'Max supply must be greater than or equal to initial supply';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if symbol is available
  const checkSymbolAvailability = async (sym: string) => {
    if (!sym.trim() || sym.trim().length < 1) {
      setSymbolStatus({ available: null, checking: false });
      return;
    }

    setSymbolStatus({ available: null, checking: true });

    try {
      const symbolUpper = sym.trim().toUpperCase();
      const available = await assetService.checkSymbolAvailable(symbolUpper);

      setSymbolStatus({
        available,
        checking: false,
      });

      console.log(
        `[TokenCreatorScreen] Symbol "${symbolUpper}" is ${available ? 'available' : 'taken'}`,
      );
    } catch (error) {
      console.warn('[TokenCreatorScreen] Failed to check symbol availability:', error);
      setSymbolStatus({ available: null, checking: false });
    }
  };

  // Handle token creation
  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    if (!currentIdentity?.did) {
      setStatus({
        type: 'error',
        message: 'Identity not available',
      });
      return;
    }

    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      console.log('[TokenCreatorScreen] Creating token:', name);

      const createRequest: TokenCreateRequest = {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        initial_supply: initialSupply.trim(),
        decimals: Number.parseInt(decimals, 10) || 18,
        max_supply: maxSupply.trim() ? maxSupply.trim() : null,
      };

      const response = await tokenService.createToken(createRequest);
      const assetId = response.token_id;
      const shareLink = `zhtp://asset/${assetId}`;

      // Save asset_id to tracked storage (with legacy-key migration)
      try {
        const trackedTokensJson = await AsyncStorage.getItem(TRACKED_TOKENS_KEY);
        let trackedTokens: string[] = trackedTokensJson
          ? JSON.parse(trackedTokensJson)
          : [];

        if (trackedTokens.length === 0) {
          const legacyCreatedTokensJson = await AsyncStorage.getItem(
            LEGACY_CREATED_TOKENS_KEY,
          );
          if (legacyCreatedTokensJson) {
            trackedTokens = JSON.parse(legacyCreatedTokensJson);
          }
        }

        if (assetId && !trackedTokens.includes(assetId)) {
          trackedTokens.push(assetId);
          await AsyncStorage.setItem(
            TRACKED_TOKENS_KEY,
            JSON.stringify(trackedTokens),
          );
          await AsyncStorage.removeItem(LEGACY_CREATED_TOKENS_KEY);
          console.log('[TokenCreatorScreen] Saved tracked asset_id:', assetId);
        }
      } catch (storageError) {
        console.warn('[TokenCreatorScreen] Failed to save asset_id to storage:', storageError);
      }

      setStatus({
        type: 'success',
        message: `Submitted to mempool. Confirming...`,
      });

      // Poll until asset is visible on chain (sovereign assets API)
      const MAX_POLLS = 30;
      const POLL_INTERVAL_MS = 2000;
      let confirmed = false;

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        try {
          const info = await assetService.getAsset(assetId);
          if (info && info.asset_id) {
            confirmed = true;
            console.log(
              '[TokenCreatorScreen] Asset confirmed:',
              info.asset_id,
              info.dao_class,
            );
            break;
          }
        } catch {
          // not yet on chain — keep polling
        }
      }

      setStatus({
        type: 'success',
        message: confirmed
          ? `DAO launched. asset_id: ${assetId}\n${shareLink}`
          : `Submitted. asset_id: ${assetId}\n${shareLink}`,
      });

      setTimeout(() => {
        setName('');
        setSymbol('');
        setInitialSupply('');
        setDecimals('18');
        setMaxSupply('');
        setStatus({ type: null, message: '' });

        if (onClose) {
          onClose();
        }
      }, 2000);
    } catch (error: any) {
      console.error('[TokenCreatorScreen] Creation failed:', error);
      setStatus({
        type: 'error',
        message: error.message || 'Failed to create token',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!currentIdentity) {
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
            Create Token
          </Text>
          <TouchableOpacity
            onPress={handleClose}
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
          {status.message && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: status.type === 'success' ? `${colors.success}15` : `${colors.error}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: status.type === 'success' ? colors.success : colors.error,
                }}
              >
                {status.message}
              </Text>
            </View>
          )}

          {/* Token Name */}
          <FormField
            label="Name"
            placeholder="My Token"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: undefined }));
              }
            }}
            error={errors.name}
            editable={!loading}
          />

          {/* Token Symbol */}
          <FormField
            label="Symbol"
            placeholder="MYTKN"
            value={symbol}
            onChangeText={(text) => {
              setSymbol(text.toUpperCase());
              if (errors.symbol) {
                setErrors((prev) => ({ ...prev, symbol: undefined }));
              }
              setSymbolStatus({ available: null, checking: false });
            }}
            onBlur={() => {
              if (symbol.trim()) {
                checkSymbolAvailability(symbol);
              }
            }}
            error={errors.symbol}
            editable={!loading}
          />

          {/* Symbol Availability */}
          {symbol.trim() && symbolStatus.checking && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: `${colors.primary}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.primary,
                }}
              >
                Checking availability...
              </Text>
            </View>
          )}

          {symbol.trim() && !symbolStatus.checking && symbolStatus.available !== null && (
            <View
              style={{
                marginBottom: spacing.lg,
                padding: spacing.md,
                backgroundColor: symbolStatus.available ? `${colors.success}15` : `${colors.error}15`,
                borderRadius: borderRadius.md,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: symbolStatus.available ? colors.success : colors.error,
                  fontWeight: typography.weight.semibold,
                }}
              >
                {symbolStatus.available ? '✓ Available' : '✗ Already taken'}
              </Text>
            </View>
          )}

          {/* Initial Supply */}
          <FormField
            label="Initial Supply"
            placeholder="1000000"
            value={initialSupply}
            onChangeText={(text) => {
              setInitialSupply(text);
              if (errors.initial_supply) {
                setErrors((prev) => ({ ...prev, initial_supply: undefined }));
              }
            }}
            keyboardType="decimal-pad"
            error={errors.initial_supply}
            editable={!loading}
          />

          {/* Decimals */}
          <FormField
            label="Decimals"
            placeholder="8"
            value={decimals}
            onChangeText={(text) => {
              setDecimals(text);
              if (errors.decimals) {
                setErrors((prev) => ({ ...prev, decimals: undefined }));
              }
            }}
            keyboardType="number-pad"
            error={errors.decimals}
            editable={!loading}
          />

          {/* Decimals Preview */}
          {decimals && !errors.decimals && initialSupply && !errors.initial_supply && (() => {
            const rawSupply = Number(initialSupply);
            const dec = Number(decimals);
            const displayedSupply = rawSupply / Math.pow(10, dec);

            const maxFractionDigits = Math.max(2, Math.min(dec, 8));
            const formatter = new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: maxFractionDigits,
            });
            const formatted = formatter.format(displayedSupply);

            let scaleLabel = '';
            if (displayedSupply >= 1e9) {
              scaleLabel = `${(displayedSupply / 1e9).toFixed(2)} Billion`;
            } else if (displayedSupply >= 1e6) {
              scaleLabel = `${(displayedSupply / 1e6).toFixed(2)} Million`;
            } else if (displayedSupply >= 1e3) {
              scaleLabel = `${(displayedSupply / 1e3).toFixed(2)} Thousand`;
            } else {
              scaleLabel = `${displayedSupply.toFixed(2)}`;
            }

            return (
              <View
                style={{
                  marginBottom: spacing.lg,
                  padding: spacing.md,
                  backgroundColor: `${colors.primary}15`,
                  borderRadius: borderRadius.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Decimals Preview
                </Text>

                <View
                  style={{
                    paddingVertical: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: `${colors.primary}30`,
                    borderBottomWidth: 1,
                    borderBottomColor: `${colors.primary}30`,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Raw supply:
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_primary,
                      marginBottom: spacing.md,
                      fontFamily: 'Courier',
                    }}
                  >
                    {Number(initialSupply).toLocaleString()}
                  </Text>

                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Decimals: <Text style={{ color: colors.primary, fontWeight: typography.weight.semibold }}>{dec}</Text>
                  </Text>

                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.md,
                    }}
                  >
                    Your token supply:
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {formatted}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_secondary,
                    }}
                  >
                    {scaleLabel}
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* Max Supply */}
          <FormField
            label="Max Supply (Optional)"
            placeholder="Leave empty for unlimited"
            value={maxSupply}
            onChangeText={(text) => {
              setMaxSupply(text);
              if (errors.max_supply) {
                setErrors((prev) => ({ ...prev, max_supply: undefined }));
              }
            }}
            keyboardType="decimal-pad"
            error={errors.max_supply}
            editable={!loading}
          />

          {/* Create Button */}
          <Button
            onPress={handleCreate}
            disabled={loading || !name || !symbol || !initialSupply}
            style={{
              backgroundColor:
                loading || !name || !symbol || !initialSupply
                  ? colors.text_secondary
                  : colors.primary,
            }}
          >
            {loading ? 'Creating...' : 'Create Token'}
          </Button>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

export default TokenCreatorScreen;
