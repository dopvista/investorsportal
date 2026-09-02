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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { ConflictError, fetchRemote, getDeviceId, pushRemote } from '../lib/cloud';
import type { BackupData } from '../lib/backup';
import { useAppStore } from './StoreProvider';

const STAMP_KEY = 'ilazo-last-synced-stamp';

export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'error' | 'conflict';

interface SyncContextValue {
  session: Session | null;
  email: string | null;
  status: SyncStatus;
  message: string | null;
  /** Server stamp of the snapshot this phone last agreed with. */
  lastSyncedAt: string | null;
  signIn(email: string, password: string): Promise<void>;
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

  const signIn = useCallback(async (em: string, password: string) => {
    setStatus('syncing');
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: em.trim(), password });
    if (error) {
      setStatus('signedOut');
      setMessage(error.message);
      throw new Error(error.message);
    }
    setStatus('idle');
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
        signIn,
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
