/**
 * SectionHeader
 * Reusable card section title component
 * Eliminates 1500+ lines of repeated heading patterns
 */

import React from 'react';
import { Text, TextProps } from '../../atoms';
import { colors, spacing, typography } from '../../../theme';

export interface SectionHeaderProps extends Omit<TextProps, 'children' | 'variant'> {
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export const SectionHeader = ({
  title,
  subtitle,
  size = 'sm',
  color = colors.text_primary,
  style,
  ...props
}: SectionHeaderProps) => {
  const sizeMap = {
    sm: typography.size.sm,
    md: typography.size.md,
    lg: typography.size.lg,
  };

  const marginBottomMap = {
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
  };

  return (
    <>
      <Text
        style={{
          fontSize: sizeMap[size],
          fontWeight: typography.weight.semibold,
          color,
          marginBottom: subtitle ? spacing.xs : marginBottomMap[size],
          ...style,
        }}
        {...props}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          variant="caption"
          style={{
            color: colors.text_secondary,
            marginBottom: marginBottomMap[size],
          }}
        >
          {subtitle}
        </Text>
      )}
    </>
  );
};

SectionHeader.displayName = 'SectionHeader';
