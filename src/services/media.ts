/**
 * Shared media utilities: save to gallery and share downloaded files.
 */

import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { TiebaNative } from '../../modules/tieba-native/src/TiebaNative';

async function withWatermark(file: File, watermarkText: string): Promise<string> {
  if (!watermarkText) return file.uri;
  return TiebaNative.applyWatermark(file.uri, watermarkText);
}

function destinationFile(uri: string, prefix: string): File {
  const filename =
    uri.split('/').pop()?.split('?')[0]?.split('#')[0] ||
    `${prefix}_${Date.now()}.jpg`;
  return new File(Paths.cache, `${prefix}_${filename}`);
}

/** Download a remote file to cache and delete it in a finally block. */
async function withTempFile(
  uri: string,
  prefix: string,
  run: (file: File) => Promise<void>,
): Promise<void> {
  const file = await File.downloadFileAsync(uri, prefix === 'share_' ? destinationFile(uri, 'share_') : Paths.cache);
  try {
    await run(file);
  } finally {
    try {
      file.delete();
    } catch {
      // Best-effort cleanup.
    }
  }
}

/**
 * Save an image to the device photo library with write-only permission.
 */
export async function saveImageToGallery(
  uri: string,
  watermarkText = '',
): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  if (status !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }
  await withTempFile(uri, 'save_', async (file) => {
    await MediaLibrary.saveToLibraryAsync(await withWatermark(file, watermarkText));
  });
}

/**
 * Share a remote file. When sharing is unavailable on the device, the file
 * is still downloaded and its path is returned for callers to surface.
 */
export async function shareFile(
  uri: string,
  filename?: string,
  options?: { mimeType?: string; dialogTitle?: string; watermarkText?: string },
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('SHARE_UNAVAILABLE');
  }
  const target = filename
    ? new File(Paths.cache, filename)
    : destinationFile(uri, 'share_');
  const file = await File.downloadFileAsync(uri, target);
  try {
    const shareUri = await withWatermark(file, options?.watermarkText ?? '');
    await Sharing.shareAsync(shareUri, {
      mimeType: options?.mimeType ?? 'image/jpeg',
      dialogTitle: options?.dialogTitle ?? '分享',
    });
  } finally {
    try {
      file.delete();
    } catch {
      // Best-effort cleanup.
    }
  }
}
