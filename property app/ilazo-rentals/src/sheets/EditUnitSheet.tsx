import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { FieldLabel, Input } from '../ui/primitives';
import { PrimaryButton, SelectField, SheetHeader } from '../ui/fields';
import { ToastHost } from '../ui/Toast';
import { colors, font, radius } from '../theme';
import { useApp } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { isOwnerOccupied, isVacant } from '../../core/engine';
import { fmt, parseAmt } from '../../core/money';
import type { UnitType } from '../../core/types';

const TYPES: UnitType[] = ['Single', 'Couples', 'Family'];

export function EditUnitSheet({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const units = useApp((s) => s.units);
  const updateUnit = useApp((s) => s.updateUnit);
  const { showToast } = useUi();
  const unit = units.find((u) => u.id === unitId);

  const wasOwner = unit ? isOwnerOccupied(unit) : false;
  // The owner-occupied toggle only applies to units with an occupant.
  const canOwnerOccupy = unit ? !isVacant(unit) : false;

  const [name, setName] = useState(unit?.name ?? '');
  const [type, setType] = useState<UnitType>(unit?.type ?? 'Single');
  const [rent, setRent] = useState(fmt(wasOwner ? 0 : unit?.rent ?? 0));
  const [ownerOccupied, setOwnerOccupied] = useState(wasOwner);

  if (!unit) return null;
  const newRent = ownerOccupied ? 0 : parseAmt(rent);
  const rentChanged = !ownerOccupied && newRent > 0 && newRent !== unit.rent;
  const becomingOwner = ownerOccupied && !wasOwner;
  const leavingOwner = !ownerOccupied && wasOwner;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Enter the unit name');
      return;
    }
    if (units.some((u) => u.id !== unitId && u.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      showToast(`${trimmed} already exists`);
      return;
    }
    if (!ownerOccupied && newRent <= 0) {
      showToast('Enter the monthly rent');
      return;
    }
    updateUnit({ unitId, name: trimmed, type, rent: newRent });
    onClose();
    showToast(
      becomingOwner
        ? `${trimmed} is now owner-occupied`
        : rentChanged || leavingOwner
          ? `${trimmed} updated · rent now ${fmt(newRent)}/mo`
          : `${trimmed} updated`,
      3000,
    );
  };

  return (
    <Sheet visible onClose={onClose}>
      <SheetHeader icon="domain" title="Edit unit" subtitle="Name, type and monthly rent" onClose={onClose} />

      <FieldLabel>Unit name</FieldLabel>
      <Input value={name} onChangeText={setName} />

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
              placeholderTextColor={colors.muted3}
            />
          )}
        </View>
      </View>

      {canOwnerOccupy && (
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
      )}

      {becomingOwner ? (
        <View style={[s.note, { backgroundColor: colors.ownerBg, borderColor: colors.ownerBg }]}>
          <Icon name="home" size={22} color={colors.owner} />
          <Text style={[s.noteText, { color: colors.owner }]}>
            This unit becomes owner-occupied — rent stops being charged and it leaves the rent roll. Past receipts and
            history stay exactly as they are.
          </Text>
        </View>
      ) : rentChanged ? (
        <View style={s.rentNote}>
          <Icon name="event-repeat" size={22} color={newRent > unit.rent ? colors.amberInk : colors.green} />
          <Text style={s.rentNoteText}>
            Rent {newRent > unit.rent ? 'rises' : 'drops'} from {fmt(unit.rent)} to {fmt(newRent)}. The new rate
            applies to months not yet paid for — coverage already bought and past receipts stay exactly as they are.
          </Text>
        </View>
      ) : leavingOwner ? (
        <View style={s.rentNote}>
          <Icon name="event-repeat" size={22} color={colors.green} />
          <Text style={s.rentNoteText}>
            Rent resumes at {fmt(newRent)}/mo from months not yet paid for. Set the amount above.
          </Text>
        </View>
      ) : (
        <View style={s.note}>
          <Icon name="info" size={22} color={colors.green} />
          <Text style={s.noteText}>
            Changing the rent here only affects future months. The tenant, lease dates and payment history are
            untouched.
          </Text>
        </View>
      )}

      <PrimaryButton label="Save unit" onPress={submit} onCancel={onClose} />
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
  rentNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.amberBg,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
  },
  rentNoteText: { flex: 1, fontSize: 12.5, color: colors.amberLabel, fontFamily: font.bodySemi },
});
