/**
 * Backup & restore: export the whole ledger to a shareable JSON file, and
 * parse a backup file back into the app's { units, txns, company } shape.
 *
 * The persisted source of truth is exactly { units, txns, company } (see
 * store/createStore.ts), so a backup is just that object wrapped with a small
 * header. Importing replaces the current ledger — this is how you move data
 * from one phone to another: Export on the old phone, share the file across,
 * Import on the new phone.
 *
 * Note: payment-evidence images are stored as private on-device file URIs; a
 * JSON backup carries the ledger (units/txns/company) but not the image files.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Company, Txn, Unit } from '../../core/types';

export interface BackupData {
  units: Unit[];
  txns: Txn[];
  company: Company;
}

export interface BackupFile {
  app: 'ilazo-rentals';
  kind: 'backup';
  version: 1;
  exportedAt: string; // ISO datetime
  data: BackupData;
}

export function buildBackup(data: BackupData): BackupFile {
  return {
    app: 'ilazo-rentals',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { units: data.units, txns: data.txns, company: data.company },
  };
}

/** Write the backup to a temp file and open the OS share sheet. */
export async function exportBackup(data: BackupData): Promise<void> {
  const json = JSON.stringify(buildBackup(data), null, 2);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const uri = `${FileSystem.cacheDirectory}ilazo-backup-${stamp}.json`;
  await FileSystem.writeAsStringAsync(uri, json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Ilazo Rentals backup',
      UTI: 'public.json',
    });
  }
}

/**
 * Validate + unwrap a backup file's JSON text. Accepts either the wrapped
 * BackupFile or a bare { units, txns, company } object. Throws on anything
 * that isn't a recognisable Ilazo backup.
 */
export function parseBackup(jsonText: string): BackupData {
  let obj: any;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const data = obj && typeof obj === 'object' && obj.data ? obj.data : obj;
  const ok =
    data &&
    typeof data === 'object' &&
    Array.isArray(data.units) &&
    Array.isArray(data.txns) &&
    data.company &&
    typeof data.company === 'object' &&
    typeof data.company.name === 'string';
  if (!ok) throw new Error('That is not an Ilazo Rentals backup file.');
  return { units: data.units, txns: data.txns, company: data.company };
}
