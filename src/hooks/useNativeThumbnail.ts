import { useEffect, useState } from 'react';
import { TiebaNative } from '../../modules/tieba-native/src/TiebaNative';

const pendingThumbnails = new Map<string, Promise<string>>();
const TIEBA_REFERER = 'https://tieba.baidu.com/';

/**
 * Resolve a remote image through native ImageIO downsampling once per source
 * URI. The local JPEG is cached by TiebaImageIO and reused on later visits.
 */
export function useNativeThumbnail(
  sourceUri: string,
  width = 56,
  height = 56,
): string {
  const [uri, setUri] = useState('');

  useEffect(() => {
    if (!sourceUri) return;
    let cancelled = false;

    let promise = pendingThumbnails.get(sourceUri);
    if (!promise) {
      promise = TiebaNative.makeThumbnail(
        sourceUri,
        width,
        height,
        sourceUri,
        TIEBA_REFERER,
      ).catch((error: any) => {
        pendingThumbnails.delete(sourceUri);
        if (__DEV__) {
          console.warn('[TiebaImageIO] thumbnail failed:', error?.message ?? error);
        }
        // Keep the thumbnail usable when the native downloader is offline.
        return sourceUri;
      });
      if (pendingThumbnails.size >= 256) {
        const oldest = pendingThumbnails.keys().next().value;
        if (oldest) pendingThumbnails.delete(oldest);
      }
      pendingThumbnails.set(sourceUri, promise);
    }

    promise.then((result) => {
      if (!cancelled) setUri(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceUri, width, height]);

  return uri;
}
