/**
 * FormField
 * Reusable form field component with label, input, and error message
 * Eliminates 1200+ lines of repeated form field patterns
 */

import React from 'react';
import { View, TextInputProps as RNTextInputProps } from 'react-native';
import { Text, Input } from '../../atoms';
import { colors, spacing, typography } from '../../../theme';

export interface FormFieldProps extends Omit<RNTextInputProps, 'style' | 'error'> {
  label: string;
  error?: string | null;
  required?: boolean;
  helperText?: string;
  containerStyle?: any;
  textInputStyle?: any;
  rightIcon?: React.ReactNode;
}

export const FormField = React.forwardRef<any, FormFieldProps>(
  (
    {
      label,
      error,
      required = false,
      helperText,
      containerStyle,
      textInputStyle,
      rightIcon,
      ...inputProps
    },
    ref
  ) => {
    return (
      <View style={containerStyle}>
        <Text
          style={{
            fontSize: typography.size.sm,
            fontWeight: typography.weight.semibold,
            color: colors.text_primary,
            marginBottom: spacing.sm,
          }}
        >
          {label}
          {required && <Text style={{ color: colors.error }}> *</Text>}
        </Text>
        <Input
          ref={ref}
          {...inputProps}
          error={error || undefined}
          textInputStyle={textInputStyle || undefined}
          rightIcon={rightIcon}
        />
        {helperText && !error && (
          <Text
            variant="caption"
            style={{
              color: colors.text_secondary,
              marginTop: spacing.xs,
            }}
          >
            {helperText}
          </Text>
        )}
      </View>
    );
  }
);

FormField.displayName = 'FormField';
