import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Avatar, Card, ProgressBar, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, heroShadow, radius } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { unitVM, mw } from '../vm';
import { computeCovers } from '../../core/engine';
import { unitOccupiedSince, unitTenants, unitTotal } from '../../core/statements';
import { fmt } from '../../core/money';
import { fmtDate } from '../../core/dates';
import { initials } from '../../core/names';
import type { UnitsStackParamList } from '../navigation';

type Props = NativeStackScreenProps<UnitsStackParamList, 'UnitDetails'>;

export function UnitDetailsScreen({ navigation, route }: Props) {
  const { unitId } = route.params;
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const unit = units.find((u) => u.id === unitId);

  if (!unit) {
    // The unit list is fixed, but guard anyway (e.g. stale deep link).
    return (
      <Screen>
        <BackHeader label="Unit details" onBack={() => navigation.goBack()} />
        <Text style={{ fontFamily: font.bodySemi, color: colors.muted }}>Unit not found.</Text>
      </Screen>
    );
  }

  const v = unitVM(unit, today);
  const covers = computeCovers(units, txns);
  const tenants = unitTenants(units, txns, unitId, covers);
  const occSince = unitOccupiedSince(txns, unitId);
  const tenureLine =
    v.due > 0
      ? `${mw(v.monthsBehind)} overdue — accruing since ${fmtDate(unit.nextDue)}`
      : `On track — next rent due ${fmtDate(unit.nextDue)}`;

  const call = () => Linking.openURL(`tel:${unit.phone.replace(/\s+/g, '')}`).catch(() => {});
  const chat = () => Linking.openURL(`sms:${unit.phone.replace(/\s+/g, '')}`).catch(() => {});

  return (
    <Screen>
      <BackHeader label="Unit details" onBack={() => navigation.goBack()} />

      {/* Green hero */}
      <LinearGradient
        colors={colors.gradB}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[s.hero, heroShadow('#0A5741')]}
      >
        <View style={s.bubbleA} />
        <View style={s.bubbleB} />
        <View style={s.heroTop}>
          <Text style={s.heroTitle}>{unit.name}</Text>
          <View style={s.heroPill}>
            <Text style={s.heroPillText}>{v.statusLabel}</Text>
          </View>
          <View style={{ marginLeft: 'auto' }} />
          <Pressable
            accessibilityLabel="Edit unit"
            onPress={() => openSheet({ kind: 'editUnit', unitId })}
            style={s.heroIconBtn}
          >
            <Icon name="edit" size={18} color="#fff" />
          </Pressable>
        </View>

        {v.vacant ? (
          <>
            <Text style={s.heroEyebrow}>NO TENANT</Text>
            <Text style={s.vacantHeroText}>
              This unit is vacant. Register a tenant to start a fresh rolling lease — rent accrues from their tenure
              start date.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => openSheet({ kind: 'newTenant', unitId })}
              style={({ pressed }) => [s.recordBtn, { marginLeft: 0, alignSelf: 'flex-start', marginTop: 14 }, pressed && { opacity: 0.9 }]}
            >
              <Icon name="person-add" size={19} color={colors.greenDark} />
              <Text style={s.recordBtnText}>Register tenant</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.heroEyebrow}>{v.ownerOccupied ? 'OCCUPANT' : 'CURRENT TENANT'}</Text>
            <View style={s.tenantRow}>
              <View style={s.tenantAvatar}>
                <Text style={s.tenantAvatarText}>{initials(unit.tenant)}</Text>
              </View>
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => navigation.navigate('TenantDetails', { unitId })}>
                <Text style={s.tenantName} numberOfLines={1}>
                  {unit.tenant}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                  <Text style={s.tenantLink}>View {v.ownerOccupied ? 'occupant' : 'tenant'} details</Text>
                  <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.75)" />
                </View>
              </Pressable>
              <Pressable accessibilityLabel="Call occupant" onPress={call} style={s.heroIconBtn}>
                <Icon name="call" size={18} color="#fff" />
              </Pressable>
              <Pressable accessibilityLabel="Message occupant" onPress={chat} style={s.heroIconBtn}>
                <Icon name="chat" size={18} color="#fff" />
              </Pressable>
            </View>

            <View style={s.heroDivider} />
            {v.ownerOccupied ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Icon name="home" size={20} color="#fff" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.dueLabel}>Owner-occupied</Text>
                  <Text style={s.ownerNote}>No rent is charged for this unit.</Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
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
              </View>
            )}
          </>
        )}
      </LinearGradient>

      {/* Lease timeline */}
      {!v.vacant && !v.ownerOccupied && (
      <Card style={s.section}>
        <View style={s.sectionHead}>
          <Icon name="event-repeat" size={19} color={colors.green} />
          <Text style={s.sectionTitle}>Lease timeline</Text>
          <Text style={s.rentRight}>
            {fmt(unit.rent)}
            <Text style={s.rentUnit}> /mo</Text>
          </Text>
        </View>
        <View style={s.timelineRow}>
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
      )}

      {/* This unit */}
      <Card style={s.section}>
        <View style={s.sectionHead}>
          <Icon name="insights" size={19} color={colors.green} />
          <Text style={s.sectionTitle}>This unit</Text>
        </View>
        <Text style={s.totalLabel}>Total generated (lifetime)</Text>
        <Text style={s.totalFigure}>
          {fmt(unitTotal(txns, unitId))} <Text style={s.totalCurrency}>TZS</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={[s.tile, { flex: 0.9 }]}>
            <Text style={s.tileLabel}>Tenants</Text>
            <Text style={s.tileValue}>{tenants.length}</Text>
          </View>
          <View style={[s.tile, { flex: 1.5 }]}>
            <Text style={s.tileLabel}>Occupied since</Text>
            <Text style={s.tileValue}>{occSince ? fmtDate(occSince) : '—'}</Text>
          </View>
          <View style={[s.tile, { flex: 1.3 }]}>
            <Text style={s.tileLabel}>Current rent</Text>
            <Text style={s.tileValue}>{v.ownerOccupied ? 'No rent' : fmt(unit.rent)}</Text>
          </View>
        </View>
      </Card>

      {/* Tenants of this unit */}
      <SectionLabel label="Tenants of this unit" />
      <Card style={{ paddingHorizontal: 15, paddingVertical: 5 }}>
        {tenants.length === 0 && (
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: colors.muted3, paddingVertical: 12 }}>
            No tenant history yet.
          </Text>
        )}
        {tenants.map((t, i) => (
          <Pressable
            key={t.name}
            onPress={() => openSheet({ kind: 'tenantHist', unitId, tenant: t.name })}
            style={[s.histRow, i < tenants.length - 1 && s.histRowBorder]}
          >
            <Avatar name={t.name} size={38} rad={12} fontSize={12} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.histName} numberOfLines={1}>
                  {t.name}
                </Text>
                <View style={[s.badge, { backgroundColor: t.current ? colors.greenPillBg : colors.pastBg }]}>
                  <Text style={[s.badgeText, { color: t.current ? colors.green : colors.faint }]}>
                    {t.current ? 'Current' : 'Past'}
                  </Text>
                </View>
              </View>
              <Text style={s.histSub}>
                {t.current ? `Since ${fmtDate(t.start)}` : `${fmtDate(t.start)} – ${fmtDate(t.end)}`} · {t.months} mo
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.histPaid}>{fmt(t.totalPaid)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                <Text style={s.histLink}>History</Text>
                <Icon name="chevron-right" size={14} color={colors.chevron} />
              </View>
            </View>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.heroDetail, padding: 15, paddingBottom: 13, overflow: 'hidden' },
  bubbleA: {
    position: 'absolute',
    right: -44,
    top: -44,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bubbleB: {
    position: 'absolute',
    right: 26,
    bottom: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitle: { fontFamily: font.heading, fontSize: 21, color: '#fff', letterSpacing: -0.2 },
  heroPill: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  heroPillText: { fontSize: 11, fontFamily: font.bodyBold, color: '#fff' },
  heroIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    fontSize: 10,
    fontFamily: font.bodyXBold,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 11,
  },
  vacantHeroText: {
    fontSize: 13,
    fontFamily: font.bodyMed,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 8,
    lineHeight: 19,
  },
  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 6 },
  tenantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantAvatarText: { color: '#fff', fontFamily: font.bodyXBold, fontSize: 14 },
  tenantName: { fontSize: 17, fontFamily: font.bodyBold, color: '#fff' },
  tenantLink: { fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontFamily: font.body },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 11, marginBottom: 10 },
  dueLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontFamily: font.bodySemi },
  ownerNote: { fontSize: 13, color: '#fff', fontFamily: font.bodySemi, marginTop: 1 },
  dueFigure: { fontFamily: font.heading, fontSize: 27, color: '#fff', marginTop: 2, letterSpacing: -0.3 },
  recordBtn: {
    marginLeft: 'auto',
    backgroundColor: '#fff',
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  totalLabel: { fontSize: 11, color: colors.muted2, fontFamily: font.bodySemi },
  totalFigure: { fontFamily: font.heading, fontSize: 25, color: colors.green, marginTop: 1, letterSpacing: -0.3 },
  totalCurrency: { fontSize: 13, color: colors.muted3, fontFamily: font.bodySemi },
  tile: { backgroundColor: colors.tile, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  tileLabel: {
    fontSize: 10,
    color: colors.muted2,
    fontFamily: font.bodyBold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tileValue: { fontFamily: font.headingSemi, fontSize: 15, color: colors.ink, marginTop: 2 },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  histName: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink, flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: font.bodyXBold },
  histSub: { fontSize: 11, color: colors.muted3, marginTop: 1, fontFamily: font.body },
  histPaid: { fontFamily: font.heading, fontSize: 14, color: colors.green },
  histLink: { fontSize: 10, color: colors.chevron, fontFamily: font.bodyBold },
});
