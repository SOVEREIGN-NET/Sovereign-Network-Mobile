import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../../theme';

export interface LoadingViewProps {
  message?: string;
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
  loader: {
    marginBottom: spacing.lg,
  },
  message: {
    fontSize: typography.size.md,
    color: colors.text_secondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

/**
 * Replaces the duplicated loading pattern found in all 5 screens
 * Provides a consistent loading UI with optional message
 *
 * @example
 * if (loading) {
 *   return <LoadingView message="Loading your data..." />;
 * }
 */
export const LoadingView = React.memo(
  ({ message = 'Loading...', style }: LoadingViewProps) => {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
        />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    );
  },
);

LoadingView.displayName = 'LoadingView';
