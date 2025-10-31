import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.base,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Variant: Primary
  primaryButton: {
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.transparent,
    borderColor: colors.text_tertiary,
  },
  primaryText: {
    color: colors.primary,
    fontWeight: '700' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: -0.5, height: -0.5 },
    textShadowRadius: 0.5,
  },
  primaryTextDisabled: {
    color: colors.text_tertiary,
  },
  // Variant: Secondary (Transparent with border, like Browser app)
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  secondaryButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryText: {
    color: colors.text_primary,
    fontWeight: '700' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: -0.5, height: -0.5 },
    textShadowRadius: 0.5,
  },
  secondaryTextDisabled: {
    color: colors.text_tertiary,
  },
  // Variant: Outline
  outlineButton: {
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  outlineButtonDisabled: {
    borderColor: colors.text_tertiary,
  },
  outlineText: {
    color: colors.primary,
    fontWeight: '700' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: -0.5, height: -0.5 },
    textShadowRadius: 0.5,
  },
  outlineTextDisabled: {
    color: colors.text_tertiary,
  },
  // Variant: Danger
  dangerButton: {
    backgroundColor: colors.error,
  },
  dangerButtonDisabled: {
    backgroundColor: colors.bg_medium,
  },
  dangerText: {
    color: colors.white,
    fontWeight: '700' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: -1, height: -1 },
    textShadowRadius: 0.5,
  },
  dangerTextDisabled: {
    color: colors.text_tertiary,
  },
  // Sizes
  smButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mdButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lgButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  // Text sizes
  smText: {
    fontSize: typography.size.sm,
  },
  mdText: {
    fontSize: typography.size.md,
  },
  lgText: {
    fontSize: typography.size.lg,
  },
});

export const Button = React.memo(
  ({
    onPress,
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    style,
    testID,
  }: ButtonProps) => {
    const isDisabled = disabled || loading;

    const getButtonStyle = (): (ViewStyle | undefined)[] => {
      const baseStyle: (ViewStyle | undefined)[] = [styles.button];

      // Variant styles
      switch (variant) {
        case 'primary':
          baseStyle.push(isDisabled ? styles.primaryButtonDisabled : styles.primaryButton);
          break;
        case 'secondary':
          baseStyle.push(isDisabled ? styles.secondaryButtonDisabled : styles.secondaryButton);
          break;
        case 'outline':
          baseStyle.push(
            isDisabled ? styles.outlineButtonDisabled : styles.outlineButton,
          );
          break;
        case 'danger':
          baseStyle.push(isDisabled ? styles.dangerButtonDisabled : styles.dangerButton);
          break;
      }

      // Size styles
      switch (size) {
        case 'sm':
          baseStyle.push(styles.smButton);
          break;
        case 'md':
          baseStyle.push(styles.mdButton);
          break;
        case 'lg':
          baseStyle.push(styles.lgButton);
          break;
      }

      if (style) {
        baseStyle.push(style);
      }

      return baseStyle;
    };

    const getTextStyle = (): (TextStyle | undefined)[] => {
      const baseStyle: (TextStyle | undefined)[] = [];

      // Text color based on variant
      switch (variant) {
        case 'primary':
          baseStyle.push(isDisabled ? styles.primaryTextDisabled : styles.primaryText);
          break;
        case 'secondary':
          baseStyle.push(isDisabled ? styles.secondaryTextDisabled : styles.secondaryText);
          break;
        case 'outline':
          baseStyle.push(isDisabled ? styles.outlineTextDisabled : styles.outlineText);
          break;
        case 'danger':
          baseStyle.push(isDisabled ? styles.dangerTextDisabled : styles.dangerText);
          break;
      }

      // Text size based on button size
      switch (size) {
        case 'sm':
          baseStyle.push(styles.smText);
          break;
        case 'md':
          baseStyle.push(styles.mdText);
          break;
        case 'lg':
          baseStyle.push(styles.lgText);
          break;
      }

      return baseStyle;
    };

    const renderChildren = () => {
      const isStringOrNumber = typeof children === 'string' || typeof children === 'number';
      const isArray = Array.isArray(children);

      if (isStringOrNumber || isArray) {
        return <Text style={getTextStyle()}>{children}</Text>;
      }
      return children;
    };

    return (
      <TouchableOpacity
        style={getButtonStyle()}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        testID={testID}
      >
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
        {renderChildren()}
      </TouchableOpacity>
    );
  },
);

Button.displayName = 'Button';
