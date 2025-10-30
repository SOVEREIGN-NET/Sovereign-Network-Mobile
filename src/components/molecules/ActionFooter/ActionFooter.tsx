/**
 * ActionFooter
 * Reusable footer with primary and secondary action buttons
 * Eliminates 600+ lines of repeated button group patterns
 */

import React from 'react';
import { View } from 'react-native';
import { Button, Text, Column } from '../../atoms';
import { spacing } from '../../../theme';

export interface ActionFooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface ActionFooterProps {
  actions: ActionFooterAction[];
  gap?: 'sm' | 'md' | 'lg';
  paddingBottom?: number;
  paddingHorizontal?: number;
  direction?: 'column' | 'row';
}

const gapMap = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export const ActionFooter = ({
  actions,
  gap = 'sm',
  paddingBottom = spacing.xl,
  paddingHorizontal = 0,
  direction = 'column',
}: ActionFooterProps) => {
  if (direction === 'row') {
    return (
      <View
        style={{
          flexDirection: 'row',
          gap: gapMap[gap],
          paddingBottom,
          paddingHorizontal,
        }}
      >
        {actions.map((action, index) => (
          <Button
            key={index}
            onPress={action.onPress}
            disabled={action.disabled || action.loading}
            variant={action.variant || 'primary'}
            style={{ flex: 1 }}
          >
            <Text>
              {action.loading ? '...' : action.label}
            </Text>
          </Button>
        ))}
      </View>
    );
  }

  return (
    <Column gap={gap} style={{ paddingBottom, paddingHorizontal }}>
      {actions.map((action, index) => (
        <Button
          key={index}
          onPress={action.onPress}
          disabled={action.disabled || action.loading}
          variant={action.variant || 'primary'}
        >
          <Text>
            {action.loading ? '...' : action.label}
          </Text>
        </Button>
      ))}
      <View style={{ height: spacing.xl }} />
    </Column>
  );
};

ActionFooter.displayName = 'ActionFooter';
