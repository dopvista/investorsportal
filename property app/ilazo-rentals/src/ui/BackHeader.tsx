import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, font } from '../theme';
import { Icon } from './Icon';

/** Back arrow + uppercase eyebrow ('UNIT DETAILS') or bold title variant. */
export function BackHeader({
  label,
  onBack,
  bold,
}: {
  label: string;
  onBack: () => void;
  bold?: boolean;
}) {
  return (
    <View style={s.row}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={s.btn}>
        <Icon name="arrow-back" size={21} color={colors.ink} />
      </Pressable>
      {bold ? <Text style={s.title}>{label}</Text> : <Text style={s.eyebrow}>{label.toUpperCase()}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  eyebrow: { fontSize: 12, color: colors.muted2, fontFamily: font.bodyBold, letterSpacing: 0.8 },
  title: { fontSize: 20, fontFamily: font.heading, color: colors.ink },
});
