import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Screen } from '../ui/Screen';
import { Avatar, Card, Pill, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, vs } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { unitVM } from '../vm';
import { occupiedUnits } from '../../core/engine';
import { pastTenants } from '../../core/statements';
import { fmtDate } from '../../core/dates';
import type { TabsParamList } from '../navigation';

export function TenantsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabsParamList>>();
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const vms = occupiedUnits(units).map((u) => unitVM(u, today));
  const past = pastTenants(units, txns);

  const openTenant = (unitId: string) =>
    navigation.navigate('UnitsTab', { screen: 'TenantDetails', params: { unitId }, initial: false });

  return (
    <Screen topPad={10}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.title}>Tenants</Text>
          <Text style={s.subtitle}>
            {vms.length} active · {past.length} former
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openSheet({ kind: 'newTenant' })}
          style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Icon name="person-add" size={19} color="#fff" />
          <Text style={s.newBtnText}>New</Text>
        </Pressable>
      </View>

      <SectionLabel label="Current tenants" />
      <View style={{ gap: 8 }}>
        {vms.map((v) => (
          <Card key={v.unit.id} onPress={() => openTenant(v.unit.id)} style={s.tenantCard}>
            <Avatar name={v.unit.tenant} size={42} rad={14} fontSize={14} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.tenantName} numberOfLines={1}>
                {v.unit.tenant}
              </Text>
              {/* Pill sits inline with the unit/type instead of on its own row:
                  it uses the empty gutter that was already there and saves a
                  whole line of height per card. */}
              <View style={s.metaRow}>
                <Text style={s.tenantMeta} numberOfLines={1}>
                  {v.unit.name} · {v.unit.type}
                </Text>
                <Pill label={v.statusShort} bg={v.statusBg} fg={v.statusFg} small />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.balance, { color: v.balanceColor }]}>{v.balanceLabel}</Text>
              {!v.ownerOccupied && <Text style={s.coveredTo}>to {v.coveredThrough}</Text>}
            </View>
          </Card>
        ))}
      </View>

      <SectionLabel label="Former tenants" />
      <Card style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
        {past.length === 0 ? (
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: colors.muted3, paddingVertical: 12 }}>
            No former tenants yet.
          </Text>
        ) : (
          past.map((p, i) => (
            <View key={p.name} style={[s.pastRow, i < past.length - 1 && s.pastRowBorder]}>
              <Avatar name={p.name} size={38} rad={12} bg={colors.pastBg} fg={colors.faint} fontSize={12} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.pastName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={s.pastMeta} numberOfLines={1}>
                  {p.unitName} · Last paid {fmtDate(p.lastPaymentDate)}
                </Text>
              </View>
              <View style={s.pastBadge}>
                <Text style={s.pastBadgeText}>Past</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  title: { fontFamily: font.heading, fontSize: 22, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: colors.muted2, marginTop: 2, fontFamily: font.body },
  newBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  newBtnText: { color: '#fff', fontSize: 13, fontFamily: font.bodyBold },

  tenantCard: { paddingVertical: vs(11, 10), paddingHorizontal: vs(13, 12), flexDirection: 'row', alignItems: 'center', gap: vs(12, 10) },
  tenantName: { fontSize: 15, fontFamily: font.bodyBold, color: colors.ink },
  // Tight gap so a long pill (e.g. "Owner-occupied") doesn't squeeze the
  // unit/type text into an ellipsis on narrow screens.
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  tenantMeta: { fontSize: 12, color: colors.muted2, fontFamily: font.body, flexShrink: 1 },
  balance: { fontFamily: font.heading, fontSize: 15 },
  coveredTo: { fontSize: 10.5, color: colors.muted3, marginTop: 2, fontFamily: font.body },

  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  pastRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pastName: { fontSize: 13.5, fontFamily: font.bodySemi, color: colors.avatarFg },
  pastMeta: { fontSize: 11.5, color: colors.muted3, fontFamily: font.body },
  pastBadge: { backgroundColor: colors.pastBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pastBadgeText: { fontSize: 10.5, fontFamily: font.bodyBold, color: colors.faint },
});
