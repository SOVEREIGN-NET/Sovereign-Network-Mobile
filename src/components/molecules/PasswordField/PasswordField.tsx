/**
 * PasswordField
 * Form field with password visibility toggle
 * Extends FormField with show/hide password functionality
 */

import React, { useState } from 'react';
import { View, Pressable, TextInputProps as RNTextInputProps } from 'react-native';
import { Text } from '../../atoms';
import { FormField } from '../FormField/FormField';
import { typography } from '../../../theme';

export interface PasswordFieldProps extends Omit<RNTextInputProps, 'style' | 'error'> {
  label: string;
  error?: string | null;
  required?: boolean;
  helperText?: string;
  containerStyle?: any;
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
      <View>
        <FormField
          ref={ref}
          label={label}
          error={error}
          required={required}
          helperText={helperText}
          containerStyle={containerStyle}
          textInputStyle={textInputStyle}
          secureTextEntry={!isVisible}
          textContentType="none"
          autoComplete="off"
          rightIcon={
            <Pressable
              onPress={() => setIsVisible(!isVisible)}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{
                opacity: isVisible ? 1 : 0.5,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: typography.size.lg }}>👁️</Text>
            </Pressable>
          }
          {...inputProps}
        />
      </View>
    );
  }
);

PasswordField.displayName = 'PasswordField';
