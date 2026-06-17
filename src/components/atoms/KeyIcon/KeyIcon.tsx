/**
 * KeyIcon
 * A simple key SVG icon.
 * Used next to backup viewing actions.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '../../../theme';

export interface KeyIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const KeyIcon: React.FC<KeyIconProps> = ({
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
    <Circle
      cx="9"
      cy="15"
      r="5"
      stroke={color}
      strokeWidth={1.5}
    />
    <Path
      d="M12.5 11.5L21 3"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <Path
      d="M19 5l2-2"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <Path
      d="M16 8l2-2"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Svg>
);

export default KeyIcon;