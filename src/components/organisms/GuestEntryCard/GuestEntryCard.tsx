/**
 * GuestEntryCard
 *
 * Shared landing layout used by every tab that shows a sign-in prompt to
 * guests (SID wallet tab, Profile tab, etc). Centralizes the "faded
 * preview + headline + body + dual CTAs" pattern so the tabs stay
 * visually consistent and the Sonar duplication number stays honest.
 *
 * Props intentionally minimal — callers supply their own `preview` node
 * (wallet card, profile card, …) and their own copy. The dual CTAs
 * (Sign In primary + Create Account secondary) are the same everywhere
 * the card is used, so they live here.
 */

import React from 'react';
import { View } from 'react-native';
import { Text, Button } from '../../atoms';
import { colors, spacing, typography } from '../../../theme';

export interface GuestEntryCardProps {
  /**
   * Faded preview card shown above the copy. Rendered at 55% opacity by
   * the consumer to signal "this is what you'd see logged in".
   */
  preview: React.ReactNode;
  headline: string;
  body: string;
  signInLabel: string;
  createLabel: string;
  onSignIn: () => void;
  onCreate: () => void;
}

export const GuestEntryCard: React.FC<GuestEntryCardProps> = ({
  preview,
  headline,
  body,
  signInLabel,
  createLabel,
  onSignIn,
  onCreate,
}) => (
  <View
    style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.xl,
    }}
  >
    {preview}

    <View style={{ alignItems: 'center', maxWidth: 340 }}>
      <Text
        style={{
          fontSize: typography.size['2xl'],
          fontWeight: typography.weight.bold,
          color: colors.text_primary,
          textAlign: 'center',
          marginBottom: spacing.sm,
          letterSpacing: -0.3,
        }}
      >
        {headline}
      </Text>
      <Text
        style={{
          fontSize: typography.size.md,
          color: colors.text_secondary,
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        {body}
      </Text>
    </View>

    <View style={{ width: '100%', maxWidth: 320, gap: spacing.md }}>
      <Button variant="primary" onPress={onSignIn}>
        {signInLabel}
      </Button>
      <Button variant="secondary" onPress={onCreate}>
        {createLabel}
      </Button>
    </View>
  </View>
);

export default GuestEntryCard;
