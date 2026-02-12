/**
 * Token Detail Screen
 * View token details with mint and info sections
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  FormField,
  HeaderBar,
  ScreenLayout,
  DetailRow,
  SectionLabel,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import { useAuth } from '../hooks/useAuth';
import tokenService from '../services/TokenService';
import { atomicToHuman } from '../utils/tokenUnits';

const TokenDetailScreen = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { tokenId } = route.params || {};
  const { currentIdentity } = useAuth();

  // State
  const [token, setToken] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [mintAmount, setMintAmount] = useState('');
  const [mintRecipient, setMintRecipient] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; recipient?: string }>({});
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  // Load token info
  useEffect(() => {
    const loadTokenInfo = async () => {
      try {
        setLoading(true);
        if (!tokenId) {
          return;
        }

        const info = await tokenService.getTokenInfo(tokenId);
        setToken(info);
        console.log('[TokenDetailScreen] Loaded token:', info.name);
      } catch (error) {
        console.error('[TokenDetailScreen] Failed to load token:', error);
        Alert.alert('Error', 'Failed to load token details');
      } finally {
        setLoading(false);
      }
    };

    loadTokenInfo();
  }, [tokenId]);

  // Validate mint form
  const validateMintForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!mintAmount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = Number.parseFloat(mintAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Amount must be a positive number';
      }
    }

    if (!mintRecipient.trim()) {
      newErrors.recipient = 'Recipient DID is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle mint
  const handleMint = async () => {
    if (!validateMintForm()) {
      return;
    }

    if (!currentIdentity?.did) {
      setStatus({ type: 'error', message: 'Identity not available' });
      return;
    }

    setMinting(true);
    setStatus({ type: null, message: '' });

    try {
      console.log('[TokenDetailScreen] Minting token:', {
        tokenId,
        amount: mintAmount,
        recipient: mintRecipient,
      });

      await tokenService.mintToken({
        token_id: tokenId,
        amount: Number.parseFloat(mintAmount),
        to: mintRecipient,
      });

      setStatus({
        type: 'success',
        message: `Successfully minted ${mintAmount} tokens to ${mintRecipient.substring(0, 12)}...`,
      });

      // Clear form
      setMintAmount('');
      setMintRecipient('');
      setErrors({});

      // Reload token info
      const info = await tokenService.getTokenInfo(tokenId);
      setToken(info);

      // Close after 2 seconds
      setTimeout(() => {
        navigation?.goBack();
      }, 2000);
    } catch (error: any) {
      console.error('[TokenDetailScreen] Mint failed:', error);
      setStatus({
        type: 'error',
        message: error.message || 'Failed to mint token',
      });
    } finally {
      setMinting(false);
    }
  };

  if (loading || !token) {
    return <LoadingView />;
  }

  const formatBalance = (balance: number): string => {
    return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg_darkest }}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <HeaderBar title={token.name} onBackPress={() => navigation?.goBack()} />

        <ScreenLayout paddingTop={spacing.md}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Column gap="md" style={{ paddingBottom: spacing.xl }}>
              {/* Token Header Card */}
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card style={{ marginHorizontal: 0, backgroundColor: colors.bg_darker }}>
                  <View
                    style={{
                      padding: spacing.lg,
                      alignItems: 'center',
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      marginBottom: spacing.md,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.size['4xl'],
                        marginBottom: spacing.sm,
                      }}
                    >
                      ◆
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.xl,
                        fontWeight: typography.weight.bold,
                        color: colors.text_primary,
                      }}
                    >
                      {token.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.lg,
                        color: colors.primary,
                        marginTop: spacing.xs,
                      }}
                    >
                      {token.symbol}
                    </Text>
                  </View>

                  {/* Info Section */}
                  <SectionLabel style={{ paddingHorizontal: spacing.md }}>Information</SectionLabel>
                  <Column gap="sm" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                    <DetailRow label="Total Supply" value={formatBalance(atomicToHuman(token.total_supply, token.decimals))} />
                    <DetailRow label="Decimals" value={token.decimals.toString()} />
                    {token.max_supply && (
                      <DetailRow label="Max Supply" value={formatBalance(atomicToHuman(token.max_supply, token.decimals))} />
                    )}
                    <DetailRow label="Deflationary" value={token.is_deflationary ? 'Yes' : 'No'} />
                    <DetailRow label="Created at Block" value={token.created_at_block.toString()} />
                    <DetailRow
                      label="Creator"
                      value={typeof token.creator === 'string' ? token.creator.substring(0, 12) + '...' : 'Unknown'}
                    />
                  </Column>
                </Card>
              </View>

              {/* Mint Section */}
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card style={{ marginHorizontal: 0 }}>
                  <SectionLabel>Mint Tokens</SectionLabel>

                  <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                    <FormField
                      label="Amount to Mint"
                      placeholder="0.00"
                      value={mintAmount}
                      onChangeText={(text) => {
                        setMintAmount(text);
                        setErrors((prev) => ({ ...prev, amount: undefined }));
                      }}
                      error={errors.amount}
                      editable={!minting}
                      keyboardType="decimal-pad"
                    />

                    <FormField
                      label="Recipient DID"
                      placeholder="did:zhtp:..."
                      value={mintRecipient}
                      onChangeText={(text) => {
                        setMintRecipient(text);
                        setErrors((prev) => ({ ...prev, recipient: undefined }));
                      }}
                      error={errors.recipient}
                      editable={!minting}
                      autoCapitalize="none"
                    />

                    {status.type && (
                      <Card
                        style={{
                          marginHorizontal: 0,
                          backgroundColor:
                            status.type === 'success' ? `${colors.success}15` : `${colors.error}15`,
                          borderWidth: 1,
                          borderColor: status.type === 'success' ? colors.success : colors.error,
                        }}
                      >
                        <View style={{ padding: spacing.md }}>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              color: status.type === 'success' ? colors.success : colors.error,
                            }}
                          >
                            {status.message}
                          </Text>
                        </View>
                      </Card>
                    )}

                    <Button
                      title={minting ? 'Minting...' : 'Mint Tokens'}
                      onPress={handleMint}
                      disabled={minting}
                      style={{
                        backgroundColor: minting ? colors.text_secondary : colors.primary,
                      }}
                    />
                  </View>
                </Card>
              </View>
            </Column>
          </ScrollView>
        </ScreenLayout>
      </View>
    </KeyboardAvoidingView>
  );
};

export default TokenDetailScreen;
