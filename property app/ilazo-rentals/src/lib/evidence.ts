/**
 * Payment-evidence images: picking (gallery/camera) and persisting.
 *
 * Picker results live in a temporary cache, so before a payment is saved the
 * images are copied into the app's document directory — they then survive
 * restarts and cache clears, and their URIs are stored on the transaction.
 */
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

const EVIDENCE_DIR = `${FileSystem.documentDirectory}evidence/`;

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

/** Copy picked images into permanent app storage; returns the stored URIs. */
export async function persistEvidence(uris: string[]): Promise<string[]> {
  if (uris.length === 0) return [];
  const dir = await FileSystem.getInfoAsync(EVIDENCE_DIR);
  if (!dir.exists) {
    await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
  }
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const src = uris[i];
    // Already persisted (e.g. editing flow) — keep as-is.
    if (src.startsWith(EVIDENCE_DIR)) {
      out.push(src);
      continue;
    }
    const extMatch = /\.(\w{3,4})(\?|$)/.exec(src);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const dest = `${EVIDENCE_DIR}ev-${Date.now()}-${i}.${ext}`;
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      out.push(dest);
    } catch {
      // If the copy fails keep the original URI rather than losing the attachment.
      out.push(src);
    }
  }
  return out;
}
