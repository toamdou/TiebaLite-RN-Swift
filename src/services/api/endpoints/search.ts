import { apiPost } from '../client';
import { getTiebaError } from '../interceptors';
import { protoSearchSug } from '../protoClient';
import { searchClient } from '../searchClient';
import type {
  SearchForumResult,
  SearchPostResult,
  SearchThreadResult,
  SearchUserResult,
} from '@/types';
import { SearchThreadFilter, SearchThreadOrder } from '@/types';
// ============================================================
// Search — already aligned ✅
// ============================================================

function toArray(val: any): any[] { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); }
function toExact(val: any): any | null { if (!val || Array.isArray(val)) return null; return val; }
const mapForumItem = (item: any): SearchForumResult => ({ forumId: String(item.forum_id ?? ''), forumName: item.forum_name ?? '', avatar: item.avatar ?? '', memberCount: parseInt(String(item.concern_num ?? '0'), 10), threadCount: parseInt(String(item.post_num ?? '0'), 10), isLike: (item.has_concerned ?? 0) === 1 });

export async function searchForum(keyword: string, signal?: AbortSignal): Promise<SearchForumResult[]> {
  const raw = (
    await searchClient.get<any>('/mo/q/search/forum', {
      params: { word: keyword },
      signal,
    })
  ).data;
  const data = raw.data ?? raw;
  const res: SearchForumResult[] = [];
  const exact = toExact(data.exact_match ?? data.exactMatch);
  if (exact) res.push(mapForumItem(exact));
  for (const item of toArray(data.fuzzy_match ?? data.fuzzyMatch ?? data)) res.push(mapForumItem(item));
  return res;
}

export async function searchThread(keyword: string, page: number = 1, order: SearchThreadOrder = SearchThreadOrder.NEW_FIRST, filter: SearchThreadFilter = SearchThreadFilter.ALL, signal?: AbortSignal): Promise<{ items: SearchThreadResult[]; hasMore: boolean; currentPage: number }> {
  const raw = (
    await searchClient.get<any>('/mo/q/search/thread', {
      params: { word: keyword, pn: page, st: order, tt: filter, rn: 20, ct: 1, cv: '99.9.101' },
      signal,
    })
  ).data;
  const data = raw.data ?? raw;
  const list: any[] = data.post_list ?? data.postList ?? [];
  return {
    items: list.map((i: any) => ({
      id: String(i.tid ?? ''),
      title: i.title ?? '',
      forumName: i.forum_name ?? i.forumInfo?.forum_name ?? '',
      forumAvatar: i.forum_info?.avatar ?? i.forumInfo?.avatar ?? '',
      authorName: i.user?.user_name ?? i.user?.userName ?? '',
      authorNameShow: i.user?.show_nickname ?? i.user?.showNickname ?? '',
      authorPortrait: i.user?.portrait ?? '',
      replyNum: parseInt(String(i.post_num ?? '0'), 10),
      likeNum: parseInt(String(i.like_num ?? '0'), 10),
      shareNum: parseInt(String(i.share_num ?? '0'), 10),
      createTime: typeof i.modified_time === 'number' ? i.modified_time : parseInt(String(i.time ?? '0'), 10),
      content: i.content ?? '',
      media: (i.media ?? []).map((m: any) => ({
        type: m.type ?? 'pic',
        width: parseInt(String(m.width ?? '0'), 10) || 300,
        height: parseInt(String(m.height ?? '0'), 10) || 300,
        bigPic: m.big_pic ?? m.bigPic ?? '',
        smallPic: m.small_pic ?? m.smallPic ?? '',
        waterPic: m.water_pic ?? m.waterPic ?? '',
        src: m.src ?? '',
        vsrc: m.vsrc ?? '',
      })),
      mainPost: i.main_post ? {
        title: i.main_post.title ?? '',
        content: i.main_post.content ?? '',
        user: i.main_post.user ? {
          userName: i.main_post.user.user_name ?? i.main_post.user.userName ?? '',
          showNickname: i.main_post.user.show_nickname ?? i.main_post.user.showNickname,
          userId: String(i.main_post.user.user_id ?? i.main_post.user.userId ?? ''),
          portrait: i.main_post.user.portrait ?? '',
        } : undefined,
        likeNum: i.main_post.like_num ?? i.main_post.likeNum,
        shareNum: i.main_post.share_num ?? i.main_post.shareNum,
        postNum: i.main_post.post_num ?? i.main_post.postNum,
        media: (i.main_post.media ?? []).map((m: any) => ({
          type: m.type ?? 'pic',
          width: parseInt(String(m.width ?? '0'), 10) || 300,
          height: parseInt(String(m.height ?? '0'), 10) || 300,
          bigPic: m.big_pic ?? m.bigPic ?? '',
          smallPic: m.small_pic ?? m.smallPic ?? '',
          waterPic: m.water_pic ?? m.waterPic ?? '',
          src: m.src ?? '',
          vsrc: m.vsrc ?? '',
        })),
      } : undefined,
      postInfo: i.post_info ? {
        tid: i.post_info.tid,
        pid: i.post_info.pid,
        title: i.post_info.title ?? '',
        content: i.post_info.content ?? '',
        user: i.post_info.user ? {
          userName: i.post_info.user.user_name ?? i.post_info.user.userName ?? '',
          showNickname: i.post_info.user.show_nickname ?? i.post_info.user.showNickname,
          userId: String(i.post_info.user.user_id ?? i.post_info.user.userId ?? ''),
          portrait: i.post_info.user.portrait ?? '',
        } : undefined,
      } : undefined,
    })),
    // Kotlin uses requested page+1 for currentPage tracking, NOT server response
    // Align: return requested page so store can use it directly
    hasMore: (data.has_more ?? 0) === 1,
    currentPage: page,
  };
}

export async function searchUser(keyword: string, signal?: AbortSignal): Promise<SearchUserResult[]> {
  const raw = (
    await searchClient.get<any>('/mo/q/search/user', {
      params: { word: keyword },
      signal,
    })
  ).data;
  const data = raw.data ?? raw;
  const mapUser = (item: any): SearchUserResult => ({ uid: String(item.id ?? item.user_id ?? ''), name: item.name ?? item.user_name ?? '', nameShow: item.show_nickname ?? item.name_show ?? item.name ?? '', portrait: item.portrait ?? '', intro: item.intro ?? '', fansNum: parseInt(String(item.fans_num ?? '0'), 10) });
  const res: SearchUserResult[] = [];
  const exact = toExact(data.exact_match ?? data.exactMatch);
  if (exact) res.push(mapUser(exact));
  for (const item of toArray(data.fuzzy_match ?? data.fuzzyMatch ?? data.user_list ?? data)) res.push(mapUser(item));
  return res;
}

export async function searchPost(_forumId: string, keyword: string, forumName: string = '', page: number = 1, sortType: number = 1, isOnlyThread: number = 0, signal?: AbortSignal): Promise<{ items: SearchPostResult[]; hasMore: boolean }> {
  const raw = (await apiPost<any>(
    '/c/s/searchpost',
    { word: keyword, kw: forumName, pn: page, rn: 30, only_thread: isOnlyThread, sm: sortType },
    undefined,
    signal,
  )).data;
  const d: any = raw.data ?? {};
  const list: any[] = Array.isArray(d) ? d : (d.post_list ?? []);
  return { items: list.map((i: any) => ({ id: String(i.tid ?? ''), title: i.title ?? '', content: i.content ?? '', authorName: i.user?.user_name ?? '', authorId: String(i.user?.user_id ?? ''), forumName: i.forum_name ?? '', createTime: parseInt(String(i.time ?? '0'), 10), replyNum: parseInt(String(i.post_num ?? '0'), 10) })), hasMore: (d.has_more ?? list.length >= 30) ? true : false };
}

// ============================================================
// Search Suggestions — 对齐 Kotlin protobuf searchSug
// ============================================================
// Kotlin: POST /c/s/searchSug?cmd=309438&format=protobuf (V12, needSToken=true)

export async function searchSuggestions(keyword: string, isForum: boolean = false, signal?: AbortSignal): Promise<{ list: string[]; forumList: any[] }> {
  try {
    const decoded = await protoSearchSug({ word: keyword, isForum }, signal);
    if (getTiebaError(decoded)) {
      return { list: [], forumList: [] };
    }
    return {
      list: decoded.data?.list ?? [],
      forumList: (decoded.data?.forumList ?? []).map((f: any) => ({
        forumId: String(f.forumId ?? f.forum_id ?? ''),
        forumName: f.forumName ?? f.forum_name ?? '',
        avatar: f.avatar ?? '',
        memberCount: Number(f.memberCount ?? f.member_count ?? 0),
        threadCount: Number(f.threadCount ?? f.thread_count ?? 0),
      })),
    };
  } catch (e) {
    // Fallback: return empty on network error
    if (__DEV__) console.warn('[searchSuggestions] failed:', e);
    return { list: [], forumList: [] };
  }
}


