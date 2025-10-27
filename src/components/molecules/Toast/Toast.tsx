import React, { useEffect } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  success: {
    backgroundColor: colors.success,
  },
  error: {
    backgroundColor: colors.error,
  },
  warning: {
    backgroundColor: colors.warning,
  },
  info: {
    backgroundColor: colors.info,
  },
  icon: {
    fontSize: typography.size.lg,
  },
  messageText: {
    flex: 1,
    color: colors.white,
    fontSize: typography.size.md,
    fontWeight: '500' as const,
  },
});

const typeConfig: Record<ToastType, { icon: string; bgColor: string }> = {
  success: { icon: '✅', bgColor: colors.success },
  error: { icon: '❌', bgColor: colors.error },
  warning: { icon: '⚠️', bgColor: colors.warning },
  info: { icon: 'ℹ️', bgColor: colors.info },
};

export const Toast = React.memo(
  ({
    message,
    type = 'info',
    duration = 3000,
    onDismiss,
    style,
  }: ToastProps) => {
    const [fadeAnim] = React.useState(new Animated.Value(0));
    const config = typeConfig[type];

    useEffect(() => {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto dismiss
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(onDismiss);
      }, duration);

      return () => clearTimeout(timer);
    }, [duration, fadeAnim, onDismiss]);

    return (
      <Animated.View
        style={[
          { opacity: fadeAnim },
          style,
        ]}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: config.bgColor,
            },
          ]}
        >
          <RNText style={styles.icon}>{config.icon}</RNText>
          <RNText style={styles.messageText} numberOfLines={2}>
            {message}
          </RNText>
        </View>
      </Animated.View>
    );
  },
);

Toast.displayName = 'Toast';
