/**
 * TabSelector
 * Reusable segmented control / tab selector component
 * Eliminates 300+ lines of repeated tab patterns
 */

import React from 'react';
import { View } from 'react-native';
import { Button, Text } from '../../atoms';
import { colors, spacing } from '../../../theme';

export interface TabOption {
  id: string | number;
  label: string;
  icon?: string;
}

export interface TabSelectorProps {
  tabs: TabOption[];
  activeTab: string | number;
  onTabChange: (tabId: string | number) => void;
  gap?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
}

const gapMap = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export const TabSelector = ({
  tabs,
  activeTab,
  onTabChange,
  gap = 'sm',
  fullWidth = true,
  disabled = false,
}: TabSelectorProps) => {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: gapMap[gap],
        backgroundColor: colors.bg_darker,
        padding: spacing.xs,
        borderRadius: 8,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Button
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            disabled={disabled}
            variant={isActive ? 'primary' : 'secondary'}
            style={{
              flex: fullWidth ? 1 : undefined,
              backgroundColor: isActive ? colors.primary : 'transparent',
            }}
          >
            <Text
              color={isActive ? colors.white : colors.text_secondary}
              weight={isActive ? 'semibold' : 'normal'}
            >
              {tab.icon && <Text style={{ marginRight: spacing.xs }}>{tab.icon}</Text>}
              {tab.label}
            </Text>
          </Button>
        );
      })}
    </View>
  );
};

TabSelector.displayName = 'TabSelector';
