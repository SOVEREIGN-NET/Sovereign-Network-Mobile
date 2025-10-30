import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '../../atoms';
import { colors, spacing, borderRadius } from '../../../theme';

export type InfoCardType = 'info' | 'warning' | 'error' | 'success';

export interface InfoCardProps {
  title: string;
  description: string;
  type?: InfoCardType;
  icon?: string;
}

const typeStyles = {
  info: {
    bgColor: `${colors.info}15`,
    borderColor: colors.info,
    titleColor: colors.info,
  },
  warning: {
    bgColor: `${colors.warning}15`,
    borderColor: colors.warning,
    titleColor: colors.warning,
  },
  error: {
    bgColor: `${colors.error}15`,
    borderColor: colors.error,
    titleColor: colors.error,
  },
  success: {
    bgColor: `${colors.success}15`,
    borderColor: colors.success,
    titleColor: colors.success,
  },
};

export const InfoCard = ({
  title,
  description,
  type = 'info',
  icon,
}: InfoCardProps) => {
  const style = typeStyles[type];

  return (
    <Card
      style={{
        backgroundColor: style.bgColor,
        borderColor: style.borderColor,
        borderWidth: 1,
      }}
    >
      <View
        style={{
          backgroundColor: colors.bg_darker,
          padding: spacing.md,
          borderRadius: borderRadius.md,
          borderLeftWidth: 4,
          borderLeftColor: style.borderColor,
        }}
      >
        <Text
          variant="body"
          weight="semibold"
          color={style.titleColor}
          style={{ marginBottom: spacing.sm }}
        >
          {icon ? `${icon} ${title}` : title}
        </Text>
        <Text variant="caption" color={colors.text_secondary}>
          {description}
        </Text>
      </View>
    </Card>
  );
};

InfoCard.displayName = 'InfoCard';
