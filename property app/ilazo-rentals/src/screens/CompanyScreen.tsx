import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Card, FieldLabel, Input } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { colors, font, heroShadow } from '../theme';
import { useApp } from '../state/StoreProvider';
import { useUi } from '../state/UiProvider';
import { initials } from '../../core/names';
import { DEFAULT_MOTTO } from '../../core/seed';
import type { MoreStackParamList } from '../navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'Company'>;

export function CompanyScreen({ navigation }: Props) {
  const company = useApp((s) => s.company);
  const saveCompany = useApp((s) => s.saveCompany);
  const { showToast } = useUi();
  const [form, setForm] = useState(company);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim()) {
      showToast('Enter the company name');
      return;
    }
    saveCompany({ ...form, name: form.name.trim(), short: form.short.trim() });
    showToast('Company profile saved');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <BackHeader label="Company profile" onBack={() => navigation.goBack()} bold />

        <Card style={{ borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LinearGradient colors={colors.gradLogo} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.logo, heroShadow('#0B5B45')]}>
            <Text style={s.logoText}>{initials(form.name)}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Pressable style={s.logoBtn} onPress={() => showToast('Coming soon', 1800)}>
              <Icon name="photo-camera" size={18} color={colors.green} />
              <Text style={s.logoBtnText}>Change logo</Text>
            </Pressable>
            <Text style={s.logoHint}>Shown on the app header and on receipts</Text>
          </View>
        </Card>

        <Card style={{ borderRadius: 20, padding: 14, marginTop: 10 }}>
          <FieldLabel>Company name</FieldLabel>
          <Input value={form.name} onChangeText={set('name')} />

          <FieldLabel style={{ marginTop: 12 }}>
            Short name <Text style={s.labelHint}>· shown on dashboard</Text>
          </FieldLabel>
          <Input value={form.short} onChangeText={set('short')} />

          <View style={{ flexDirection: 'row', gap: 11, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Phone</FieldLabel>
              <Input value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>TIN</FieldLabel>
              <Input value={form.tin} onChangeText={set('tin')} keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          <FieldLabel style={{ marginTop: 12 }}>Email</FieldLabel>
          <Input value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />

          <FieldLabel style={{ marginTop: 12 }}>Address</FieldLabel>
          <Input value={form.address} onChangeText={set('address')} multiline numberOfLines={2} style={{ minHeight: 56, textAlignVertical: 'top' }} />

          <FieldLabel style={{ marginTop: 12 }}>
            Receipt message <Text style={s.labelHint}>· closing line tenants read</Text>
          </FieldLabel>
          <Input
            value={form.motto ?? ''}
            onChangeText={set('motto')}
            placeholder={DEFAULT_MOTTO}
            multiline
            numberOfLines={2}
            style={{ minHeight: 56, textAlignVertical: 'top' }}
          />
          <Text style={s.fieldHint}>Prints at the foot of every receipt and statement you share.</Text>
        </Card>

        <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.9 }]}>
          <Icon name="check" size={20} color="#fff" />
          <Text style={s.saveBtnText}>Save company profile</Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  logo: { width: 62, height: 62, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.heading, fontSize: 22, color: '#fff' },
  fieldHint: { marginTop: 6, fontSize: 11.5, lineHeight: 16, color: colors.muted3, fontFamily: font.body },
  logoBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.hairline3,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logoBtnText: { fontSize: 13, fontFamily: font.bodyBold, color: colors.green },
  logoHint: { fontSize: 11, color: colors.muted3, marginTop: 6, fontFamily: font.body },
  labelHint: { fontFamily: font.bodyMed, color: colors.faint },
  saveBtn: {
    marginTop: 12,
    backgroundColor: colors.green,
    borderRadius: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.green,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: font.bodyBold },
});
