import React from 'react';
import { View } from 'react-native';
import { Text } from '../../atoms';
import { colors, spacing, borderRadius } from '../../../theme';

export interface ErrorAlertProps {
  message: string;
  icon?: string;
}

export const ErrorAlert = ({ message, icon = '❌' }: ErrorAlertProps) => {
  if (!message) return null;

  return (
    <View
      style={{
        backgroundColor: colors.error,
        padding: spacing.md,
        borderRadius: borderRadius.md,
      }}
    >
      <Text style={{ color: colors.white }}>
        {icon} {message}
      </Text>
    </View>
  );
};

ErrorAlert.displayName = 'ErrorAlert';
