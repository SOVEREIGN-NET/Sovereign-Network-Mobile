import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  style?: ViewStyle;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary Component
 * Catches errors in the component tree and displays a fallback UI
 * Prevents white screen of death
 *
 * @example
 * <ErrorBoundary onError={logErrorToService}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    console.error('Error caught by boundary:', error, errorInfo);
  }

  componentDidUpdate(
    prevProps: ErrorBoundaryProps,
  ) {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary if resetKeys changed
    if (hasError && resetKeys && prevProps.resetKeys !== resetKeys) {
      this.resetError();
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, style } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <View style={[styles.container, style]}>
          <View style={styles.content}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message} numberOfLines={5}>
              {error?.message || 'An unexpected error occurred'}
            </Text>
            <View
              style={styles.button}
              // @ts-ignore
              onPress={this.resetError}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </View>
          </View>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.error,
    maxWidth: 350,
    alignItems: 'center',
  },
  icon: {
    fontSize: typography.size['4xl'],
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: 'bold' as const,
    color: colors.error,
    marginBottom: spacing.md,
  },
  message: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    color: colors.black,
    fontSize: typography.size.md,
    fontWeight: 'bold' as const,
  },
});
