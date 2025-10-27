import React from 'react';
import { View, Text as RNText, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
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
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  icon: {
    fontSize: typography.size['5xl'],
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: 'bold' as const,
    color: colors.text_primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.size.md,
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 300,
    lineHeight: 22,
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    color: colors.black,
    fontSize: typography.size.md,
    fontWeight: 'bold' as const,
  },
});

export const EmptyState = React.memo(
  ({ icon = '📭', title, message, action, style }: EmptyStateProps) => {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.contentContainer}>
          {icon && <RNText style={styles.icon}>{icon}</RNText>}
          <RNText style={styles.title}>{title}</RNText>
          {message && <RNText style={styles.message}>{message}</RNText>}
          {action && (
            <View
              style={styles.actionButton}
              // @ts-ignore - TouchableOpacity pressability
              onPress={action.onPress}
            >
              <RNText style={styles.actionButtonText}>{action.label}</RNText>
            </View>
          )}
        </View>
      </View>
    );
  },
);

EmptyState.displayName = 'EmptyState';
