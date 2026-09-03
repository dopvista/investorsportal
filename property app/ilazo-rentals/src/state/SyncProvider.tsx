/**
 * Cloud sync state.
 *
 * Design notes:
 * - Signing in is OPTIONAL. The app remains fully usable offline exactly as
 *   before; sync is an added safety net, never a gate in front of your data.
 * - Uploads are automatic (debounced after any change, and when the app goes to
 *   the background). Downloads are deliberate — pulling replaces the ledger, so
 *   it always asks first.
 * - If another phone wrote to the cloud since we last looked, an upload is
 *   refused and `status` becomes 'conflict' rather than silently overwriting.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { ConflictError, fetchRemote, getDeviceId, pushRemote } from '../lib/cloud';
import type { BackupData } from '../lib/backup';
import { useAppStore } from './StoreProvider';

const STAMP_KEY = 'ilazo-last-synced-stamp';
/** Must also be listed under Supabase Auth -> URL Configuration -> Redirect URLs. */
export const REDIRECT_URL = 'ilazorentals://auth-callback';

export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'error' | 'conflict';

interface SyncContextValue {
  session: Session | null;
  email: string | null;
  status: SyncStatus;
  message: string | null;
  /** Server stamp of the snapshot this phone last agreed with. */
  lastSyncedAt: string | null;
  /** Google is the only sign-in method — no passwords are handled by this app. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Upload now. `force` overwrites a conflicting cloud copy. */
  backupNow(force?: boolean): Promise<void>;
  /** Download and replace the local ledger. */
  restoreFromCloud(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const store = useAppStore();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signedOut');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const stampRef = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStamp = useCallback((s: string | null) => {
    stampRef.current = s;
    setLastSyncedAt(s);
    AsyncStorage.setItem(STAMP_KEY, s ?? '').catch(() => {});
  }, []);

  // Restore the remembered stamp + any existing session on boot.
  useEffect(() => {
    AsyncStorage.getItem(STAMP_KEY)
      .then((s) => {
        if (s) {
          stampRef.current = s;
          setLastSyncedAt(s);
        }
      })
      .catch(() => {});

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setStatus(data.session ? 'idle' : 'signedOut');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setStatus(s ? 'idle' : 'signedOut');
      if (!s) setMessage(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const snapshot = useCallback((): BackupData => {
    const s = store.getState();
    return { units: s.units, txns: s.txns, company: s.company };
  }, [store]);

  const backupNow = useCallback(
    async (force = false) => {
      const uid = session?.user?.id;
      if (!uid) return;
      setStatus('syncing');
      setMessage(null);
      try {
        const deviceId = await getDeviceId();
        const stamp = await pushRemote({
          userId: uid,
          data: snapshot(),
          deviceId,
          expectedStamp: stampRef.current,
          force,
        });
        setStamp(stamp);
        setStatus('idle');
        setMessage('Backed up');
      } catch (e: any) {
        if (e instanceof ConflictError) {
          setStatus('conflict');
          setMessage('Another device updated the cloud copy since this phone last synced.');
        } else {
          setStatus('error');
          setMessage(e?.message ?? 'Backup failed');
        }
      }
    },
    [session, snapshot, setStamp],
  );

  const restoreFromCloud = useCallback(async () => {
    if (!session?.user?.id) return;
    setStatus('syncing');
    setMessage(null);
    try {
      const remote = await fetchRemote();
      if (!remote) {
        setStatus('idle');
        setMessage('Nothing in the cloud yet');
        return;
      }
      store.getState().importData(remote.data);
      setStamp(remote.updatedAt);
      setStatus('idle');
      setMessage('Restored from cloud');
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message ?? 'Restore failed');
    }
  }, [session, store, setStamp]);

  // Auto-upload: debounce local edits, and flush when the app is backgrounded.
  useEffect(() => {
    if (!session) return;
    const schedule = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        // Never auto-overwrite a conflicting cloud copy — the user decides.
        setStatus((cur) => {
          if (cur !== 'conflict') void backupNow(false);
          return cur;
        });
      }, 2500);
    };
    const unsub = store.subscribe(schedule);
    const appSub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') schedule();
    });
    return () => {
      unsub();
      appSub.remove();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [session, store, backupNow]);

  /**
   * Google sign-in via the system browser.
   *
   * Uses the Google provider already configured on this Supabase project (the
   * web portal signs in the same way), so there is no separate Google Cloud
   * client and no signing-key fingerprint to register. supabase-js defaults to
   * PKCE, so the callback carries a `code` we exchange for a session; the
   * implicit `#access_token` form is handled too for safety.
   */
  const signInWithGoogle = useCallback(async () => {
    setStatus('syncing');
    setMessage(null);
    try {
      const redirectTo = REDIRECT_URL;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error('Could not start Google sign-in');

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success' || !res.url) {
        // User dismissed the browser — not an error worth shouting about.
        setStatus('signedOut');
        return;
      }

      const url = new URL(res.url);
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) throw new Error(exErr.message);
      } else {
        const hash = new URLSearchParams((res.url.split('#')[1] ?? ''));
        const access_token = hash.get('access_token');
        const refresh_token = hash.get('refresh_token');
        if (!access_token || !refresh_token) throw new Error('Google did not return a session');
        const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sErr) throw new Error(sErr.message);
      }
      setStatus('idle');
    } catch (e: any) {
      setStatus('signedOut');
      setMessage(e?.message ?? 'Google sign-in failed');
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStamp(null);
    setStatus('signedOut');
  }, [setStamp]);

  return (
    <SyncContext.Provider
      value={{
        session,
        email: session?.user?.email ?? null,
        status,
        message,
        lastSyncedAt,
        signInWithGoogle,
        signOut,
        backupNow,
        restoreFromCloud,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
