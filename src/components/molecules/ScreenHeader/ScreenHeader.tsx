import React from 'react';
import { View } from 'react-native';
import { Text } from '../../atoms';
import { colors, spacing } from '../../../theme';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
}

export const ScreenHeader = ({
  title,
  subtitle,
  titleColor = colors.primary,
  subtitleColor = colors.text_secondary,
}: ScreenHeaderProps) => {
  return (
    <View style={{ padding: spacing.lg }}>
      <Text
        variant="h2"
        color={titleColor}
        style={{ marginBottom: subtitle ? spacing.sm : 0 }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text variant="body" color={subtitleColor}>
          {subtitle}
        </Text>
      )}
    </View>
  );
};

ScreenHeader.displayName = 'ScreenHeader';
