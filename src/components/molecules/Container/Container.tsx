import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing } from '../../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'xl';
  backgroundColor?: string;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

const paddingMap = {
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

export const Container = React.memo(
  ({
    children,
    scrollable = false,
    padding = 'lg',
    backgroundColor = colors.bg_darkest,
    style,
  }: ContainerProps) => {
    const insets = useSafeAreaInsets();
    const paddingValue = paddingMap[padding];

    const containerStyle = [
      styles.container,
      {
        backgroundColor,
        paddingHorizontal: paddingValue,
        paddingTop: insets.top + paddingValue,
        paddingBottom: insets.bottom + paddingValue,
      },
      style,
    ];

    if (scrollable) {
      return (
        <ScrollView
          style={containerStyle}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      );
    }

    return <View style={containerStyle}>{children}</View>;
  },
);

Container.displayName = 'Container';
