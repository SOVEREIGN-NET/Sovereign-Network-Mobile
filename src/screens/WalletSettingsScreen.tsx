import React from 'react';
import { Platform, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { BUILD_INFO } from '../config';

const WalletSettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">
        {/* Export / Recovery */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            {t.wallet.settings.title}
          </Text>

          <Column gap="sm">
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('BackupIdentity')}
            >
              {t.wallet.settings.exportWallet}
            </Button>
          </Column>
        </Card>

        {/* Build Info — helps identify which build a user is running */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            Build Info
          </Text>

          <View
            style={{
              backgroundColor: colors.bg_darker,
              padding: spacing.md,
              borderRadius: borderRadius.base,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Column gap="sm">
              <BuildInfoRow
                label="Platform"
                value={Platform.OS === 'ios' ? 'iOS' : 'Android'}
              />
              <BuildInfoRow
                label="Version"
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.version
                    : BUILD_INFO.android.version
                }
              />
              <BuildInfoRow
                label="Build"
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.build
                    : BUILD_INFO.android.build
                }
              />
              <BuildInfoRow
                label="Commit"
                value={`${BUILD_INFO.gitCommit}${BUILD_INFO.gitDirty ? '-dirty' : ''}`}
                mono
              />
              <BuildInfoRow label="Branch" value={BUILD_INFO.gitBranch} mono />
              <BuildInfoRow
                label="Generated"
                value={BUILD_INFO.generatedAt}
                mono
              />
            </Column>
          </View>
        </Card>
      </Column>
    </ScreenLayout>
  );
};

const BuildInfoRow = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <Text
      style={{
        fontSize: typography.size.xs,
        color: colors.text_secondary,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: typography.size.xs,
        color: colors.text_primary,
        fontWeight: typography.weight.semibold,
        fontFamily: mono ? (Platform.OS === 'ios' ? 'Menlo' : 'monospace') : undefined,
        flexShrink: 1,
        textAlign: 'right',
        marginLeft: spacing.md,
      }}
      numberOfLines={1}
    >
      {value}
    </Text>
  </Row>
);

export default WalletSettingsScreen;
