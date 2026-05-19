/**
 * Small primitives shared across the three messaging screens.
 *
 * Kept inline rather than promoted to atoms/molecules — none of these
 * are useful outside the messaging surface yet, and pulling them out
 * prematurely would force a global API on what's still a phase-1 sketch.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../theme';
import {
  type LocalMessage,
  MessageContentType,
} from '../../types/messaging';

/** Deterministic color from a string — used to tint avatars. */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

interface AvatarProps {
  name: string;
  online?: boolean;
  size?: number;
  /**
   * When true, swap the initial for an abstract 2×2 mosaic so a
   * shoulder-surfer can't read off who you talk to. The hue still
   * tracks the contact so each row reads as visually distinct — same
   * affordance, no leaked biography.
   */
  redacted?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  online,
  size = 44,
  redacted = false,
}) => {
  const hue = hashHue(name);
  const bg = redacted
    ? `hsl(${hue}, 25%, 22%)`
    : `hsl(${hue}, 55%, 28%)`;
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const dotSize = Math.max(8, Math.round(size * 0.22));
  // Mosaic tile geometry. Even sizing, tight gap — reads as
  // "obscured face" without looking like a missing image icon.
  const tile = Math.round(size * 0.18);
  const gap = Math.max(2, Math.round(size * 0.05));
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          avatarStyles.bubble,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
          },
        ]}
      >
        {redacted ? (
          <View style={[avatarStyles.mosaicGrid, { gap }]}>
            <View style={avatarStyles.mosaicRow}>
              <View
                style={[
                  avatarStyles.mosaicTile,
                  { width: tile, height: tile, marginRight: gap },
                ]}
              />
              <View
                style={[
                  avatarStyles.mosaicTile,
                  {
                    width: tile,
                    height: tile,
                    opacity: 0.55,
                  },
                ]}
              />
            </View>
            <View style={avatarStyles.mosaicRow}>
              <View
                style={[
                  avatarStyles.mosaicTile,
                  {
                    width: tile,
                    height: tile,
                    marginRight: gap,
                    opacity: 0.55,
                  },
                ]}
              />
              <View
                style={[
                  avatarStyles.mosaicTile,
                  { width: tile, height: tile },
                ]}
              />
            </View>
          </View>
        ) : (
          <Text
            style={[
              avatarStyles.initial,
              { fontSize: size * 0.42 },
            ]}
          >
            {initial}
          </Text>
        )}
      </View>
      {online && !redacted && (
        <View
          style={[
            avatarStyles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
            },
          ]}
        />
      )}
    </View>
  );
};

const avatarStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#fff',
    fontWeight: typography.weight.semibold,
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: colors.bg_darkest,
  },
  mosaicGrid: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mosaicRow: {
    flexDirection: 'row',
  },
  mosaicTile: {
    backgroundColor: '#ffffffcc',
    borderRadius: 1.5,
  },
});

/**
 * Render a wall-clock-relative timestamp tight enough to fit in a
 * conversation row. Falls back to a date for anything older than a week.
 */
export function formatRelativeTime(timestampSec: number): string {
  const nowMs = Date.now();
  const ms = timestampSec * 1000;
  const diff = nowMs - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) {
    const d = new Date(ms);
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (diff < 7 * 86_400_000) {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncated DID for the inbox row when privacy mode is on. Recognisable
 * to the owner of the identity (their own keys hash deterministically),
 * opaque to a casual onlooker. Format: `did:zhtp:abcd…wxyz`.
 */
export function redactedName(did: string): string {
  const tail = did.replace(/^did:zhtp:/, '');
  if (tail.length <= 12) return did;
  return `did:zhtp:${tail.slice(0, 4)}…${tail.slice(-4)}`;
}

/**
 * Short, shoulder-surf-safe label that conveys *what kind* of message
 * arrived without leaking content. Time + count carry the metadata that
 * remains useful when the body is hidden.
 */
export function redactedPreview(
  msg: LocalMessage,
  unreadCount: number,
): string {
  if (unreadCount > 1) return `${unreadCount} new messages`;
  switch (msg.content_type) {
    case MessageContentType.Text:
      return msg.direction === 'sent'
        ? 'You sent a message'
        : 'Encrypted message';
    case MessageContentType.Image:
      return 'Image';
    case MessageContentType.File:
      return 'File';
    case MessageContentType.Voice:
      return 'Voice message';
    case MessageContentType.KeyExchange:
      return 'Secure session';
    case MessageContentType.KeyRatchet:
      return 'Re-keyed';
    case MessageContentType.ReadReceipt:
      return '';
    default:
      return '';
  }
}

/**
 * The varying-width skeleton bars shown next to the redacted preview.
 * Three bars with stable per-row widths (so they don't shimmer when the
 * list re-renders) — feels like content is loading or sealed, not like
 * censorship asterisks.
 */
export const RedactionBars: React.FC<{ seed: string; tint?: string }> = ({
  seed,
  tint = colors.text_tertiary,
}) => {
  // Deterministic widths from the seed so the same row keeps the same
  // bar pattern across re-renders — the eye learns it as part of the
  // visual identity rather than a glitch.
  const h = hashHue(seed);
  const widths = [
    18 + (h % 14),
    10 + ((h >> 3) % 10),
    14 + ((h >> 6) % 12),
  ];
  return (
    <View style={redactionBarStyles.row}>
      {widths.map((w, i) => (
        <View
          key={i}
          style={[
            redactionBarStyles.bar,
            { width: w, backgroundColor: tint, opacity: 0.45 },
          ]}
        />
      ))}
    </View>
  );
};

const redactionBarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    height: 6,
    borderRadius: 3,
  },
});

/**
 * Eye / eye-slash glyph for the privacy toggle. Drawn from primitives so
 * it matches the rest of the navigator iconography (also Views, no SVG).
 */
export const EyeIcon: React.FC<{ off?: boolean; color?: string; size?: number }> = ({
  off = false,
  color = colors.text_primary,
  size = 18,
}) => {
  const w = size;
  const h = Math.round(size * 0.62);
  const pupil = Math.round(size * 0.32);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderWidth: 1.5,
          borderColor: color,
          borderRadius: w / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: pupil,
            height: pupil,
            borderRadius: pupil / 2,
            backgroundColor: color,
          }}
        />
      </View>
      {off && (
        <View
          style={{
            position: 'absolute',
            width: size * 1.15,
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: '-32deg' }],
          }}
        />
      )}
    </View>
  );
};

/** Conversation-row preview text, content-type aware. */
export function previewBody(msg: LocalMessage): string {
  switch (msg.content_type) {
    case MessageContentType.Text:
      return msg.body;
    case MessageContentType.Image:
      return '🖼 Image';
    case MessageContentType.File:
      return '📎 File';
    case MessageContentType.Voice:
      return '🎙 Voice message';
    case MessageContentType.KeyExchange:
      return 'Started a secure conversation';
    case MessageContentType.KeyRatchet:
      return 'Re-keyed';
    case MessageContentType.ReadReceipt:
      return '';
    default:
      return '';
  }
}

/** Format a single bubble's HH:MM stamp. */
export function formatBubbleTime(timestampSec: number): string {
  return new Date(timestampSec * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Minimal lock badge used in chat headers + the inbox subtitle. */
export const LockBadge: React.FC<{ size?: number; color?: string }> = ({
  size = 11,
  color = colors.text_secondary,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
    }}
  >
    <View
      style={{
        width: size,
        height: size,
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: borderRadius.sm,
      }}
    />
    <View style={{ height: size, justifyContent: 'center' }}>
      <Text style={{ fontSize: size, color }}>•</Text>
    </View>
  </View>
);
