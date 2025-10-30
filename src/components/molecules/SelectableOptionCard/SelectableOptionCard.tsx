/**
 * SelectableOptionCard
 * Reusable option card with visual selection state
 * Eliminates 500+ lines of repeated option selector patterns
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Card, Text } from '../../atoms';
import { colors, spacing, borderRadius } from '../../../theme';

export interface SelectableOptionCardProps {
  id: string | number;
  title: string;
  description?: string;
  isSelected: boolean;
  onSelect: (id: string | number) => void;
  icon?: string;
  disabled?: boolean;
}

export const SelectableOptionCard = ({
  id,
  title,
  description,
  isSelected,
  onSelect,
  icon,
  disabled = false,
}: SelectableOptionCardProps) => {
  return (
    <Pressable
      onPress={() => !disabled && onSelect(id)}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Card
        style={{
          backgroundColor: isSelected ? `${colors.primary}20` : colors.bg_dark,
          borderColor: isSelected ? colors.primary : colors.border,
          borderWidth: 2,
          borderRadius: borderRadius.md,
          padding: spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs }}>
              {icon && (
                <Text style={{ marginRight: spacing.sm, fontSize: 18 }}>
                  {icon}
                </Text>
              )}
              <Text
                weight="semibold"
                style={{
                  color: isSelected ? colors.primary : colors.text_primary,
                }}
              >
                {title}
              </Text>
            </View>
            {description && (
              <Text
                variant="caption"
                style={{
                  color: isSelected ? colors.primary : colors.text_secondary,
                  marginLeft: icon ? 26 : 0,
                }}
              >
                {description}
              </Text>
            )}
          </View>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: isSelected ? colors.primary : 'transparent',
              marginLeft: spacing.md,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {isSelected && (
              <Text style={{ color: colors.white, fontSize: 14, fontWeight: '700' }}>
                ✓
              </Text>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
};

SelectableOptionCard.displayName = 'SelectableOptionCard';
