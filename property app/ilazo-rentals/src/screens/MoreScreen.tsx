import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen } from '../ui/Screen';
import { Card } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, heroShadow } from '../theme';
import { useApp } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { exportBackup, parseBackup } from '../lib/backup';
import type { MoreStackParamList } from '../navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'More'>;

export function MoreScreen({ navigation }: Props) {
  const company = useApp((s) => s.company);
  const units = useApp((s) => s.units);
  const txns = useApp((s) => s.txns);
  const importData = useApp((s) => s.importData);
  const { showToast } = useUi();
  const soon = () => showToast('Coming soon', 1800);

  // Export the whole ledger to a JSON file and open the share sheet.
  const onExport = async () => {
    try {
      await exportBackup({ units, txns, company });
    } catch {
      showToast('Could not export backup', 2200);
    }
  };

  // Pick a backup JSON, validate it, and (after confirmation) replace the ledger.
  const onImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      let data;
      try {
        data = parseBackup(text);
      } catch (e: any) {
        showToast(e?.message ?? 'Invalid backup file', 2600);
        return;
      }
      Alert.alert(
        'Import this backup?',
        `This replaces ALL current data with ${data.units.length} units and ${data.txns.length} transactions from the file. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: () => {
              importData(data);
              showToast('Backup imported', 2200);
            },
          },
        ],
      );
    } catch {
      showToast('Could not read that file', 2400);
    }
  };

  const items = [
    { icon: 'business', label: 'Company profile', onPress: () => navigation.navigate('Company') },
    { icon: 'description', label: 'Statements & receipts', onPress: () => navigation.navigate('Statements') },
    { icon: 'insights', label: 'Reports', onPress: soon },
    { icon: 'cloud', label: 'Cloud backup & sync', onPress: () => navigation.navigate('CloudSync') },
    { icon: 'backup', label: 'Export data (backup)', onPress: onExport },
    { icon: 'restore', label: 'Import data (restore)', onPress: onImport },
    { icon: 'settings', label: 'App settings', onPress: soon },
  ];

  return (
    <Screen topPad={10}>
      <Text style={s.title}>More</Text>

      <LinearGradient
        colors={colors.gradA}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[s.companyCard, heroShadow('#0B5B45')]}
      >
        <View style={s.companyIcon}>
          <Icon name="domain" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.companyName} numberOfLines={2}>
            {company.name}
          </Text>
          <Text style={s.companyMeta}>1 property · {units.length} units · Dodoma</Text>
        </View>
      </LinearGradient>

      <Card style={{ borderRadius: 22, marginTop: 14, paddingHorizontal: 16, paddingVertical: 4 }}>
        {items.map((m, i) => (
          <Pressable key={m.label} onPress={m.onPress} style={[s.row, i < items.length - 1 && s.rowBorder]}>
            <Icon name={m.icon} size={22} color={colors.avatarFg} />
            <Text style={s.rowLabel}>{m.label}</Text>
            <Icon name="chevron-right" size={20} color={colors.chevronFaint} />
          </Pressable>
        ))}
      </Card>

      <Text style={s.version}>Ilazo Rentals · v1.0 · built for {company.short || company.name}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.heading, fontSize: 22, color: colors.ink, letterSpacing: -0.2, marginBottom: 12 },
  companyCard: { borderRadius: 22, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13 },
  companyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: { fontSize: 15.5, fontFamily: font.bodyBold, color: '#fff', lineHeight: 19 },
  companyMeta: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3, fontFamily: font.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowLabel: { flex: 1, fontSize: 14.5, fontFamily: font.bodySemi, color: colors.ink },
  version: { textAlign: 'center', fontSize: 11.5, color: colors.faint, marginTop: 20, fontFamily: font.body },
});
