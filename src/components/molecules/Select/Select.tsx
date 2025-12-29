/**
 * Select Component
 * Dropdown selector with modal options
 */

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Text, Badge } from '../../atoms';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface SelectOption {
  id: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
}

export interface SelectProps {
  options: SelectOption[];
  selectedId: string | number;
  onSelect: (id: string | number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  options,
  selectedId,
  onSelect,
  label,
  placeholder = 'Select an option',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Filter out options with missing labels to prevent nil insertion errors
  const validOptions = options.filter(opt => opt.label && opt.label.length > 0);
  const selectedOption = validOptions.find((opt) => opt.id === selectedId);

  const handleSelect = (id: string | number) => {
    onSelect(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Select Button */}
      <Pressable
        onPress={() => setIsOpen(true)}
        disabled={disabled}
        style={{
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: borderRadius.sm,
          backgroundColor: disabled ? colors.bg_light : colors.bg_medium,
          borderWidth: 1,
          borderColor: colors.border_light,
          minHeight: 44,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: typography.size.sm,
            color: selectedOption ? colors.text_primary : colors.text_secondary,
            fontWeight: typography.weight.medium,
          }}
        >
          {selectedOption?.label || placeholder}
        </Text>
      </Pressable>

      {/* Dropdown Modal */}
      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setIsOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bg_dark,
              borderTopLeftRadius: borderRadius.lg,
              borderTopRightRadius: borderRadius.lg,
              maxHeight: '70%',
              paddingTop: spacing.md,
            }}
          >
            {/* Header */}
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border_light,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {label || 'Select'}
              </Text>
            </View>

            {/* Options List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ paddingHorizontal: 0 }}
            >
              {validOptions.map((option) => {
                const isSelected = option.id === selectedId;
                const isDisabled = option.disabled === true;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => !isDisabled && handleSelect(option.id)}
                    disabled={isDisabled}
                    style={{
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      backgroundColor: isSelected ? colors.primary + '20' : 'transparent',
                      borderLeftWidth: isSelected ? 3 : 0,
                      borderLeftColor: isSelected ? colors.primary : 'transparent',
                      minHeight: 48,
                      justifyContent: 'center',
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: isSelected ? typography.weight.semibold : typography.weight.normal,
                          color: isDisabled ? colors.text_tertiary : (isSelected ? colors.primary : colors.text_primary),
                        }}
                      >
                        {option.label}
                      </Text>
                      {option.badge && (
                        <Badge label={option.badge} variant="warning" />
                      )}
                    </View>
                    {option.description && (
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_secondary,
                          marginTop: spacing.xs,
                        }}
                      >
                        {option.description}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Footer Spacing */}
            <View style={{ height: spacing.lg }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

Select.displayName = 'Select';
