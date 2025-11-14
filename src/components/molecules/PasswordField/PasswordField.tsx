/**
 * PasswordField
 * Form field with password visibility toggle
 * Extends FormField with show/hide password functionality
 */

import React, { useState } from 'react';
import { View, Pressable, TextInputProps as RNTextInputProps } from 'react-native';
import { Text } from '../../atoms';
import { FormField } from '../FormField/FormField';
import { spacing, typography } from '../../../theme';

export interface PasswordFieldProps extends Omit<RNTextInputProps, 'style' | 'error'> {
  label: string;
  error?: string | null;
  required?: boolean;
  helperText?: string;
  containerStyle?: any;
  textInputStyle?: any;
}

export const PasswordField = React.forwardRef<any, PasswordFieldProps>(
  (
    {
      label,
      error,
      required = false,
      helperText,
      containerStyle,
      textInputStyle,
      ...inputProps
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <View style={{ position: 'relative' }}>
        <FormField
          ref={ref}
          label={label}
          error={error}
          required={required}
          helperText={helperText}
          containerStyle={containerStyle}
          textInputStyle={textInputStyle}
          secureTextEntry={!isVisible}
          {...inputProps}
        />
        <Pressable
          onPress={() => setIsVisible(!isVisible)}
          style={{
            position: 'absolute',
            right: spacing.lg,
            top: '50%',
            transform: [{ translateY: -12 }],
            opacity: isVisible ? 1 : 0.5,
          }}
        >
          <Text style={{ fontSize: typography.size.xl }}>👁️</Text>
        </Pressable>
      </View>
    );
  }
);

PasswordField.displayName = 'PasswordField';
