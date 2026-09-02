import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, vs } from '../theme';

/** Scrollable screen body with safe-area top padding on the cream background. */
export function Screen({ children, topPad = 6 }: { children: React.ReactNode; topPad?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + topPad,
          paddingHorizontal: 16,
          paddingBottom: vs(18, 14),
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {/*
        Status-bar scrim: the ScrollView runs full-bleed, so scrolled content
        used to slide up behind the clock/battery and collide with them.
        Painting the safe-area strip in the page colour keeps the status bar
        legible without costing any layout height.
      */}
      <View pointerEvents="none" style={[s.statusScrim, { height: insets.top }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
});
