/**
 * Payment-evidence images: picking (gallery/camera) and persisting.
 *
 * Picker results live in a temporary cache, so before a payment is saved the
 * image is copied into the app's document directory. What goes on the
 * transaction is the KEY (a bare filename), never the device path — a path
 * means nothing on the other phone. See lib/evidenceStore.ts.
 */
import * as ImagePicker from 'expo-image-picker';
import { adoptLocalFile, newEvidenceKey } from './evidenceStore';

/**
 * Pick an image from the gallery (screenshots, saved photos).
 *
 * Single selection on purpose: Android's system photo picker opens as a
 * compact half-sheet for single picks but takes over the full screen for
 * multi-select. Tap "Add image" again to attach more.
 */
export async function pickEvidenceImages(): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => a.uri);
}

/** Take a photo with the camera (e.g. of a paper receipt). */
export async function captureEvidencePhoto(): Promise<string[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (res.canceled) return [];
  return res.assets.map((a) => a.uri);
}

/**
 * Copy picked images into permanent app storage; returns their keys.
 *
 * The key is what the transaction stores and what syncs, so it is minted here
 * once and never derived from the device path again.
 */
export async function persistEvidence(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const src of uris) {
    const key = newEvidenceKey(src);
    // On a copy failure keep the original URI rather than losing the
    // attachment; the next sync retries the migration.
    out.push((await adoptLocalFile(src, key)) ? key : src);
  }
  return out;
}
