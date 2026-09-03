/**
 * Payment-evidence images, shared across devices.
 *
 * The bug this fixes: evidence was recorded as a device-local path
 * (`file:///data/user/0/.../evidence/ev-1788351343064-0.jpeg`) and that string
 * was what synced. The second phone received a path to a file it had never
 * had, and drew an empty tile. The path was also timestamp-named, so it did
 * not even identify the image — two phones could mint the same name for
 * different pictures.
 *
 * So the ledger now stores a KEY — a bare filename like `ev-m8x2k1-a7f3.jpg`,
 * with no directory in it — which means the same image on every device. The
 * bytes live in Supabase Storage under `<userId>/<key>`, and each phone keeps
 * a cache at `documentDirectory + evidence/<key>`.
 *
 * Transfers stream through the filesystem rather than base64: a signed URL
 * plus `FileSystem.uploadAsync`/`downloadAsync` never holds a whole photo in
 * JS memory.
 *
 * Everything here is best-effort. An image that cannot be fetched right now
 * leaves the ledger untouched and is retried on the next sync — losing a
 * thumbnail is never allowed to break a payment record.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import type { Txn } from '../../core/types';

export const EVIDENCE_BUCKET = 'ilazo-evidence';
const DIR = `${FileSystem.documentDirectory}evidence/`;

/** Patch for one transaction whose legacy URIs became keys. */
export interface EvidencePatch {
  id: string;
  evidence: string[];
}

export interface EvidenceSyncResult {
  uploaded: number;
  downloaded: number;
  /** Transactions whose evidence entries were rewritten to keys. */
  patches: EvidencePatch[];
  /** Stored images no longer referenced by any transaction. */
  pruned: number;
}

/**
 * A key is a bare filename. Anything with a slash is a path — either a legacy
 * stored URI or a freshly picked image still sitting in the picker's cache.
 */
export function isEvidenceKey(v: string): boolean {
  return !!v && !v.includes('/') && !v.includes(':');
}

export function localUriForKey(key: string): string {
  return DIR + key;
}

function extOf(uri: string): string {
  const m = /\.(\w{3,4})(?:\?|$)/.exec(uri);
  const e = (m ? m[1] : 'jpg').toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

function mimeOf(key: string): string {
  const e = extOf(key);
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'heic') return 'image/heic';
  return 'image/jpeg';
}

/** Collision-resistant without a uuid dependency: time base36 + randomness. */
export function newEvidenceKey(srcUri: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ev-${Date.now().toString(36)}-${rand}.${extOf(srcUri)}`;
}

/**
 * The key for migrating a legacy device-local path — its own filename.
 *
 * This MUST be derived, not minted. The legacy path already synced, so both
 * phones hold the identical string and both will try to migrate it; a random
 * key each time uploaded the same photo again on every pass. Deriving from the
 * filename makes the migration idempotent and makes the two phones agree on
 * the answer without talking to each other.
 */
export function keyForLegacyPath(path: string): string {
  const base = path.split('?')[0].split('/').pop() || '';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '');
  return safe && !safe.startsWith('.') ? safe : newEvidenceKey(path);
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

export async function hasLocal(key: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(localUriForKey(key))).exists;
  } catch {
    return false;
  }
}

/** Copy an arbitrary source image into the cache under `key`. */
export async function adoptLocalFile(srcUri: string, key: string): Promise<boolean> {
  try {
    await ensureDir();
    const dest = localUriForKey(key);
    if ((await FileSystem.getInfoAsync(dest)).exists) return true;
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    return true;
  } catch {
    return false;
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Upload the cached file for `key`. Overwrites, so retries are harmless. */
export async function uploadOne(userId: string, key: string): Promise<boolean> {
  try {
    const local = localUriForKey(key);
    if (!(await FileSystem.getInfoAsync(local)).exists) return false;

    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUploadUrl(`${userId}/${key}`, { upsert: true });
    if (error || !data?.signedUrl) return false;

    const res = await FileSystem.uploadAsync(data.signedUrl, local, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'content-type': mimeOf(key) },
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/** Fetch `key` into the local cache. */
export async function downloadOne(userId: string, key: string): Promise<boolean> {
  try {
    await ensureDir();
    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(`${userId}/${key}`, 60 * 60);
    if (error || !data?.signedUrl) return false;

    const res = await FileSystem.downloadAsync(data.signedUrl, localUriForKey(key));
    if (res.status >= 200 && res.status < 300) return true;
    // A failed download leaves a 0-byte or error-body file behind, which would
    // then render as a broken tile forever. Clear it so the next try refetches.
    await FileSystem.deleteAsync(localUriForKey(key), { idempotent: true });
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve an evidence entry to something <Image> can display.
 *
 * Legacy path entries are returned as-is (they still work on the phone that
 * made them). A key resolves to the cache, downloading once if this phone has
 * not seen the image yet.
 */
export async function resolveEvidence(entry: string): Promise<string | null> {
  if (!isEvidenceKey(entry)) return entry;
  if (await hasLocal(entry)) return localUriForKey(entry);
  const uid = await currentUserId();
  if (!uid) return null;
  return (await downloadOne(uid, entry)) ? localUriForKey(entry) : null;
}

function evidenceOf(t: Txn): string[] {
  return t.evidence ?? [];
}

/**
 * Reconcile every attachment with the cloud.
 *
 * One `list` call establishes what the account already holds, then each entry
 * is pushed, pulled, or migrated:
 *
 * - legacy path, file present  → becomes a key, uploaded, ledger patched
 * - legacy path, file missing  → left alone; the phone that owns the file will
 *                                migrate it, and guessing here would destroy
 *                                the only reference to it
 * - key, cached but not remote → uploaded
 * - key, remote but not cached → downloaded
 */
export async function syncEvidence(userId: string, txns: Txn[]): Promise<EvidenceSyncResult> {
  const out: EvidenceSyncResult = { uploaded: 0, downloaded: 0, patches: [], pruned: 0 };

  const { data: listed, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .list(userId, { limit: 1000 });
  if (error) return out;
  const remote = new Set((listed ?? []).map((o) => o.name));

  for (const t of txns) {
    const entries = evidenceOf(t);
    if (entries.length === 0) continue;

    let changed = false;
    const next: string[] = [];

    for (const entry of entries) {
      if (isEvidenceKey(entry)) {
        if (remote.has(entry)) {
          if (!(await hasLocal(entry)) && (await downloadOne(userId, entry))) out.downloaded++;
        } else if (await hasLocal(entry)) {
          if (await uploadOne(userId, entry)) {
            remote.add(entry);
            out.uploaded++;
          }
        }
        next.push(entry);
        continue;
      }

      // Legacy device-local path.
      let exists = false;
      try {
        exists = (await FileSystem.getInfoAsync(entry)).exists;
      } catch {
        exists = false;
      }
      if (!exists) {
        next.push(entry); // not ours to fix
        continue;
      }
      const key = keyForLegacyPath(entry);
      if ((await adoptLocalFile(entry, key)) && (await uploadOne(userId, key))) {
        remote.add(key);
        out.uploaded++;
        next.push(key);
        changed = true;
      } else {
        next.push(entry);
      }
    }

    if (changed) out.patches.push({ id: t.id, evidence: next });
  }

  out.pruned = await pruneOrphans(userId, txns, listed ?? []);
  return out;
}

/**
 * Delete stored images no transaction refers to any more.
 *
 * Only objects older than PRUNE_AFTER_MS are considered. The other phone may
 * have just uploaded an image whose ledger entry has not reached us yet, and
 * deleting that would destroy a fresh attachment; anything that has sat
 * unreferenced for a day is genuinely orphaned.
 */
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

async function pruneOrphans(
  userId: string,
  txns: Txn[],
  listed: { name: string; created_at?: string | null }[],
): Promise<number> {
  const referenced = new Set<string>();
  for (const t of txns) for (const e of evidenceOf(t)) referenced.add(e);

  const cutoff = Date.now() - PRUNE_AFTER_MS;
  const stale = listed
    .filter((o) => !referenced.has(o.name))
    .filter((o) => {
      const t = o.created_at ? Date.parse(o.created_at) : NaN;
      return Number.isFinite(t) && t < cutoff;
    })
    .map((o) => `${userId}/${o.name}`);

  if (stale.length === 0) return 0;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(stale);
  return error ? 0 : stale.length;
}
