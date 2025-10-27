import React from 'react';
import {
  Modal as RNModal,
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../../theme';
import { Text } from '../../atoms/Text';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: Array<{
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
  style?: ViewStyle;
  closeOnBackdropPress?: boolean;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    maxWidth: '90%',
    width: 350,
  },
  titleContainer: {
    marginBottom: spacing.lg,
  },
  content: {
    marginBottom: spacing.xl,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.bg_medium,
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  primaryText: {
    color: colors.black,
    fontWeight: 'bold' as const,
  },
  secondaryText: {
    color: colors.text_primary,
    fontWeight: '600' as const,
  },
  dangerText: {
    color: colors.white,
    fontWeight: '600' as const,
  },
});

export const Modal = React.memo(
  ({
    visible,
    onClose,
    title,
    children,
    actions,
    style,
    closeOnBackdropPress = true,
  }: ModalProps) => {
    const getActionButtonStyle = (variant: string = 'secondary') => {
      switch (variant) {
        case 'primary':
          return [styles.actionButton, styles.primaryButton];
        case 'danger':
          return [styles.actionButton, styles.dangerButton];
        default:
          return [styles.actionButton, styles.secondaryButton];
      }
    };

    const getActionTextStyle = (variant: string = 'secondary') => {
      switch (variant) {
        case 'primary':
          return styles.primaryText;
        case 'danger':
          return styles.dangerText;
        default:
          return styles.secondaryText;
      }
    };

    return (
      <RNModal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={styles.container}
          activeOpacity={1}
          onPress={closeOnBackdropPress ? onClose : undefined}
        >
          <TouchableOpacity
            style={[styles.modal, style]}
            activeOpacity={1}
            onPress={() => {}}
          >
            {title && (
              <View style={styles.titleContainer}>
                <Text variant="h2" weight="bold">
                  {title}
                </Text>
              </View>
            )}

            <View style={styles.content}>
              {typeof children === 'string' ? (
                <Text variant="body">{children}</Text>
              ) : (
                children
              )}
            </View>

            {actions && actions.length > 0 && (
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={getActionButtonStyle(action.variant)}
                    onPress={() => {
                      action.onPress();
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={getActionTextStyle(action.variant)}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </RNModal>
    );
  },
);

Modal.displayName = 'Modal';
