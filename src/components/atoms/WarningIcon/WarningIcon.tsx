/**
 * WarningIcon
 * An exclamation mark inside a triangle — alert / warning symbol.
 * Used next to security warnings.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../../theme';

export interface WarningIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const WarningIcon: React.FC<WarningIconProps> = ({
  size = 20,
  color = colors.warning,
  style,
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={style}
  >
    <Path
      d="M12 3L2 21h20L12 3z"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 10v4"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <Path
      d="M12 17v0"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Svg>
);

export default WarningIcon;