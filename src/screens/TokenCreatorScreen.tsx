/**
 * Token Creator Screen
 * Create new tokens via QUIC endpoints
 */

import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Modal, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  FormField,
  HeaderBar,
  Text,
  LoadingView,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import tokenService from '../services/TokenService';
import { useAuth } from '../hooks/useAuth';
import { TokenCreateRequest } from '../types/token';

// Storage keys
const CREATED_TOKENS_KEY = 'sov:created_tokens';

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
  const { currentIdentity } = useAuth();

  // FORM STATE
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [initialSupply, setInitialSupply] = useState('');
  const [decimals, setDecimals] = useState('8');
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
    } else if (!/^[A-Z0-9]+$/.test(symbol.toUpperCase())) {
      newErrors.symbol = 'Symbol must contain only letters and numbers';
    } else if (symbol.trim().length < 1 || symbol.trim().length > 10) {
      newErrors.symbol = 'Symbol must be 1-10 characters';
    }

    if (!initialSupply.trim()) {
      newErrors.initial_supply = 'Initial supply is required';
    } else {
      const supply = Number.parseFloat(initialSupply);
      if (Number.isNaN(supply) || supply <= 0) {
        newErrors.initial_supply = 'Initial supply must be a positive number';
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
      const response = await tokenService.listTokens();
      const tokens = response.tokens || [];
      const symbolUpper = sym.trim().toUpperCase();
      const exists = tokens.some(token => token.symbol.toUpperCase() === symbolUpper);

      setSymbolStatus({
        available: !exists,
        checking: false,
      });

      console.log(`[TokenCreatorScreen] Symbol "${symbolUpper}" is ${exists ? 'taken' : 'available'}`);
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
        initial_supply: Number.parseFloat(initialSupply),
        decimals: Number.parseInt(decimals, 10) || 8,
        max_supply: maxSupply.trim() ? Number.parseFloat(maxSupply) : null,
      };

      const response = await tokenService.createToken(createRequest);

      // Save created token ID to storage for later reference
      try {
        const createdTokensJson = await AsyncStorage.getItem(CREATED_TOKENS_KEY);
        const createdTokens: string[] = createdTokensJson ? JSON.parse(createdTokensJson) : [];
        if (!createdTokens.includes(response.token_id)) {
          createdTokens.push(response.token_id);
          await AsyncStorage.setItem(CREATED_TOKENS_KEY, JSON.stringify(createdTokens));
          console.log('[TokenCreatorScreen] Saved created token ID:', response.token_id);
        }
      } catch (storageError) {
        console.warn('[TokenCreatorScreen] Failed to save token ID to storage:', storageError);
      }

      setStatus({
        type: 'success',
        message: `Token created successfully! Token ID: ${response.token_id}`,
      });

      // Reset form
      setTimeout(() => {
        setName('');
        setSymbol('');
        setInitialSupply('');
        setDecimals('8');
        setMaxSupply('');
        setStatus({ type: null, message: '' });

        // Close modal if callback provided
        if (onClose) {
          onClose();
        }

        // Show success alert
        Alert.alert('Success', `Token "${name}" created successfully!`);
      }, 1500);
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

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg_darkest,
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl * 2.5,
    },
    statusMessage: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: status.type === 'success' ? colors.success + '20' : colors.error + '20',
    },
    statusText: {
      color: status.type === 'success' ? colors.success : colors.error,
      fontSize: typography.size.sm,
    },
  });

  if (!currentIdentity) {
    return <LoadingView />;
  }

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Create Token"
        onBackPress={() => onClose?.()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Status Message */}
        {status.message && (
          <View style={styles.statusMessage}>
            <Text style={styles.statusText}>{status.message}</Text>
          </View>
        )}

        {/* Quick Help */}
        <View
          style={{
            marginBottom: spacing.md,
            padding: spacing.md,
            backgroundColor: colors.bg_darker,
            borderRadius: borderRadius.lg,
          }}
        >
          <Text
            style={{
              fontSize: typography.size.xs,
              fontWeight: typography.weight.semibold,
              color: colors.text_secondary,
              marginBottom: spacing.xs,
            }}
          >
            💡 HOW DECIMALS WORK
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              lineHeight: 16,
            }}
          >
            • 8 decimals: 1,000,000,000 raw = 10.00 tokens{'\n'}
            • 18 decimals: 1,000,000,000 raw = 0.000000001 tokens
          </Text>
        </View>

        {/* Create Form Card */}
        <Card>
          <View style={{ marginBottom: spacing.md }}>
            <Text
              style={{
                fontSize: typography.size.lg,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.sm,
              }}
            >
              Create New Token
            </Text>
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
              }}
            >
              Define your token's properties
            </Text>
          </View>

          {/* User DID Reference */}
          <View
            style={{
              marginBottom: spacing.md,
              padding: spacing.sm,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.base,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
                marginBottom: spacing.xs,
              }}
            >
              Your DID (Creator):
            </Text>
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_primary,
                fontFamily: 'Courier',
              }}
              numberOfLines={1}
            >
              {currentIdentity.did}
            </Text>
          </View>

          {/* Token Name */}
          <FormField
            label="Token Name"
            placeholder="e.g., My Token"
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
            label="Token Symbol"
            placeholder="e.g., MYTKN"
            value={symbol}
            onChangeText={(text) => {
              setSymbol(text.toUpperCase());
              if (errors.symbol) {
                setErrors((prev) => ({ ...prev, symbol: undefined }));
              }
              // Reset availability check on change
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

          {/* Symbol Availability Status */}
          {symbol.trim() && symbolStatus.available !== null && (
            <View
              style={{
                marginBottom: spacing.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.base,
                backgroundColor: symbolStatus.available
                  ? 'rgba(76, 175, 80, 0.15)'
                  : 'rgba(244, 67, 54, 0.15)',
                borderLeftWidth: 3,
                borderLeftColor: symbolStatus.available ? '#4caf50' : '#f44336',
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: symbolStatus.available ? '#4caf50' : '#f44336',
                }}
              >
                {symbolStatus.available ? '✓ Symbol Available' : '✗ Symbol Already Taken'}
              </Text>
            </View>
          )}

          {/* Symbol Checking Indicator */}
          {symbol.trim() && symbolStatus.checking && (
            <View
              style={{
                marginBottom: spacing.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.base,
                backgroundColor: colors.primary + '15',
                borderLeftWidth: 3,
                borderLeftColor: colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.primary,
                }}
              >
                Checking availability...
              </Text>
            </View>
          )}

          {/* Initial Supply */}
          <FormField
            label="Initial Supply"
            placeholder="e.g., 1000000"
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
            placeholder="e.g., 8 or 18"
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

            // Format with thousands separators and decimals
            const formatter = new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: Math.min(dec, 8),
            });
            const formatted = formatter.format(displayedSupply);

            // Calculate scale label
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
                  marginBottom: spacing.md,
                  padding: spacing.md,
                  backgroundColor: colors.primary + '15',
                  borderRadius: borderRadius.base,
                  borderLeftWidth: 3,
                  borderLeftColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                  }}
                >
                  DECIMALS PREVIEW
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
                  Raw supply: {Number(initialSupply).toLocaleString()}
                </Text>

                {/* Main Display */}
                <View
                  style={{
                    paddingTop: spacing.md,
                    paddingBottom: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.primary + '30',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.primary + '30',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.xs,
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

          {/* Max Supply (Optional) */}
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

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              marginTop: spacing.lg,
            }}
          >
            <Button
              variant="primary"
              onPress={handleCreate}
              loading={loading}
              style={{ flex: 1 }}
            >
              Create Token
            </Button>
            {onClose && (
              <Button
                variant="secondary"
                onPress={onClose}
                disabled={loading}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
            )}
          </View>
        </Card>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default TokenCreatorScreen;
