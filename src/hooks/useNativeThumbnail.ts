import { useEffect, useState } from 'react';
import { TiebaNative } from '../../modules/tieba-native/src/TiebaNative';
import { sanitizeUrl } from '@/utils';

const pendingThumbnails = new Map<string, Promise<string>>();
const TIEBA_REFERER = 'https://tieba.baidu.com/';

/**
 * Resolve a remote image through native ImageIO downsampling once per source
 * URI. The local JPEG is cached by TiebaImageIO and reused on later visits.
 * 入参统一升级为 https（ATS 禁止明文 HTTP，native URLSession 同样受约束）。
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
    const safeUri = sanitizeUrl(sourceUri);

    let promise = pendingThumbnails.get(safeUri);
    if (!promise) {
      promise = TiebaNative.makeThumbnail(
        safeUri,
        width,
        height,
        safeUri,
        TIEBA_REFERER,
      ).then((result) => {
        // 成功路径也释放条目：Map 只做并发去重，不驻留已完成 promise（原生侧已有磁盘缓存）
        pendingThumbnails.delete(safeUri);
        return result;
      }).catch((error: any) => {
        pendingThumbnails.delete(safeUri);
        if (__DEV__) {
          console.warn('[TiebaImageIO] thumbnail failed:', error?.message ?? error);
        }
        // Keep the thumbnail usable when the native downloader is offline.
        return safeUri;
      });
      if (pendingThumbnails.size >= 256) {
        const oldest = pendingThumbnails.keys().next().value;
        if (oldest) pendingThumbnails.delete(oldest);
      }
      pendingThumbnails.set(safeUri, promise);
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
