import React from 'react';
import {
  Card,
  Text,
  Button,
  Column,
  LoadingView,
  ScreenLayout,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';

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
      </Column>
    </ScreenLayout>
  );
};

export default WalletSettingsScreen;
