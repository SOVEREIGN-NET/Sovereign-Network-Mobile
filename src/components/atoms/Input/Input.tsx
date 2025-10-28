import React, { useState } from 'react';
import {
  View,
  TextInput as RNTextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps as RNTextInputProps,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface InputProps extends Omit<RNTextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string;
  containerStyle?: ViewStyle;
  style?: ViewStyle;
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
  inputPlaceholder: colors.text_tertiary,
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

      return (
        <View style={[styles.container, containerStyle]}>
          {label && (
            <View style={styles.labelContainer}>
              <Text style={styles.label}>{label}</Text>
            </View>
          )}

          <View
            style={[
              styles.inputWrapper,
              isFocused && styles.inputWrapperFocused,
              error && styles.inputWrapperError,
              style,
            ]}
          >
            {leftIcon && <Text style={styles.icon}>{leftIcon}</Text>}

            <RNTextInput
              ref={ref}
              style={styles.input}
              placeholderTextColor={styles.inputPlaceholder}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...props}
            />

            {rightIcon && <Text style={[styles.icon, styles.rightIcon]}>{rightIcon}</Text>}
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
