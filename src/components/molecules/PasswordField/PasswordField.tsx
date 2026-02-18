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
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : isVisible ? 1 : 0.5,
                width: 52,
                height: '100%',
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 0,
                marginRight: -18,
              })}
            >
              <Text style={{ fontSize: 22 }}>{isVisible ? '👁️' : '👁️‍🗨️'}</Text>
            </Pressable>
          }
          {...inputProps}
        />
      </View>
    );
  }
);

PasswordField.displayName = 'PasswordField';
