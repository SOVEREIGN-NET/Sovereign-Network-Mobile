import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  Column,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const BookmarksScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();

  const mockBookmarks = [
    {
      id: '1',
      name: 'Main Wallet',
      address: 'did:zhtp:abc123...xyz',
      type: 'wallet',
      lastUsed: '2 hours ago',
    },
    {
      id: '2',
      name: 'DeFi Hub',
      address: 'zhtp://defi-hub.sovereign',
      type: 'dapp',
      lastUsed: '1 day ago',
    },
    {
      id: '3',
      name: 'DAO Portal',
      address: 'zhtp://dao-governance.sovereign',
      type: 'dapp',
      lastUsed: '3 days ago',
    },
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'wallet':
        return '💼';
      case 'dapp':
        return '🔗';
      case 'website':
        return '🌐';
      default:
        return '📌';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'wallet':
        return t.bookmarks.wallet;
      case 'dapp':
        return t.bookmarks.dapp;
      case 'website':
        return t.bookmarks.website;
      default:
        return type;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
            {/* Header */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.bookmarks.title}
              </Text>
            </View>

            {/* Bookmarks List */}
            {mockBookmarks.length > 0 ? (
              <View style={{ paddingHorizontal: spacing.md }}>
                <Column gap="md">
                  {mockBookmarks.map((bookmark) => (
                    <TouchableOpacity key={bookmark.id} activeOpacity={0.7}>
                      <Card style={{ marginHorizontal: 0 }}>
                        <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm }}>
                            <Text
                              style={{
                                fontSize: typography.size.lg,
                              }}
                            >
                              {getTypeIcon(bookmark.type)}
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: typography.size.sm,
                                  fontWeight: typography.weight.semibold,
                                  color: colors.text_primary,
                                  marginBottom: spacing.xs,
                                }}
                              >
                                {bookmark.name}
                              </Text>
                              <Text
                                style={{
                                  fontSize: typography.size.xs,
                                  color: colors.text_secondary,
                                  marginBottom: spacing.xs,
                                }}
                                numberOfLines={1}
                              >
                                {bookmark.address}
                              </Text>
                              <Text
                                style={{
                                  fontSize: typography.size.xs,
                                  color: colors.text_tertiary,
                                }}
                              >
                                {getTypeLabel(bookmark.type)}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: colors.text_secondary,
                              }}
                            >
                              {t.bookmarks.lastUsed}: {bookmark.lastUsed}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </Column>
              </View>
            ) : (
              <View style={{ paddingHorizontal: spacing.md }}>
                <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {t.bookmarks.empty}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                    }}
                  >
                    {t.bookmarks.emptyDescription}
                  </Text>
                </Card>
              </View>
            )}

            {/* Add Bookmark Button */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Button variant="secondary">
                {t.bookmarks.addBookmark}
              </Button>
            </View>
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default BookmarksScreen;
