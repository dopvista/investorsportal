/**
 * Cloud snapshot read/write.
 *
 * The whole persisted ledger ({units, txns, company}) is stored as one JSON
 * row per user in `ilazo_snapshots`. `updated_at` is stamped by the database,
 * never by the phone, so ordering can't drift with a wrong device clock.
 *
 * Conflict safety: the app remembers the `updated_at` it last saw. Before an
 * upload we re-read the server stamp — if it moved, another device wrote in the
 * meantime and we refuse to overwrite, surfacing the choice to the user instead
 * of silently discarding their work.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { BackupData } from './backup';

const TABLE = 'ilazo_snapshots';
const DEVICE_KEY = 'ilazo-device-id';

export interface RemoteSnapshot {
  data: BackupData;
  updatedAt: string;
  deviceId: string | null;
}

/** Stable per-install id so the UI can say which phone wrote last. */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `phone-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Full snapshot, or null when this account has never synced. */
export async function fetchRemote(): Promise<RemoteSnapshot | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at, device_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    data: data.data as BackupData,
    updatedAt: data.updated_at as string,
    deviceId: (data.device_id as string | null) ?? null,
  };
}

/** Just the server stamp — used for the pre-upload conflict check. */
export async function fetchRemoteStamp(): Promise<string | null> {
  const { data, error } = await supabase.from(TABLE).select('updated_at').maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.updated_at as string) ?? null;
}

export class ConflictError extends Error {
  constructor(public readonly remoteStamp: string) {
    super('The cloud copy was updated by another device.');
    this.name = 'ConflictError';
  }
}

/**
 * Upload the ledger. Throws ConflictError when the server has moved on since
 * `expectedStamp` — unless `force` is set (the user explicitly chose to
 * overwrite the cloud copy).
 */
export async function pushRemote(opts: {
  userId: string;
  data: BackupData;
  deviceId: string;
  expectedStamp: string | null;
  force?: boolean;
}): Promise<string> {
  const { userId, data, deviceId, expectedStamp, force } = opts;

  if (!force) {
    const current = await fetchRemoteStamp();
    // A row exists that we have not seen → another device wrote it.
    if (current && current !== expectedStamp) throw new ConflictError(current);
  }

  const { data: row, error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data, device_id: deviceId }, { onConflict: 'user_id' })
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return row.updated_at as string;
}
