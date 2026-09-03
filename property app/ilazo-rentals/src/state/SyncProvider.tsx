/**
 * Cloud sync state.
 *
 * Design notes:
 * - Signing in is OPTIONAL. The app remains fully usable offline exactly as
 *   before; sync is an added safety net, never a gate in front of your data.
 * - Sync is automatic in both directions and needs no button: it runs on
 *   sign-in, shortly after any edit, when the app is opened or backgrounded,
 *   and on a quiet timer while the app is in use, so a payment recorded on one
 *   phone reaches the other without anybody tapping anything.
 * - Every sync is a pull-merge-push, so "automatic" never means "overwrites":
 *   the two ledgers are merged (see core/merge.ts) before anything is written.
 * - Background ticks stay silent. A tick that fails (no signal, plane mode)
 *   leaves the last good state on screen and simply tries again next time;
 *   only a sync the user asked for is allowed to report an error.
 * - "Restore" is the one deliberate, destructive action — it replaces this
 *   phone's ledger with the cloud copy, so it always asks first.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { ConflictError, fetchRemote, fetchRemoteStamp, getDeviceId, pushRemote } from '../lib/cloud';
import { mergeLedgers } from '../../core/merge';
import type { BackupData } from '../lib/backup';
import { useAppStore } from './StoreProvider';

const STAMP_KEY = 'ilazo-last-synced-stamp';
/** Debounce after an edit — long enough to batch a burst of typing. */
const AFTER_EDIT_MS = 2500;
/** Quiet poll while the app is open, so the other phone's work turns up. */
const POLL_MS = 60_000;
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
  /** True while signed in — sync then runs by itself, with no user action. */
  autoSync: boolean;
  /** Google is the only sign-in method — no passwords are handled by this app. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Pull, merge, push. Safe to call any time. */
  syncNow(): Promise<void>;
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
  /** Local edits not yet pushed — decides who wins for edited fields on merge. */
  const dirtyRef = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One sync at a time: the edit debounce, the poll and the foreground hook
      can all come due together, and three concurrent merges would race. */
  const busyRef = useRef(false);

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

  /**
   * Pull, merge, push — a compare-and-swap.
   *
   * We read the cloud copy, merge it with this phone's ledger (union of
   * payments, coverage recomputed), write the result back only if the cloud
   * has not moved since we read it, and retry the whole merge if it has. That
   * way concurrent edits from the other phone are absorbed rather than
   * overwritten, and a race can never silently drop a payment.
   *
   * `quiet` marks an automatic run: it neither announces itself nor reports
   * failure, because a dropped signal is not something to interrupt the user
   * over — the next tick will pick it up.
   */
  const syncNow = useCallback(async (opts?: { quiet?: boolean }) => {
    const uid = session?.user?.id;
    if (!uid || busyRef.current) return;
    busyRef.current = true;
    if (!opts?.quiet) {
      setStatus('syncing');
      setMessage(null);
    }
    try {
      const deviceId = await getDeviceId();
      for (let attempt = 0; ; attempt++) {
        const remote = await fetchRemote();
        const local = snapshot();
        // A phone that has never synced has no claim to be the newer copy —
        // it may have been sitting on a months-old ledger. Its payments are
        // still merged in (the union never drops a transaction), but the
        // cloud wins wherever the two disagree about the same record. Without
        // this, signing in on a stale phone would quietly push that staleness
        // over a good copy before anyone could reach "Restore".
        const preferLocal = stampRef.current !== null && dirtyRef.current;
        const merged = remote ? mergeLedgers(local, remote.data, preferLocal) : local;
        try {
          const stamp = await pushRemote({
            userId: uid,
            data: merged,
            deviceId,
            expectedStamp: remote?.updatedAt ?? null,
          });
          // Only adopt the merged ledger once the write actually landed.
          if (remote) store.getState().importData(merged);
          dirtyRef.current = false;
          setStamp(stamp);
          setStatus('idle');
          setMessage('Synced');
          return;
        } catch (e) {
          // The other phone wrote between our read and our write — merge again.
          if (e instanceof ConflictError && attempt < 2) continue;
          throw e;
        }
      }
    } catch (e: any) {
      // An automatic run stays invisible; the next one will try again.
      if (opts?.quiet) return;
      setStatus('error');
      setMessage(e?.message ?? 'Sync failed');
    } finally {
      busyRef.current = false;
    }
  }, [session, snapshot, store, setStamp]);

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

  /**
   * The poll. With nothing to push, it asks only for the server's timestamp —
   * a single-column read — and stops there if the cloud has not moved. So the
   * common case (both phones idle) costs one tiny query a minute and writes
   * nothing, rather than re-uploading an unchanged ledger.
   */
  const autoTick = useCallback(async () => {
    if (!session?.user?.id || busyRef.current) return;
    if (!dirtyRef.current) {
      try {
        if ((await fetchRemoteStamp()) === stampRef.current) return; // nothing new either side
      } catch {
        return; // offline — leave the screen alone and retry next tick
      }
    }
    await syncNow({ quiet: true });
  }, [session, syncNow]);

  /**
   * The automatic loop. Everything that can produce or reveal a change is
   * wired to a sync: signing in, editing, opening the app, leaving it, and a
   * quiet timer for the case where both phones sit open at once.
   */
  useEffect(() => {
    if (!session) return;

    const afterEdit = () => {
      dirtyRef.current = true;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void syncNow({ quiet: true }), AFTER_EDIT_MS);
    };
    const unsub = store.subscribe(afterEdit);

    // The timer only runs while the app is actually on screen; polling a
    // backgrounded app would burn battery for changes nobody is looking at.
    let poll: ReturnType<typeof setInterval> | null = setInterval(() => void autoTick(), POLL_MS);
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    const appSub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') {
        void syncNow({ quiet: true }); // pick up whatever the other phone did
        if (!poll) poll = setInterval(() => void autoTick(), POLL_MS);
      } else {
        stopPoll();
        // Flush on the way out, but only if there is actually something to
        // flush — marking the ledger dirty every time the screen turns off
        // would cost a pointless upload on the next tick.
        if (dirtyRef.current) {
          if (pushTimer.current) clearTimeout(pushTimer.current);
          void syncNow({ quiet: true });
        }
      }
    });

    void syncNow({ quiet: true }); // and once on sign-in

    return () => {
      unsub();
      appSub.remove();
      stopPoll();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [session, store, syncNow, autoTick]);

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
        autoSync: !!session,
        signInWithGoogle,
        signOut,
        syncNow,
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
