/**
 * AnnouncementBanner — renders the current remote announcement (if any).
 *
 * Mount this once near the app root (above the navigator). When no
 * announcement is active, this component returns null — zero footprint.
 *
 * The severity colour is pulled from the existing theme tokens so the
 * banner blends with the rest of the chrome and respects light/dark.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../atoms/Text';
import { colors, spacing, typography, borderRadius } from '../../../theme';
import {
  useRemoteAnnouncement,
  type UseRemoteAnnouncementResult,
} from '../../../hooks/useRemoteAnnouncement';
import type { AnnouncementSeverity } from '../../../services/RemoteAnnouncement';

interface SeverityColors {
  background: string;
  border: string;
  text: string;
}

function severityColors(severity: AnnouncementSeverity | undefined): SeverityColors {
  switch (severity) {
    case 'critical':
      return {
        background: `${colors.error}1a`,
        border: colors.error,
        text: colors.text_primary,
      };
    case 'warning':
      return {
        background: `${colors.warning}1a`,
        border: colors.warning,
        text: colors.text_primary,
      };
    case 'info':
    default:
      return {
        background: `${colors.info}1a`,
        border: colors.info,
        text: colors.text_primary,
      };
  }
}

export function AnnouncementBanner(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const { announcement, dismiss }: UseRemoteAnnouncementResult =
    useRemoteAnnouncement();

  if (!announcement) return null;

  const palette = severityColors(announcement.severity);
  const showClose = announcement.dismissable !== false;

  return (
    <View
      // Sit above the safe-area top inset — looks correct on notched / Dynamic
      // Island devices without the banner sliding under the status bar.
      style={{
        paddingTop: insets.top + spacing.xs,
        backgroundColor: palette.background,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: typography.size.sm,
              color: palette.text,
              lineHeight: 18,
            }}
            numberOfLines={4}
          >
            {announcement.message}
          </Text>
        </View>
        {showClose && (
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss announcement"
            style={{
              paddingHorizontal: spacing.xs,
              borderRadius: borderRadius.sm,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                color: palette.text,
                fontWeight: typography.weight.semibold,
                lineHeight: 18,
              }}
            >
              ✕
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default AnnouncementBanner;
