import { apiPost } from '../client';
import { TiebaApiError } from '../interceptors';
import { protoPbFloor, protoPbPage } from '../protoClient';
import { getUidSync } from '@/services/storage/AuthSQLiteStorage';
import {
  assertProtoSuccess,
  extractData,
  getStoken,
  mapProtoContent,
  mapProtoPosts,
  mapProtoThread,
  postFormAction,
  requireTbs,
  toMillis,
  type TiebaRes,
} from './helpers';
import type { FavoriteThread, PostInfo, SubPostInfo, ThreadInfo } from '@/types';

export async function pbPage(
  threadId: string, page: number = 1, postId?: string,
  seeLz: boolean = false, back: boolean = false, sortType: number = 0,
  signal?: AbortSignal,
): Promise<{ thread: ThreadInfo; posts: PostInfo[]; page: { current: number; total: number; hasMore: boolean } }> {
  const decoded = await protoPbPage({
    kz: threadId,
    pn: page,
    pid: postId,
    seeLz,
    back,
    sortType,
    // Kotlin proto pbPageFlow 的 st_type 默认空串（仅"提到我的/收藏"来源传非空值；
    // 'tb_frslist' 是 JSON 老接口的默认值，误用于 proto 端点会被服务端当特殊来源处理）。
    stType: '',
  }, signal);
  assertProtoSuccess(decoded);
  const data = decoded.data;
  // Kotlin PbPageRepository 兜底：首楼可能下发在 first_floor_post 而非 post_list
  const rawPosts = data?.postList ?? [];
  const posts = rawPosts.length > 0
    ? mapProtoPosts(rawPosts, threadId, data?.userList ?? [])
    : (data?.firstFloorPost ? mapProtoPosts([data.firstFloorPost], threadId, data?.userList ?? []) : []);
  // hasMore 用 currentPage < totalPage 推导，而非服务端 hasMore 字段（同
  // pbFloor）：越界 pn 时服务端返回 current 递增 + totalPage 不变，若直信
  // hasMore 会把"越界页也算还有下一页"，配合 loadMore 守卫层叠失效。
  const curPage = data?.page?.currentPage ?? page;
  const totPage = data?.page?.totalPage ?? data?.page?.totalCount ?? 0;
  return {
    // ⚠️ mapProtoThread 的 opts 结构是 { forum }：直接传 forum 对象会读不到
    // forum.avatar/forum.id → 吧头像、吧名、forumId 全空（remote 版引入）。
    thread: mapProtoThread(data?.thread, { forum: data?.forum }),
    posts,
    page: {
      current: curPage,
      total: totPage,
      hasMore: totPage > 0 ? curPage < totPage : (data?.page?.hasMore ?? 0) === 1,
    },
  };
}

// Kotlin protobuf: POST /c/f/pb/floor?cmd=302002&format=protobuf (v12)
export async function pbFloor(
  threadId: string, postId: string, forumId: string, page: number = 1, subPostId?: string,
  signal?: AbortSignal,
): Promise<{ posts: SubPostInfo[]; page: { current: number; total: number; hasMore: boolean } }> {
  const decoded = await protoPbFloor({
    kz: threadId,
    pid: postId,
    pn: page,
    forumId: forumId || undefined,
    subPostId: subPostId || undefined,
  }, signal);
  assertProtoSuccess(decoded);
  const data = decoded.data;
  const rawPosts = data?.subpostList ?? [];
  // Kotlin uses: page.current_page < page.total_page (NOT has_more field!)
  const pg = data?.page;
  const curPage = pg?.currentPage ?? page;
  const totPage = pg?.totalPage ?? 0;
  const computedHasMore = totPage > 0 ? curPage < totPage : (pg?.hasMore ?? 0) === 1;
  return {
    posts: rawPosts.map((item: any) => {
      // 判空内嵌 author（proto3 空对象 {} 问题，同 mapProtoThread/mapProtoPosts）
      const rawAuthor = item.author && typeof item.author === 'object' && Object.keys(item.author).length > 0
        ? item.author
        : undefined;
      const author = rawAuthor ?? {};
      return {
        id: String(item.id ?? ''),
        postId: String(item.postId ?? postId),
        authorId: String(item.authorId ?? author.id ?? ''),
        authorName: author.name ?? '',
        authorNameShow: author.nameShow ?? author.name ?? '',
        authorPortrait: author.portrait ?? '',
        authorLevelId: Number(author.levelId ?? 0) || undefined,
        content: mapProtoContent(item.content ?? []),
        createTime: toMillis(Number(item.time ?? 0)),
        replyToUserName: item.replyToUserName ?? '',
        // 楼中楼 IP 属地：proto 下发在 location.addr（投影白名单保留 location），
        // 旧实现只读 item.ipAddress（恒空）
        ipLocation: item.location?.addr ?? item.ipAddress ?? author.ipAddress ?? '',
        agreeNum: Number(item.agreeNum ?? item.agree?.agreeNum ?? 0),
        isAgree: (item.agree?.hasAgree ?? 0) === 1,
      };
    }),
    page: {
      current: curPage,
      total: totPage,
      hasMore: computedHasMore,
    },
  };
}

// ============================================================
// Posts — 仅保留删除/互动/收藏。发帖/回复已按产品要求移除。
// ============================================================
// Kotlin: POST /c/c/bawu/delpost (FORCE_LOGIN)
export async function delPost(
  forumId: string, forumName: string, threadId: string, postId: string, isFloor: boolean = false,
): Promise<{ success: boolean }> {
  const data = extractData(await apiPost<TiebaRes<unknown>>('/c/c/bawu/delpost', {
    fid: forumId, word: forumName, z: threadId, pid: postId, isfloor: isFloor ? '1' : '0',
    src: '1', is_vipdel: '0', delete_my_post: '1', tbs: await requireTbs(),
  }));
  return { success: data.code === 0 };
}

// Kotlin: POST /c/c/bawu/delthread (FORCE_LOGIN)
export async function delThread(forumId: string, forumName: string, threadId: string): Promise<{ success: boolean }> {
  const data = extractData(await apiPost<TiebaRes<unknown>>('/c/c/bawu/delthread', {
    fid: forumId, word: forumName, z: threadId, src: '1', is_vipdel: '0', delete_my_thread: '1', tbs: await requireTbs(),
  }));
  return { success: data.code === 0 };
}

// ============================================================
// Interactions — 对齐 Kotlin (POST, form-encoded, FORCE_LOGIN)
// ============================================================
// Kotlin: POST /c/c/agree/opAgree (FORCE_LOGIN) {thread_id, post_id, agree_type=2, obj_type=3, op_type, tbs, stoken}

export async function agree(threadId: string, postId: string, opType: number = 1): Promise<{ success: boolean }> {
  await postFormAction('/c/c/agree/opAgree', {
    thread_id: threadId, post_id: postId, agree_type: '2', obj_type: '3', op_type: String(opType), tbs: await requireTbs(), stoken: getStoken(),
  });
  return { success: true };
}

export async function disagree(threadId: string, postId: string, opType: number = 1): Promise<{ success: boolean }> {
  await postFormAction('/c/c/agree/opAgree', {
    thread_id: threadId, post_id: postId, agree_type: opType ? '5' : '2', obj_type: '3', op_type: opType ? '1' : '0', tbs: await requireTbs(), stoken: getStoken(),
  });
  return { success: true };
}

// Kotlin: POST /c/c/user/follow (FORCE_LOGIN) {portrait, tbs, from_type=2, in_live=0}
export async function followUser(portrait: string, tbs: string): Promise<{ success: boolean }> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法关注', 400, 400);
  }
  await postFormAction('/c/c/user/follow', {
    portrait, tbs, from_type: '2', in_live: '0', authsid: 'null', stoken: getStoken(),
  });
  return { success: true };
}

// Kotlin: POST /c/c/user/unfollow (FORCE_LOGIN) {portrait, tbs, from_type=2, in_live=0}
export async function unfollowUser(portrait: string, tbs: string): Promise<{ success: boolean }> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法取消关注', 400, 400);
  }
  await postFormAction('/c/c/user/unfollow', {
    portrait, tbs, from_type: '2', in_live: '0', authsid: 'null', stoken: getStoken(), timestamp: String(Date.now()),
  });
  return { success: true };
}

// ============================================================
// Favorites — 对齐 Kotlin (POST, FORCE_LOGIN)
// ============================================================
// Kotlin: POST /c/f/post/threadstore (rn=50, offset=page*50, user_id=uid)
// Kotlin: POST /c/c/post/addstore (data=json, tbs, stoken)
// Kotlin: POST /c/c/post/rmstore (tid, tbs, fid=null)

/**
 * 收藏列表项（新字段形状，NOTIFICATIONS-ADAPTER / 收藏 UI 侧按此消费）。
 * 服务端 store_list 为 snake_case，此处统一映射为 camelCase：
 * - id / tid / threadId 三别名等价（tid 为服务端主键，跳转统一用 id）
 * - collectTime / updateTime 经 toMillis 统一转毫秒（兼容秒/毫秒下发，不乘 1000）
 * - 向后兼容：仍满足旧 FavoriteThread 形状，UI 旧的 item.id / title / floor 读取保持有效
 */
export interface FavoriteStoreItem extends FavoriteThread {
  /** 服务端原始帖子 id（与 id / threadId 等价） */
  tid: string;
  /** 帖子 id 别名（跳转用） */
  threadId: string;
  /** 所属吧 id（forum_id） */
  forumId: string;
  /** 服务端 is_read（1 / '1' / true 已读） */
  isRead: boolean;
}

/** 映射服务端 store_list 单条（snake_case）为 UI camelCase 形状。 */
export function mapStoreItem(item: any): FavoriteStoreItem {
  const tid = String(item.tid ?? item.id ?? item.thread_id ?? '');
  return {
    id: tid,
    tid,
    threadId: String(item.thread_id ?? item.tid ?? item.id ?? tid),
    title: item.title ?? item.thread_title ?? '',
    forumName: item.forum_name ?? item.forumName ?? item.fname ?? '',
    forumId: String(item.forum_id ?? item.forumId ?? item.fid ?? ''),
    authorName: item.author_name ?? item.authorName ?? '',
    postId: String(item.post_id ?? item.postId ?? item.pid ?? ''),
    floor: Number(item.floor ?? 0),
    collectTime: toMillis(Number(item.collect_time ?? item.collectTime ?? 0)),
    updateTime: toMillis(Number(item.update_time ?? item.updateTime ?? 0)),
    latestReplyNum: Number(item.latest_reply_num ?? item.latestReplyNum ?? 0),
    isRead: item.is_read === 1 || item.is_read === '1' || item.is_read === true || item.isRead === 1 || item.isRead === true,
  };
}

export async function threadStore(page: number = 0, signal?: AbortSignal): Promise<{ items: FavoriteStoreItem[]; hasMore: boolean }> {
  // page 从 0 开始（与调用方 initialPage=0 对齐），offset=(page-1)*50，保证第 0 页被请求。
  const offset = Math.max(0, (page - 1)) * 50;
  // Kotlin OfficialTiebaApi: threadStoreFlow(rn, offset, stoken, user_id)
  const raw = await postFormAction<any>('/c/f/post/threadstore', {
    rn: '50', offset: String(offset), stoken: getStoken(), user_id: getUidSync() || '',
  }, signal);
  const storeList = raw?.data?.store_list ?? raw?.store_list ?? [];
  return {
    // 新字段形状：store_list 映射为 camelCase（旧实现直接透传 snake_case，UI 读 item.title 等恒空、formatCount(undefined) 崩溃、keyExtractor 全 undefined）
    items: Array.isArray(storeList) ? storeList.map(mapStoreItem) : [],
    hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
  };
}

export async function addStore(threadId: string, postId?: string): Promise<{ success: boolean }> {
  const dataObj = JSON.stringify([{ tid: threadId, pid: postId ?? '0', cid: '0', status: '0' }]);
  // Kotlin OfficialTiebaApi: addStoreFlow(data, stoken)
  await postFormAction('/c/c/post/addstore', {
    data: dataObj, stoken: getStoken(),
  });
  return { success: true };
}

export async function removeStore(threadId: string): Promise<{ success: boolean }> {
  // Kotlin OfficialTiebaApi: removeStoreFlow(tid, fid="null", tbs, stoken, user_id)
  await postFormAction('/c/c/post/rmstore', {
    tid: threadId, fid: 'null', tbs: await requireTbs(), stoken: getStoken(), user_id: getUidSync() || '',
  });
  return { success: true };
}
