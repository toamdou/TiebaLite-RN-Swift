import { apiGetHybrid } from '../client';
import { TiebaApiError } from '../interceptors';
import { protoHotThreadList, protoPersonalized, protoTopicList, protoUserLike } from '../protoClient';
import { assertProtoSuccess, extractData, mapProtoThread, toMillis, type ClientDataRes } from './helpers';
import { LoadType } from '@/types';
import type { FeedItem, HotPageData, TopicInfo } from '@/types';
// ============================================================
// Feed — protobuf-aligned (Kotlin OfficialTiebaApi protobuf)
// ============================================================
// Kotlin protobuf: POST /c/f/excellent/personalized?cmd=309471

/** Map raw proto thread entries to FeedItem rows (proto + JSON fallback share this). */
function mapThreadItems(threadList: any[], userList: any[]): FeedItem[] {
  return threadList.map((t: any) => ({
    type: 'thread' as const,
    threadInfo: mapProtoThread(t, { userList }),
  }));
}

export async function personalized(loadType: LoadType = LoadType.REFRESH, page: number = 1, signal?: AbortSignal): Promise<{ items: FeedItem[]; hasMore: boolean }> {
  try {
    const decoded = await protoPersonalized({ loadType: Number(loadType), pn: page }, signal);
    assertProtoSuccess(decoded);
    const data = decoded.data;
    const items = mapThreadItems(data?.threadList ?? [], data?.userList ?? []);
    const hasMore = (data?.page?.hasMore ?? 0) === 1;
    return { items, hasMore };
  } catch (e) {
    if (__DEV__) console.warn('[personalized] proto failed, fallback:', e);
    const response = await apiGetHybrid<ClientDataRes<{ items: FeedItem[]; has_more: number }>>(
      '/c/f/personalized',
      {
        load_type: String(loadType), page_no: String(page), page_size: '20',
      },
      signal,
    );
    const data = extractData(response);
    return { items: data.data?.items ?? [], hasMore: data.data?.has_more === 1 };
  }
}

// Kotlin protobuf: POST /c/f/concern/userlike?cmd=309474
export async function userLike(
  pageTag?: string, lastRequestUnix?: number, loadType: LoadType = LoadType.REFRESH,
  signal?: AbortSignal,
): Promise<{ items: FeedItem[]; pageTag: string; hasMore: boolean }> {
  try {
    const decoded = await protoUserLike({
      loadType: Number(loadType),
      pageTag: pageTag ?? '',
      lastRequestUnix: lastRequestUnix ?? 0,
    }, signal);
    assertProtoSuccess(decoded);
    const data = decoded.data;
    const items = mapThreadItems(data?.threadList ?? [], data?.userList ?? []);
    return {
      items,
      pageTag: data?.pageTag ?? '',
      hasMore: (data?.hasMore ?? 0) === 1,
    };
  } catch (e) {
    if (__DEV__) console.warn('[userLike] proto failed, fallback:', e);
    const response = await apiGetHybrid<ClientDataRes<{ items: FeedItem[]; page_tag: string; has_more: number }>>(
      '/c/f/userLike',
      {
        load_type: String(loadType), page_tag: pageTag ?? '', last_request_unix: lastRequestUnix !== undefined ? String(lastRequestUnix) : '',
      },
      signal,
    );
    const data = extractData(response);
    return { items: data.data?.items ?? [], pageTag: data.data?.page_tag ?? '', hasMore: data.data?.has_more === 1 };
  }
}

// ============================================================
// Hot Threads & Topics — already protobuf-aligned ✅
// ============================================================

function mapHotTopic(t: any) {
  return {
    topicId: String(t.topicId ?? ''),
    topicName: String(t.topicName ?? ''),
    type: Number(t.type ?? 0),
    discussNum: Number(t.discussNum ?? 0),
    tag: Number(t.tag ?? 0),
    topicDesc: String(t.topicDesc ?? ''),
    topicPic: String(t.topicPic ?? ''),
  };
}

function mapHotTab(t: any) {
  return {
    tabId: Number(t.tabId ?? 0),
    tabType: Number(t.tabType ?? 0),
    tabName: String(t.tabName ?? ''),
    tabCode: String(t.tabCode ?? ''),
    tabUrl: String(t.tabUrl ?? ''),
    tabGid: String(t.tabGid ?? ''),
    tabTitle: String(t.tabTitle ?? ''),
    isGeneralTab: Number(t.isGeneralTab ?? 0),
  };
}

function mapHotThread(t: any) {
  return {
    id: String(t.id ?? ''),
    threadId: String(t.threadId ?? t.id ?? ''),
    title: String(t.title ?? ''),
    replyNum: Number(t.replyNum ?? 0),
    viewNum: Number(t.viewNum ?? 0),
    forumId: String(t.forumId ?? ''),
    forumName: String(t.forumName ?? ''),
    authorId: String(t.author?.id ?? t.authorId ?? ''),
    authorName: String(t.author?.name ?? ''),
    authorNameShow: String(t.author?.nameShow ?? ''),
    authorPortrait: String(t.author?.portrait ?? ''),
    firstPostId: String(t.firstPostId ?? ''),
    createTime: toMillis(Number(t.createTime ?? t.lastTimeInt ?? 0)),
    agreeNum: Number(t.agreeNum ?? 0),
    hotNum: Number(t.hotNum ?? 0),
    hasAgree: Number(t.agree?.hasAgree ?? 0),
    agree: t.agree
      ? {
          agreeNum: Number(t.agree.agreeNum ?? 0),
          hasAgree: Number(t.agree.hasAgree ?? 0),
          diffAgreeNum: Number(t.agree.diffAgreeNum ?? 0),
        }
      : undefined,
    tabId: Number(t.tabId ?? 0),
    tabName: String(t.tabName ?? ''),
  };
}

export async function hotThreadList(tabCode: string = 'all'): Promise<HotPageData> {
  const decoded = await protoHotThreadList(tabCode);
  // proto3: error_code=0 时不序列化，undefined 视为成功
  assertProtoSuccess(decoded);
  const data = decoded.data;
  if (!data) throw new TiebaApiError('Empty response', -1, -1);
  if (__DEV__) {
    console.log('[hotThreadList] raw lengths:', 'topicList=', (data.topicList ?? []).length, 'threadInfo=', (data.threadInfo ?? []).length, 'hotThreadTabInfo=', (data.hotThreadTabInfo ?? []).length);
    if ((data.threadInfo ?? []).length > 0) {
      console.log('[hotThreadList] first thread sample:', JSON.stringify(data.threadInfo![0]).slice(0, 300));
    }
  }
  return {
    topics: (data.topicList ?? []).map(mapHotTopic),
    tabs: (data.hotThreadTabInfo ?? []).map(mapHotTab),
    threads: (data.threadInfo ?? []).map(mapHotThread),
  };
}

function mapTopicInfo(t: any): TopicInfo {
  return {
    topicId: String(t.topicId ?? t.topic_id ?? ''),
    topicName: String(t.topicName ?? t.topic_name ?? ''),
    topicDesc: String(t.topicDesc ?? t.topic_desc ?? ''),
    discussNum: Number(t.discussNum ?? t.discuss_num ?? 0),
    isHot: (t.topicTag ?? t.topic_tag ?? t.tag) === 2,
    isNew: (t.topicTag ?? t.topic_tag ?? t.tag) === 1,
  };
}

export async function topicList(): Promise<TopicInfo[]> {
  const decoded = await protoTopicList();
  assertProtoSuccess(decoded);
  return (decoded.data?.topicList ?? decoded.data?.topic_list ?? []).map(mapTopicInfo);
}


