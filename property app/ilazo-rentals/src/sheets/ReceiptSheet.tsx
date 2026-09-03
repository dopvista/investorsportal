import React, { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/primitives';
import { EvidenceThumbs } from '../ui/EvidenceRow';
import { receiptShareText } from '../lib/shareText';
import { colors, font } from '../theme';
import { useApp } from '../state/StoreProvider';
import type { Receipt } from '../../core/statements';
import { fmt } from '../../core/money';
import { fmtDate } from '../../core/dates';
import { initials } from '../../core/names';

export function ReceiptSheet({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const company = useApp((s) => s.company);
  const shotRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  /** Share the receipt as a picture (falls back to formatted text if needed). */
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Rent receipt ${receipt.no}` });
      } else {
        await Share.share({ message: receiptShareText(company, receipt), title: `Rent receipt ${receipt.no}` });
      }
    } catch {
      Share.share({ message: receiptShareText(company, receipt), title: `Rent receipt ${receipt.no}` }).catch(() => {});
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
            <Text style={s.coName} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={s.coAddress} numberOfLines={1}>
              {company.address}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
          <Text style={s.docTitle}>RENT RECEIPT</Text>
          <Text style={s.docNo}>{receipt.no}</Text>
        </View>
        <View style={s.dashed} />

        <Row label="Received from" value={receipt.tenant} />
        <Row label="Unit" value={receipt.unitName} />
        <Row label="Date paid" value={fmtDate(receipt.date)} />
        <Row label="Method" value={receipt.method} />
        <View style={s.periodRow}>
          <Text style={s.rowLabel}>For period</Text>
          <View style={{ alignItems: 'flex-end', paddingLeft: 12, flex: 1 }}>
            <Text style={s.rowValue} numberOfLines={1}>
              {receipt.coverMonths}
            </Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {receipt.coverRange}
            </Text>
          </View>
        </View>

        <View style={s.amountBox}>
          <Text style={s.amountLabel}>Amount received</Text>
          <Text style={s.amountValue}>
            {fmt(receipt.amount)} <Text style={s.amountCurrency}>TZS</Text>
          </Text>
        </View>

        <View style={s.statusRow}>
          <Text style={s.rowLabel}>Status</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="check-circle" size={16} color={colors.green} />
            <Text style={s.statusValue}>Completed successfully</Text>
          </View>
        </View>
      </Card>
      </View>

      {/* Evidence stays in-app only — deliberately outside the shared image capture. */}
      {receipt.evidence.length > 0 && (
        <Card style={{ marginTop: 10, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="attachment" size={16} color={colors.muted2} />
            <Text style={s.evidenceLabel}>PAYMENT EVIDENCE · {receipt.evidence.length}</Text>
          </View>
          <EvidenceThumbs uris={receipt.evidence} size={72} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 11, marginTop: 16 }}>
        <Pressable onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeText}>Close</Text>
        </Pressable>
        <Pressable onPress={share} style={[s.shareBtn, sharing && { opacity: 0.7 }]}>
          <Icon name="ios-share" size={19} color="#fff" />
          <Text style={s.shareText}>{sharing ? 'Preparing…' : 'Share receipt'}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.heading, fontSize: 15, color: '#fff' },
  coName: { fontSize: 14, fontFamily: font.bodyBold, color: colors.ink, lineHeight: 17 },
  coAddress: { fontSize: 10.5, color: colors.muted3, marginTop: 2, fontFamily: font.body },
  docTitle: { fontFamily: font.heading, fontSize: 13, letterSpacing: 1.5, color: colors.green },
  docNo: { marginLeft: 'auto', fontSize: 11.5, fontFamily: font.bodyBold, color: colors.muted2 },
  dashed: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    marginTop: 10,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  periodRow: { flexDirection: 'row', alignItems: 'flex-start' },
  rowLabel: { fontSize: 12.5, color: colors.muted2, fontFamily: font.body, flexShrink: 0 },
  rowValue: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.ink, flex: 1, textAlign: 'right', paddingLeft: 12 },
  amountBox: {
    backgroundColor: colors.previewBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 },
  statusValue: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.green },
  amountLabel: { fontSize: 12.5, fontFamily: font.bodyBold, color: colors.previewSub },
  evidenceLabel: { fontSize: 11, fontFamily: font.bodyXBold, letterSpacing: 0.6, color: colors.muted2 },
  amountValue: { marginLeft: 'auto', fontFamily: font.heading, fontSize: 22, color: colors.green },
  amountCurrency: { fontSize: 12, color: colors.muted2, fontFamily: font.body },
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
