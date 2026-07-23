/**
 * ScreenLayout
 * Reusable wrapper combining SafeAreaView + ScrollView with consistent styling.
 * Optional:
 *   - `onBack` renders a "← Back" row at the top, wired to the handler.
 *   - `keyboardAvoiding` wraps content in KeyboardAvoidingView so TextInputs
 *     near the bottom of the screen aren't covered by the soft keyboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  Insets,
  KeyboardAvoidingView,
  Keyboard,
  KeyboardEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  findNodeHandle,
  UIManager,
} from 'react-native';
import { SafeAreaView, SafeAreaViewProps } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../../theme';
import { ArrowIcon } from '../../atoms/ArrowIcon/ArrowIcon';

export interface ScreenLayoutProps extends Omit<ScrollViewProps, 'children' | 'scrollIndicatorInsets'> {
  children: React.ReactNode;
  paddingHorizontal?: number;
  paddingTop?: number;
  paddingBottom?: number;
  safeAreaEdges?: SafeAreaViewProps['edges'];
  backgroundColor?: string;
  scrollIndicatorInsets?: Insets;
  showsVerticalScrollIndicator?: boolean;
  /** If provided, renders a "← Back" pressable at the top. */
  onBack?: () => void;
  /** Label next to the arrow. Defaults to "Back". */
  backLabel?: string;
  /** Wrap content in KeyboardAvoidingView so inputs aren't covered. */
  keyboardAvoiding?: boolean;
  /** Stretch the content container to fill the viewport — needed for
   *  vertically-centered guest/empty states. Leave false for forms so
   *  the keyboard can scroll the focused input above the fold. */
  centerContent?: boolean;
}

export const ScreenLayout = React.forwardRef<ScrollView, ScreenLayoutProps>(
  (
    {
      children,
      paddingHorizontal = spacing.lg,
      paddingTop = 20,
      paddingBottom = spacing.lg,
      safeAreaEdges = ['bottom'],
      backgroundColor = colors.bg_darkest,
      scrollIndicatorInsets = { right: 1 },
      showsVerticalScrollIndicator = false,
      onBack,
      backLabel = 'Back',
      keyboardAvoiding = false,
      centerContent = false,
      style,
      contentContainerStyle,
      ...props
    },
    ref
  ) => {
    // Internal ScrollView ref used to force-scroll the focused TextInput
    // into view. Consumers can still pass their own via forwardRef.
    const internalRef = useRef<ScrollView | null>(null);
    const setRef = (node: ScrollView | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<ScrollView | null>).current = node;
    };

    // Track the live keyboard height. Drives the ScrollView's bottom padding
    // so we reserve exactly the keyboard's height (no lazy constant) and
    // release it when the keyboard closes.
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    // When the keyboard opens, find whichever TextInput is currently focused
    // and scroll the ScrollView so that input sits comfortably above the
    // keyboard. Works without per-field wiring — any <TextInput> descendant
    // benefits. `TextInput.State.currentlyFocusedInput()` returns the live node.
    useEffect(() => {
      const showEvent =
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent =
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const onShow = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
        const kb = e.endCoordinates?.height ?? 0;
        setKeyboardHeight(kb);

        const scroll = internalRef.current;
        if (!scroll) return;
        const state = (TextInput as unknown as {
          State?: { currentlyFocusedInput?: () => unknown };
        }).State;
        const focused = state?.currentlyFocusedInput?.();
        if (!focused) return;
        const focusedHandle = findNodeHandle(focused as React.Component);
        const scrollHandle = findNodeHandle(scroll);
        if (!focusedHandle || !scrollHandle) return;
        UIManager.measureLayout(
          focusedHandle,
          scrollHandle,
          () => {},
          (_x, y, _w, h) => {
            // Land the input's bottom ~24px above the keyboard.
            const overlap = y + h + 24 - kb - 40;
            if (overlap > 0) {
              scroll.scrollTo({ y: overlap, animated: true });
            }
          },
        );
      });
      const onHide = Keyboard.addListener(hideEvent, () => {
        setKeyboardHeight(0);
      });
      return () => {
        onShow.remove();
        onHide.remove();
      };
    }, []);

    const scrollView = (
      <ScrollView
        ref={setRef}
        style={{
          flex: 1,
          backgroundColor,
          ...style,
        }}
        contentContainerStyle={{
          paddingHorizontal,
          paddingTop: onBack ? spacing.sm : paddingTop,
          // Normal bottom padding when idle; while the keyboard is open,
          // expand by exactly its measured height plus a small breathing
          // buffer. Dynamic — no lazy constants, no guesses.
          paddingBottom:
            keyboardHeight > 0
              ? paddingBottom + keyboardHeight + spacing.md
              : paddingBottom,
          // Fill the viewport only when the caller is centering content
          // (guest/empty states). Forms omit this so the keyboard can
          // scroll inputs above the fold.
          ...(centerContent ? { flexGrow: 1 } : null),
          ...contentContainerStyle,
        }}
        scrollIndicatorInsets={scrollIndicatorInsets}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        {...props}
      >
        {onBack ? (
          <View style={{ marginBottom: spacing.md }}>
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.xs,
              }}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
            >
              <ArrowIcon direction="left" size={18} color={colors.primary} />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.medium,
                }}
              >
                {backLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {children}
      </ScrollView>
    );

    // On iOS wrap in KeyboardAvoidingView (behavior=padding) so the ScrollView
    // shrinks by the keyboard height. Combined with the scroll-to-focused
    // effect above, the focused input lands above the keyboard. On Android
    // `windowSoftInputMode="adjustResize"` in the manifest handles this
    // natively, so no JS wrapper — otherwise it double-adjusts and jumps.
    const needsKav = keyboardAvoiding && Platform.OS === 'ios';
    const body = needsKav ? (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {scrollView}
      </KeyboardAvoidingView>
    ) : (
      scrollView
    );

    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor,
        }}
        edges={safeAreaEdges}
      >
        {body}
      </SafeAreaView>
    );
  }
);

ScreenLayout.displayName = 'ScreenLayout';
