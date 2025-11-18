import React, { useState } from 'react';
import {
  View,
  TextInput as RNTextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps as RNTextInputProps,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface InputProps extends Omit<RNTextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string | React.ReactNode;
  containerStyle?: ViewStyle;
  style?: ViewStyle | TextStyle;
  textInputStyle?: TextStyle;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  labelContainer: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text_primary,
    fontWeight: '600' as const,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_medium,
    borderRadius: borderRadius.base,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  icon: {
    fontSize: typography.size.lg,
    marginRight: spacing.sm,
  },
  rightIcon: {
    marginLeft: spacing.sm,
    marginRight: 0,
  },
  input: {
    flex: 1,
    color: colors.text_primary,
    fontSize: typography.size.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  errorContainer: {
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.error,
    fontWeight: '500' as const,
  },
  hintContainer: {
    marginTop: spacing.sm,
  },
  hintText: {
    fontSize: typography.size.sm,
    color: colors.text_tertiary,
    fontWeight: '400' as const,
  },
});

export const Input = React.memo(
  React.forwardRef<RNTextInput, InputProps>(
    (
      {
        label,
        error,
        hint,
        leftIcon,
        rightIcon,
        containerStyle,
        style,
        textInputStyle,
        onFocus,
        onBlur,
        ...props
      },
      ref,
    ) => {
      const [isFocused, setIsFocused] = useState(false);

      const handleFocus = (e: any) => {
        setIsFocused(true);
        onFocus?.(e);
      };

      const handleBlur = (e: any) => {
        setIsFocused(false);
        onBlur?.(e);
      };

      const wrapperStyles: any[] = [styles.inputWrapper];
      if (isFocused && styles.inputWrapperFocused) {
        wrapperStyles.push(styles.inputWrapperFocused);
      }
      if (error && styles.inputWrapperError) {
        wrapperStyles.push(styles.inputWrapperError);
      }
      if (style) {
        wrapperStyles.push(style);
      }

      const inputStyles: any[] = [styles.input];
      if (textInputStyle) {
        inputStyles.push(textInputStyle);
      }

      return (
        <View style={containerStyle ? [styles.container, containerStyle] : styles.container}>
          {label && (
            <View style={styles.labelContainer}>
              <Text style={styles.label}>{label}</Text>
            </View>
          )}

          <View style={wrapperStyles}>
            {leftIcon && <Text style={styles.icon}>{leftIcon}</Text>}

            <RNTextInput
              ref={ref}
              style={inputStyles}
              placeholderTextColor={colors.text_tertiary}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...props}
            />

            {rightIcon && typeof rightIcon === 'string' && (
              <Text style={[styles.icon, styles.rightIcon]}>{rightIcon}</Text>
            )}
            {rightIcon && typeof rightIcon !== 'string' && (
              <View style={[styles.icon, styles.rightIcon]}>
                {rightIcon}
              </View>
            )}
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!error && hint && (
            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          )}
        </View>
      );
    },
  ),
);

Input.displayName = 'Input';
