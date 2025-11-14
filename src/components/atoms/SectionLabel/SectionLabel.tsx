/**
 * SectionLabel
 * Semantic label component for section headers within cards
 * Provides consistent styling for labels used in cards and forms
 */

import React from 'react';
import { Text, TextProps } from '../Text/Text';
import { colors, spacing, typography } from '../../../theme';

export interface SectionLabelProps extends Omit<TextProps, 'children'> {
  children: string;
}

export const SectionLabel = React.memo(({ children, style, ...props }: SectionLabelProps) => {
  const defaultStyle = {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.md,
  };

  return (
    <Text
      {...props}
      style={style ? { ...defaultStyle, ...style } : defaultStyle}
    >
      {children}
    </Text>
  );
});

SectionLabel.displayName = 'SectionLabel';
