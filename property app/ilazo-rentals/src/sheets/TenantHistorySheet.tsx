import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { Avatar, Card } from '../ui/primitives';
import { SheetHeader } from '../ui/fields';
import { colors, font } from '../theme';
import { useApp } from '../state/StoreProvider';
import { computeCovers } from '../../core/engine';
import { unitTenants } from '../../core/statements';
import { fmt } from '../../core/money';
import { fmtDate } from '../../core/dates';

export function TenantHistorySheet({
  unitId,
  tenant,
  onClose,
}: {
  unitId: string;
  tenant: string;
  onClose: () => void;
}) {
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const covers = computeCovers(units, txns);
  const summary = unitTenants(units, txns, unitId, covers).find((t) => t.name === tenant);
  const unitName = units.find((u) => u.id === unitId)?.name ?? '';

  return (
    <Sheet visible onClose={onClose} maxHeightPct={0.88}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 }}>
        <Avatar name={tenant} size={44} rad={14} fontSize={14} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name}>{tenant}</Text>
          <Text style={s.sub}>
            {unitName} · {fmt(summary?.totalPaid ?? 0)} TZS total
          </Text>
        </View>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={s.closeWrap}>
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <Text style={s.eyebrow}>PAYMENT HISTORY</Text>
      <Card style={{ paddingHorizontal: 15, paddingVertical: 5 }}>
        {(summary?.rows ?? []).map((r, i) => (
          <View key={`${r.date}-${i}`} style={[s.row, i < (summary?.rows.length ?? 0) - 1 && s.rowBorder]}>
            <View style={s.rowIcon}>
              <Icon name="south-west" size={18} color={colors.green} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowDate}>{fmtDate(r.date)}</Text>
              {!!r.months && (
                <Text style={s.rowSub} numberOfLines={1}>
                  {r.months}
                </Text>
              )}
              {!!r.range && (
                <Text style={s.rowSub} numberOfLines={1}>
                  {r.range}
                </Text>
              )}
            </View>
            <Text style={s.rowAmount}>+{fmt(r.amount)}</Text>
          </View>
        ))}
      </Card>
    </Sheet>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: font.heading, fontSize: 17, color: colors.ink },
  sub: { fontSize: 12, color: colors.muted2, fontFamily: font.body },
  closeWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.segment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: font.bodyXBold,
    letterSpacing: 0.8,
    color: colors.muted2,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.greenTintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDate: { fontSize: 13.5, fontFamily: font.bodySemi, color: colors.ink },
  rowSub: { fontSize: 11.5, color: colors.muted3, fontFamily: font.body },
  rowAmount: { fontFamily: font.heading, fontSize: 14.5, color: colors.green },
});
