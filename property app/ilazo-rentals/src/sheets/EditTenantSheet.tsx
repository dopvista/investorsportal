import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { FieldLabel, Input } from '../ui/primitives';
import { PrimaryButton, SheetHeader } from '../ui/fields';
import { ToastHost } from '../ui/Toast';
import { StyleSheet, Text } from 'react-native';
import { colors, font } from '../theme';
import { useApp } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';

export function EditTenantSheet({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const units = useApp((s) => s.units);
  const editTenant = useApp((s) => s.editTenant);
  const { showToast } = useUi();
  const unit = units.find((u) => u.id === unitId);

  const [name, setName] = useState(unit?.tenant ?? '');
  const [phone, setPhone] = useState(unit?.phone ?? '');
  const [kinName, setKinName] = useState(unit?.kin?.name ?? '');
  const [kinPhone, setKinPhone] = useState(unit?.kin?.phone ?? '');
  const [kinRel, setKinRel] = useState(unit?.kin?.rel ?? '');

  if (!unit) return null;

  const submit = () => {
    if (!name.trim()) {
      showToast('Enter the tenant name');
      return;
    }
    editTenant({ unitId, name, phone, kin: { name: kinName, phone: kinPhone, rel: kinRel } });
    onClose();
    showToast('Tenant details updated');
  };

  return (
    <Sheet visible onClose={onClose}>
      <SheetHeader icon="edit" title="Update tenant details" subtitle="Lease dates & balances are unaffected" onClose={onClose} />

      <FieldLabel>Tenant full name</FieldLabel>
      <Input value={name} onChangeText={setName} />
      <FieldLabel style={{ marginTop: 15 }}>Phone</FieldLabel>
      <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <View style={s.kinHead}>
        <Icon name="diversity-1" size={20} color={colors.amberInk} />
        <Text style={s.kinHeadText}>Next of kin</Text>
      </View>
      <FieldLabel>Full name</FieldLabel>
      <Input value={kinName} onChangeText={setKinName} />
      <View style={{ flexDirection: 'row', gap: 11, marginTop: 12 }}>
        <View style={{ flex: 1.2 }}>
          <FieldLabel>Phone</FieldLabel>
          <Input value={kinPhone} onChangeText={setKinPhone} keyboardType="phone-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Relation</FieldLabel>
          <Input value={kinRel} onChangeText={setKinRel} />
        </View>
      </View>

      <PrimaryButton label="Save changes" onPress={submit} onCancel={onClose} />
      <ToastHost bottom={40} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  kinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12, marginHorizontal: 2 },
  kinHeadText: {
    fontSize: 12.5,
    fontFamily: font.bodyXBold,
    color: colors.ink,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
