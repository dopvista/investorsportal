import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { cardShadow, colors, font, radius } from '../theme';
import { initials as initialsOf } from '../../core/names';

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Pill({ label, bg, fg, small }: { label: string; bg: string; fg: string; small?: boolean }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }, small && s.pillSmall]}>
      <Text style={[s.pillText, { color: fg }, small && s.pillTextSmall]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({
  name,
  size = 42,
  rad = 14,
  bg = colors.avatarBg,
  fg = colors.avatarFg,
  fontSize,
}: {
  name: string;
  size?: number;
  rad?: number;
  bg?: string;
  fg?: string;
  fontSize?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: rad, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.bodyXBold, fontSize: fontSize ?? Math.round(size / 3), color: fg }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

export function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{label}</Text>
      {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
    </View>
  );
}

export function ProgressBar({
  pct,
  color,
  height = 7,
  style,
}: {
  pct: number;
  color: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' }, style]}>
      <View style={{ height: '100%', borderRadius: 5, width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </View>
  );
}

export function FieldLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[s.fieldLabel, style as any]}>{children}</Text>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted3} {...props} style={[s.input, props.style]} />;
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline }, style]} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    ...cardShadow,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    // A pill states a fact in two or three words — it keeps its natural width
    // and the flexible text beside it gives way, never the other way round.
    flexShrink: 0,
  },
  pillSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: font.bodyBold, fontSize: 12 },
  pillTextSmall: { fontSize: 10, fontFamily: font.bodyXBold },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontFamily: font.bodyBold,
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: font.bodyBold,
    color: colors.muted,
    marginBottom: 7,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    fontFamily: font.bodySemi,
    backgroundColor: colors.card,
    color: colors.ink,
  },
});
