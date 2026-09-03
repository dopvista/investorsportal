import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../ui/Screen';
import { BackHeader } from '../ui/BackHeader';
import { Card } from '../ui/primitives';
import { PrimaryButton } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font } from '../theme';
import { useSync } from '../state/SyncProvider';
import { useUi } from '../state/UiProvider';
import type { MoreStackParamList } from '../navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'CloudSync'>;

/** Google mark for the sign-in button (MaterialCommunityIcons ships the logo). */
function GoogleMark() {
  return <MaterialCommunityIcons name="google" size={20} color="#4285F4" />;
}

function stamp(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CloudSyncScreen({ navigation }: Props) {
  const { session, email, status, message, lastSyncedAt, autoSync, signInWithGoogle, signOut, syncNow, restoreFromCloud } =
    useSync();
  const { showToast } = useUi();
  const [busy, setBusy] = useState(false);

  const doSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      showToast('Signed in — cloud sync on');
    } catch (e: any) {
      showToast(e?.message ?? 'Google sign-in failed', 3000);
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

            <Pressable
              onPress={doSignIn}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              style={({ pressed }) => [s.googleBtn, pressed && { opacity: 0.85 }]}
            >
              <GoogleMark />
              <Text style={s.googleText}>{busy ? 'Opening Google…' : 'Continue with Google'}</Text>
            </Pressable>

            <Text style={s.authNote}>
              Signs you in with the same Google account you use for the Investors Portal. This app never
              asks for or stores a password.
            </Text>
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
                <Text style={s.metaLabel}>Auto-sync</Text>
                <View style={s.autoWrap}>
                  <View style={[s.dot, { backgroundColor: autoSync ? colors.green : colors.faint }]} />
                  <Text style={[s.metaValue, autoSync && { color: colors.green }]} numberOfLines={1}>
                    {autoSync ? 'On' : 'Off'}
                  </Text>
                </View>
              </View>
              <View style={[s.metaRow, { marginTop: 8 }]}>
                <Text style={s.metaLabel}>Last synced</Text>
                <Text style={s.metaValue} numberOfLines={1}>
                  {stamp(lastSyncedAt)}
                </Text>
              </View>
              {message && <Text style={[s.msg, (status === 'error' || status === 'conflict') && { color: colors.red }]}>{message}</Text>}
            </Card>

            {status === 'conflict' && (
              <Card style={[s.infoCard, { borderColor: colors.red, borderWidth: 1, marginTop: 14 }]}>
                <Icon name="warning" size={20} color={colors.red} />
                <Text style={[s.infoText, { color: colors.red }]}>
                  Could not settle with the cloud copy after several tries — the other phone may be
                  syncing at the same time. Tap Sync now again; nothing has been changed or lost.
                </Text>
              </Card>
            )}

            <Text style={s.note}>
              Nothing to press. Every phone signed in to this account syncs on its own — after each
              change, whenever the app is opened, and every minute while it is in use. Changes are
              merged, so payments recorded on either phone are kept. "Sync now" just does it this
              second; "Restore" is the escape hatch that replaces this phone with the cloud copy.
            </Text>

            <PrimaryButton
              label={status === 'syncing' ? 'Syncing…' : 'Sync now'}
              onPress={() => void syncNow()}
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
  googleBtn: {
    marginTop: 20,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  googleText: { fontSize: 15, fontFamily: font.bodyBold, color: colors.ink, includeFontPadding: false },
  authNote: { marginTop: 14, fontSize: 11.5, lineHeight: 17, color: colors.muted3, fontFamily: font.body, textAlign: 'center' },
  infoCard: { borderRadius: 16, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.muted, fontFamily: font.body },
  statusCard: { borderRadius: 18, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  statusTitle: { fontSize: 15, fontFamily: font.bodyBold, color: colors.ink },
  statusSub: { fontSize: 12, color: colors.muted2, marginTop: 2, fontFamily: font.body },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  autoWrap: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
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
