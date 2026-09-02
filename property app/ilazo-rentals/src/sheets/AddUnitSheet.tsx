import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { FieldLabel, Input } from '../ui/primitives';
import { PrimaryButton, SelectField, SheetHeader } from '../ui/fields';
import { ToastHost } from '../ui/Toast';
import { colors, font, radius } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { fmt, parseAmt } from '../../core/money';
import type { UnitType } from '../../core/types';

const TYPES: UnitType[] = ['Single', 'Couples', 'Family'];

export function AddUnitSheet({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const units = useApp((s) => s.units);
  const addUnit = useApp((s) => s.addUnit);
  const { showToast } = useUi();

  const [name, setName] = useState('');
  const [type, setType] = useState<UnitType>('Single');
  const [rent, setRent] = useState('300,000');
  const [ownerOccupied, setOwnerOccupied] = useState(false);
  const [owner, setOwner] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Enter the unit name');
      return;
    }
    if (units.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`${trimmed} already exists`);
      return;
    }
    if (ownerOccupied) {
      const who = owner.trim();
      if (!who) {
        showToast("Enter the occupant's name");
        return;
      }
      addUnit({ name: trimmed, type, rent: 0, date: today, owner: who });
      onClose();
      showToast(`Owner-occupied unit added · ${trimmed}`, 3000);
      return;
    }
    const rentAmt = parseAmt(rent);
    if (rentAmt <= 0) {
      showToast('Enter the monthly rent');
      return;
    }
    addUnit({ name: trimmed, type, rent: rentAmt, date: today });
    onClose();
    showToast(`Unit added · ${trimmed}`, 3000);
  };

  return (
    <Sheet visible onClose={onClose}>
      <SheetHeader
        icon="domain"
        title="Add new unit"
        subtitle={ownerOccupied ? 'Occupied by the owner — no rent' : 'The unit starts vacant'}
        onClose={onClose}
      />

      <FieldLabel>Unit name</FieldLabel>
      <Input value={name} onChangeText={setName} placeholder="e.g. Ilazo 4" />

      <View style={{ flexDirection: 'row', gap: 11, marginTop: 16, zIndex: 30 }}>
        <View style={{ flex: 1 }}>
          <FieldLabel>Type</FieldLabel>
          <SelectField value={type} onChange={setType} compact options={TYPES.map((t) => ({ value: t, label: t }))} />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Monthly rent (TZS)</FieldLabel>
          {ownerOccupied ? (
            <View style={[s.rentInput, s.rentDisabled]}>
              <Text style={s.rentDisabledText}>No rent</Text>
            </View>
          ) : (
            <TextInput
              value={rent}
              onChangeText={setRent}
              keyboardType="numeric"
              style={s.rentInput}
              placeholder={fmt(300000)}
              placeholderTextColor={colors.muted3}
            />
          )}
        </View>
      </View>

      {/* Owner-occupied toggle */}
      <View style={s.toggleRow}>
        <View style={s.toggleIcon}>
          <Icon name="home" size={19} color={colors.owner} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.toggleTitle}>Owner-occupied</Text>
          <Text style={s.toggleSub}>The owner lives here — no rent is charged</Text>
        </View>
        <Switch
          value={ownerOccupied}
          onValueChange={setOwnerOccupied}
          trackColor={{ false: colors.track, true: colors.owner }}
          thumbColor="#fff"
        />
      </View>

      {ownerOccupied ? (
        <>
          <FieldLabel style={{ marginTop: 16 }}>Occupant name</FieldLabel>
          <Input value={owner} onChangeText={setOwner} placeholder="e.g. Dodoma Contemporary (owner)" />
          <View style={[s.note, { backgroundColor: colors.ownerBg, borderColor: colors.ownerBg }]}>
            <Icon name="info" size={22} color={colors.owner} />
            <Text style={[s.noteText, { color: colors.owner }]}>
              This unit counts as occupied but is excluded from the rent roll and never shows rent due.
            </Text>
          </View>
        </>
      ) : (
        <View style={s.note}>
          <Icon name="person-add" size={24} color={colors.green} />
          <Text style={s.noteText}>
            Once added, open the unit (or use New on the Tenants page) to register its first tenant — rent starts
            accruing from their tenure start date.
          </Text>
        </View>
      )}

      <PrimaryButton label="Add unit" onPress={submit} onCancel={onClose} />
      <ToastHost bottom={40} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  rentInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: font.headingSemi,
    backgroundColor: colors.card,
    color: colors.ink,
  },
  rentDisabled: { backgroundColor: colors.tile, justifyContent: 'center' },
  rentDisabledText: { fontSize: 15, fontFamily: font.headingSemi, color: colors.muted3 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.ownerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink },
  toggleSub: { fontSize: 11.5, fontFamily: font.bodyMed, color: colors.muted2, marginTop: 1 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.previewBg,
    borderWidth: 1,
    borderColor: colors.previewBorder,
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
  },
  noteText: { flex: 1, fontSize: 12.5, color: colors.previewSub, fontFamily: font.bodySemi },
});
