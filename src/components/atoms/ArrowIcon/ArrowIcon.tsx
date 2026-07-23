/**
 * ArrowIcon
 * A clean SVG arrow icon drawn with a single thick angled line.
 * Supports multiple directions: up, down, left, right, up-right, down-left.
 *
 * The base arrow shape is the thin, sharp chevron-style arrow seen
 * throughout the app (back arrow, send/receive indicators, etc.).
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../../theme';

export type ArrowDirection =
  | 'left'       // ← back
  | 'right'      // → forward / send
  | 'up'         // ↑ send
  | 'down'       // ↓ receive
  | 'up-right'   // ↗ send-out
  | 'down-left'; // ↙ receive-in

export interface ArrowIconProps {
  direction?: ArrowDirection;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Extra style for the Svg wrapper (e.g. marginLeft). */
  style?: ViewStyle;
}

/** Map direction to angle (degrees) — rotating a right-pointing arrow. */
const directionAngle: Record<ArrowDirection, number> = {
  left:       180,
  right:      0,
  up:         -90,
  down:       90,
  'up-right': -45,
  'down-left': 135,
};

export const ArrowIcon: React.FC<ArrowIconProps> = ({
  direction = 'right',
  size = 20,
  color = colors.text_primary,
  strokeWidth = 2.5,
  style,
}) => {
  const angle = directionAngle[direction];
  // viewBox keeps the arrow centred regardless of rotation
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={[style, { transform: [{ rotate: `${angle}deg` }] }]}
    >
      <Path
        d="M5 12h14M12 5l7 7-7 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default ArrowIcon;
