import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Avatar, Card, Pill, ProgressBar } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, heroShadow } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { unitVM, mw } from '../vm';
import { computeCovers, rentTxnsFor, splitCover } from '../../core/engine';
import { fmt } from '../../core/money';
import { fmtDate, monthYear } from '../../core/dates';
import { initials } from '../../core/names';
import type { UnitsStackParamList } from '../navigation';

type Props = NativeStackScreenProps<UnitsStackParamList, 'TenantDetails'>;

export function TenantDetailsScreen({ navigation, route }: Props) {
  const { unitId } = route.params;
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const [histOpen, setHistOpen] = useState(false);
  const unit = units.find((u) => u.id === unitId);

  if (!unit || !unit.tenant.trim()) {
    return (
      <Screen>
        <BackHeader label="Tenant details" onBack={() => navigation.goBack()} />
        <Text style={{ fontFamily: font.bodySemi, color: colors.muted }}>
          {unit ? `${unit.name} is vacant — no tenant to show.` : 'Tenant not found.'}
        </Text>
      </Screen>
    );
  }

  const v = unitVM(unit, today);
  const covers = computeCovers(units, txns);
  const myTxns = rentTxnsFor(txns, unitId, unit.tenant);
  const payTotal = myTxns.reduce((a, t) => a + t.amount, 0);
  const history = myTxns
    .slice()
    .reverse()
    .map((t) => {
      const sp = splitCover(covers[t.id] ?? t.covers);
      return { id: t.id, date: t.date, months: sp.m, range: sp.r, amount: t.amount };
    });
  const tenureLine =
    v.due > 0
      ? `${mw(v.monthsBehind)} overdue — accruing since ${fmtDate(unit.nextDue)}`
      : `On track — next rent due ${fmtDate(unit.nextDue)}`;
  const hasKin = !!unit.kin?.name;

  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
  const chat = (phone: string) => Linking.openURL(`sms:${phone.replace(/\s+/g, '')}`).catch(() => {});

  return (
    <Screen>
      <BackHeader label="Tenant details" onBack={() => navigation.goBack()} />

      {/* Tenant card */}
      <Card style={{ borderRadius: 22, padding: 16, paddingVertical: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar name={unit.tenant} size={56} rad={18} fontSize={18} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {unit.tenant}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {unit.name} · {unit.type} · since {monthYear(unit.leaseStart)}
            </Text>
          </View>
          <Pill label={v.statusShort} bg={v.statusBg} fg={v.statusFg} />
        </View>
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
          <Pressable style={s.actionBtn} onPress={() => call(unit.phone)}>
            <Icon name="call" size={18} color={colors.green} />
            <Text style={s.actionText}>Call</Text>
          </Pressable>
          <Pressable style={s.actionBtn} onPress={() => chat(unit.phone)}>
            <Icon name="chat" size={18} color={colors.green} />
            <Text style={s.actionText}>Message</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Edit tenant"
            style={[s.actionBtn, { flex: 0, paddingHorizontal: 14 }]}
            onPress={() => openSheet({ kind: 'editTenant', unitId })}
          >
            <Icon name="edit" size={18} color={colors.avatarFg} />
          </Pressable>
        </View>
      </Card>

      {/* Amount due strip */}
      <LinearGradient
        colors={colors.gradB}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[s.dueStrip, heroShadow('#0A5741')]}
      >
        <View>
          <Text style={s.dueLabel}>Amount due now</Text>
          <Text style={s.dueFigure}>{v.balanceLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openSheet({ kind: 'collect', unitId })}
          style={({ pressed }) => [s.recordBtn, pressed && { opacity: 0.9 }]}
        >
          <Icon name="add-card" size={19} color={colors.greenDark} />
          <Text style={s.recordBtnText}>Record</Text>
        </Pressable>
      </LinearGradient>

      {/* Lease timeline */}
      <Card style={s.section}>
        <View style={s.sectionHead}>
          <Icon name="event-repeat" size={19} color={colors.green} />
          <Text style={s.sectionTitle}>Lease timeline</Text>
          <Text style={s.rentRight}>
            {fmt(unit.rent)}
            <Text style={s.rentUnit}> /mo</Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View>
            <Text style={s.tlLabel}>Started</Text>
            <Text style={s.tlValue}>{fmtDate(unit.leaseStart)}</Text>
          </View>
          <ProgressBar pct={v.pct} color={v.barColor} height={8} style={{ flex: 1, marginHorizontal: 2 }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.tlLabel}>Covered to</Text>
            <Text style={s.tlValue}>{v.coveredThrough}</Text>
          </View>
        </View>
        <View style={s.tenureChip}>
          <Icon name={v.tenureIcon} size={17} color={v.barColor} />
          <Text style={[s.tenureChipText, { color: v.barColor }]}>{tenureLine}</Text>
        </View>
      </Card>

      {/* Next of kin */}
      {hasKin && (
        <Card style={[s.section, { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15 }]}>
          <Avatar name={unit.kin.name} size={40} rad={13} bg={colors.amberBg} fg={colors.amberInk} fontSize={13} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.kinLabel}>Next of kin</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.kinName} numberOfLines={1}>
                {unit.kin.name}
              </Text>
              {!!unit.kin.rel && (
                <View style={s.kinBadge}>
                  <Text style={s.kinBadgeText}>{unit.kin.rel}</Text>
                </View>
              )}
            </View>
            <Text style={s.kinPhone} numberOfLines={1}>{unit.kin.phone}</Text>
          </View>
          <Pressable accessibilityLabel="Call next of kin" style={s.kinCall} onPress={() => call(unit.kin.phone)}>
            <Icon name="call" size={19} color={colors.green} />
          </Pressable>
        </Card>
      )}

      {/* Total payments */}
      <Card style={[s.section, { paddingHorizontal: 15 }]} onPress={() => setHistOpen((o) => !o)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={s.payIcon}>
            <Icon name="receipt-long" size={24} color={colors.green} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.payLabel}>Total Payments</Text>
            <Text style={s.payFigure}>
              {fmt(payTotal)} <Text style={s.payCurrency}>TZS</Text>
            </Text>
            <Text style={s.paySub}>
              {myTxns.length} {myTxns.length === 1 ? 'payment' : 'payments'} · tap to view history
            </Text>
          </View>
          <Icon name={histOpen ? 'expand-less' : 'expand-more'} size={24} color={colors.muted3} />
        </View>
      </Card>

      {histOpen && (
        <Card style={{ paddingHorizontal: 15, paddingVertical: 6, marginTop: 9 }}>
          {history.length === 0 ? (
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: colors.muted3, paddingVertical: 12 }}>
              No payments recorded yet.
            </Text>
          ) : (
            history.map((h, i) => (
              <View key={h.id} style={[s.histRow, i < history.length - 1 && s.histRowBorder]}>
                <View style={s.histIcon}>
                  <Icon name="south-west" size={18} color={colors.green} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.histDate}>{fmtDate(h.date)}</Text>
                  {!!h.months && (
                    <Text style={s.histSub} numberOfLines={1}>
                      {h.months}
                    </Text>
                  )}
                  {!!h.range && (
                    <Text style={s.histSub} numberOfLines={1}>
                      {h.range}
                    </Text>
                  )}
                </View>
                <Text style={s.histAmount}>+{fmt(h.amount)}</Text>
              </View>
            ))
          )}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: font.heading, fontSize: 21, color: colors.ink },
  meta: { fontSize: 12.5, color: colors.muted2, marginTop: 3, fontFamily: font.bodyMed },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline3,
    borderRadius: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  actionText: { fontSize: 13, fontFamily: font.bodyBold, color: colors.green },

  dueStrip: {
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 15,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontFamily: font.bodySemi },
  dueFigure: { fontFamily: font.heading, fontSize: 24, color: '#fff', marginTop: 1 },
  recordBtn: {
    marginLeft: 'auto',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordBtnText: { color: colors.greenDark, fontSize: 14, fontFamily: font.bodyXBold },

  section: { padding: 12, marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: font.bodyXBold,
    color: colors.ink,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rentRight: { marginLeft: 'auto', fontFamily: font.headingSemi, fontSize: 13, color: colors.ink },
  rentUnit: { fontSize: 10, color: colors.muted3, fontFamily: font.bodySemi },
  tlLabel: { fontSize: 10.5, color: colors.muted2, fontFamily: font.bodySemi },
  tlValue: { fontFamily: font.headingSemi, fontSize: 13.5, color: colors.ink, marginTop: 1 },
  tenureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 9,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: colors.tileDeep,
  },
  tenureChipText: { fontSize: 12, fontFamily: font.bodySemi, flexShrink: 1 },

  kinLabel: { fontSize: 12, fontFamily: font.bodyBold, color: colors.amberInk },
  kinName: { fontFamily: font.heading, fontSize: 16, color: colors.ink, flexShrink: 1, marginTop: 1 },
  kinBadge: { backgroundColor: colors.amberBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  kinBadgeText: { fontSize: 11, fontFamily: font.bodyBold, color: colors.amberInk },
  kinPhone: { fontSize: 11.5, color: colors.muted3, marginTop: 1, fontFamily: font.body },
  kinCall: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline3,
    alignItems: 'center',
    justifyContent: 'center',
  },

  payIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.greenTintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payLabel: { fontSize: 12, fontFamily: font.bodyBold, color: colors.muted2 },
  payFigure: { fontFamily: font.heading, fontSize: 21, color: colors.green, marginTop: 1 },
  payCurrency: { fontSize: 12, color: colors.muted3, fontFamily: font.bodySemi },
  paySub: { fontSize: 11.5, color: colors.muted3, marginTop: 1, fontFamily: font.body },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  histIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.greenTintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histDate: { fontSize: 13.5, fontFamily: font.bodySemi, color: colors.ink },
  histSub: { fontSize: 11.5, color: colors.muted3, fontFamily: font.body },
  histAmount: { fontFamily: font.heading, fontSize: 14.5, color: colors.green },
});
