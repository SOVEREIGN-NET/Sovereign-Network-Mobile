import React from 'react';
import {
  Text as RNText,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { colors, typography } from '../../../theme';

export type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'small';
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

export interface TextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
  /**
   * Accepts a single `TextStyle`, an array of styles (including falsy
   * branches like `condition && { color }`), and any other shape the
   * underlying RN Text accepts. Mirrors `RNText`'s own `style` typing.
   */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Forwarded to the underlying RN Text — controls truncation glyph. */
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
}

const styles = StyleSheet.create({
  // Variants
  h1: {
    fontSize: typography.size['2xl'],
  },
  h2: {
    fontSize: typography.size.xl,
  },
  h3: {
    fontSize: typography.size.lg,
  },
  body: {
    fontSize: typography.size.md,
  },
  caption: {
    fontSize: typography.size.sm,
  },
  small: {
    fontSize: typography.size.xs,
  },
  // Weights
  normal: {
    fontWeight: typography.weight.normal,
  },
  medium: {
    fontWeight: typography.weight.medium,
  },
  semibold: {
    fontWeight: typography.weight.semibold,
  },
  bold: {
    fontWeight: typography.weight.bold,
  },
});

export const Text = React.memo(
  ({
    children,
    variant = 'body',
    weight = 'normal',
    color = colors.text_primary,
    style,
    numberOfLines,
    ellipsizeMode,
  }: TextProps) => {
    const variantStyle = {
      h1: styles.h1,
      h2: styles.h2,
      h3: styles.h3,
      body: styles.body,
      caption: styles.caption,
      small: styles.small,
    }[variant];

    const weightStyle = {
      normal: styles.normal,
      medium: styles.medium,
      semibold: styles.semibold,
      bold: styles.bold,
    }[weight];

    return (
      <RNText
        style={[variantStyle, weightStyle, { color }, style]}
        numberOfLines={numberOfLines}
        ellipsizeMode={ellipsizeMode}
      >
        {children}
      </RNText>
    );
  },
);

Text.displayName = 'Text';
