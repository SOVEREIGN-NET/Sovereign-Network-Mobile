import React from 'react';
import { View } from 'react-native';
import { Button, Text } from '../../atoms';
import { colors, spacing } from '../../../theme';

export interface ActionButtonConfig {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export interface ActionButtonsProps {
  buttons: ActionButtonConfig[];
  gap?: 'sm' | 'md' | 'lg';
  paddingHorizontal?: number;
  paddingVertical?: number;
}

export const ActionButtons = ({
  buttons,
  gap = 'md',
  paddingHorizontal,
  paddingVertical,
}: ActionButtonsProps) => {
  const gapValue = {
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
  }[gap];

  return (
    <View
      style={{
        paddingHorizontal: paddingHorizontal ?? spacing.lg,
        paddingVertical: paddingVertical ?? spacing.lg,
        gap: gapValue,
      }}
    >
      {buttons.map((button, index) => (
        <Button
          key={index}
          variant={button.variant ?? 'primary'}
          onPress={button.onPress}
          disabled={button.disabled || button.loading}
        >
          <Text
            color={
              button.variant === 'danger'
                ? colors.white
                : colors.text_primary
            }
            weight="semibold"
          >
            {button.loading ? '⏳ ...' : button.label}
          </Text>
        </Button>
      ))}
    </View>
  );
};

ActionButtons.displayName = 'ActionButtons';
