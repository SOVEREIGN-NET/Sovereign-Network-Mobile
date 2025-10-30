/**
 * ScreenLayout
 * Reusable wrapper combining SafeAreaView + ScrollView with consistent styling
 * Eliminates repetitive layout patterns across all screens
 */

import React from 'react';
import { ScrollView, ScrollViewProps, Insets } from 'react-native';
import { SafeAreaView, SafeAreaViewProps } from 'react-native-safe-area-context';
import { colors, spacing } from '../../../theme';

export interface ScreenLayoutProps extends Omit<ScrollViewProps, 'children' | 'scrollIndicatorInsets'> {
  children: React.ReactNode;
  paddingHorizontal?: number;
  paddingTop?: number;
  paddingBottom?: number;
  safeAreaEdges?: SafeAreaViewProps['edges'];
  backgroundColor?: string;
  scrollIndicatorInsets?: Insets;
  showsVerticalScrollIndicator?: boolean;
}

export const ScreenLayout = React.forwardRef<ScrollView, ScreenLayoutProps>(
  (
    {
      children,
      paddingHorizontal = spacing.lg,
      paddingTop = 20,
      paddingBottom = spacing.lg,
      safeAreaEdges = ['bottom'],
      backgroundColor = colors.bg_darkest,
      scrollIndicatorInsets = { right: 1 },
      showsVerticalScrollIndicator = false,
      style,
      contentContainerStyle,
      ...props
    },
    ref
  ) => {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor,
        }}
        edges={safeAreaEdges}
      >
        <ScrollView
          ref={ref}
          style={{
            flex: 1,
            backgroundColor,
            ...style,
          }}
          contentContainerStyle={{
            paddingHorizontal,
            paddingTop,
            paddingBottom,
            ...contentContainerStyle,
          }}
          scrollIndicatorInsets={scrollIndicatorInsets}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          {...props}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
);

ScreenLayout.displayName = 'ScreenLayout';
