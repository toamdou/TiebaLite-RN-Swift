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
    stType: 'tb_frslist',
  }, signal);
  assertProtoSuccess(decoded);
  const data = decoded.data;
  return {
    thread: mapProtoThread(data?.thread, data?.forum),
    posts: mapProtoPosts(data?.postList ?? [], threadId, data?.userList ?? []),
    page: { current: data?.page?.currentPage ?? page, total: data?.page?.totalPage ?? data?.page?.totalCount ?? 0, hasMore: (data?.page?.hasMore ?? 0) === 1 },
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
  if (__DEV__) {
    console.log(`[pbFloor] response: subpostList.length=${rawPosts.length}, curPage=${curPage}, totPage=${totPage}, hasMore=${computedHasMore}, rawHasMore=${pg?.hasMore}`);
  }
  return {
    posts: rawPosts.map((item: any) => {
      const author = item.author ?? {};
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
        ipLocation: item.ipAddress ?? author.ipAddress ?? '',
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

export async function threadStore(page: number = 0, signal?: AbortSignal): Promise<{ items: FavoriteThread[]; hasMore: boolean }> {
  // page 从 0 开始（与调用方 initialPage=0 对齐），offset=(page-1)*50，保证第 0 页被请求。
  const offset = Math.max(0, (page - 1)) * 50;
  // Kotlin OfficialTiebaApi: threadStoreFlow(rn, offset, stoken, user_id)
  const raw = await postFormAction<any>('/c/f/post/threadstore', {
    rn: '50', offset: String(offset), stoken: getStoken(), user_id: getUidSync() || '',
  }, signal);
  return { items: raw?.data?.store_list ?? raw?.store_list ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
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
