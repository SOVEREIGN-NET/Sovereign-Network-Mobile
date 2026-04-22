import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { colors, spacing, typography } from '../../../theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string | React.ReactNode;
  containerStyle?: ViewStyle;
  style?: ViewStyle | TextStyle;
  textInputStyle?: TextStyle;
}

/**
 * Build the style sheet at render time so theme-dependent colours
 * (`colors.text_primary`, `colors.error`, etc.) come from the live
 * palette. See `applyTheme` in `theme/tokens`.
 */
const makeStyles = () =>
  StyleSheet.create({
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

export const Input = React.forwardRef<TextInput | null, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      containerStyle,
      style: _style,
      textInputStyle: _textInputStyle,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
      const baseStyles = makeStyles();
      const [isFocused, setIsFocused] = useState(false);

      const handleFocus = (e: any) => {
        setIsFocused(true);
        onFocus?.(e);
      };

      const handleBlur = (e: any) => {
        setIsFocused(false);
        onBlur?.(e);
      };

      // Resolve border / field / placeholder colours from the live
      // palette so the Input respects the current theme. Hardcoded
      // hex values were the reason the Send-Tokens fields stayed dark
      // on the light theme.
      let borderColor: string;
      if (error) borderColor = colors.error;
      else if (isFocused) borderColor = colors.primary;
      else borderColor = colors.border;

      return (
        <View style={[baseStyles.container, containerStyle]}>
          {label && (
            <View style={baseStyles.labelContainer}>
              <Text style={baseStyles.label}>{label}</Text>
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.bg_medium,
              borderRadius: 10,
              paddingHorizontal: 18,
              borderWidth: 1,
              borderColor,
            }}
          >
            {leftIcon && <Text style={baseStyles.icon}>{leftIcon}</Text>}

            <TextInput
              ref={ref}
              style={baseStyles.input}
              placeholderTextColor={colors.text_placeholder}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...Object.fromEntries(
                Object.entries(props).filter(([_, v]) => v !== undefined && v !== null)
              )}
            />

            {rightIcon && typeof rightIcon === 'string' && (
              <Text style={[baseStyles.icon, baseStyles.rightIcon]}>{rightIcon}</Text>
            )}
            {rightIcon && typeof rightIcon !== 'string' && rightIcon}
          </View>

          {error && (
            <View style={baseStyles.errorContainer}>
              <Text style={baseStyles.errorText}>{error}</Text>
            </View>
          )}

          {!error && hint && (
            <View style={baseStyles.hintContainer}>
              <Text style={baseStyles.hintText}>{hint}</Text>
            </View>
          )}
        </View>
      );
    }
);

Input.displayName = 'Input';
