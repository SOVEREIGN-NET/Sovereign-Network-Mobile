import React from 'react';
import {
  TouchableOpacity,
  Animated,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors } from '../../../theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 32,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
  },
  enabled: {
    backgroundColor: colors.success,
  },
  disabled: {
    backgroundColor: colors.bg_medium,
  },
  disabledSwitch: {
    opacity: 0.5,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export const Switch = React.memo(
  ({ value, onValueChange, disabled = false, style }: SwitchProps) => {
    const [posAnim] = React.useState(
      new Animated.Value(value ? 26 : 0),
    );

    React.useEffect(() => {
      Animated.spring(posAnim, {
        toValue: value ? 26 : 0,
        useNativeDriver: false,
        friction: 6,
        tension: 40,
      }).start();
    }, [value, posAnim]);

    return (
      <TouchableOpacity
        style={[
          styles.container,
          value ? styles.enabled : styles.disabled,
          disabled && styles.disabledSwitch,
          style,
        ]}
        onPress={() => !disabled && onValueChange(!value)}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX: posAnim }],
            },
          ]}
        />
      </TouchableOpacity>
    );
  },
);

Switch.displayName = 'Switch';
