// The phone's side of report photos: the camera and gallery, the compression, the
// app's own folder, and the bucket. Owner: Daily Reporting (Anuradha). Issue #81
// PR 2, ADR-037. Everything else in reports/ talks to these through the small
// interfaces in photo-store.ts and photo-upload.ts, so it is tested without a
// phone. Expo APIs checked against the SDK 57 docs.

import type { SupabaseClient } from '@supabase/supabase-js';
import { File, Directory, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PhotoFiles } from './photo-store';
import type { PhotoStorage, UploadOutcome } from './photo-upload';

/** P1: the long side of a stored photo, in pixels, and the JPEG quality. */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.7;

export type PickResult =
  | { kind: 'picked'; uri: string }
  | { kind: 'cancelled' }
  | { kind: 'denied' }
  | { kind: 'failed' };

/**
 * Takes a photo or picks one, then shrinks and re-encodes it as a JPEG in the
 * app's cache. Asks the phone's permission first, once the screen has said why.
 * Never throws and never returns the error's text (ADR-029).
 */
export async function pickAndCompress(source: 'camera' | 'library'): Promise<PickResult> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { kind: 'denied' };

    // One image, no cropping, at full quality: compression is ours, below.
    const options = { mediaTypes: ['images' as const], allowsEditing: false, quality: 1 };
    const picked =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return { kind: 'cancelled' };

    const context = ImageManipulator.manipulate(asset.uri);
    // Only the long side is set, so the ratio holds; a small photo is not enlarged.
    if (Math.max(asset.width, asset.height) > PHOTO_MAX_SIDE) {
      context.resize(asset.width >= asset.height ? { width: PHOTO_MAX_SIDE } : { height: PHOTO_MAX_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    return { kind: 'picked', uri: saved.uri };
  } catch {
    return { kind: 'failed' };
  }
}

const FOLDER = 'report-photos';

/** The app's own folder, which the system does not clear (Paths.document). */
export const expoPhotoFiles: PhotoFiles = {
  async keep(sourceUri, photoId) {
    const folder = new Directory(Paths.document, FOLDER);
    folder.create({ idempotent: true, intermediates: true });
    const source = new File(sourceUri);
    const kept = new File(folder, `${photoId}.jpg`);
    source.copy(kept);
    const sizeBytes = kept.size;
    // The compressed copy in the cache is no longer needed.
    if (source.exists) source.delete();
    return { uri: kept.uri, sizeBytes };
  },
  async read(uri) {
    return new File(uri).bytes();
  },
  async remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};

const BUCKET = 'report-photos';

type StorageFailure = { status?: number | string; statusCode?: number | string; message?: string };

function codeOf(error: StorageFailure): number | null {
  const n = Number(error.statusCode ?? error.status);
  return Number.isFinite(n) ? n : null;
}

/**
 * The bucket, as the signed-in user. The session is read once, and refused if it
 * is not the photo author's, with that session's token sent as the header
 * (ADR-020, like the push). An existing object is a replay, not an error.
 */
export function supabasePhotoStorage(supabase: SupabaseClient): PhotoStorage {
  return {
    async upload(userId, path, bytes, contentType): Promise<UploadOutcome> {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session || session.user.id.toLowerCase() !== userId.toLowerCase()) {
        // Not this user's turn: the photo waits for its author to be signed in.
        return 'retry';
      }
      try {
        const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType,
          upsert: false,
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!error) return 'uploaded';
        const code = codeOf(error as StorageFailure);
        if (code === 409) return 'exists';
        // Policy, size and type refusals cannot be cured by trying again; 401 is an
        // expired token, which a later run's fresh session fixes.
        if (code !== null && code >= 400 && code < 500 && code !== 401 && code !== 408 && code !== 429) return 'refused';
        return 'retry';
      } catch {
        return 'retry';
      }
    },
  };
}
