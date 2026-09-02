import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

/**
 * Bottom sheet matching the prototype: slides up (~320ms, cubic-bezier(.22,1,.36,1))
 * over a dim backdrop; tap backdrop or the Android back button to close.
 */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightPct = 0.94,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightPct?: number;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(height);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: 320,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, height, slide, fade]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop, opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>
        {/* Lifts the sheet above the keyboard so focused inputs stay visible. */}
        <KeyboardAvoidingView behavior="padding" style={s.kav} pointerEvents="box-none">
          <Animated.View
            style={[
              s.sheet,
              { maxHeight: height * maxHeightPct, transform: [{ translateY: slide }], paddingBottom: 24 + insets.bottom },
            ]}
          >
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#0E1512',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -12 },
    elevation: 24,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.handle,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
});
