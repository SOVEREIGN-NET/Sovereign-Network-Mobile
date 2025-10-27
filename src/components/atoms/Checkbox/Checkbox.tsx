import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary,
  },
  boxUnchecked: {
    backgroundColor: colors.transparent,
  },
  boxDisabled: {
    borderColor: colors.text_tertiary,
    backgroundColor: colors.bg_light,
  },
  checkmark: {
    fontSize: typography.size.md,
    color: colors.black,
    fontWeight: 'bold' as const,
  },
  label: {
    fontSize: typography.size.md,
    color: colors.text_primary,
    flex: 1,
  },
  labelDisabled: {
    color: colors.text_tertiary,
  },
});

export const Checkbox = React.memo(
  ({ checked, onChange, label, disabled = false, style }: CheckboxProps) => {
    return (
      <TouchableOpacity
        style={[styles.container, style]}
        onPress={() => !disabled && onChange(!checked)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.box,
            checked ? styles.boxChecked : styles.boxUnchecked,
            disabled && styles.boxDisabled,
          ]}
        >
          {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        {label && (
          <Text style={[styles.label, disabled && styles.labelDisabled]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  },
);

Checkbox.displayName = 'Checkbox';
