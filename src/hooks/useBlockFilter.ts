import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { BlockManager } from '@/utils/BlockManager';
import { contentToText } from '@/utils';
import {
  getBlockFilterSnapshot,
  refreshBlockFilter,
  subscribeBlockFilter,
} from '@/utils/blockFilterSync';

export function useBlockFilter() {
  const { blockedWords, blockedUsers } = useSyncExternalStore(
    subscribeBlockFilter,
    getBlockFilterSnapshot,
  );

  useEffect(() => {
    refreshBlockFilter().catch(() => {});
  }, []);

  const refresh = useCallback(() => refreshBlockFilter(), []);

  const filterPosts = useCallback(
    <T extends { content?: any; authorId?: string; authorName?: string }>(
      posts: T[],
    ): T[] => {
      if (blockedWords.length === 0 && blockedUsers.length === 0) return posts;
      return posts.filter((post) => {
        const contentText = contentToText(post.content);
        if (BlockManager.shouldBlockContent(contentText, blockedWords)) return false;
        if (post.authorId && BlockManager.shouldBlockUser(post.authorId, post.authorName || null, blockedUsers)) return false;
        return true;
      });
    },
    [blockedWords, blockedUsers],
  );

  /** Check if a single content element (text/emoji) is blocked. Aligns with Kotlin BlockableContent. */
  const isContentBlocked = useCallback(
    (contentItem: any): boolean => {
      if (blockedWords.length === 0) return false;
      const text = contentItem?.text || '';
      if (!text) return false;
      return BlockManager.shouldBlockContent(text, blockedWords);
    },
    [blockedWords],
  );

  return {
    blockedWords,
    blockedUsers,
    filterPosts,
    isContentBlocked,
    refresh,
  };
}
