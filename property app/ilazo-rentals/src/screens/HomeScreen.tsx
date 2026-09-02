import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/Screen';
import { Card, Pill, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, heroShadow, radius, vs } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { unitVM, mw } from '../vm';
import { collectedTotal, expensesTotal, monthRoll, netIncome, occupiedUnits } from '../../core/engine';
import { fmt } from '../../core/money';
import { fmtDate } from '../../core/dates';
import { initials } from '../../core/names';
import type { TabsParamList } from '../navigation';

export function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabsParamList>>();
  const { width } = useWindowDimensions();
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const company = useApp((s) => s.company);
  const [heroPage, setHeroPage] = useState(0);
  const heroW = width - 32;

  const vms = units.map((u) => unitVM(u, today));
  const attention = vms.filter((v) => v.due > 0);
  const outstanding = attention.reduce((a, v) => a + v.due, 0);
  const collected = collectedTotal(txns);
  const expenses = expensesTotal(txns);

  const openUnit = (unitId: string) =>
    navigation.navigate('UnitsTab', { screen: 'UnitDetails', params: { unitId }, initial: false });

  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, heroW));
    if (p !== heroPage) setHeroPage(p);
  };

  return (
    <Screen>
      {/* Header */}
      <View style={s.headerRow}>
        <View>
          <Text style={s.headerSub}>
            {company.short || company.name} · Ilazo
          </Text>
          <Text style={s.headerTitle}>Good morning</Text>
        </View>
        <View style={s.avatarCircle}>
          <Text style={s.avatarLetter}>{initials(company.name)[0] ?? 'D'}</Text>
        </View>
      </View>

      {/* Swipeable hero */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={heroW + 12}
        decelerationRate="fast"
        onScroll={onHeroScroll}
        scrollEventThrottle={16}
      >
        {/* Net income leads when nothing is outstanding; Outstanding leads otherwise. */}
        {(outstanding > 0 ? (['out', 'net'] as const) : (['net', 'out'] as const)).map((k, i) =>
          k === 'out' ? (
            <LinearGradient
              key="out"
              colors={colors.gradA}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[s.hero, heroShadow('#0B5B45'), { width: heroW, marginRight: i === 0 ? 12 : 0 }]}
            >
              <View style={s.heroBubble} />
              <Text style={s.heroLabel}>Outstanding rent</Text>
              <Text style={s.heroFigure}>
                {fmt(outstanding)} <Text style={s.heroCurrency}>TZS</Text>
              </Text>
              <Text style={s.heroSub}>
                {attention.length > 0
                  ? `across ${attention.length}${attention.length === 1 ? ' tenant' : ' tenants'}`
                  : 'all tenants up to date'}
                {' · as of '}
                {fmtDate(today)}
              </Text>
              <View style={s.heroTiles}>
                <View style={s.heroTile}>
                  <Text style={s.heroTileLabel}>Rent roll / mo</Text>
                  <Text style={s.heroTileValue}>{fmt(monthRoll(units))}</Text>
                </View>
                <View style={s.heroTile}>
                  <Text style={s.heroTileLabel}>Occupancy</Text>
                  <Text style={s.heroTileValue}>
                    {occupiedUnits(units).length} / {units.length}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          ) : (
            <LinearGradient
              key="net"
              colors={colors.gradDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[s.hero, heroShadow('#17241F'), { width: heroW, marginRight: i === 0 ? 12 : 0 }]}
            >
              <View style={s.heroBubble} />
              <Text style={s.heroLabel}>Net income · lifetime</Text>
              <Text style={s.heroFigure}>
                {fmt(netIncome(txns))} <Text style={s.heroCurrency}>TZS</Text>
              </Text>
              <Text style={s.heroSub}>since May 2024</Text>
              <View style={s.heroTiles}>
                <View style={[s.heroTile, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                  <Text style={s.heroTileLabel}>Collected</Text>
                  <Text style={[s.heroTileValue, { color: colors.mint }]}>{fmt(collected)}</Text>
                </View>
                <View style={[s.heroTile, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                  <Text style={s.heroTileLabel}>Expenses</Text>
                  <Text style={[s.heroTileValue, { color: colors.coral }]}>{fmt(expenses)}</Text>
                </View>
              </View>
            </LinearGradient>
          )
        )}
      </ScrollView>

      {/* Pager dots */}
      <View style={s.dotsRow}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              height: 7,
              borderRadius: 99,
              width: heroPage === i ? 18 : 7,
              backgroundColor: heroPage === i ? colors.ink : colors.dotIdle,
            }}
          />
        ))}
      </View>

      {/* Your units — attention state folded into each row */}
      <SectionLabel
        label="Your units"
        right={
          <Pressable onPress={() => navigation.navigate('UnitsTab', { screen: 'Units' })} hitSlop={8}>
            <Text style={s.seeAll}>See all ›</Text>
          </Pressable>
        }
      />
      <View style={{ gap: 8 }}>
        {vms.map((v) => (
          <Card key={v.unit.id} onPress={() => openUnit(v.unit.id)} style={s.unitRow}>
            <View style={[s.unitIcon, { backgroundColor: v.statusBg }]}>
              <Icon name="apartment" size={21} color={v.dotColor} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.unitRowTenant} numberOfLines={1}>
                {v.vacant ? 'No tenant yet' : v.unit.tenant}
              </Text>
              <Text style={s.unitRowName} numberOfLines={1}>
                {v.unit.name} <Text style={s.unitRowType}>· {v.unit.type}</Text>
              </Text>
              {v.due > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Icon name="error" size={13} color={colors.red} />
                  <Text style={s.behindText}>{mw(v.monthsBehind)} behind</Text>
                  <Pressable onPress={() => openSheet({ kind: 'collect', unitId: v.unit.id })} hitSlop={8}>
                    <Text style={s.collectLink}>Collect ›</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Pill label={v.balanceLabel} bg={v.statusBg} fg={v.statusFg} />
              {!v.vacant && !v.ownerOccupied && (
                <Text style={s.coveredTo}>
                  to <Text style={{ color: colors.ink }}>{v.coveredThrough}</Text>
                </Text>
              )}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: vs(12, 10) },
  headerSub: { fontSize: 12.5, color: colors.muted2, fontFamily: font.bodySemi },
  headerTitle: { fontFamily: font.heading, fontSize: 21, color: colors.ink, letterSpacing: -0.2 },
  avatarCircle: {
    marginLeft: 'auto',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.greenPillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.green, fontFamily: font.bodyXBold, fontSize: 15 },

  hero: { borderRadius: radius.hero, padding: vs(16, 14), paddingBottom: vs(14, 12), overflow: 'hidden' },
  heroBubble: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroLabel: { fontSize: 13, fontFamily: font.bodySemi, color: 'rgba(255,255,255,0.9)' },
  heroFigure: { fontFamily: font.heading, fontSize: 31, color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  heroCurrency: { fontSize: 14, fontFamily: font.headingMed, color: 'rgba(255,255,255,0.8)' },
  heroSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.88)', marginTop: 2, fontFamily: font.bodyMed },
  heroTiles: { flexDirection: 'row', gap: 10, marginTop: vs(12, 10) },
  heroTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  heroTileLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: font.bodyMed },
  heroTileValue: { fontFamily: font.headingSemi, fontSize: 15.5, color: '#fff', marginTop: 2 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },

  behindText: { fontSize: 12, fontFamily: font.bodySemi, color: colors.red },
  collectLink: { fontSize: 12, fontFamily: font.bodyBold, color: colors.green, marginLeft: 4 },

  seeAll: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.green },

  unitRow: { borderRadius: 18, paddingVertical: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  unitIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitRowTenant: { fontFamily: font.bodyXBold, color: colors.ink, fontSize: 17 },
  unitRowName: { fontSize: 13, fontFamily: font.bodySemi, color: colors.muted2, marginTop: 2 },
  unitRowType: { fontFamily: font.bodySemi, color: colors.muted3, fontSize: 12.5 },
  coveredTo: { fontSize: 10.5, fontFamily: font.bodySemi, color: colors.muted2, marginTop: 5 },
});
