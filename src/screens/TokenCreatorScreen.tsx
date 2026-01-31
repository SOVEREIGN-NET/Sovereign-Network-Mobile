/**
 * Token Creator Screen
 * Create, mint, transfer, and view tokens via QUIC endpoints
 * Feature-flagged to only show in development builds
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  FormField,
  HeaderBar,
  Text,
  ErrorView,
  LoadingView,
  SideDrawer,
  DrawerItem,
} from '../components';
import { colors, spacing, typography } from '../theme';
import tokenService from '../services/TokenService';
import { useAuth } from '../hooks/useAuth';
import { useTokenOperations } from '../hooks/useTokenOperations';
import {
  TokenCreateRequest,
  TokenMintRequest,
  TokenTransferRequest,
  TokenListItem,
  TokenInfoResponse,
} from '../types/token';

type TabName = 'create' | 'mint' | 'transfer' | 'view';

interface SubmitStatus {
  type: 'success' | 'error' | null;
  message: string;
}

interface CreateFormErrors {
  name?: string;
  symbol?: string;
  initial_supply?: string;
  decimals?: string;
  max_supply?: string;
}

interface MintFormErrors {
  amount?: string;
  to?: string;
}

interface TransferFormErrors {
  amount?: string;
  to?: string;
}

export const TokenCreatorScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { currentIdentity } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('create');
  const [drawerVisible, setDrawerVisible] = useState(false);

  // CREATE TAB STATE
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [initialSupply, setInitialSupply] = useState('');
  const [decimals, setDecimals] = useState('8');
  const [maxSupply, setMaxSupply] = useState('');
  const [createErrors, setCreateErrors] = useState<CreateFormErrors>({});
  const [createLoading, setCreateLoading] = useState(false);
  const [createStatus, setCreateStatus] = useState<SubmitStatus>({ type: null, message: '' });

  // MINT TAB STATE
  const [myTokens, setMyTokens] = useState<TokenListItem[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintRecipient, setMintRecipient] = useState('');
  const [mintErrors, setMintErrors] = useState<MintFormErrors>({});
  const [mintLoading, setMintLoading] = useState(false);
  const [mintStatus, setMintStatus] = useState<SubmitStatus>({ type: null, message: '' });

  // TRANSFER TAB STATE
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferErrors, setTransferErrors] = useState<TransferFormErrors>({});
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferStatus, setTransferStatus] = useState<SubmitStatus>({ type: null, message: '' });

  // VIEW TAB STATE
  const [allTokens, setAllTokens] = useState<TokenListItem[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [selectedTokenDetail, setSelectedTokenDetail] = useState<TokenInfoResponse | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const tabs: { id: TabName; label: string }[] = [
    { id: 'create', label: 'Create' },
    { id: 'mint', label: 'Mint' },
    { id: 'transfer', label: 'Transfer' },
    { id: 'view', label: 'View' },
  ];

  // Load user's tokens on mount
  useEffect(() => {
    loadUserTokens();
  }, []);

  const loadUserTokens = async () => {
    try {
      const response = await tokenService.listTokens();
      const userTokens = response.tokens.filter(
        (t) => t.token_id && currentIdentity?.did
      );
      setMyTokens(userTokens);
      if (userTokens.length > 0) {
        setSelectedTokenId(userTokens[0].token_id);
      }
    } catch (error) {
      console.error('Failed to load user tokens:', error);
    }
  };

  const loadAllTokens = async () => {
    setViewLoading(true);
    try {
      const response = await tokenService.listTokens();
      setAllTokens(response.tokens);
    } catch (error) {
      console.error('Failed to load all tokens:', error);
    } finally {
      setViewLoading(false);
    }
  };

  const loadTokenDetail = async (tokenId: string) => {
    try {
      const detail = await tokenService.getTokenInfo(tokenId);
      setSelectedTokenDetail(detail);
      setDetailModalVisible(true);
    } catch (error) {
      console.error('Failed to load token detail:', error);
    }
  };

  // VALIDATION FUNCTIONS

  const validateCreateForm = (): boolean => {
    const newErrors: CreateFormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Token name is required';
    } else if (name.length < 2 || name.length > 50) {
      newErrors.name = 'Name must be 2-50 characters';
    }

    if (!symbol.trim()) {
      newErrors.symbol = 'Token symbol is required';
    } else if (!/^[A-Z]{2,10}$/.test(symbol)) {
      newErrors.symbol = 'Symbol must be 2-10 uppercase letters';
    }

    if (!initialSupply.trim()) {
      newErrors.initial_supply = 'Initial supply is required';
    } else {
      const supply = Number.parseFloat(initialSupply);
      if (Number.isNaN(supply) || supply <= 0) {
        newErrors.initial_supply = 'Must be a positive number';
      }
    }

    const dec = Number.parseInt(decimals);
    if (Number.isNaN(dec) || dec < 0 || dec > 18) {
      newErrors.decimals = 'Decimals must be 0-18';
    }

    if (maxSupply && maxSupply.trim() !== '') {
      const maxSup = Number.parseFloat(maxSupply);
      const initSup = Number.parseFloat(initialSupply);
      if (Number.isNaN(maxSup) || maxSup < initSup) {
        newErrors.max_supply = 'Max supply must be >= initial supply';
      }
    }

    setCreateErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateMintForm = (): boolean => {
    const newErrors: MintFormErrors = {};

    if (!mintAmount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = Number.parseFloat(mintAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Must be a positive number';
      }
    }

    if (!mintRecipient.trim()) {
      newErrors.to = 'Recipient DID is required';
    } else if (!mintRecipient.startsWith('did:zhtp:')) {
      newErrors.to = 'Invalid DID format (must start with did:zhtp:)';
    }

    setMintErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateTransferForm = (): boolean => {
    const newErrors: TransferFormErrors = {};

    if (!transferAmount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = Number.parseFloat(transferAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Must be a positive number';
      }
    }

    if (!transferRecipient.trim()) {
      newErrors.to = 'Recipient DID is required';
    } else if (!transferRecipient.startsWith('did:zhtp:')) {
      newErrors.to = 'Invalid DID format (must start with did:zhtp:)';
    }

    setTransferErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // SUBMIT HANDLERS

  const handleCreateToken = async () => {
    if (!validateCreateForm() || !currentIdentity?.did) return;

    setCreateLoading(true);
    setCreateStatus({ type: null, message: '' });

    try {
      const request: TokenCreateRequest = {
        name,
        symbol,
        initial_supply: Number.parseFloat(initialSupply),
        decimals: Number.parseInt(decimals),
        max_supply: maxSupply ? Number.parseFloat(maxSupply) : null,
        // creator_identity auto-derived from authenticated session
      };

      const result = await tokenService.createToken(request);

      if (result.success) {
        setCreateStatus({
          type: 'success',
          message: `✅ Token ${result.symbol} created! ID: ${result.token_id.slice(0, 8)}...`,
        });
        // Clear form
        setName('');
        setSymbol('');
        setInitialSupply('');
        setDecimals('8');
        setMaxSupply('');
        // Reload token list
        loadUserTokens();
      } else {
        setCreateStatus({
          type: 'error',
          message: '❌ Token creation failed',
        });
      }
    } catch (error: any) {
      setCreateStatus({
        type: 'error',
        message: `❌ ${error.message || 'Failed to create token'}`,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleMintToken = async () => {
    if (!validateMintForm() || !currentIdentity?.did || !selectedTokenId) return;

    setMintLoading(true);
    setMintStatus({ type: null, message: '' });

    try {
      const request: TokenMintRequest = {
        token_id: selectedTokenId,
        amount: Number.parseFloat(mintAmount),
        to: mintRecipient,
        // creator_identity auto-derived from authenticated session
      };

      const result = await tokenService.mintToken(request);

      if (result.success) {
        setMintStatus({
          type: 'success',
          message: `✅ Minted ${result.amount_minted} tokens! New total: ${result.new_total_supply}`,
        });
        setMintAmount('');
        setMintRecipient('');
      } else {
        setMintStatus({
          type: 'error',
          message: '❌ Mint failed',
        });
      }
    } catch (error: any) {
      setMintStatus({
        type: 'error',
        message: `❌ ${error.message || 'Failed to mint tokens'}`,
      });
    } finally {
      setMintLoading(false);
    }
  };

  const handleTransferToken = async () => {
    if (!validateTransferForm() || !currentIdentity?.did || !selectedTokenId) return;

    setTransferLoading(true);
    setTransferStatus({ type: null, message: '' });

    try {
      const request: TokenTransferRequest = {
        token_id: selectedTokenId,
        // from auto-derived from authenticated session
        to: transferRecipient,
        amount: Number.parseFloat(transferAmount),
      };

      const result = await tokenService.transferToken(request);

      if (result.success) {
        setTransferStatus({
          type: 'success',
          message: `✅ Transferred ${result.amount} tokens! Your balance: ${result.from_balance}`,
        });
        setTransferAmount('');
        setTransferRecipient('');
      } else {
        setTransferStatus({
          type: 'error',
          message: '❌ Transfer failed',
        });
      }
    } catch (error: any) {
      setTransferStatus({
        type: 'error',
        message: `❌ ${error.message || 'Failed to transfer tokens'}`,
      });
    } finally {
      setTransferLoading(false);
    }
  };

  const drawerItems: DrawerItem[] = [
    {
      id: 'close',
      label: 'Close',
      icon: '✕',
      onPress: () => {
        setDrawerVisible(false);
        // Close modal
        navigation.goBack();
      },
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg_dark }]}>
      {/* Custom Header with Back Button and Menu */}
      <View style={{
        backgroundColor: colors.bg_dark,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md + insets.top,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Back Button */}
        <Pressable
          onPress={() => {
            // Close modal
            navigation.goBack();
          }}
          style={{ padding: spacing.sm, marginLeft: -spacing.sm }}
        >
          <Text style={{ fontSize: 24 }}>←</Text>
        </Pressable>

        {/* Title */}
        <Text style={{
          fontSize: typography.size.lg,
          fontWeight: typography.weight.semibold,
          color: colors.text_primary,
        }}>
          Token Creator
        </Text>

        {/* Hamburger Menu */}
        <Pressable
          onPress={() => setDrawerVisible(true)}
          style={{ padding: spacing.sm, marginRight: -spacing.sm }}
        >
          <View style={{ gap: spacing.xs }}>
            <View style={{ width: 20, height: 2, backgroundColor: colors.text_primary }} />
            <View style={{ width: 20, height: 2, backgroundColor: colors.text_primary }} />
            <View style={{ width: 20, height: 2, backgroundColor: colors.text_primary }} />
          </View>
        </Pressable>
      </View>

      {/* Side Drawer */}
      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      {/* TAB SELECTOR */}
      <View style={[styles.tabContainer, { backgroundColor: colors.bg_dark, paddingHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => {
              setActiveTab(tab.id);
              if (tab.id === 'view') {
                loadAllTokens();
              }
            }}
            style={[
              styles.tabButton,
              {
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderBottomWidth: activeTab === tab.id ? 2 : 0,
                borderBottomColor: activeTab === tab.id ? colors.cyan : 'transparent',
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: activeTab === tab.id ? colors.cyan : colors.text_primary,
                fontSize: 13,
                fontWeight: '400',
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TAB CONTENT */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        {/* CREATE TAB */}
        {activeTab === 'create' && (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            <FormField
              label="Token Name"
              placeholder="e.g., MyToken"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (createErrors.name) {
                  setCreateErrors({ ...createErrors, name: undefined });
                }
              }}
              error={createErrors.name}
              editable={!createLoading}
            />

            <FormField
              label="Symbol"
              placeholder="e.g., MTK"
              value={symbol}
              onChangeText={(text) => {
                setSymbol(text.toUpperCase());
                if (createErrors.symbol) {
                  setCreateErrors({ ...createErrors, symbol: undefined });
                }
              }}
              error={createErrors.symbol}
              editable={!createLoading}
            />

            <FormField
              label="Initial Supply"
              placeholder="1000000"
              value={initialSupply}
              onChangeText={(text) => {
                setInitialSupply(text);
                if (createErrors.initial_supply) {
                  setCreateErrors({ ...createErrors, initial_supply: undefined });
                }
              }}
              error={createErrors.initial_supply}
              editable={!createLoading}
              keyboardType="decimal-pad"
            />

            <FormField
              label="Decimals"
              placeholder="8"
              value={decimals}
              onChangeText={(text) => {
                setDecimals(text);
                if (createErrors.decimals) {
                  setCreateErrors({ ...createErrors, decimals: undefined });
                }
              }}
              error={createErrors.decimals}
              editable={!createLoading}
              keyboardType="number-pad"
            />

            <FormField
              label="Max Supply (Optional)"
              placeholder="Leave empty for unlimited"
              value={maxSupply}
              onChangeText={(text) => {
                setMaxSupply(text);
                if (createErrors.max_supply) {
                  setCreateErrors({ ...createErrors, max_supply: undefined });
                }
              }}
              error={createErrors.max_supply}
              editable={!createLoading}
              keyboardType="decimal-pad"
            />

            {createStatus.type && (
              <Card
                style={{
                  borderLeftWidth: 1,
                  borderLeftColor: colors.text_secondary,
                  backgroundColor: colors.bg_secondary,
                }}
              >
                <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>
                  {createStatus.message}
                </Text>
              </Card>
            )}

            <Button
              variant="primary"
              onPress={handleCreateToken}
              loading={createLoading}
              disabled={createLoading}
              style={{ opacity: 0.9 }}
            >
              Create Token
            </Button>
          </View>
        )}

        {/* MINT TAB */}
        {activeTab === 'mint' && (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {myTokens.length === 0 ? (
              <Card>
                <Text style={{ color: colors.text_secondary, textAlign: 'center' }}>
                  No tokens created yet. Create a token first!
                </Text>
              </Card>
            ) : (
              <>
                <View>
                  <Text style={{ color: colors.text_secondary, marginBottom: spacing.sm, fontSize: 12 }}>
                    Select Token
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    {myTokens.map((token) => (
                      <TouchableOpacity
                        key={token.token_id}
                        onPress={() => setSelectedTokenId(token.token_id)}
                        style={{
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          borderWidth: selectedTokenId === token.token_id ? 1 : 0.5,
                          borderColor: selectedTokenId === token.token_id ? colors.cyan : colors.text_secondary,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: selectedTokenId === token.token_id ? colors.cyan : colors.text_secondary,
                            fontSize: 12,
                            fontWeight: '400',
                          }}
                        >
                          {token.symbol}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <FormField
                  label="Amount to Mint"
                  placeholder="1000"
                  value={mintAmount}
                  onChangeText={(text) => {
                    setMintAmount(text);
                    if (mintErrors.amount) {
                      setMintErrors({ ...mintErrors, amount: undefined });
                    }
                  }}
                  error={mintErrors.amount}
                  editable={!mintLoading}
                  keyboardType="decimal-pad"
                />

                <FormField
                  label="Recipient DID"
                  placeholder="did:zhtp:..."
                  value={mintRecipient}
                  onChangeText={(text) => {
                    setMintRecipient(text);
                    if (mintErrors.to) {
                      setMintErrors({ ...mintErrors, to: undefined });
                    }
                  }}
                  error={mintErrors.to}
                  editable={!mintLoading}
                />

                {mintStatus.type && (
                  <Card
                    style={{
                      borderLeftWidth: 1,
                      borderLeftColor: colors.text_secondary,
                      backgroundColor: colors.bg_secondary,
                    }}
                  >
                    <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>
                      {mintStatus.message}
                    </Text>
                  </Card>
                )}

                <Button
                  variant="primary"
                  onPress={handleMintToken}
                  loading={mintLoading}
                  disabled={mintLoading}
                  style={{ opacity: 0.9 }}
                >
                  Mint Tokens
                </Button>
              </>
            )}
          </View>
        )}

        {/* TRANSFER TAB */}
        {activeTab === 'transfer' && (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {myTokens.length === 0 ? (
              <Card>
                <Text style={{ color: colors.text_secondary, textAlign: 'center' }}>
                  No tokens to transfer. Create a token first!
                </Text>
              </Card>
            ) : (
              <>
                <View>
                  <Text style={{ color: colors.text_secondary, marginBottom: spacing.sm, fontSize: 12 }}>
                    Select Token
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    {myTokens.map((token) => (
                      <TouchableOpacity
                        key={token.token_id}
                        onPress={() => setSelectedTokenId(token.token_id)}
                        style={{
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          borderWidth: selectedTokenId === token.token_id ? 1 : 0.5,
                          borderColor: selectedTokenId === token.token_id ? colors.cyan : colors.text_secondary,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: selectedTokenId === token.token_id ? colors.cyan : colors.text_secondary,
                            fontSize: 12,
                            fontWeight: '400',
                          }}
                        >
                          {token.symbol}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <FormField
                  label="Amount to Transfer"
                  placeholder="100"
                  value={transferAmount}
                  onChangeText={(text) => {
                    setTransferAmount(text);
                    if (transferErrors.amount) {
                      setTransferErrors({ ...transferErrors, amount: undefined });
                    }
                  }}
                  error={transferErrors.amount}
                  editable={!transferLoading}
                  keyboardType="decimal-pad"
                />

                <FormField
                  label="Recipient DID"
                  placeholder="did:zhtp:..."
                  value={transferRecipient}
                  onChangeText={(text) => {
                    setTransferRecipient(text);
                    if (transferErrors.to) {
                      setTransferErrors({ ...transferErrors, to: undefined });
                    }
                  }}
                  error={transferErrors.to}
                  editable={!transferLoading}
                />

                {transferStatus.type && (
                  <Card
                    style={{
                      borderLeftWidth: 1,
                      borderLeftColor: colors.text_secondary,
                      backgroundColor: colors.bg_secondary,
                    }}
                  >
                    <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>
                      {transferStatus.message}
                    </Text>
                  </Card>
                )}

                <Button
                  variant="primary"
                  onPress={handleTransferToken}
                  loading={transferLoading}
                  disabled={transferLoading}
                  style={{ opacity: 0.9 }}
                >
                  Transfer Tokens
                </Button>
              </>
            )}
          </View>
        )}

        {/* VIEW TAB */}
        {activeTab === 'view' && (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {viewLoading ? (
              <LoadingView message="Loading tokens..." />
            ) : allTokens.length === 0 ? (
              <Card>
                <Text style={{ color: colors.text_secondary, textAlign: 'center' }}>
                  No tokens on network yet
                </Text>
              </Card>
            ) : (
              allTokens.map((token) => (
                <Card
                  key={token.token_id}
                  onPress={() => loadTokenDetail(token.token_id)}
                  style={{ borderWidth: 1, borderColor: colors.text_secondary }}
                >
                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text_primary, fontWeight: '400' }}>
                        {token.name}
                      </Text>
                      <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>{token.symbol}</Text>
                    </View>
                    <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>
                      {token.total_supply}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* TOKEN DETAIL MODAL */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.bg_dark }]}>
            {selectedTokenDetail && (
              <ScrollView style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text_primary, fontSize: 18, fontWeight: '400' }}>
                      {selectedTokenDetail.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setDetailModalVisible(false)}
                      style={{ padding: spacing.sm }}
                    >
                      <Text style={{ color: colors.text_secondary, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Card style={{ borderWidth: 1, borderColor: colors.text_secondary }}>
                    <View style={{ gap: spacing.md }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Symbol</Text>
                        <Text style={{ color: colors.text_primary, fontWeight: '400', fontSize: 12 }}>
                          {selectedTokenDetail.symbol}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Decimals</Text>
                        <Text style={{ color: colors.text_primary, fontSize: 12, fontWeight: '400' }}>
                          {selectedTokenDetail.decimals}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Total Supply</Text>
                        <Text style={{ color: colors.text_primary, fontSize: 12, fontWeight: '400' }}>
                          {selectedTokenDetail.total_supply}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Max Supply</Text>
                        <Text style={{ color: colors.text_primary, fontSize: 12, fontWeight: '400' }}>
                          {selectedTokenDetail.max_supply || '∞'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Deflationary</Text>
                        <Text style={{ color: colors.text_primary, fontSize: 12, fontWeight: '400' }}>
                          {selectedTokenDetail.is_deflationary ? 'Yes' : 'No'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Creator</Text>
                        <Text style={{ color: colors.text_secondary, fontSize: 11, fontWeight: '400' }}>
                          {selectedTokenDetail.creator.slice(0, 16)}...
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.text_secondary, fontSize: 12, fontWeight: '400' }}>Block</Text>
                        <Text style={{ color: colors.text_primary, fontSize: 12, fontWeight: '400' }}>
                          {selectedTokenDetail.created_at_block}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.bg_secondary,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
