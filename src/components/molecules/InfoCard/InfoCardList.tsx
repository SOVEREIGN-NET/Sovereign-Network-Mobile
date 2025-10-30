import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '../../atoms';
import { colors, spacing } from '../../../theme';

export interface InfoCardListItem {
  id: string;
  title: string;
  description: string;
}

export interface InfoCardListProps {
  items: InfoCardListItem[];
  gap?: 'sm' | 'md' | 'lg';
}

const gapMap = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export const InfoCardList = ({ items, gap = 'md' }: InfoCardListProps) => {
  return (
    <View style={{ gap: gapMap[gap] }}>
      {items.map((item) => (
        <Card
          key={item.id}
          style={{
            backgroundColor: colors.bg_dark,
            borderColor: colors.border,
            borderWidth: 1,
          }}
        >
          <View style={{ padding: spacing.md }}>
            <Text
              variant="body"
              weight="semibold"
              color={colors.text_primary}
              style={{ marginBottom: spacing.xs }}
            >
              {item.title}
            </Text>
            <Text variant="caption" color={colors.text_secondary}>
              {item.description}
            </Text>
          </View>
        </Card>
      ))}
    </View>
  );
};

InfoCardList.displayName = 'InfoCardList';
