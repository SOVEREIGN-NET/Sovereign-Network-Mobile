import React from 'react';
import { View, Pressable } from 'react-native';
import { Card, Text } from '../../atoms';
import { colors, spacing } from '../../../theme';

export interface OptionCardItem<T> {
  id: T;
  title: string;
  description?: string;
}

export interface OptionCardGroupProps<T> {
  options: OptionCardItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  gap?: 'sm' | 'md' | 'lg';
}

const gapMap = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export const OptionCardGroup = React.forwardRef<
  View,
  OptionCardGroupProps<any>
>(({ options, selected, onSelect, gap = 'md' }, ref) => {
  return (
    <View ref={ref} style={{ gap: gapMap[gap] }}>
      {options.map((option) => {
        const isSelected = option.id === selected;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={{ marginBottom: 0 }}
          >
            <Card
              style={{
                padding: spacing.md,
                backgroundColor: isSelected
                  ? `${colors.primary}20`
                  : colors.bg_dark,
                borderColor: isSelected ? colors.primary : colors.border,
                borderWidth: 1,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.text_primary}
                  >
                    {option.title}
                  </Text>
                  {option.description && (
                    <Text
                      variant="caption"
                      color={colors.text_secondary}
                      style={{ marginTop: spacing.xs }}
                    >
                      {option.description}
                    </Text>
                  )}
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  }}
                />
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
});

OptionCardGroup.displayName = 'OptionCardGroup';
