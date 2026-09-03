import React, { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/primitives';
import { colors, font } from '../theme';
import { useApp } from '../state/StoreProvider';
import type { StatementData } from '../../core/statements';
import { fmt } from '../../core/money';
import { DEFAULT_MOTTO } from '../../core/seed';
import { fmtDate } from '../../core/dates';
import { initials } from '../../core/names';
import { statementShareText } from '../lib/shareText';

const BALANCE_STYLES = {
  due: { bg: colors.redBg, label: colors.redLabel, sub: colors.redSub, value: colors.red },
  credit: { bg: colors.amberBg, label: colors.amberInk, sub: colors.amberSub, value: colors.amber },
  nil: { bg: colors.previewBg, label: colors.greenDark, sub: colors.previewMuted, value: colors.green },
} as const;

export function StatementSheet({ statement, onClose }: { statement: StatementData; onClose: () => void }) {
  const company = useApp((s) => s.company);
  const b = statement.balance;
  const bs = BALANCE_STYLES[b.kind];
  // The value column carries a figure, not a sentence: "Nil — up to date" was
  // three times the width of any amount and wrapped inside its own column. The
  // reassurance is already on the line below it ("settled" / "nothing unpaid").
  const balanceValue =
    b.kind === 'due' ? `${fmt(b.amount)} due` : b.kind === 'credit' ? `${fmt(b.amount)} cr` : 'Nil';

  const shotRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  /** Share the statement as a picture (falls back to formatted text if needed). */
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Statement — ${statement.tenant}` });
      } else {
        await Share.share({ message: statementShareText(company, statement), title: `Statement — ${statement.tenant}` });
      }
    } catch {
      Share.share({ message: statementShareText(company, statement) }).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

  return (
    <Sheet visible onClose={onClose}>
      <View ref={shotRef} collapsable={false} style={{ backgroundColor: colors.bg, padding: 10 }}>
      <Card style={{ padding: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <LinearGradient colors={colors.gradLogo} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.logo}>
            <Text style={s.logoText}>{initials(company.name)}</Text>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.coName}>{company.name}</Text>
            <Text style={s.coSub}>Tenant statement</Text>
          </View>
        </View>

        <View style={s.dashed} />
        <Text style={s.tenant}>{statement.tenant}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {statement.unitName}
          {statement.type ? ` · ${statement.type}` : ''} · rent {fmt(statement.rent)}/mo
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <View style={s.periodBadge}>
            <Text style={s.periodBadgeText}>{statement.periodLabel}</Text>
          </View>
          <Text style={s.since}>
            occupied since <Text style={{ fontFamily: font.bodyBold, color: colors.ink }}>{fmtDate(statement.leaseStart)}</Text>
          </Text>
        </View>

        {/* 3-way reconciliation: Rent charged = Paid + Outstanding */}
        <View style={{ gap: 9, marginTop: 14 }}>
          <View style={[s.reconRow, { backgroundColor: colors.bg }]}>
            <View style={s.reconLabelCol}>
              <Text style={[s.reconLabel, { color: colors.ink }]}>Rent charged</Text>
              <Text style={[s.reconSub, { color: colors.faint }]}>{statement.chargedSub}</Text>
            </View>
            <Text style={[s.reconValue, { color: colors.ink }]}>{fmt(statement.charged)}</Text>
          </View>
          <View style={[s.reconRow, { backgroundColor: colors.previewBg }]}>
            <View style={s.reconLabelCol}>
              <Text style={[s.reconLabel, { color: colors.greenDark }]}>Paid</Text>
              <Text style={[s.reconSub, { color: colors.previewMuted }]}>{statement.paidSub}</Text>
            </View>
            <Text style={[s.reconValue, { color: colors.green }]}>{fmt(statement.received)}</Text>
          </View>
          <View style={[s.reconRow, { backgroundColor: bs.bg }]}>
            <View style={s.reconLabelCol}>
              <Text style={[s.reconLabel, { color: bs.label }]}>{b.label}</Text>
              {!!b.at && <Text style={[s.reconAt, { color: bs.label }]}>{b.at}</Text>}
              <Text style={[s.reconSub, { color: bs.sub }]}>{b.sub}</Text>
            </View>
            <Text style={[s.reconValue, { color: bs.value }]} numberOfLines={1}>
              {balanceValue}
            </Text>
          </View>
        </View>

        <View style={s.coveredRow}>
          {/* "Paid up to (covered through)" said the same thing twice and was
              long enough to wrap. The unit cards already say "Covered to". */}
          <Text style={s.coveredLabel} numberOfLines={1}>
            Covered through
          </Text>
          <Text style={s.coveredValue} numberOfLines={1}>
            {fmtDate(statement.coverEnd)}
          </Text>
        </View>

        <View style={s.dashed} />
        <Text style={s.paysEyebrow}>PAYMENTS</Text>
        {statement.pays.length === 0 ? (
          <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.muted3, paddingVertical: 8 }}>
            No payments in this period.
          </Text>
        ) : (
          statement.pays.map((p, i) => (
            <View key={`${p.date}-${i}`} style={[s.payRow, i < statement.pays.length - 1 && s.payRowBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.payDate}>{fmtDate(p.date)}</Text>
                {!!p.months && (
                  <Text style={s.paySub} numberOfLines={1}>
                    {p.months}
                  </Text>
                )}
                {!!p.range && (
                  <Text style={s.paySub} numberOfLines={1}>
                    {p.range}
                  </Text>
                )}
              </View>
              <Text style={s.payAmount}>{fmt(p.amount)}</Text>
            </View>
          ))
        )}

        {/* A statement is shared with the tenant too, so it closes in the
            company's own words rather than trailing off after the table. */}
        <View style={s.mottoWrap}>
          <View style={s.mottoRule} />
          <Text style={s.motto}>{company.motto || DEFAULT_MOTTO}</Text>
        </View>
      </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: 11, marginTop: 16 }}>
        <Pressable onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeText}>Close</Text>
        </Pressable>
        <Pressable onPress={share} style={[s.shareBtn, sharing && { opacity: 0.7 }]}>
          <Icon name="ios-share" size={19} color="#fff" />
          <Text style={s.shareText}>{sharing ? 'Preparing…' : 'Share statement'}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.heading, fontSize: 15, color: '#fff' },
  coName: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink, lineHeight: 17 },
  coSub: { fontSize: 10.5, color: colors.muted3, marginTop: 2, fontFamily: font.body },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, marginVertical: 14 },
  tenant: { fontSize: 16, fontFamily: font.bodyXBold, color: colors.ink },
  meta: { fontSize: 12, color: colors.muted2, marginTop: 2, fontFamily: font.body },
  periodBadge: { backgroundColor: colors.greenPillBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  periodBadgeText: { fontSize: 11, fontFamily: font.bodyBold, color: colors.green },
  since: { fontSize: 12, color: colors.muted2, fontFamily: font.body },

  reconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
    // The label is the longest thing here ("Balance at 03 Sep 2026") and the
    // figure is the thing nobody may misread, so a real gap holds them apart
    // and the label — not the amount — gives way when space runs short.
    gap: 12,
  },
  reconLabelCol: { flex: 1, minWidth: 0 },
  reconLabel: { fontSize: 12.5, lineHeight: 16, fontFamily: font.bodyBold },
  // Smaller than the title it belongs to, and on its own line: three short
  // lines cost less height than a two-line title plus a sub, so the card does
  // not grow.
  reconAt: { fontSize: 11, lineHeight: 14, fontFamily: font.bodySemi },
  reconSub: { fontSize: 11, lineHeight: 14, marginTop: 1, fontFamily: font.body },
  reconValue: { marginLeft: 'auto', flexShrink: 0, fontFamily: font.heading, fontSize: 18 },

  coveredRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  mottoWrap: { marginTop: 18, alignItems: 'center' },
  mottoRule: { width: 34, height: 2, borderRadius: 1, backgroundColor: colors.greenPillBg, marginBottom: 11 },
  motto: { fontSize: 11.5, lineHeight: 17, color: colors.muted2, fontFamily: font.bodySemi, textAlign: 'center', paddingHorizontal: 2, letterSpacing: -0.1 },
  coveredLabel: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, color: colors.muted2, fontFamily: font.body },
  coveredValue: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.ink },

  paysEyebrow: { fontSize: 11, fontFamily: font.bodyXBold, letterSpacing: 0.7, color: colors.muted2, marginBottom: 8 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  payRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  payDate: { fontSize: 12.5, fontFamily: font.bodySemi, color: colors.ink },
  paySub: { fontSize: 10.5, color: colors.muted3, fontFamily: font.body },
  payAmount: { fontFamily: font.heading, fontSize: 13, color: colors.green },

  closeBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
    borderRadius: 15,
    paddingVertical: 15,
  },
  closeText: { fontSize: 14, fontFamily: font.bodyBold, color: colors.avatarFg },
  shareBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.green,
    borderRadius: 15,
    paddingVertical: 15,
    shadowColor: colors.green,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  shareText: { fontSize: 14, fontFamily: font.bodyBold, color: '#fff' },
});
