import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  ScreenLayout,
  FormField,
  LoadingView,
} from '../components';
import { useAuth, useWalletList } from '../hooks';
import { getTokenRegistry } from '../hooks/useTokenRegistry';
import { useAddressBook } from '../hooks/useAddressBook';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import tokenService from '../services/TokenService';
import { TokenTransferRequest, SovTransferRequest } from '../types/token';
import { humanToAtomic, atomsToNumber } from '../utils/tokenUnits';
import { WELFARE_DAOS } from '../constants';

// Welfare tokens ($FOOD, $HEAL, $EDU, $HOME, $ENRG) are staking receipts —
// they're yield from DAO stakes, not peer-to-peer transferable assets. Hide
// them from the Send screen so users don't attempt to send what the node
// won't accept.
const WELFARE_TOKEN_IDS: ReadonlySet<string> = new Set(
  WELFARE_DAOS.map(d => d.tokenId),
);

const SOV_DECIMALS = 18;
import { CHAIN_ID } from '../config';

// Storage keys
const TRACKED_TOKENS_KEY = 'sov:tracked_tokens';
const LEGACY_CREATED_TOKENS_KEY = 'sov:created_tokens';

interface SendableToken {
  id: string; // token_id for custom, or 'SOV' for native
  symbol: string;
  name: string;
  balance: number;
  type: 'sov' | 'custom'; // sov = native token, custom = custom token
  token_id?: string; // Only for custom tokens
  decimals?: number;
}

interface TransferFormState {
  recipient: string;
  amount: string;
  memo: string;
}

interface TransferFormErrors {
  recipient?: string;
  amount?: string;
}

const SendTokensScreen = ({ navigation, route }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
  const { wallets, refresh: refreshWallets } = useWalletList();
  // Optional token preselected by the caller (e.g. SID screen carousel).
  const preselectedTokenId: string | undefined = route?.params?.preselectedTokenId;

  // Token list and balance state
  const [allTokens, setAllTokens] = useState<SendableToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<SendableToken | null>(
    null,
  );
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // Transfer form state
  const [transferForm, setTransferForm] = useState<TransferFormState>({
    recipient: '',
    amount: '',
    memo: '',
  });
  const [errors, setErrors] = useState<TransferFormErrors>({});
  const [isTransferring, setIsTransferring] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedFromWallet, setSelectedFromWallet] = useState<string | null>(
    null,
  );
  const [transferStatus, setTransferStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({
    type: null,
    message: '',
  });

  // Address book
  const { entries: addressBookEntries, add: addToBook, findByAddress } = useAddressBook();
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [savingContact, setSavingContact] = useState<{ address: string } | null>(null);
  const [newContactName, setNewContactName] = useState('');

  const getDefaultSovWalletId = useCallback((): string | null => {
    if (!wallets || wallets.length === 0) {
      return null;
    }
    const primaryWallet = wallets.find(
      w => (w.wallet_type || '').toLowerCase() === 'primary',
    );
    return (primaryWallet || wallets[0])?.id ?? null;
  }, [wallets]);

  const shortenWalletId = (walletId: string) =>
    `${walletId.substring(0, 12)}...${walletId.substring(walletId.length - 8)}`;
  // No hardcoded SOV token ID — resolved dynamically from /api/v1/token/balances

  const isHex = (value: string) => /^[0-9a-fA-F]+$/.test(value);
  const normalizeRecipient = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.startsWith('did:zhtp:')) {
      return trimmed.substring('did:zhtp:'.length);
    }
    return trimmed;
  };

  const isValidRecipient = (value: string) => {
    const hex = normalizeRecipient(value);
    if (!isHex(hex)) return false;
    return hex.length === 64 || hex.length === 5184;
  };

  // Re-fetch wallet balances from server whenever screen gains focus
  useFocusEffect(
    useCallback(() => {
      refreshWallets();
    }, [refreshWallets]),
  );

  // Re-load token list whenever wallet data changes (including after refresh)
  useEffect(() => {
    if (currentIdentity?.did) {
      loadAllTokens();
    }
  }, [currentIdentity?.did, wallets]);

  // Load both SOV wallets and custom tokens
  const loadAllTokens = async () => {
    if (!currentIdentity?.did) {
      return;
    }

    setTokensLoading(true);
    setTokensError(null);

    try {
      const tokens: SendableToken[] = [];
      const tokenMap = new Map<string, SendableToken>(); // To deduplicate

      // 1. Add SOV from wallets (sum all wallet balances)
      if (wallets && wallets.length > 0) {
        const totalSovBalance = wallets.reduce(
          (sum, wallet) => sum + (wallet.total_balance || 0),
          0,
        );
        if (totalSovBalance > 0) {
          tokens.push({
            id: 'SOV',
            symbol: 'SOV',
            name: 'Sovereign',
            balance: totalSovBalance,
            type: 'sov',
            decimals: SOV_DECIMALS,
          });
        }
      }

      // 2. Load all token balances (includes SOV + custom tokens).
      // IMPORTANT: Balances are keyed by the primary wallet ID, NOT the
      // identity ID. CBE (and other tokens) are held at selectedWallet.id —
      // querying by identity returns 0 for CBE. Fall back to identity only
      // when no wallet is available yet.
      const primaryWallet = wallets?.find(
        w => (w.wallet_type || '').toLowerCase() === 'primary',
      ) ?? wallets?.[0];
      const identityHex = currentIdentity.did.startsWith('did:zhtp:')
        ? currentIdentity.did.substring('did:zhtp:'.length)
        : currentIdentity.did;
      const balanceLookupAddress = primaryWallet?.id || identityHex;

      console.log(
        '[SendTokensScreen] Loading token balances for:',
        balanceLookupAddress,
        primaryWallet ? '(wallet)' : '(identity fallback)',
      );
      try {
        const allBalances = await tokenService.getUserTokenBalances(balanceLookupAddress);
        if (allBalances && allBalances.length > 0) {
          // Find the SOV wallet entry we added above (if any)
          const sovEntry = tokens.find(t => t.type === 'sov');

          allBalances.forEach(token => {
            const symbol = String(token.symbol || '').toUpperCase();

            // Welfare DAO tokens are staking yield, not transferable — hide.
            if (token.token_id && WELFARE_TOKEN_IDS.has(token.token_id)) {
              return;
            }

            // Skip tokens the node didn't tag with decimals — can't safely
            // format or transfer without knowing the unit.
            if (token.decimals == null || !Number.isFinite(token.decimals)) {
              console.warn(
                '[SendTokensScreen] Skipping token with missing decimals:',
                token.token_id,
                token.symbol,
              );
              return;
            }

            const decimals = token.decimals;
            const rawAtoms = String(token.balance ?? '0');
            const humanReadableBalance = atomsToNumber(rawAtoms, decimals);

            // If this is SOV, merge token_id into the existing wallet entry
            if (symbol === 'SOV' && sovEntry) {
              sovEntry.token_id = token.token_id;
              sovEntry.decimals = decimals;
              console.log(
                '[SendTokensScreen] SOV token_id resolved from balances:',
                token.token_id,
              );
              tokenMap.set(token.token_id, sovEntry);
              return;
            }

            const sendableToken: SendableToken = {
              id: token.token_id,
              symbol: token.symbol || 'Token',
              name: token.name || 'Unknown',
              balance: humanReadableBalance,
              type: 'custom',
              token_id: token.token_id,
              decimals,
            };
            tokenMap.set(token.token_id, sendableToken);
            tokens.push(sendableToken);
          });

          // If we didn't have a wallet entry but got SOV from balances, add it
          if (!sovEntry) {
            const sovFromBalances = allBalances.find(
              t => String(t.symbol || '').toUpperCase() === 'SOV',
            );
            if (sovFromBalances && sovFromBalances.decimals != null) {
              const decimals = sovFromBalances.decimals;
              const balance = atomsToNumber(
                String(sovFromBalances.balance ?? '0'),
                decimals,
              );
              tokens.unshift({
                id: 'SOV',
                symbol: 'SOV',
                name: sovFromBalances.name || 'Sovereign',
                balance,
                type: 'sov',
                token_id: sovFromBalances.token_id,
                decimals,
              });
            }
          }
        }
      } catch (customError) {
        console.warn(
          '[SendTokensScreen] Failed to load token balances (non-fatal):',
          customError,
        );
      }

      // 3. Load tracked token IDs (includes legacy "created tokens" key migration)
      try {
        let trackedTokenIds: string[] = [];
        const trackedTokensJson = await AsyncStorage.getItem(TRACKED_TOKENS_KEY);
        if (trackedTokensJson) {
          trackedTokenIds = JSON.parse(trackedTokensJson);
        } else {
          const legacyCreatedTokensJson = await AsyncStorage.getItem(
            LEGACY_CREATED_TOKENS_KEY,
          );
          if (legacyCreatedTokensJson) {
            trackedTokenIds = JSON.parse(legacyCreatedTokensJson);
            await AsyncStorage.setItem(
              TRACKED_TOKENS_KEY,
              JSON.stringify(trackedTokenIds),
            );
            await AsyncStorage.removeItem(LEGACY_CREATED_TOKENS_KEY);
          }
        }

        // Fetch token info for each tracked token
        for (const tokenId of trackedTokenIds) {
          // Welfare tokens are staking yield — never expose in Send picker.
          if (WELFARE_TOKEN_IDS.has(tokenId)) continue;
          if (!tokenMap.has(tokenId)) {
            // Token not in balance list, try to get info and add with 0 balance
            try {
              const tokenInfo = await tokenService.getTokenInfo(tokenId);
              const sendableToken: SendableToken = {
                id: tokenId,
                symbol: tokenInfo.symbol || 'Token',
                name: tokenInfo.name || 'Unknown',
                balance: 0,
                type: 'custom',
                token_id: tokenId,
                decimals: tokenInfo.decimals ?? 0,
              };
              tokenMap.set(tokenId, sendableToken);
              tokens.push(sendableToken);
            } catch (infoError) {
              console.warn(
                '[SendTokensScreen] Failed to get info for tracked token:',
                tokenId,
              );
            }
          }
        }
      } catch (storageError) {
        console.warn(
          '[SendTokensScreen] Failed to load tracked tokens from storage:',
          storageError,
        );
      }

      // 4. Merge in every token the chain knows about (registry), with
      //    balance 0 if the user doesn't hold any. This guarantees CBE and
      //    any future tokens show up as sendable even before the user
      //    receives them. Registry comes from GET /api/v1/token/list.
      try {
        const registry = await getTokenRegistry();
        for (const item of registry) {
          // Welfare tokens are staking yield — never expose in Send picker.
          if (WELFARE_TOKEN_IDS.has(item.token_id)) continue;
          if (tokenMap.has(item.token_id)) continue;
          const symbol = (item.symbol || '').toUpperCase();
          // SOV is always rendered from the wallet-list aggregate, not the
          // registry row. Skip here to avoid a duplicate zero-balance SOV.
          if (symbol === 'SOV' && tokens.some(t => t.type === 'sov')) continue;
          if (item.decimals == null || !Number.isFinite(item.decimals)) {
            console.warn(
              '[SendTokensScreen] Registry token missing decimals, skipping:',
              item.token_id,
              item.symbol,
            );
            continue;
          }
          const sendableToken: SendableToken = {
            id: item.token_id,
            symbol: item.symbol || 'Token',
            name: item.name || 'Unknown',
            balance: 0,
            type: 'custom',
            token_id: item.token_id,
            decimals: item.decimals,
          };
          tokenMap.set(item.token_id, sendableToken);
          tokens.push(sendableToken);
        }
      } catch (registryError) {
        console.warn(
          '[SendTokensScreen] Failed to load token registry (non-fatal):',
          registryError,
        );
      }

      setAllTokens(tokens);

      if (tokens.length > 0) {
        // Priority: route-preselected token → SOV → first available.
        const preselected = preselectedTokenId
          ? tokens.find(
              t => t.token_id === preselectedTokenId || t.id === preselectedTokenId,
            )
          : null;
        const sovToken = tokens.find(t => t.type === 'sov');
        setSelectedToken(preselected || sovToken || tokens[0]);
      }

      // Default from-wallet for SOV transfers
      if (wallets && wallets.length > 0 && !selectedFromWallet) {
        setSelectedFromWallet(getDefaultSovWalletId());
      }
    } catch (error: any) {
      console.error('[SendTokensScreen] Failed to load tokens:', error);
      setTokensError(error.message || 'Failed to load tokens');
    } finally {
      setTokensLoading(false);
    }
  };

  useEffect(() => {
    if (selectedToken?.type !== 'sov') {
      return;
    }
    if (!wallets || wallets.length === 0) {
      return;
    }
    const hasCurrentSelection = selectedFromWallet
      ? wallets.some(w => w.id === selectedFromWallet)
      : false;
    if (!hasCurrentSelection) {
      setSelectedFromWallet(getDefaultSovWalletId());
    }
  }, [selectedToken?.type, selectedFromWallet, wallets, getDefaultSovWalletId]);

  // Validate recipient based on token type
  const isValidSovRecipient = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length === 64 && isHex(trimmed);
  };

  // Validate transfer form
  const validateTransfer = (): boolean => {
    const newErrors: TransferFormErrors = {};

    if (!transferForm.recipient.trim()) {
      newErrors.recipient = 'Recipient is required';
    } else if (selectedToken?.type === 'sov') {
      if (!isValidSovRecipient(transferForm.recipient)) {
        newErrors.recipient = 'Recipient wallet ID must be 64 hex characters';
      }
    } else if (!isValidRecipient(transferForm.recipient)) {
      newErrors.recipient =
        'Recipient must be DID (did:zhtp:...) or hex key id/pubkey';
    }

    if (!transferForm.amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = Number.parseFloat(transferForm.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Amount must be greater than 0';
      } else if (selectedToken?.type === 'sov' && selectedFromWallet) {
        // SOV: validate against per-wallet balance
        const sourceWallet = wallets?.find(w => w.id === selectedFromWallet);
        if (sourceWallet && amount > sourceWallet.available_balance) {
          newErrors.amount = `Insufficient balance (${sourceWallet.available_balance.toFixed(
            2,
          )})`;
        }
      } else if (selectedToken && amount > selectedToken.balance) {
        newErrors.amount = `Insufficient balance (${selectedToken.balance})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Open confirmation modal (validates first)
  const handleReview = () => {
    if (!selectedToken || !validateTransfer()) return;
    setShowConfirmation(true);
  };

  // Handle transfer (called from confirmation modal)
  const handleTransfer = async () => {
    setShowConfirmation(false);
    if (!selectedToken || !validateTransfer()) {
      return;
    }

    setIsTransferring(true);
    setTransferStatus({ type: null, message: '' });

    try {
      console.log('[SendTokensScreen] Transferring:', selectedToken.symbol);

      const decimals = selectedToken.decimals ?? SOV_DECIMALS;
      const baseUnits = humanToAtomic(transferForm.amount, decimals);
      if (!baseUnits) {
        throw new Error(`Amount must have at most ${decimals} decimals`);
      }

      if (selectedToken.type === 'sov') {
        // SOV: wallet-to-wallet transfer
        if (!selectedFromWallet) {
          throw new Error('Please select a source wallet');
        }

        const sovRequest: SovTransferRequest = {
          from_wallet_id: selectedFromWallet,
          to_wallet_id: transferForm.recipient.trim(),
          amount: baseUnits,
          token_id: selectedToken.token_id || '',
        };

        await tokenService.transferSov(sovRequest);
      } else {
        // Custom token (e.g. CBE): wallet-to-wallet transfer.
        //
        // Like SOV, these tokens are held at wallet_id, not at the identity
        // key. Route through transferTokenFromWallet so the signed tx carries
        // the correct sender (`selectedWallet.id`) and the nonce is fetched
        // against the sender — not the recipient.
        const tokenId = selectedToken.token_id;
        if (!tokenId) {
          throw new Error('Token ID missing for selected token.');
        }

        const primaryWallet =
          wallets?.find(w => (w.wallet_type || '').toLowerCase() === 'primary') ??
          wallets?.[0];
        const fromWalletId = primaryWallet?.id;
        if (!fromWalletId) {
          throw new Error('No wallet available to send from.');
        }

        await tokenService.transferTokenFromWallet({
          token_id: tokenId,
          from_wallet_id: fromWalletId,
          to_wallet_id: transferForm.recipient.trim(),
          amount: baseUnits,
          chain_id: CHAIN_ID,
        });
      }

      setTransferStatus({
        type: 'success',
        message: `Transfer submitted — check Activity for confirmation.`,
      });

      refreshWallets();

      // Offer to save recipient to address book if not already saved
      const recipient = transferForm.recipient.trim();
      const alreadySaved = findByAddress(recipient);
      if (!alreadySaved) {
        setTimeout(() => {
          setNewContactName('');
          setSavingContact({ address: recipient });
        }, 800);
      } else {
        setTimeout(() => navigation.goBack(), 1500);
      }
    } catch (error: any) {
      console.error('[SendTokensScreen] Transfer failed:', error);
      setTransferStatus({
        type: 'error',
        message: error.message || 'Failed to transfer token',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  if (!currentIdentity) {
    return <LoadingView />;
  }

  if (tokensLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.md} paddingBottom={spacing.xl}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="lg" style={{ paddingHorizontal: spacing.sm }}>
          {/* Title */}
          <View>
            <Text
              style={{
                fontSize: typography.size.lg,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              Send Token
            </Text>
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
                marginTop: spacing.xs,
              }}
            >
              Transfer your tokens to another address
            </Text>
          </View>

          {/* Error message */}
          {tokensError && (
            <Card style={{ backgroundColor: colors.error + '20' }}>
              <Text
                style={{ color: colors.error, fontSize: typography.size.sm }}
              >
                {tokensError}
              </Text>
              <Button
                variant="primary"
                size="sm"
                onPress={loadAllTokens}
                style={{ marginTop: spacing.md }}
              >
                Retry
              </Button>
            </Card>
          )}

          {/* Transfer status */}
          {transferStatus.message && (
            <Card
              style={{
                backgroundColor:
                  transferStatus.type === 'success'
                    ? colors.success + '20'
                    : colors.error + '20',
              }}
            >
              <Text
                style={{
                  color:
                    transferStatus.type === 'success'
                      ? colors.success
                      : colors.error,
                  fontSize: typography.size.sm,
                }}
              >
                {transferStatus.message}
              </Text>
            </Card>
          )}

          {/* Token Selection */}
          {allTokens.length > 0 ? (
            <View>
              <Row
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_secondary,
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  SELECT TOKEN
                </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('TokenManagement')}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: borderRadius.sm,
                    backgroundColor: colors.bg_darker,
                    borderWidth: 1,
                    borderColor: colors.primary + '40',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.primary,
                    }}
                  >
                    Manage
                  </Text>
                </TouchableOpacity>
              </Row>

              <Column gap="xs">
                {allTokens.map(token => (
                  <TouchableOpacity
                    key={token.id}
                    onPress={() => {
                      setSelectedToken(token);
                      setTransferForm({ recipient: '', amount: '', memo: '' });
                      setErrors({});
                      if (token.type === 'sov' && wallets?.length > 0) {
                        setSelectedFromWallet(getDefaultSovWalletId());
                      }
                    }}
                    style={{
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.md,
                      borderRadius: borderRadius.lg,
                      backgroundColor:
                        selectedToken?.id === token.id
                          ? colors.primary + '20'
                          : colors.bg_darker,
                      borderWidth: 1.5,
                      borderColor:
                        selectedToken?.id === token.id
                          ? colors.primary
                          : colors.border,
                    }}
                  >
                    <Row
                      style={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Column gap="xs" style={{ flex: 1 }}>
                        <Row style={{ alignItems: 'center', gap: spacing.xs }}>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              fontWeight: typography.weight.semibold,
                              color: colors.text_primary,
                            }}
                          >
                            {token.symbol}
                          </Text>
                          {token.balance === 0 && token.type === 'custom' && (
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: colors.primary,
                                fontWeight: typography.weight.semibold,
                              }}
                            >
                              (Tracked)
                            </Text>
                          )}
                        </Row>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                          }}
                        >
                          {token.name}
                        </Text>
                      </Column>
                      <Column gap="xs" style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            fontWeight: typography.weight.semibold,
                            color: colors.text_primary,
                          }}
                        >
                          {token.balance.toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                          }}
                        >
                          {token.balance === 0 && token.type === 'custom'
                            ? 'No balance'
                            : 'Available'}
                        </Text>
                      </Column>
                    </Row>
                  </TouchableOpacity>
                ))}
              </Column>
            </View>
          ) : (
            <Card style={{ backgroundColor: colors.warning + '20' }}>
              <Text
                style={{ color: colors.warning, fontSize: typography.size.sm }}
              >
                No tokens available yet. Receive or add tracked token IDs to
                get started.
              </Text>
            </Card>
          )}

          {/* Choose from Contacts — compact shortcut, sits between token list
              and the transfer form. Hidden when the address book is empty. */}
          {selectedToken && addressBookEntries.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowAddressBook(true)}
              style={{
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.full,
                borderWidth: 1,
                borderColor: colors.primary + '60',
                backgroundColor: colors.primary + '10',
              }}
            >
              <Text style={{ fontSize: typography.size.sm, color: colors.primary }}>
                👥
              </Text>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.primary,
                }}
              >
                Choose from Contacts
              </Text>
            </TouchableOpacity>
          )}

          {/* Transfer Form */}
          {selectedToken && (
            <Card>
              <View style={{ marginBottom: spacing.lg }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Balance
                </Text>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      color: colors.text_secondary,
                    }}
                  >
                    {selectedToken.name} ({selectedToken.symbol})
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                    }}
                  >
                    {selectedToken.balance.toFixed(2)}
                  </Text>
                </Row>
              </View>

              {/* Recipient Input */}
              <View>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Recipient Wallet Address
                </Text>
                <FormField
                  label=""
                  placeholder="64 hex characters"
                  value={transferForm.recipient}
                  onChangeText={text => {
                    setTransferForm(prev => ({ ...prev, recipient: text }));
                    if (errors.recipient) {
                      setErrors(prev => ({ ...prev, recipient: undefined }));
                    }
                  }}
                  error={errors.recipient}
                  editable={!isTransferring}
                />
                {transferForm.recipient.trim().length > 0 && (() => {
                  const saved = findByAddress(transferForm.recipient.trim());
                  return saved ? (
                    <Text style={{ fontSize: typography.size.sm, color: colors.primary, marginTop: spacing.xs }}>
                      {saved.name}
                    </Text>
                  ) : null;
                })()}
              </View>

              {/* Amount */}
              <FormField
                label="Amount"
                placeholder="0"
                value={transferForm.amount}
                onChangeText={text => {
                  setTransferForm(prev => ({ ...prev, amount: text }));
                  if (errors.amount) {
                    setErrors(prev => ({ ...prev, amount: undefined }));
                  }
                }}
                keyboardType="decimal-pad"
                error={errors.amount}
                editable={!isTransferring}
              />

              {/* Memo (Optional) */}
              <FormField
                label="Memo (Optional)"
                placeholder="Add a note to this transfer"
                value={transferForm.memo}
                onChangeText={text => {
                  setTransferForm(prev => ({ ...prev, memo: text }));
                }}
                multiline
                numberOfLines={2}
                editable={!isTransferring}
              />

              {/* Action Buttons */}
              {/* CBE sends are disabled until the node accepts wallet-based
                  TokenTransfer for non-SOV tokens. The mobile signing path is
                  ready (transferTokenFromWallet) — flip this back on once the
                  backend verification path is fixed. */}
              {(selectedToken.symbol || '').toUpperCase() === 'CBE' && (
                <View
                  style={{
                    marginTop: spacing.md,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    backgroundColor: colors.warning + '15',
                    borderWidth: 1,
                    borderColor: colors.warning + '55',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.warning,
                      fontWeight: typography.weight.semibold,
                      marginBottom: spacing.xs,
                    }}
                  >
                    CBE transfers temporarily unavailable
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                    }}
                  >
                    Sending is disabled while the network verification path is being updated. Receiving CBE still works.
                  </Text>
                </View>
              )}
              <Row gap="md" style={{ marginTop: spacing.lg }}>
                <Button
                  variant="primary"
                  onPress={handleReview}
                  loading={isTransferring}
                  disabled={
                    isTransferring ||
                    (selectedToken.symbol || '').toUpperCase() === 'CBE'
                  }
                  style={{ flex: 1 }}
                >
                  Send
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  disabled={isTransferring}
                  style={{ flex: 1 }}
                >
                  Cancel
                </Button>
              </Row>
            </Card>
          )}
        </Column>
      </ScrollView>

      {/* Address book picker */}
      <Modal visible={showAddressBook} transparent animationType="slide" onRequestClose={() => setShowAddressBook(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.bg_dark,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
              paddingTop: spacing.md,
              paddingBottom: spacing['2xl'],
              maxHeight: '80%',
            }}
          >
            {/* Drag handle */}
            <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.bg_lighter,
                }}
              />
            </View>

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: spacing.lg,
                marginBottom: spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xl,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                Contacts
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddressBook(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.bg_lighter,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.text_primary, fontSize: 16, fontWeight: '600' }}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Contact list */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            >
              {addressBookEntries.map((entry, index) => (
                <TouchableOpacity
                  key={entry.id}
                  onPress={() => {
                    setTransferForm(prev => ({ ...prev, recipient: entry.address }));
                    setShowAddressBook(false);
                  }}
                  activeOpacity={0.6}
                  style={{
                    paddingVertical: spacing.lg,
                    paddingHorizontal: spacing.md,
                    borderRadius: borderRadius.base,
                    backgroundColor: index % 2 === 0 ? colors.bg_darker : 'transparent',
                    marginBottom: spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {entry.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                      fontFamily: 'Courier',
                    }}
                    numberOfLines={1}
                  >
                    {entry.address}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Save contact prompt (shown after successful transfer) */}
      <Modal visible={!!savingContact} transparent animationType="fade" onRequestClose={() => { setSavingContact(null); navigation.goBack(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: spacing.lg }}>
            <View
              style={{
                backgroundColor: colors.bg_dark,
                borderRadius: borderRadius.xl,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.xl,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xl,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                Save contact?
              </Text>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.text_secondary,
                  fontFamily: 'Courier',
                  marginBottom: spacing.lg,
                }}
                numberOfLines={2}
              >
                {savingContact?.address}
              </Text>
              <TextInput
                value={newContactName}
                onChangeText={setNewContactName}
                placeholder="Contact name"
                placeholderTextColor={colors.text_placeholder}
                style={{
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.base,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.lg,
                  color: colors.text_primary,
                  fontSize: typography.size.md,
                  marginBottom: spacing.lg,
                }}
                autoFocus
              />
              <Row style={{ gap: spacing.md }}>
                <TouchableOpacity
                  onPress={() => { setSavingContact(null); navigation.goBack(); }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.lg,
                    borderRadius: borderRadius.base,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: colors.text_secondary,
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                    }}
                  >
                    Skip
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    if (!newContactName.trim()) return;
                    await addToBook(newContactName.trim(), savingContact!.address);
                    setSavingContact(null);
                    navigation.goBack();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.lg,
                    borderRadius: borderRadius.base,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: colors.bg_darkest,
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.bold,
                    }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </Row>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Confirmation Modal ── */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
        }}>
          <View style={{
            backgroundColor: colors.bg_dark,
            borderRadius: borderRadius.lg,
            overflow: 'hidden',
          }}>
            {/* Header */}
            <View style={{
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
            }}>
              <Text style={{
                color: colors.bg_darkest,
                fontSize: typography.size.md,
                fontWeight: typography.weight.bold,
                textAlign: 'center',
              }}>
                Confirm Transfer
              </Text>
            </View>

            {/* Details */}
            <View style={{ padding: spacing.lg }}>
              {/* Amount */}
              <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                <Text style={{
                  fontSize: 32,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}>
                  {transferForm.amount} {selectedToken?.symbol}
                </Text>
              </View>

              {/* Rows */}
              <View style={{ gap: spacing.md }}>
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: `${colors.border}50`,
                }}>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    To
                  </Text>
                  <Text style={{
                    fontSize: typography.size.sm,
                    color: colors.text_primary,
                    fontFamily: 'Courier',
                    maxWidth: '60%',
                  }} numberOfLines={1} ellipsizeMode="middle">
                    {transferForm.recipient}
                  </Text>
                </View>

                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: `${colors.border}50`,
                }}>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    From
                  </Text>
                  <Text style={{
                    fontSize: typography.size.sm,
                    color: colors.text_primary,
                    fontFamily: 'Courier',
                    maxWidth: '60%',
                  }} numberOfLines={1} ellipsizeMode="middle">
                    {selectedFromWallet ?? 'Primary Wallet'}
                  </Text>
                </View>

                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: `${colors.border}50`,
                }}>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    Token
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_primary }}>
                    {selectedToken?.name} ({selectedToken?.symbol})
                  </Text>
                </View>

                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                }}>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    Network
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_primary }}>
                    Sovereign Network
                  </Text>
                </View>
              </View>

              {/* Warning */}
              <View style={{
                marginTop: spacing.lg,
                padding: spacing.sm,
                backgroundColor: `${colors.warning}15`,
                borderRadius: borderRadius.sm,
              }}>
                <Text style={{
                  fontSize: typography.size.xs,
                  color: colors.warning,
                  textAlign: 'center',
                }}>
                  Transactions are irreversible. Please verify the recipient address.
                </Text>
              </View>

              {/* Buttons */}
              <Row gap="md" style={{ marginTop: spacing.lg }}>
                <Button
                  variant="secondary"
                  onPress={() => setShowConfirmation(false)}
                  style={{ flex: 1 }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  onPress={handleTransfer}
                  style={{ flex: 1 }}
                >
                  Confirm
                </Button>
              </Row>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenLayout>
  );
};

export default SendTokensScreen;
