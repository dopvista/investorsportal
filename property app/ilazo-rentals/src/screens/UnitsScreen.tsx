import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../ui/Screen';
import { Avatar, Card, Pill, ProgressBar } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, vs } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { unitVM } from '../vm';
import { occupiedUnits, outstandingTotal, monthRoll } from '../../core/engine';
import { fmt } from '../../core/money';
import type { UnitsStackParamList } from '../navigation';

export function UnitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<UnitsStackParamList>>();
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const vms = units.map((u) => unitVM(u, today));

  return (
    <Screen topPad={10}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.title}>Units</Text>
          <Text style={s.subtitle}>Ilazo · Dodoma</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openSheet({ kind: 'addUnit' })}
          style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Icon name="domain-add" size={19} color="#fff" />
          <Text style={s.newBtnText}>New Unit</Text>
        </Pressable>
      </View>

      {/* Portfolio summary strip */}
      <View style={s.strip}>
        <Card style={s.stat}>
          <Text style={s.statLabel}>Occupied</Text>
          <Text style={s.statValue}>
            {occupiedUnits(units).length}/{units.length}
          </Text>
        </Card>
        <Card style={s.stat}>
          <Text style={s.statLabel}>Roll / mo</Text>
          <Text style={[s.statValue, { color: colors.green }]}>{fmt(monthRoll(units))}</Text>
        </Card>
        <Card style={s.stat}>
          <Text style={s.statLabel}>Arrears</Text>
          <Text style={[s.statValue, { color: colors.red }]}>{fmt(outstandingTotal(units, today))}</Text>
        </Card>
      </View>

      <View style={{ gap: vs(10, 8) }}>
        {vms.map((v) => (
          <Card
            key={v.unit.id}
            style={s.unitCard}
            onPress={() => navigation.navigate('UnitDetails', { unitId: v.unit.id })}
          >
            <View style={s.cardTop}>
              <View style={s.unitIcon}>
                <Icon name="apartment" size={24} color={colors.green} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.unitName}>{v.unit.name}</Text>
                <Text style={s.unitMeta}>
                  {v.unit.type} · {fmt(v.unit.rent)} /mo
                </Text>
              </View>
              <Pill label={v.statusLabel} bg={v.statusBg} fg={v.statusFg} />
              {/* Affordance for the whole-card tap → UnitDetails (replaces the
                  old footer "Details ›" link, which cost a full row of height). */}
              <Icon name="chevron-right" size={18} color={colors.chevronFaint} />
            </View>

            {v.vacant ? (
              <Pressable
                style={s.vacantRow}
                onPress={() => openSheet({ kind: 'newTenant', unitId: v.unit.id })}
                accessibilityRole="button"
              >
                <View style={s.vacantIcon}>
                  <Icon name="person-add" size={18} color={colors.faint} />
                </View>
                <Text style={s.vacantText}>No tenant yet — register one</Text>
                <Icon name="chevron-right" size={17} color={colors.chevron} />
              </Pressable>
            ) : (
              <View style={s.tenantRow}>
                <Avatar name={v.unit.tenant} size={34} rad={11} fontSize={11} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.tenantName} numberOfLines={1}>
                    {v.unit.tenant}
                  </Text>
                  <Text style={s.covered}>
                    {v.ownerOccupied ? 'Lives here · owner' : `Covered to ${v.coveredThrough}`}
                  </Text>
                </View>
                <Text style={[s.balance, { color: v.balanceColor }]}>{v.balanceLabel}</Text>
              </View>
            )}

            {/* The old footer repeated the status a third time (pill + balance
                already say it) and added a whole row of height, which pushed
                the 4th unit off-screen on shorter phones. The progress bar
                still carries the tenure at a glance. */}
            <ProgressBar pct={v.pct} color={v.barColor} style={{ marginTop: vs(10, 8) }} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontFamily: font.heading, fontSize: 22, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: colors.muted2, marginTop: 2, fontFamily: font.body },
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

  strip: { flexDirection: 'row', gap: 9, marginBottom: vs(12, 10) },
  stat: { flex: 1, borderRadius: 15, paddingVertical: 10, paddingHorizontal: 12 },
  statLabel: {
    fontSize: 10.5,
    color: colors.muted2,
    fontFamily: font.bodyBold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: { fontFamily: font.heading, fontSize: 19, color: colors.ink, marginTop: 3 },

  unitCard: { borderRadius: 20, padding: vs(12, 10) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  unitIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.greenTintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitName: { fontSize: 16.5, fontFamily: font.bodyBold, color: colors.ink },
  unitMeta: { fontSize: 12, color: colors.muted2, marginTop: 1, fontFamily: font.body },

  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  tenantName: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink },
  covered: { fontSize: 11, color: colors.muted3, fontFamily: font.body },
  balance: { fontFamily: font.heading, fontSize: 15 },

  vacantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inputBorder,
  },
  vacantIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.pastBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacantText: { flex: 1, fontSize: 13, fontFamily: font.bodySemi, color: colors.muted2 },

});
