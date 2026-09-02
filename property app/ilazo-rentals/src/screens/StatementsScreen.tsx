import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Avatar, Card } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { colors, font } from '../theme';
import { useApp, useToday } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { computeCovers } from '../../core/engine';
import { buildAccounts, buildReceipts, buildStatement } from '../../core/statements';
import { fmt } from '../../core/money';
import { fmtDate, yearOf } from '../../core/dates';
import type { MoreStackParamList } from '../navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'Statements'>;
type YearFilter = number | 'all';

export function StatementsScreen({ navigation }: Props) {
  const { openSheet } = useUi();
  const today = useToday();
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const [tab, setTab] = useState<'receipts' | 'statements'>('receipts');
  // Year filter defaults to the current year and drives BOTH tabs.
  const [fy, setFy] = useState<YearFilter>(yearOf(today));
  const [fyMenu, setFyMenu] = useState(false);

  const covers = useMemo(() => computeCovers(units, txns), [units, txns]);
  const receipts = useMemo(() => buildReceipts(units, txns, covers), [units, txns, covers]);
  const accounts = useMemo(() => buildAccounts(units, txns), [units, txns]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of receipts) set.add(yearOf(r.date));
    return [...set].sort((a, b) => b - a);
  }, [receipts]);

  const receiptsF = fy === 'all' ? receipts : receipts.filter((r) => yearOf(r.date) === fy);
  const accountsF = fy === 'all' ? accounts : accounts.filter((a) => a.years.includes(fy));
  const fyActive = fy !== 'all';

  const openStatement = (accountKey: string) => {
    const account = accounts.find((a) => `${a.unitId}|${a.tenant}` === accountKey);
    if (!account) return;
    const statement = buildStatement(account, covers, fy === 'all' ? null : fy, today);
    openSheet({ kind: 'statement', statement });
  };

  return (
    <Screen>
      <BackHeader label="Statements & receipts" onBack={() => navigation.goBack()} bold />

      {/* Tabs + year filter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={s.segment}>
          {(['receipts', 'statements'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[s.segmentBtn, tab === t && s.segmentBtnActive]}
              accessibilityRole="button"
              accessibilityState={tab === t ? { selected: true } : {}}
            >
              <Text style={[s.segmentText, { color: tab === t ? colors.green : colors.muted }]}>
                {t === 'receipts' ? 'Receipts' : 'Statements'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel="Filter by year"
          onPress={() => setFyMenu(true)}
          style={[s.fyBtn, fyActive ? { backgroundColor: colors.green, borderColor: colors.green } : null]}
        >
          <Icon name="filter-alt" size={23} color={fyActive ? '#fff' : colors.avatarFg} />
        </Pressable>
      </View>

      {tab === 'receipts' ? (
        <>
          <Text style={s.scopeNote}>
            {receiptsF.length} rent receipts · {fy === 'all' ? 'newest first' : `year ${fy}`}
          </Text>
          <View style={{ gap: 10 }}>
            {receiptsF.length === 0 ? (
              <Card style={{ padding: 16, alignItems: 'center' }}>
                <Text style={s.emptyText}>No receipts for this period.</Text>
              </Card>
            ) : (
              receiptsF.map((r) => (
                <Card key={r.txnId} style={s.receiptRow} onPress={() => openSheet({ kind: 'receipt', receipt: r })}>
                  <View style={s.receiptIcon}>
                    <Icon name="receipt-long" size={21} color={colors.green} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.receiptTenant}>{r.tenant}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={s.receiptMeta}>
                        {r.no} · {r.unitName} · {fmtDate(r.date)}
                      </Text>
                      {r.evidence.length > 0 && <Icon name="attachment" size={13} color={colors.green} />}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.receiptAmount}>{fmt(r.amount)}</Text>
                    <Text style={s.receiptCurrency}>TZS</Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={s.scopeNote}>
            Generate an account statement per tenant{fy === 'all' ? '' : ` · ${fy}`}
          </Text>
          <View style={{ gap: 10 }}>
            {accountsF.length === 0 ? (
              <Card style={{ padding: 16, alignItems: 'center' }}>
                <Text style={s.emptyText}>No tenants for this period.</Text>
              </Card>
            ) : (
              accountsF.map((a) => (
                <Card
                  key={`${a.unitId}|${a.tenant}`}
                  style={s.acctRow}
                  onPress={() => openStatement(`${a.unitId}|${a.tenant}`)}
                >
                  <Avatar name={a.tenant} size={42} rad={13} fontSize={13} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.acctName}>{a.tenant}</Text>
                    <Text style={s.acctSub} numberOfLines={1}>
                      {a.unitName} · {a.current ? 'covered to' : 'left'} {fmtDate(a.coverEnd)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.badge, { backgroundColor: a.current ? colors.greenPillBg : colors.pastBg }]}>
                      <Text style={[s.badgeText, { color: a.current ? colors.green : colors.faint }]}>
                        {a.current ? 'Active' : 'Past'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={s.generate}>Generate</Text>
                      <Icon name="chevron-right" size={18} color={colors.green} />
                    </View>
                  </View>
                </Card>
              ))
            )}
          </View>
        </>
      )}

      {/* Year filter sheet */}
      <Sheet visible={fyMenu} onClose={() => setFyMenu(false)} maxHeightPct={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Icon name="filter-alt" size={22} color={colors.green} />
          <Text style={s.fyTitle}>Filter by year</Text>
          <Pressable onPress={() => setFyMenu(false)} style={s.closeBtn} accessibilityLabel="Close">
            <Icon name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <View style={{ gap: 8 }}>
          {([['all', 'All years'] as const, ...years.map((y) => [y, String(y)] as const)]).map(([key, label]) => {
            const on = String(fy) === String(key);
            return (
              <Pressable
                key={String(key)}
                onPress={() => {
                  setFy(key as YearFilter);
                  setFyMenu(false);
                }}
                style={[s.fyRow, on && { backgroundColor: colors.previewBg }]}
              >
                <Text style={s.fyRowLabel}>{label}</Text>
                <Icon name="check-circle" size={21} color={on ? colors.green : 'transparent'} />
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  segment: { flex: 1, flexDirection: 'row', gap: 4, backgroundColor: colors.segment, borderRadius: 14, padding: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segmentBtnActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 13.5, fontFamily: font.bodyBold },
  fyBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  scopeNote: { fontSize: 12, color: colors.muted2, marginHorizontal: 4, marginBottom: 11, fontFamily: font.body },
  emptyText: { fontFamily: font.bodySemi, fontSize: 13, color: colors.muted2 },

  receiptRow: { borderRadius: 16, paddingVertical: 11, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  receiptIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.greenTintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTenant: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink },
  receiptMeta: { fontSize: 11.5, color: colors.muted3, fontFamily: font.body },
  receiptAmount: { fontFamily: font.heading, fontSize: 14.5, color: colors.green },
  receiptCurrency: { fontSize: 10.5, color: colors.faint, fontFamily: font.body },

  acctRow: { borderRadius: 16, paddingVertical: 11, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  acctName: { fontSize: 14.5, fontFamily: font.bodyBold, color: colors.ink },
  acctSub: { fontSize: 11.5, color: colors.muted3, fontFamily: font.body },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: font.bodyXBold },
  generate: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.green },

  fyTitle: { flex: 1, fontFamily: font.heading, fontSize: 17, color: colors.ink },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.segment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline3,
    backgroundColor: colors.card,
  },
  fyRowLabel: { flex: 1, fontSize: 14.5, fontFamily: font.bodyBold, color: colors.ink },
});
