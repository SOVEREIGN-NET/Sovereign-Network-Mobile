import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import {
  Card,
  Text, LoadingView,
  Column, ScreenLayout
} from '../components';
import SShieldLogo from '../components/atoms/Logo';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const WalletScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('Tokens');

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const wallets = currentIdentity.wallets || [];
  const selectedWallet = wallets[0];

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
          {/* Wallet Header */}
          <View style={{ paddingHorizontal: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text
                  style={{
                    fontSize: typography.size.lg,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  {selectedWallet?.name || 'Wallet'}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: spacing.xs,
                  }}
                >
                  {selectedWallet?.id} • Not synced
                </Text>
              </View>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.bg_darker,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </View>
            </View>
          </View>

          {/* Wallet Address Card */}
          {selectedWallet && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0, overflow: 'hidden' }}>
                <View
                  style={{
                    borderTopWidth: 2,
                    borderTopColor: colors.primary,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.lg,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {t.wallet.details.address}
                    </Text>
                    <TouchableOpacity>
                      <Text style={{ fontSize: typography.size.xs, color: colors.primary }}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      letterSpacing: 0.5,
                    }}
                  >
                    {selectedWallet.address.substring(0, 10)}...{selectedWallet.address.substring(selectedWallet.address.length - 8)}
                  </Text>
                </View>

                {/* Balance Section */}
                <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: typography.size['5xl'],
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {selectedWallet.balance.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    {t.wallet.currency}
                  </Text>
                </View>
              </Card>
            </View>
          )}

          {/* Send & Receive Buttons */}
          <View
            style={{
              paddingHorizontal: spacing.md,
              flexDirection: 'row',
              gap: spacing.md,
            }}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: spacing.lg,
                borderRadius: borderRadius.base,
                borderWidth: 2,
                borderColor: colors.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => navigation?.navigate('SendTokens')}
              disabled={isLoading}
            >
              <Text
                style={{
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                ↑ {t.wallet.actions.send}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: spacing.lg,
                borderRadius: borderRadius.base,
                borderWidth: 2,
                borderColor: colors.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => navigation?.navigate('ReceiveTokens')}
              disabled={isLoading}
            >
              <Text
                style={{
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                ↓ {t.wallet.actions.receive}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'Tokens' && wallets.length > 0 && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Column gap="md">
                {wallets.map((wallet) => (
                  <TouchableOpacity
                    key={wallet.id}
                    activeOpacity={0.7}
                  >
                    <Card style={{ marginHorizontal: 0 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.lg,
                        }}
                      >
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: colors.primary,
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: spacing.md,
                            overflow: 'hidden',
                          }}
                        >
                          <SShieldLogo size={48} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              fontWeight: typography.weight.semibold,
                              color: colors.text_primary,
                            }}
                          >
                            {wallet.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_secondary,
                              marginTop: 2,
                            }}
                          >
                            {wallet.id}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: typography.size.md,
                            fontWeight: typography.weight.bold,
                            color: colors.text_primary,
                          }}
                        >
                          {wallet.balance.toLocaleString()}
                        </Text>
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))}
              </Column>
            </View>
          )}

          {activeTab === 'NFTs' && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card>
                <Column gap="md" style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                    No NFTs
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    You don't have any NFTs yet
                  </Text>
                </Column>
              </Card>
            </View>
          )}

          {activeTab === 'Activity' && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card>
                <Column gap="md" style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                    No Activity
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    Your transaction history will appear here
                  </Text>
                </Column>
              </Card>
            </View>
          )}

          {/* Bottom Tab Bar */}
          <View
            style={{
              marginHorizontal: spacing.md,
              marginTop: spacing.lg,
              flexDirection: 'row',
              gap: spacing.md,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.lg,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.md,
            }}
          >
            {['Tokens', 'NFTs', 'Activity'].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.md,
                  borderRadius: borderRadius.base,
                  backgroundColor: activeTab === tab ? 'rgba(0,0,0,0.3)' : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: activeTab === tab ? colors.primary : colors.text_secondary,
                    fontWeight: activeTab === tab ? typography.weight.semibold : typography.weight.normal,
                  }}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Column>
      </ScrollView>
    </ScreenLayout>
  );
};

export default WalletScreen;
