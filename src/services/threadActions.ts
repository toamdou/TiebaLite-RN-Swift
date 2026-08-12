/**
 * Shared thread/post actions: share, copy link, report and delete.
 */

import { useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { hapticNotify, NotificationFeedbackType } from '@/utils/haptics';
import { checkReportPost, delPost, delThread } from '@/services/api/endpoints';
import { buildThreadUrl } from '@/utils';

export const THREAD_ACTION_ERRORS = {
  report: '举报失败',
  delete: '删除失败',
  copy: '复制失败',
};

export async function shareThread(threadId: string): Promise<void> {
  const url = buildThreadUrl(threadId);
  await Share.share({ message: url, url }, { dialogTitle: '分享帖子' });
}

export async function copyThreadLink(threadId: string): Promise<void> {
  await Clipboard.setStringAsync(buildThreadUrl(threadId));
}

export async function fetchThreadReportUrl(threadId: string): Promise<string> {
  return checkReportPost(threadId);
}

export async function deleteThreadAction(
  forumId: string,
  forumName: string,
  threadId: string,
): Promise<void> {
  await delThread(forumId, forumName, threadId);
}

export async function deletePostAction(
  forumId: string,
  forumName: string,
  threadId: string,
  postId: string,
): Promise<void> {
  await delPost(forumId, forumName, threadId, postId, true);
}

export function useThreadActions({
  threadId,
  forumId,
  forumName,
}: {
  threadId: string;
  forumId?: string;
  forumName?: string;
}) {
  const router = useRouter();

  const share = useCallback(async () => {
    try {
      await shareThread(threadId);
    } catch {
      // Sharing is best-effort.
    }
  }, [threadId]);

  const copy = useCallback(async () => {
    try {
      await copyThreadLink(threadId);
      hapticNotify(NotificationFeedbackType.Success);
      return true;
    } catch {
      hapticNotify(NotificationFeedbackType.Error);
      Alert.alert('错误', THREAD_ACTION_ERRORS.copy);
      return false;
    }
  }, [threadId]);

  const report = useCallback(
    async (postId?: string) => {
      try {
        const url = await fetchThreadReportUrl(postId || threadId);
        if (url) {
          router.push({
            pathname: '/webview',
            params: { url, title: '举报' },
          });
        } else {
          Alert.alert('提示', '当前帖子不支持在线举报');
        }
        return true;
      } catch {
        hapticNotify(NotificationFeedbackType.Error);
        Alert.alert('错误', THREAD_ACTION_ERRORS.report);
        return false;
      }
    },
    [threadId, router],
  );

  const remove = useCallback(
    async (postId?: string) => {
      const deletingThread = !postId || postId === threadId;
      try {
        if (deletingThread) {
          await deleteThreadAction(forumId || '', forumName || '', threadId);
        } else {
          await deletePostAction(forumId || '', forumName || '', threadId, postId);
        }
        hapticNotify(NotificationFeedbackType.Success);
        return true;
      } catch {
        hapticNotify(NotificationFeedbackType.Error);
        Alert.alert('错误', THREAD_ACTION_ERRORS.delete);
        return false;
      }
    },
    [threadId, forumId, forumName],
  );

  return { share, copy, report, remove };
}
