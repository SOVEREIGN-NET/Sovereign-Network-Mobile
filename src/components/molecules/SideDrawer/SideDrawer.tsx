/**
 * SideDrawer Component
 * Slide-out menu with navigation options (Settings, History, Bookmarks, Favorites)
 * Used in Dashboard/Browser screens
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  useWindowDimensions,
  SafeAreaView,
  Animated,
} from 'react-native';
import { Text, Divider, Column } from '../../atoms';
import { colors, spacing, typography, shadows } from '../../../theme';

export interface DrawerItem {
  id: string;
  label: string;
  icon: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}

export interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  items: DrawerItem[];
  title?: string;
}

const SideDrawer: React.FC<SideDrawerProps> = ({
  visible,
  onClose,
  items,
  title = 'Menu',
}) => {
  const { width } = useWindowDimensions();
  const drawerWidth = width * 0.5;
  const [slideAnim] = useState(new Animated.Value(-drawerWidth));

  // Animate drawer when visible changes
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -drawerWidth,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim, drawerWidth]);

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    drawerContainer: {
      width: drawerWidth,
      height: '100%',
      backgroundColor: colors.bg_dark,
      ...shadows.lg,
    },
    safeArea: {
      flex: 1,
      backgroundColor: colors.bg_dark,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: typography.size.lg,
      fontWeight: typography.weight.bold,
      color: colors.text_primary,
      marginBottom: spacing.md,
    },
    closeButton: {
      alignItems: 'flex-start',
      padding: spacing.sm,
      marginLeft: -spacing.sm,
    },
    closeIcon: {
      fontSize: typography.size.lg,
      color: colors.text_primary,
    },
    content: {
      flex: 1,
      paddingVertical: spacing.md,
    },
    menuItem: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    menuItemPressed: {
      backgroundColor: colors.bg_darker,
    },
    menuIcon: {
      fontSize: typography.size.lg,
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuLabel: {
      fontSize: typography.size.md,
      fontWeight: typography.weight.medium,
      flex: 1,
    },
    menuLabelDefault: {
      color: colors.text_primary,
    },
    menuLabelDanger: {
      color: colors.error,
    },
    divider: {
      marginHorizontal: 0,
      marginVertical: 0,
    },
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {/* Drawer */}
        <Animated.View
          style={[
            styles.drawerContainer,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <SafeAreaView style={styles.safeArea}>
            {/* Header with Close Button */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            {/* Menu Items */}
            <ScrollView style={styles.content} scrollEventThrottle={16}>
              <Column>
                {items.map((item, index) => (
                  <View key={item.id}>
                    <Pressable
                      onPress={() => {
                        onClose();
                        // Delay navigation to allow drawer to close first
                        setTimeout(() => item.onPress(), 50);
                      }}
                      style={({ pressed }) => [
                        styles.menuItem,
                        pressed && styles.menuItemPressed,
                      ]}
                    >
                      {item.icon && <Text style={styles.menuIcon}>{item.icon}</Text>}
                      <Text
                        style={{
                          ...styles.menuLabel,
                          ...(item.variant === 'danger'
                            ? styles.menuLabelDanger
                            : styles.menuLabelDefault),
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                    {index < items.length - 1 && (
                      <Divider style={styles.divider} />
                    )}
                  </View>
                ))}
              </Column>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>

        {/* Overlay */}
        <Pressable
          style={[styles.overlay, { flex: 1 }]}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
};

export default SideDrawer;
