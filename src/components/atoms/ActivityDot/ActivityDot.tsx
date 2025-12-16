import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ActivityDotProps {
  color: string;
  size?: number;
}

/**
 * A simple dot indicator that shows activity status
 */
export const ActivityDot: React.FC<ActivityDotProps> = ({
  color,
  size = 8,
}) => {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {},
});

export default ActivityDot;
