import React from 'react';
import {
  View,
  TouchableOpacity,
  Text as RNText,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface ListItemProps {
  icon?: string;
  title: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  icon: {
    fontSize: typography.size['2xl'],
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: typography.size.md,
    color: colors.text_primary,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
  },
  rightContent: {
    marginLeft: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});

export const ListItem = React.memo(
  ({
    icon,
    title,
    subtitle,
    rightContent,
    onPress,
    divider = true,
    style,
  }: ListItemProps) => {
    const content = (
      <>
        {icon && <RNText style={styles.icon}>{icon}</RNText>}
        <View style={styles.content}>
          <RNText style={styles.title} numberOfLines={1}>
            {title}
          </RNText>
          {subtitle && (
            <RNText style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </RNText>
          )}
        </View>
        {rightContent && <View style={styles.rightContent}>{rightContent}</View>}
      </>
    );

    if (onPress) {
      return (
        <TouchableOpacity
          style={[styles.container, style]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <View style={styles.touchable}>{content}</View>
          {divider && <View style={styles.divider} />}
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.container, style]}>
        <View style={styles.touchable}>{content}</View>
        {divider && <View style={styles.divider} />}
      </View>
    );
  },
);

ListItem.displayName = 'ListItem';
