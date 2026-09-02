import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, font, radius } from '../theme';
import { Icon } from './Icon';
import { fmtDate, todayISO } from '../../core/dates';
import type { ISODate } from '../../core/types';

/**
 * Dropdown-style select. The options float in an overlay anchored under the
 * field — they never push the surrounding layout down.
 */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  compact,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={open ? s.selectOpen : undefined}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((o) => !o)}
        style={[s.input, compact && s.inputCompact, { flexDirection: 'row', alignItems: 'center' }]}
      >
        <Text style={[s.inputText, compact && s.inputTextCompact]} numberOfLines={1}>
          {current?.label ?? ''}
        </Text>
        <Icon name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.muted} style={{ marginLeft: 'auto' }} />
      </Pressable>
      {open && (
        <View style={s.options}>
          {options.map((o, i) => (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={[s.option, i < options.length - 1 && s.optionBorder]}
            >
              <Text
                style={[s.inputText, compact && s.inputTextCompact, o.value === value && { color: colors.green }]}
                numberOfLines={1}
              >
                {o.label}
              </Text>
              {o.value === value && <Icon name="check" size={18} color={colors.green} style={{ marginLeft: 'auto' }} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Date field backed by the native date picker on each platform. */
export function DateField({ value, onChange }: { value: ISODate; onChange: (v: ISODate) => void }) {
  const [show, setShow] = useState(false);
  const dateValue = new Date(`${value}T12:00:00`);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setShow((v) => !v)} style={[s.input, s.inputCompact, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <Icon name="event-available" size={17} color={colors.muted} />
        <Text style={s.inputTextCompact}>{fmtDate(value)}</Text>
      </Pressable>
      {show &&
        (Platform.OS === 'ios' ? (
          <View style={s.iosPicker}>
            <DateTimePicker
              value={dateValue}
              mode="date"
              display="spinner"
              onValueChange={(_e: unknown, d?: Date) => {
                if (d) onChange(todayISO(d));
              }}
            />
            <Pressable onPress={() => setShow(false)} style={s.doneBtn}>
              <Text style={s.doneText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <DateTimePicker
            value={dateValue}
            mode="date"
            display="default"
            onValueChange={(_e: unknown, d?: Date) => {
              setShow(false);
              if (d) onChange(todayISO(d));
            }}
            onDismiss={() => setShow(false)}
          />
        ))}
    </View>
  );
}

/** Sheet header: icon tile + title + subtitle + close button. */
export function SheetHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <View style={s.headIcon}>
        <Icon name={icon} size={22} color={colors.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.headTitle}>{title}</Text>
        <Text style={s.headSub}>{subtitle}</Text>
      </View>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={s.closeBtn}>
        <Icon name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/**
 * Primary action button used at the bottom of sheets.
 *
 * Pass `onCancel` to get a secondary Close button on the left; the primary
 * then shares the row (flex) instead of running full-width. Both buttons use a
 * fixed height with `justifyContent: 'center'` so the label is optically
 * centred — `paddingVertical` alone left it sitting low on Android because of
 * the extra font padding.
 */
export function PrimaryButton({
  label,
  onPress,
  onCancel,
  cancelLabel = 'Close',
}: {
  label: string;
  onPress: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const primary = (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.primary, onCancel ? s.primaryInRow : null, pressed && { opacity: 0.9 }]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );

  if (!onCancel) return primary;

  return (
    <View style={s.actionRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.9 }]}
      >
        <Text style={s.cancelText}>{cancelLabel}</Text>
      </Pressable>
      {primary}
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.card,
  },
  inputCompact: { paddingVertical: 12 },
  inputText: { fontSize: 14.5, fontFamily: font.bodySemi, color: colors.ink, flexShrink: 1 },
  inputTextCompact: { fontSize: 13.5, fontFamily: font.bodySemi, color: colors.ink },
  selectOpen: { zIndex: 100, elevation: 100 },
  options: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 5,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    backgroundColor: colors.card,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 12,
    shadowColor: '#142820',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  iosPicker: { backgroundColor: colors.card, borderRadius: radius.input, marginTop: 6, overflow: 'hidden' },
  doneBtn: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  doneText: { color: colors.green, fontFamily: font.bodyBold, fontSize: 14 },

  headIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.greenPillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontFamily: font.heading, fontSize: 18, color: colors.ink },
  headSub: { fontSize: 12, color: colors.muted2, fontFamily: font.body },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.segment,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primary: {
    marginTop: 18,
    backgroundColor: colors.green,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  /**
   * Inside the action row the row owns the top margin. The 1 : 1.4 split
   * matches the existing Close/Share footers in the receipt & statement
   * sheets, so every popup's buttons line up the same way.
   */
  primaryInRow: { flex: 1.4, marginTop: 0 },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: font.bodyBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  actionRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  cancelText: {
    color: colors.avatarFg,
    fontSize: 15,
    fontFamily: font.bodyBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
