import React from 'react';
import { View, ViewStyle } from 'react-native';

export interface SearchIconProps {
  color: string;
  size?: number;
  style?: ViewStyle;
}

export const SearchIcon = ({ color, size = 24, style }: SearchIconProps) => {
  const scale = size / 24;

  return (
    <View
      style={[{
        width: size,
        height: size,
        justifyContent: 'center',
        alignItems: 'center',
      }, style]}
    >
      <View
        style={{
          width: 16 * scale,
          height: 16 * scale,
          borderRadius: (16 * scale) / 2,
          borderWidth: 2 * scale,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: 2 * scale,
          height: 8 * scale,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
          position: 'absolute',
          bottom: 2 * scale,
          right: 2 * scale,
        }}
      />
    </View>
  );
};
