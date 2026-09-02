import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Card, FieldLabel, Input } from '../ui/primitives';
import { PrimaryButton } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { colors, font } from '../theme';
import { useSync } from '../state/SyncProvider';
import { useUi } from '../state/UiProvider';
import type { MoreStackParamList } from '../navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'CloudSync'>;

function stamp(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CloudSyncScreen({ navigation }: Props) {
  const { session, email, status, message, lastSyncedAt, signIn, signOut, backupNow, restoreFromCloud } = useSync();
  const { showToast } = useUi();
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const doSignIn = async () => {
    if (!em.trim() || !pw) {
      showToast('Enter your email and password');
      return;
    }
    setBusy(true);
    try {
      await signIn(em, pw);
      setPw('');
      showToast('Signed in — cloud sync on');
    } catch (e: any) {
      showToast(e?.message ?? 'Sign in failed', 3000);
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () =>
    Alert.alert(
      'Restore from cloud?',
      'This replaces everything on this phone with the cloud copy. Any changes here that were never backed up will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void restoreFromCloud() },
      ],
    );

  const confirmOverwrite = () =>
    Alert.alert(
      'Overwrite the cloud copy?',
      'Another device backed up more recently. Uploading now replaces that copy with this phone’s data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Overwrite', style: 'destructive', onPress: () => void backupNow(true) },
      ],
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <BackHeader label="Cloud backup & sync" onBack={() => navigation.goBack()} bold />

        {!session ? (
          <>
            <Card style={s.infoCard}>
              <Icon name="info" size={20} color={colors.green} />
              <Text style={s.infoText}>
                Sign in to keep a private copy of your ledger in the cloud — locked to your account — so
                nothing is lost if this phone breaks, and your other phone can pick it up. The app keeps
                working normally whether you sign in or not.
              </Text>
            </Card>

            <FieldLabel style={{ marginTop: 18 }}>Email</FieldLabel>
            <Input
              value={em}
              onChangeText={setEm}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.muted3}
            />
            <FieldLabel style={{ marginTop: 14 }}>Password</FieldLabel>
            <Input
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted3}
            />
            <PrimaryButton label={busy ? 'Signing in…' : 'Sign in'} onPress={doSignIn} onCancel={() => navigation.goBack()} />
          </>
        ) : (
          <>
            <Card style={s.statusCard}>
              <View style={s.statusRow}>
                <Icon
                  name={status === 'conflict' || status === 'error' ? 'error' : 'check-circle'}
                  size={22}
                  color={status === 'conflict' || status === 'error' ? colors.red : colors.green}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.statusTitle}>
                    {status === 'syncing'
                      ? 'Syncing…'
                      : status === 'conflict'
                        ? 'Needs your decision'
                        : status === 'error'
                          ? 'Sync problem'
                          : 'Cloud sync is on'}
                  </Text>
                  <Text style={s.statusSub}>Signed in as {email}</Text>
                </View>
              </View>

              <View style={s.divider} />
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Last synced</Text>
                <Text style={s.metaValue}>{stamp(lastSyncedAt)}</Text>
              </View>
              {message && <Text style={[s.msg, (status === 'error' || status === 'conflict') && { color: colors.red }]}>{message}</Text>}
            </Card>

            {status === 'conflict' && (
              <Card style={[s.infoCard, { borderColor: colors.red, borderWidth: 1, marginTop: 14 }]}>
                <Icon name="warning" size={20} color={colors.red} />
                <Text style={[s.infoText, { color: colors.red }]}>
                  Your other phone backed up after this one last synced. Restore to take the cloud copy, or
                  overwrite it with what is on this phone. Nothing is changed until you choose.
                </Text>
              </Card>
            )}

            <Text style={s.note}>
              Changes on this phone upload automatically. Downloading replaces this phone’s data, so it
              always asks first.
            </Text>

            <PrimaryButton
              label="Back up now"
              onPress={() => (status === 'conflict' ? confirmOverwrite() : void backupNow(false))}
              onCancel={confirmRestore}
              cancelLabel="Restore"
            />

            <Text style={s.signOut} onPress={() => void signOut()}>
              Sign out of cloud sync
            </Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  infoCard: { borderRadius: 16, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.muted, fontFamily: font.body },
  statusCard: { borderRadius: 18, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  statusTitle: { fontSize: 15, fontFamily: font.bodyBold, color: colors.ink },
  statusSub: { fontSize: 12, color: colors.muted2, marginTop: 2, fontFamily: font.body },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaLabel: { fontSize: 12.5, color: colors.muted2, fontFamily: font.bodySemi },
  metaValue: { marginLeft: 'auto', fontSize: 12.5, color: colors.ink, fontFamily: font.bodyBold },
  msg: { marginTop: 10, fontSize: 12, color: colors.muted2, fontFamily: font.body },
  note: { marginTop: 16, fontSize: 12, lineHeight: 18, color: colors.muted3, fontFamily: font.body },
  signOut: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: font.bodyBold,
    color: colors.red,
  },
});
