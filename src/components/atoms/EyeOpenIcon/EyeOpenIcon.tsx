/**
 * EyeOpenIcon
 * An open eye SVG icon.
 * Used as a toggle to reveal hidden passphrase text.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '../../../theme';

export interface EyeOpenIconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const EyeOpenIcon: React.FC<EyeOpenIconProps> = ({
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
    <Path
      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle
      cx="12"
      cy="12"
      r="3"
      stroke={color}
      strokeWidth={1.5}
    />
  </Svg>
);

export default EyeOpenIcon;