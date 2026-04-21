import React, { useState } from 'react';
import { View } from 'react-native';
import { Card, Text, Button, DetailRow, Column, LoadingView, ScreenLayout } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';

const ConfirmTransactionScreen = ({ navigation, route }: any) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<'success' | 'error' | null>(null);
  const [transactionId, setTransactionId] = useState('');

  const { recipient, amount, currency, fee, total, memo } = route.params || {};

  const handleConfirm = async () => {
    setIsLoading(true);

    // Simulate transaction processing
    setTimeout(() => {
      // Simulate 90% success rate
      if (Math.random() > 0.1) {
        setTransactionId(`0x${Math.random().toString(16).slice(2, 42)}`);
        setTransactionResult('success');
      } else {
        setTransactionResult('error');
      }
      setIsLoading(false);
    }, 1500);
  };

  const handleBack = () => {
    if (transactionResult === 'success') {
      navigation.navigate('WalletMain');
    } else {
      navigation.goBack();
    }
  };

  if (!recipient || amount === undefined) {
    return <LoadingView />;
  }

  if (transactionResult === 'success') {
    return (
      <ScreenLayout>
        <Column gap="lg" style={{ justifyContent: 'center', flex: 1 }}>
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.md }}>
              ✅
            </Text>
            <Text variant="h2" style={{ marginBottom: spacing.md, textAlign: 'center' }}>
              {t.confirmTransaction.success.title}
            </Text>
            <Text
              variant="body"
              style={{
                color: colors.text_secondary,
                marginBottom: spacing.lg,
                textAlign: 'center',
              }}
            >
              {t.confirmTransaction.success.message}
            </Text>

            <Card
              style={{
                backgroundColor: colors.bg_darker,
                marginVertical: spacing.md,
                width: '100%',
              }}
            >
              <Column gap="sm">
                <DetailRow
                  label={t.confirmTransaction.success.transactionId}
                  value={transactionId.substring(0, 12) + '...' + transactionId.substring(-8)}
                />
                <DetailRow label={t.confirmTransaction.currency} value={currency} />
                <DetailRow label={t.confirmTransaction.amount} value={`${amount} ${currency}`} />
                <DetailRow label={t.confirmTransaction.fee} value={`${fee.toFixed(8)} ${currency}`} />
                <DetailRow
                  label={t.confirmTransaction.total}
                  value={`${total.toFixed(8)} ${currency}`}
                />
              </Column>
            </Card>

            <Button onPress={handleBack} style={{ marginTop: spacing.lg, width: '100%' }}>
              {t.confirmTransaction.success.button}
            </Button>
          </Card>
        </Column>
      </ScreenLayout>
    );
  }

  if (transactionResult === 'error') {
    return (
      <ScreenLayout>
        <Column gap="lg" style={{ justifyContent: 'center', flex: 1 }}>
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.md }}>
              ❌
            </Text>
            <Text variant="h2" style={{ marginBottom: spacing.md, textAlign: 'center', color: colors.error }}>
              {t.confirmTransaction.error.title}
            </Text>
            <Text
              variant="body"
              style={{
                color: colors.text_secondary,
                marginBottom: spacing.lg,
                textAlign: 'center',
              }}
            >
              {t.confirmTransaction.error.message}
            </Text>

            <Button
              onPress={handleBack}
              variant="outline"
              style={{
                marginTop: spacing.lg,
                width: '100%',
                borderColor: colors.error,
              }}
            >
              {t.confirmTransaction.error.button}
            </Button>
          </Card>
        </Column>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout paddingTop={20}>
      <Column gap="lg">
          <Text variant="h1">{t.confirmTransaction.title}</Text>

          {/* Transaction Details */}
          <Card>
            <Column gap="sm">
              <DetailRow label={t.confirmTransaction.currency} value={currency} />
              <DetailRow label={t.confirmTransaction.amount} value={`${amount} ${currency}`} />
              <DetailRow label={t.confirmTransaction.recipient} value={recipient.substring(0, 20) + '...'} />
              {memo && <DetailRow label={t.confirmTransaction.memo} value={memo} />}
              <DetailRow label={t.confirmTransaction.fee} value={`${fee.toFixed(8)} ${currency}`} />
            </Column>
          </Card>

          {/* Total Summary */}
          <Card
            style={{
              backgroundColor: colors.bg_darker,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.confirmTransaction.total}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                  color: colors.primary,
                }}
              >
                {total.toFixed(8)} {currency}
              </Text>
            </View>
          </Card>

          {/* Warning */}
          <Card
            style={{
              backgroundColor: colors.warning,
            }}
          >
            <Text
              variant="body"
              style={{
                color: colors.bg_darkest,
              }}
            >
              ⚠️ Please review all details carefully. Transactions cannot be reversed once confirmed.
            </Text>
          </Card>

          {/* Action Buttons */}
          <View style={{ gap: spacing.sm }}>
            <Button
              onPress={handleConfirm}
              disabled={isLoading}
              style={{
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? t.confirmTransaction.confirmingButton : t.confirmTransaction.confirmButton}
            </Button>
            <Button onPress={() => navigation.goBack()} variant="outline" disabled={isLoading}>
              {t.confirmTransaction.cancelButton}
            </Button>
          </View>
      </Column>
    </ScreenLayout>
  );
};

export default ConfirmTransactionScreen;
