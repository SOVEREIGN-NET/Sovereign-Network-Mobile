import React from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, Input } from '../components';
import { colors, spacing } from '../theme';

const SendTokensScreen = ({ navigation }: any) => {
  const [recipient, setRecipient] = React.useState('');
  const [amount, setAmount] = React.useState('');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.lg }}>
      <Card>
        <Text variant="h2">Send ZHTP</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Input
            placeholder="Recipient address"
            value={recipient}
            onChangeText={setRecipient}
          />
          <Input placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Button onPress={() => navigation.goBack()}> SEND </Button>
          <Button onPress={() => navigation.goBack()} variant="outline">
            Cancel
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default SendTokensScreen;
