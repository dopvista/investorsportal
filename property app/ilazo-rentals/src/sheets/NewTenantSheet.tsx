import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { FieldLabel, Input } from '../ui/primitives';
import { DateField, PrimaryButton, SelectField, SheetHeader } from '../ui/fields';
import { ToastHost } from '../ui/Toast';
import { colors, font } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { fmt } from '../../core/money';

export function NewTenantSheet({ unitId, onClose }: { unitId?: string; onClose: () => void }) {
  const today = useToday();
  const units = useApp((s) => s.units);
  const registerTenant = useApp((s) => s.registerTenant);
  const { showToast } = useUi();

  const [unit, setUnit] = useState(unitId ?? units[0].id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [start, setStart] = useState(today);
  const [kinName, setKinName] = useState('');
  const [kinPhone, setKinPhone] = useState('');
  const [kinRel, setKinRel] = useState('');

  const selected = units.find((u) => u.id === unit)!;

  const submit = () => {
    if (!name.trim()) {
      showToast('Enter the tenant name');
      return;
    }
    registerTenant({
      unitId: unit,
      name,
      phone,
      start,
      kin: { name: kinName, phone: kinPhone, rel: kinRel },
    });
    onClose();
    showToast(`Tenant registered · ${name.trim()}`, 3000);
  };

  return (
    <Sheet visible onClose={onClose}>
      <SheetHeader
        icon="person-add"
        title="Register new tenant"
        subtitle={`Starts a fresh lease · rent ${fmt(selected.rent)} / month`}
        onClose={onClose}
      />

      <View style={{ zIndex: 30 }}>
        <FieldLabel>Unit</FieldLabel>
        <SelectField
          value={unit}
          onChange={setUnit}
          options={units.map((u) => ({ value: u.id, label: `${u.name} — ${u.type}` }))}
        />
      </View>

      {selected.tenant.trim() ? (
        <View style={s.warn}>
          <Icon name="info" size={20} color={colors.amberInk} />
          <Text style={s.warnText}>
            {selected.tenant} (current in {selected.name}) will move to Former tenants.
          </Text>
        </View>
      ) : (
        <View style={s.vacantNote}>
          <Icon name="check-circle" size={20} color={colors.green} />
          <Text style={s.vacantNoteText}>{selected.name} is vacant — the new tenant starts a fresh lease.</Text>
        </View>
      )}

      <FieldLabel style={{ marginTop: 16 }}>Tenant full name</FieldLabel>
      <Input value={name} onChangeText={setName} placeholder="e.g. Amina Hassan" />

      <View style={{ flexDirection: 'row', gap: 11, marginTop: 16 }}>
        <View style={{ flex: 1 }}>
          <FieldLabel>Phone</FieldLabel>
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+255 …" />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Tenure start</FieldLabel>
          <DateField value={start} onChange={setStart} />
        </View>
      </View>

      <View style={s.kinHead}>
        <Icon name="diversity-1" size={20} color={colors.amberInk} />
        <Text style={s.kinHeadText}>Next of kin</Text>
      </View>
      <FieldLabel>Full name</FieldLabel>
      <Input value={kinName} onChangeText={setKinName} placeholder="e.g. Neema Hassan" />
      <View style={{ flexDirection: 'row', gap: 11, marginTop: 12 }}>
        <View style={{ flex: 1.2 }}>
          <FieldLabel>Phone</FieldLabel>
          <Input value={kinPhone} onChangeText={setKinPhone} keyboardType="phone-pad" placeholder="+255 …" />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Relation</FieldLabel>
          <Input value={kinRel} onChangeText={setKinRel} placeholder="e.g. Sister" />
        </View>
      </View>

      <View style={s.note}>
        <Icon name="event-repeat" size={24} color={colors.green} />
        <Text style={s.noteText}>
          Rent begins accruing from the tenure start date. Record their first payment afterwards to extend the term.
        </Text>
      </View>

      <PrimaryButton label="Register tenant" onPress={submit} onCancel={onClose} />
      <ToastHost bottom={40} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.amberBg,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 12,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.amberLabel, fontFamily: font.bodySemi },
  vacantNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.previewBg,
    borderWidth: 1,
    borderColor: colors.previewBorder,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 12,
  },
  vacantNoteText: { flex: 1, fontSize: 12, color: colors.previewSub, fontFamily: font.bodySemi },
  kinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12, marginHorizontal: 2 },
  kinHeadText: {
    fontSize: 12.5,
    fontFamily: font.bodyXBold,
    color: colors.ink,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
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
