import React, { useEffect, useMemo, useState } from 'react';
import { View, Share, Alert, Clipboard, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Card, Text, Button, Column, ScreenLayout, SectionLabel } from '../components';
import { useWalletList, useUserTokenBalances, useTokenRegistry } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { TokenListItem } from '../types/token';

const ReceiveTokensScreen = ({ route }: any) => {
  const { t } = useTranslation();
  const { wallets } = useWalletList();
  const [copied, setCopied] = useState(false);
  const [selectedWalletIdx, setSelectedWalletIdx] = useState(0);

  const selectedWallet = wallets[selectedWalletIdx] ?? wallets[0];
  const walletId = selectedWallet?.id || '';
  const walletType = selectedWallet?.wallet_type || 'Primary';
  const walletSovBalance = selectedWallet?.available_balance ?? 0;

  // Registry-driven token list (SOV → CBE → alphabetical) plus per-wallet
  // balances for the currently-selected wallet.
  const { tokens: registry } = useTokenRegistry();
  const { tokens: balances } = useUserTokenBalances(walletId || null);

  const orderedTokens = useMemo<TokenListItem[]>(() => {
    const rank = (symbol: string) => {
      const s = symbol.toUpperCase();
      if (s === 'SOV') return 0;
      if (s === 'CBE') return 1;
      return 2;
    };
    return [...registry].sort((a, b) => {
      const ra = rank(a.symbol);
      const rb = rank(b.symbol);
      if (ra !== rb) return ra - rb;
      return (a.symbol || '').localeCompare(b.symbol || '');
    });
  }, [registry]);

  // Preselected token from navigation (SID screen carousel).
  const preselectedTokenId: string | undefined = route?.params?.preselectedTokenId;
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // Apply preselection once the registry loads; otherwise default to SOV.
  useEffect(() => {
    if (orderedTokens.length === 0) return;
    if (selectedTokenId && orderedTokens.some(t => t.token_id === selectedTokenId)) return;
    if (preselectedTokenId) {
      const match = orderedTokens.find(t => t.token_id === preselectedTokenId);
      if (match) {
        setSelectedTokenId(match.token_id);
        return;
      }
    }
    setSelectedTokenId(orderedTokens[0]?.token_id ?? null);
  }, [orderedTokens, preselectedTokenId, selectedTokenId]);

  const selectedToken = useMemo(
    () => orderedTokens.find(t => t.token_id === selectedTokenId) ?? null,
    [orderedTokens, selectedTokenId],
  );

  const selectedTokenSymbol = selectedToken?.symbol || 'SOV';
  const isSov = selectedTokenSymbol.toUpperCase() === 'SOV';

  // Balance for the displayed token. For SOV, prefer the per-wallet available
  // balance (matches the rest of the app); for other tokens use the merged
  // registry+balances response scoped to this wallet.
  const selectedBalance = useMemo(() => {
    if (isSov) return walletSovBalance;
    const match = balances.find(b => b.token_id === selectedTokenId);
    return match?.balance ?? 0;
  }, [isSov, walletSovBalance, balances, selectedTokenId]);

  const handleCopyAddress = async () => {
    if (!walletId) return;
    try {
      await Clipboard.setString(walletId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
      Alert.alert('Error', 'Failed to copy address to clipboard');
    }
  };

  const handleShare = async () => {
    if (!walletId) return;
    try {
      await Share.share({
        message: `My ${walletType} wallet ID (for ${selectedTokenSymbol}):\n${walletId}`,
        title: `Receive ${selectedTokenSymbol} — ${walletType} Wallet`,
      });
    } catch (error: any) {
      console.error('Share failed:', error);
    }
  };

  const truncatedId =
    walletId.length > 16
      ? `${walletId.substring(0, 8)}...${walletId.substring(walletId.length - 8)}`
      : walletId;

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">

        {/* Token Selector — SOV, CBE, and any other registry tokens. */}
        {orderedTokens.length > 1 && (
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.lg,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            {orderedTokens.map(token => {
              const active = selectedTokenId === token.token_id;
              return (
                <TouchableOpacity
                  key={token.token_id}
                  onPress={() => {
                    setSelectedTokenId(token.token_id);
                    setCopied(false);
                  }}
                  style={{
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: borderRadius.base,
                    backgroundColor: active ? colors.bg_medium : 'transparent',
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: active ? colors.primary : colors.text_secondary,
                      fontWeight: active
                        ? typography.weight.semibold
                        : typography.weight.normal,
                    }}
                  >
                    {token.symbol}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Wallet Selector (only for SOV where multi-wallet is meaningful) */}
        {isSov && wallets.length > 1 && (
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.lg,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
            }}
          >
            {wallets.map((w, idx) => (
              <TouchableOpacity
                key={w.id || idx}
                onPress={() => { setSelectedWalletIdx(idx); setCopied(false); }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.base,
                  backgroundColor: selectedWalletIdx === idx ? colors.bg_medium : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: selectedWalletIdx === idx ? colors.primary : colors.text_secondary,
                    fontWeight: selectedWalletIdx === idx ? typography.weight.semibold : typography.weight.normal,
                  }}
                >
                  {w.wallet_type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* QR Code */}
        <Card>
          <Column gap="md">
            <Text variant="h3" style={{ textAlign: 'center' }}>
              Receive {selectedTokenSymbol}
            </Text>
            <Text variant="caption" style={{ textAlign: 'center', color: colors.text_secondary }}>
              {selectedBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} {selectedTokenSymbol} in {walletType.toLowerCase()} wallet
            </Text>

            {walletId ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    padding: spacing.md,
                    borderRadius: borderRadius.lg,
                  }}
                >
                  <QRCode
                    value={walletId}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                  />
                </View>
              </View>
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: spacing.xl,
                }}
              >
                <Text variant="body" style={{ color: colors.text_tertiary }}>
                  No wallet available
                </Text>
              </View>
            )}
          </Column>
        </Card>

        {/* Wallet ID */}
        <Card>
          <Column gap="md">
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
              }}
            >
              Wallet ID
            </Text>
            <TouchableOpacity
              onPress={handleCopyAddress}
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.primary,
                  letterSpacing: 0.5,
                  fontFamily: 'Courier',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: spacing.xs,
                }}
              >
                {truncatedId || 'N/A'}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                Tap to copy full ID
              </Text>
            </TouchableOpacity>

            <View style={{ gap: spacing.sm, flexDirection: 'row' }}>
              <Button
                onPress={handleCopyAddress}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!walletId}
              >
                {copied ? '✓ Copied' : t.receiveTokens.copyButton}
              </Button>
              <Button
                onPress={handleShare}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!walletId}
              >
                {t.receiveTokens.shareButton}
              </Button>
            </View>
          </Column>
        </Card>

        {/* Info */}
        <Card style={{ backgroundColor: colors.bg_darker }}>
          <Column gap="sm">
            <SectionLabel>{t.receiveTokens.info.title}</SectionLabel>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              Share your wallet ID or QR code with the sender. The same wallet ID receives SOV, CBE, and any other chain tokens — no separate address per token.
            </Text>
          </Column>
        </Card>

      </Column>
    </ScreenLayout>
  );
};

export default ReceiveTokensScreen;
