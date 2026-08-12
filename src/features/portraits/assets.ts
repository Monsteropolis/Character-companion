import { assetRepo } from '../../persistence/repositories';
import { persistedBase } from '../../domain/factories';
import { isAnimatedFormat, validateImage } from '../../engine/sprites';
import type { StoredAsset } from '../../domain/types';

/**
 * Image import.
 *
 * Two rules govern this file:
 *  - animated formats are stored byte-for-byte, because pushing a GIF through a canvas silently
 *    flattens it to a single frame;
 *  - sprite sheets are stored byte-for-byte too, because rescaling a sheet shifts every frame
 *    boundary and would break the grid the user just measured.
 * Everything else -- ordinary portraits -- is resized down, since a 12 MP phone photo in
 * IndexedDB is a real cost on a device that also has to hold a campaign's worth of data.
 */

export const MAX_PORTRAIT_DIMENSION = 1024;

export interface ImportResult {
  asset: StoredAsset;
  width: number;
  height: number;
}

export interface ImportOptions {
  /** Sprite sheets and animated images must keep their exact pixels. */
  preserveOriginal?: boolean;
  kind?: StoredAsset['kind'];
}

export async function importImage(
  file: File,
  characterId: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const check = validateImage(file);
  if (!check.ok) throw new Error(check.reason ?? 'That image cannot be used.');

  const preserve =
    options.preserveOriginal || isAnimatedFormat(file.type) || options.kind === 'sprite';

  // Dimensions are only needed to decide whether to downscale. Preserved files skip the
  // measurement entirely, which avoids decoding a multi-megabyte sheet for no reason.
  const dimensions = preserve ? { width: 0, height: 0 } : await readDimensions(file);
  const blob = preserve ? file : await downscale(file, dimensions);

  const asset: StoredAsset = {
    ...persistedBase(),
    characterId,
    kind: options.kind ?? 'portrait',
    mimeType: file.type,
    blob,
    width: dimensions.width,
    height: dimensions.height,
  };

  return { asset: await assetRepo.save(asset), ...dimensions };
}

export const DIMENSION_TIMEOUT_MS = 5000;

/**
 * Natural dimensions of an image file. Needed before a sprite grid can be derived.
 *
 * Resolves to zeroes rather than hanging or rejecting when measurement is impossible. A decoder
 * that fires neither `load` nor `error` would otherwise leave the upload spinning forever, and
 * dimensions are only a convenience -- the grid can always be entered by hand.
 */
export function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const unavailable =
      typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function';
    if (unavailable) {
      resolve({ width: 0, height: 0 });
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;

    const finish = (result: { width: number; height: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish({ width: 0, height: 0 }), DIMENSION_TIMEOUT_MS);

    img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => finish({ width: 0, height: 0 });
    img.src = url;
  });
}

/**
 * Shrinks an oversized still image.
 *
 * Returns the original untouched when it is already small enough or when canvas is unavailable,
 * so a failure here degrades to "stored at full size" rather than losing the upload.
 */
async function downscale(
  file: File,
  dimensions: { width: number; height: number },
): Promise<Blob> {
  const { width, height } = dimensions;
  const longest = Math.max(width, height);
  if (longest === 0 || longest <= MAX_PORTRAIT_DIMENSION) return file;
  if (typeof document === 'undefined') return file;

  try {
    const scale = MAX_PORTRAIT_DIMENSION / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;

    const bitmap = await createImageBitmap(file);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Object URLs for a set of blob ids.
 *
 * Revoked when the set changes or the component unmounts; skipping that leaks the whole image
 * into memory for the session, which matters when a sprite sheet is several megabytes.
 */
export async function resolveBlobUrls(blobIds: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const id of blobIds) {
    const asset = await assetRepo.get(id);
    const url = toObjectUrl(asset?.blob);
    if (url) urls.set(id, url);
  }
  return urls;
}

/**
 * Object URL for a stored blob, or null when it cannot be resolved.
 *
 * A record whose blob is missing or malformed -- a partial import, a storage quirk -- must
 * degrade to the initials placeholder rather than throwing and taking the whole sheet down
 * with it. The image is the least important thing on a character sheet.
 */
export function toObjectUrl(blob: unknown): string | null {
  if (!(blob instanceof Blob)) return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
