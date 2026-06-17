/**
 * LockIcon
 * A simple padlock SVG icon — closed, locked state.
 * Used next to backup/security actions.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export interface LockIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const LockIcon: React.FC<LockIconProps> = ({
  size = 20,
  color = colors.text_primary,
  style,
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={style}
  >
    <Rect
      x="5"
      y="11"
      width="14"
      height="10"
      rx="2"
      stroke={color}
      strokeWidth={1.5}
    />
    <Path
      d="M8 11V7a4 4 0 0 1 8 0v4"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 15v2"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Svg>
);

export default LockIcon;