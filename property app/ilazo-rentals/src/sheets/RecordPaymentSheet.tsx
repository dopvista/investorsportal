import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { FieldLabel } from '../ui/primitives';
import { DateField, PrimaryButton, SelectField, SheetHeader } from '../ui/fields';
import { ToastHost } from '../ui/Toast';
import { EvidenceThumbs } from '../ui/EvidenceRow';
import { captureEvidencePhoto, persistEvidence, pickEvidenceImages } from '../lib/evidence';
import { colors, font, radius, vs } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { addMonths, fmtDate, addDays } from '../../core/dates';
import { dueOf, monthsCovered, monthsDue, rentedUnits } from '../../core/engine';
import { fmt, parseAmt } from '../../core/money';

const METHODS = ['Bank transfer (CRDB)', 'Cash', 'Mobile money'] as const;

/**
 * Short display labels for the half-width Method field — "Bank transfer (CRDB)"
 * is too long there and was rendering as "Bank transfer …". The stored *value*
 * is unchanged, so receipts, statements and history keep the full wording.
 */
const METHOD_LABEL: Record<string, string> = {
  'Bank transfer (CRDB)': 'Bank · CRDB',
};

export function RecordPaymentSheet({ unitId, onClose }: { unitId?: string; onClose: () => void }) {
  const today = useToday();
  const allUnits = useApp((s) => s.units);
  const recordPayment = useApp((s) => s.recordPayment);
  const { showToast } = useUi();
  // Payments only apply to rent-bearing occupied units — vacant ones have no
  // tenant, and owner-occupied ones charge no rent.
  const units = useMemo(() => rentedUnits(allUnits), [allUnits]);
  const noPayable = units.length === 0;

  const defaultUnit = useMemo(() => {
    if (unitId && units.some((u) => u.id === unitId)) return unitId;
    const inArrears = units.find((u) => dueOf(u, today) > 0);
    return (inArrears ?? units[0])?.id ?? '';
  }, [unitId, units, today]);

  const [payUnit, setPayUnit] = useState(defaultUnit);
  const [amount, setAmount] = useState(() => {
    const u = units.find((x) => x.id === defaultUnit);
    if (!u) return '';
    const due = dueOf(u, today);
    return fmt(due > 0 ? due : u.rent);
  });
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<string>(METHODS[0]);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const unit = units.find((u) => u.id === payUnit) ?? units[0];

  if (noPayable || !unit) {
    return (
      <Sheet visible onClose={onClose}>
        <SheetHeader icon="payments" title="Record a payment" subtitle="No rent-paying units" onClose={onClose} />
        <View style={s.emptyBox}>
          <Icon name="home" size={26} color={colors.owner} />
          <Text style={s.emptyText}>
            Every unit is vacant or owner-occupied, so there's no rent to collect. Register a tenant on a unit first.
          </Text>
        </View>
        <ToastHost bottom={40} />
      </Sheet>
    );
  }

  const amt = parseAmt(amount);
  const months = amt > 0 ? monthsCovered(amt, unit.rent) : 0;
  const newDue = months > 0 ? addMonths(unit.nextDue, months) : unit.nextDue;
  const newBalance = monthsDue(newDue, today) * unit.rent;
  const dueNow = dueOf(unit, today);

  // Quick-amount chips follow the selected unit's monthly rent (1–4 months).
  const chips = [1, 2, 3, 4].map((n) => fmt(n * unit.rent));

  const selectUnit = (id: string) => {
    setPayUnit(id);
    const u = units.find((x) => x.id === id)!;
    const due = dueOf(u, today);
    setAmount(fmt(due > 0 ? due : u.rent));
  };

  const addFromGallery = async () => {
    const picked = await pickEvidenceImages();
    if (picked.length) setEvidence((e) => [...e, ...picked.filter((u) => !e.includes(u))]);
  };

  const addFromCamera = async () => {
    const shot = await captureEvidencePhoto();
    if (shot.length) setEvidence((e) => [...e, ...shot]);
  };

  const save = async () => {
    if (amt <= 0) {
      showToast('Enter an amount first');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const stored = await persistEvidence(evidence);
      recordPayment({ unitId: payUnit, amount: amt, date, method, evidence: stored });
      onClose();
      showToast(`Recorded · covered to ${fmtDate(addDays(newDue, -1))}`, 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={onClose}>
      <SheetHeader
        icon="payments"
        title="Record a payment"
        subtitle={`Rent is ${fmt(unit.rent)} / month`}
        onClose={onClose}
      />

      <View style={{ zIndex: 30 }}>
        <FieldLabel>Tenant / unit</FieldLabel>
        <SelectField
          value={payUnit}
          onChange={selectUnit}
          options={units.map((u) => ({ value: u.id, label: `${u.tenant} — ${u.name}` }))}
        />
      </View>

      <FieldLabel style={{ marginTop: vs(16, 12) }}>Amount (TZS)</FieldLabel>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        style={s.amountInput}
        placeholderTextColor={colors.muted3}
      />
      <View style={{ flexDirection: 'row', gap: 6, marginTop: vs(10, 8) }}>
        {chips.map((c) => (
          <Pressable key={c} onPress={() => setAmount(c)} style={s.chip}>
            {/* Four equal chips on a 360dp screen leave ~68dp of text each, so
                a 7-digit amount like "1,200,000" used to wrap onto a second
                line. Lock to one line and let it shrink to fit instead. */}
            <Text style={s.chipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {c}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 11, marginTop: vs(16, 12), zIndex: 20 }}>
        <View style={{ flex: 1 }}>
          <FieldLabel>Paid on</FieldLabel>
          <DateField value={date} onChange={setDate} />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Method</FieldLabel>
          <SelectField
            value={method}
            onChange={setMethod}
            compact
            options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m }))}
          />
        </View>
      </View>

      {/* Payment evidence */}
      <FieldLabel style={{ marginTop: vs(16, 12) }}>
        Payment evidence <Text style={s.optional}>· screenshot or photo, optional</Text>
      </FieldLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={addFromGallery} style={s.evidenceBtn} accessibilityLabel="Add image from gallery">
          <Icon name="add-photo-alternate" size={19} color={colors.green} />
          <Text style={s.evidenceBtnText}>Add image</Text>
        </Pressable>
        <Pressable onPress={addFromCamera} style={[s.evidenceBtn, { flex: 0, paddingHorizontal: 13 }]} accessibilityLabel="Take photo">
          <Icon name="photo-camera" size={19} color={colors.green} />
        </Pressable>
      </View>
      {evidence.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <EvidenceThumbs uris={evidence} onRemove={(uri) => setEvidence((e) => e.filter((x) => x !== uri))} />
        </View>
      )}

      {/* Live coverage preview */}
      <View style={s.preview}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="event-available" size={24} color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={s.previewTitle}>
              {months > 0 ? `Extends the lease by ${months}${months === 1 ? ' month' : ' months'}` : 'Enter an amount'}
            </Text>
            <Text style={s.previewSub}>Currently {dueNow > 0 ? `${fmt(dueNow)} due` : 'paid up'}</Text>
          </View>
        </View>
        <View style={s.previewDivider} />
        <View style={s.previewRow}>
          <Text style={s.previewLabel}>New covered-through date</Text>
          <Text style={s.previewValue}>{fmtDate(addDays(newDue, -1))}</Text>
        </View>
        <View style={[s.previewRow, { marginTop: 6 }]}>
          <Text style={s.previewLabel}>Balance after payment</Text>
          <Text style={[s.previewValue, { color: newBalance > 0 ? colors.red : colors.green }]}>
            {newBalance > 0 ? `${fmt(newBalance)} due` : 'Paid up'}
          </Text>
        </View>
      </View>

      <PrimaryButton label={saving ? 'Saving…' : 'Save payment'} onPress={save} onCancel={onClose} />
      <ToastHost bottom={40} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  amountInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    padding: 14,
    fontSize: 20,
    fontFamily: font.heading,
    backgroundColor: colors.card,
    color: colors.ink,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 2,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.avatarFg, textAlign: 'center' },
  optional: { fontFamily: font.bodyMed, color: colors.faint },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.ownerBg,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  emptyText: { flex: 1, fontSize: 13, color: colors.owner, fontFamily: font.bodySemi, lineHeight: 19 },
  evidenceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  evidenceBtnText: { fontSize: 13, fontFamily: font.bodyBold, color: colors.green },
  preview: {
    backgroundColor: colors.previewBg,
    borderWidth: 1,
    borderColor: colors.previewBorder,
    borderRadius: 16,
    padding: vs(14, 12),
    marginTop: vs(18, 14),
  },
  previewTitle: { fontSize: 13, fontFamily: font.bodyBold, color: colors.ink },
  previewSub: { fontSize: 12, color: colors.previewSub, marginTop: 1, fontFamily: font.body },
  previewDivider: { height: 1, backgroundColor: colors.previewBorder, marginVertical: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  previewLabel: { fontSize: 12.5, color: colors.previewSub, fontFamily: font.bodySemi },
  previewValue: { marginLeft: 'auto', fontFamily: font.heading, fontSize: 14, color: colors.green },
});
