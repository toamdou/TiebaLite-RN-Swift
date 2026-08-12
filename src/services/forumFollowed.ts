// 已关注吧列表统一数据源，对齐 Kotlin HomeViewModel.allForumGuideFlow()。

import { forumGuide } from '@/services/api/endpoints';
import { setBackgroundForums } from '@/services/nativeBackground';
import type { ForumInfo } from '@/types';

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const MAX_TOTAL = 1000;
const CONCURRENCY = 4;
const ROUND_TIMEOUT_MS = 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface FollowedCache {
  expiresAt: number;
  forums: ForumInfo[];
}

let followedCache: FollowedCache | null = null;
let inflightFetch: Promise<ForumInfo[]> | null = null;

function mapForumInfo(item: any): ForumInfo {
  return {
    forumId: String(item.forum_id ?? item.forumId ?? ''),
    forumName: item.forum_name ?? item.forumName ?? '',
    avatar: item.avatar ?? '',
    slogan: item.slogan ?? '',
    memberCount: Number(item.member_count ?? item.memberCount ?? 0),
    threadCount: Number(item.thread_count ?? item.threadCount ?? 0),
    levelName: item.level_name ?? item.levelName ?? '',
    levelId: Number(item.level_id ?? item.levelId ?? 0),
    isLike: item.is_like === '1' || item.is_like === 1 || item.isLike === true,
    isSign: item.is_sign === '1' || item.is_sign === 1 || item.isSign === true,
    signCount: item.sign_count != null || item.signCount != null
      ? Number(item.sign_count ?? item.signCount)
      : undefined,
  };
}

async function fetchPage(
  pageNo: number,
  signal: AbortSignal,
): Promise<{ forums: ForumInfo[]; hasMore: boolean }> {
  if (signal.aborted) {
    throw new Error('获取关注贴吧列表已取消');
  }

  // Kotlin allForumGuideFlow: sortType=3, callFrom=3, pageNo 从 1 开始。
  const response = await forumGuide(3, 3, pageNo, PAGE_SIZE, signal);
  const data = response?.data ?? response;
  const forumList = data?.like_forum ?? data?.likeForum ?? [];
  return {
    forums: forumList.map((item: any) => mapForumInfo(item)),
    hasMore: forumList.length >= PAGE_SIZE,
  };
}

async function fetchAllPages(signal: AbortSignal): Promise<ForumInfo[]> {
  const pageMap = new Map<number, ForumInfo[]>();
  const seenForumIds = new Set<string>();
  const startedAt = Date.now();
  let total = 0;
  let pageNo = 1;

  while (pageNo <= MAX_PAGES) {
    if (signal.aborted) {
      throw new Error('获取关注贴吧列表已取消');
    }
    if (Date.now() - startedAt > ROUND_TIMEOUT_MS) {
      throw new Error('获取关注贴吧列表超时，请稍后重试');
    }

    const batchPages = Array.from(
      { length: Math.min(CONCURRENCY, MAX_PAGES - pageNo + 1) },
      (_, index) => pageNo + index,
    );
    const batch = await Promise.all(
      batchPages.map((page) => fetchPage(page, signal)),
    );

    let batchHasMore = false;
    batch.forEach((result, index) => {
      const currentPage = batchPages[index];
      const pageForums: ForumInfo[] = [];
      for (const item of result.forums) {
        if (!item.forumId || seenForumIds.has(item.forumId)) continue;
        seenForumIds.add(item.forumId);
        pageForums.push(item);
        total += 1;
        if (total >= MAX_TOTAL) break;
      }
      pageMap.set(currentPage, pageForums);
      if (result.hasMore) batchHasMore = true;
    });

    if (!batchHasMore || total >= MAX_TOTAL) break;
    pageNo += CONCURRENCY;
  }

  const allForums: ForumInfo[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const forums = pageMap.get(page);
    if (forums) allForums.push(...forums);
  }
  return allForums;
}

/**
 * 有界并发拉取全部已关注吧，并缓存 5 分钟。
 * 并发上限为 CONCURRENCY；同一时间只有一个全量请求在途。
 */
export async function fetchAllFollowedForums(signal?: AbortSignal): Promise<ForumInfo[]> {
  const now = Date.now();
  if (followedCache && followedCache.expiresAt > now) {
    return [...followedCache.forums];
  }
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const forums = await fetchAllPages(controller.signal);
      followedCache = { expiresAt: Date.now() + CACHE_TTL_MS, forums };
      setBackgroundForums(
        forums.map((forum) => forum.forumId),
        forums.map((forum) => forum.forumName),
      );
      return forums;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

/** 关注/取关后主动失效缓存，下次读取重新拉取。 */
export function invalidateFollowedForumsCache(): void {
  followedCache = null;
}
