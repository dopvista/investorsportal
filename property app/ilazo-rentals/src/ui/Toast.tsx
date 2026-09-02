import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, font } from '../theme';
import { useUi } from '../state/UiProvider';

/**
 * Dark pill toast, bottom-center. Rendered both at the app root and inside
 * open sheets (RN modals cover root-level overlays).
 */
export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const { toast } = useUi();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [toast, anim]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center' }]}>
      <Animated.View
        style={[
          s.toast,
          { marginBottom: bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
        ]}
      >
        <Icon name="check-circle" size={20} color={colors.mint} />
        <Text style={s.text}>{toast}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.ink,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#0E1512',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    maxWidth: '88%',
  },
  text: { color: '#fff', fontSize: 13, fontFamily: font.bodySemi, flexShrink: 1 },
});
