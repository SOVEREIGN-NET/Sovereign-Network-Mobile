import React from 'react';
import {
  FlatList,
  FlatListProps,
  StyleSheet,
} from 'react-native';
import { colors } from '../../../theme';

export interface ListProps<T> extends Omit<FlatListProps<T>, 'renderItem'> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  showsVerticalScrollIndicator?: boolean;
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.bg_darkest,
  },
});

export const List = React.memo(
  React.forwardRef<FlatList, ListProps<any>>(
    (
      {
        data,
        renderItem,
        keyExtractor,
        onEndReached,
        onEndReachedThreshold = 0.5,
        showsVerticalScrollIndicator = false,
        ...props
      },
      ref,
    ) => {
      return (
        <FlatList
          ref={ref}
          data={data}
          renderItem={({ item, index }) => renderItem(item, index)}
          keyExtractor={
            keyExtractor
              ? (item, index) => keyExtractor(item, index)
              : (item, index) =>
                  typeof item?.id === 'string'
                    ? item.id
                    : `${index}`
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={onEndReachedThreshold}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          scrollIndicatorInsets={{ right: 1 }}
          style={styles.list}
          {...props}
        />
      );
    },
  ),
);

List.displayName = 'List';
