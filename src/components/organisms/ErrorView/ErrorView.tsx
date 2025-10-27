import React from 'react';
import { View, Text as RNText, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface ErrorViewProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  contentContainer: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.error,
    maxWidth: 350,
  },
  icon: {
    fontSize: typography.size['4xl'],
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: 'bold' as const,
    color: colors.error,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.size.md,
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.black,
    fontSize: typography.size.md,
    fontWeight: 'bold' as const,
  },
  dismissButton: {
    backgroundColor: colors.bg_medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dismissButtonText: {
    color: colors.text_primary,
    fontSize: typography.size.md,
    fontWeight: '600' as const,
  },
});

export const ErrorView = React.memo(
  ({
    title = 'Something went wrong',
    message,
    onRetry,
    onDismiss,
    style,
  }: ErrorViewProps) => {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.contentContainer}>
          <RNText style={styles.icon}>⚠️</RNText>
          <RNText style={styles.title}>{title}</RNText>
          <RNText style={styles.message}>{message}</RNText>

          <View style={styles.buttonContainer}>
            {onRetry && (
              <View
                style={[styles.button, styles.retryButton]}
                // @ts-ignore
                onPress={onRetry}
              >
                <RNText style={styles.retryButtonText}>Retry</RNText>
              </View>
            )}
            {onDismiss && (
              <View
                style={[styles.button, styles.dismissButton]}
                // @ts-ignore
                onPress={onDismiss}
              >
                <RNText style={styles.dismissButtonText}>Dismiss</RNText>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  },
);

ErrorView.displayName = 'ErrorView';
