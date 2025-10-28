import React from 'react';
import { ScrollView, View } from 'react-native';
import { Card, Text, Button, Column, Input } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';

interface ValidationErrors {
  recipient?: string;
  amount?: string;
}

const SendTokensScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  // Form state
  const [recipient, setRecipient] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [memo, setMemo] = React.useState('');
  const [selectedCurrency, setSelectedCurrency] = React.useState('ZHTP');
  const [errors, setErrors] = React.useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = React.useState(false);

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    // Validate recipient address (basic: must be non-empty, at least 32 chars, hex format)
    if (!recipient.trim()) {
      newErrors.recipient = t.sendTokens.validation.recipientRequired;
    } else if (recipient.length < 32) {
      newErrors.recipient = t.sendTokens.validation.recipientTooShort;
    } else if (!/^[a-zA-Z0-9]+$/.test(recipient)) {
      newErrors.recipient = t.sendTokens.validation.recipientInvalid;
    }

    // Validate amount (must be non-empty, valid number, > 0)
    if (!amount.trim()) {
      newErrors.amount = t.sendTokens.validation.amountRequired;
    } else {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) {
        newErrors.amount = t.sendTokens.validation.amountInvalid;
      } else if (numAmount <= 0) {
        newErrors.amount = t.sendTokens.validation.amountZero;
      } else if (numAmount > 1000000) {
        newErrors.amount = t.sendTokens.validation.amountMax;
      } else if (!/^\d+(\.\d{1,8})?$/.test(amount)) {
        newErrors.amount = t.sendTokens.validation.amountDecimals;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Calculate estimated fee (2% for now)
  const amountNum = parseFloat(amount) || 0;
  const estimatedFee = amountNum * 0.02;
  const total = amountNum + estimatedFee;

  // Handle send
  const handleSend = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    // Simulate processing
    setTimeout(() => {
      setIsLoading(false);
      // Navigate to confirmation with transaction details
      navigation.navigate('ConfirmTransaction', {
        recipient,
        amount: amountNum,
        currency: selectedCurrency,
        fee: estimatedFee,
        total,
        memo,
      });
    }, 500);
  };

  const currencies = ['ZHTP', 'USDT', 'ETH', 'BTC'];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text variant="h2" style={{ marginBottom: spacing.md }}>
          {t.sendTokens.title.replace('{currency}', selectedCurrency)}
        </Text>

        {/* Currency Selector */}
        <View style={{ marginBottom: spacing.md }}>
          <Text variant="body" style={{ marginBottom: spacing.sm, color: colors.text_secondary }}>
            {t.sendTokens.currency}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            {currencies.map((currency) => (
              <Button
                key={currency}
                variant={selectedCurrency === currency ? 'primary' : 'outline'}
                onPress={() => setSelectedCurrency(currency)}
                style={{ flex: 0, paddingHorizontal: spacing.md }}
              >
                {currency}
              </Button>
            ))}
          </View>
        </View>

        <Column gap="md">
          {/* Recipient Address Input */}
          <View>
            <Input
              placeholder={t.sendTokens.recipientPlaceholder}
              value={recipient}
              onChangeText={(text) => {
                setRecipient(text);
                if (errors.recipient) {
                  setErrors((prev) => ({ ...prev, recipient: undefined }));
                }
              }}
              editable={!isLoading}
              style={{
                borderColor: errors.recipient ? colors.error : colors.border,
              }}
            />
            {errors.recipient && (
              <Text
                variant="caption"
                style={{ color: colors.error, marginTop: spacing.xs }}
              >
                {errors.recipient}
              </Text>
            )}
          </View>

          {/* Amount Input */}
          <View>
            <Input
              placeholder={t.sendTokens.amountPlaceholder}
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                if (errors.amount) {
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }
              }}
              keyboardType="decimal-pad"
              editable={!isLoading}
              style={{
                borderColor: errors.amount ? colors.error : colors.border,
              }}
            />
            {errors.amount && (
              <Text
                variant="caption"
                style={{ color: colors.error, marginTop: spacing.xs }}
              >
                {errors.amount}
              </Text>
            )}
          </View>

          {/* Memo Input */}
          <Input
            placeholder={t.sendTokens.memoPlaceholder}
            value={memo}
            onChangeText={setMemo}
            editable={!isLoading}
            multiline
            numberOfLines={3}
            style={{ textAlignVertical: 'top', minHeight: 80 }}
          />

          {/* Fee Preview */}
          {amountNum > 0 && !errors.amount && (
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                marginVertical: spacing.sm,
              }}
            >
              <Column gap="sm">
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text variant="body" style={{ color: colors.text_secondary }}>
                    {t.sendTokens.subtotal}
                  </Text>
                  <Text variant="body">
                    {amountNum.toFixed(8)} {selectedCurrency}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text variant="body" style={{ color: colors.text_secondary }}>
                    {t.sendTokens.feeLabel}
                  </Text>
                  <Text variant="body" style={{ color: colors.warning }}>
                    {estimatedFee.toFixed(8)} {selectedCurrency}
                  </Text>
                </View>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: spacing.sm,
                    marginTop: spacing.sm,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    variant="h3"
                    style={{ color: colors.primary }}
                  >
                    {t.sendTokens.total}
                  </Text>
                  <Text variant="h3" style={{ color: colors.primary }}>
                    {total.toFixed(8)} {selectedCurrency}
                  </Text>
                </View>
              </Column>
            </Card>
          )}

          {/* Action Buttons */}
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              onPress={handleSend}
              disabled={!recipient || !amount || isLoading || Object.keys(errors).length > 0}
              style={{
                opacity: !recipient || !amount || Object.keys(errors).length > 0 ? 0.5 : 1,
              }}
            >
              {isLoading ? t.sendTokens.buttonLoading : t.sendTokens.button}
            </Button>
            <Button
              onPress={() => navigation.goBack()}
              variant="outline"
              disabled={isLoading}
            >
              {t.sendTokens.cancel}
            </Button>
          </View>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default SendTokensScreen;
