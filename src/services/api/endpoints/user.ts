import { apiPost } from '../client';
import { protoProfile, protoUserPost } from '../protoClient';
import { getUidSync } from '@/services/storage/AuthSQLiteStorage';
import { assertProtoSuccess, extractData, postFormAction } from './helpers';
import type { ForumInfo, UserProfile } from '@/types';
// ============================================================
// Profile — 对齐 Kotlin (POST, form-encoded)
// ============================================================
// Kotlin MiniTiebaApi: POST /c/u/user/profile {uid, need_post_count=1}
// Kotlin OfficialTiebaApi: POST /c/c/profile/modify {birthday_show_status, birthday_time, intro, sex, nick_name, stoken}
// Kotlin OfficialTiebaApi: POST /c/c/img/portrait (multipart, FORCE_LOGIN)

export async function profile(uid: string): Promise<UserProfile> {
  // Use protobuf API (mirrors Kotlin userProfileFlow)
  const selfUid = getUidSync() || '';
  const isSelf = selfUid === uid;

  const decoded = await protoProfile({
    selfUid: selfUid || uid,
    targetUid: uid,
    isSelf,
  });

  assertProtoSuccess(decoded);

  const u = decoded.data?.user ?? {};
  return {
    user: {
      id: String(u.id ?? u.uid ?? ''),
      name: u.name ?? u.user_name ?? '',
      nameShow: u.nameShow ?? u.name_show ?? u.show_nickname ?? u.showNickname ?? u.name ?? '',
      portrait: u.portrait ?? '',
      levelId: parseInt(String(u.levelId ?? u.level_id ?? '0'), 10),
      levelName: u.levelName ?? u.level_name ?? '',
      sex: parseInt(String(u.sex ?? u.gender ?? '0'), 10),
      intro: u.intro ?? '',
      fansNum: parseInt(String(u.fansNum ?? u.fans_num ?? '0'), 10),
      concernNum: parseInt(String(u.concernNum ?? u.concern_num ?? '0'), 10),
      postNum: parseInt(String(u.postNum ?? u.post_num ?? '0'), 10),
      totalAgreeNum: parseInt(String(u.totalAgreeNum ?? u.total_agree_num ?? '0'), 10),
      ipLocation: u.ipAddress ?? u.ip_address ?? u.ip_location ?? '',
      tbAge: parseFloat(String(u.tbAge ?? u.tb_age ?? '0')),
      isBawu: (u.isBawu ?? u.is_bawu) === 1,
      tiebaUid: String(u.tiebaUid ?? u.tieba_uid ?? u.id ?? uid),
      hasConcerned: parseInt(String(u.hasConcerned ?? u.has_concerned ?? '0'), 10),
      bazhuGrade: u.bazhuGrade ? { desc: String(u.bazhuGrade.desc ?? '') } : undefined,
      newGodData: u.newGodData ? {
        status: parseInt(String(u.newGodData.status ?? '0'), 10),
        fieldName: u.newGodData.fieldName ?? u.newGodData.field_name,
      } : undefined,
    },
    statue: {
      postsNum: parseInt(String(u.postNum ?? u.post_num ?? '0'), 10),
      threadsNum: parseInt(String(u.threadNum ?? u.thread_num ?? '0'), 10),
      concernForumsNum: parseInt(String(u.myLikeNum ?? u.my_like_num ?? '0'), 10),
    },
  };
}

export async function profileModify(params: Record<string, string | number | boolean>): Promise<{ success: boolean }> {
  await postFormAction('/c/c/profile/modify', params);
  return { success: true };
}

// ============================================================
// User Content — 对齐 Kotlin (POST, form-encoded)
// ============================================================
// Kotlin MiniTiebaApi: POST /c/u/feed/userpost {uid, pn, is_thread, rn=20, need_content=1}
// Kotlin MiniTiebaApi: POST /c/f/forum/like {page_no=1, page_size=50, uid, friend_uid, is_guest} (FORCE_LOGIN)

export async function userPost(uid: string, page: number = 1, isThread: boolean = false, signal?: AbortSignal): Promise<{ items: any[]; hasMore: boolean }> {
  try {
    const decoded = await protoUserPost({ uid, pn: page, isThread: isThread ? 1 : 0, needContent: 1 }, signal);
    assertProtoSuccess(decoded);
    const data = decoded.data;
    const content = data?.postList ?? [];
    return {
      items: content.map((i: any) => ({
        ...i,
        // proto 路径 content 是 PostInfoContent 对象（postContent: Abstract[]，type 为数值），
        // 归一化为 contentToText 可读的片段数组，避免回复行正文恒空（JSON 路径保持透传）。
        content:
          typeof i.content === 'string'
            ? i.content
            : Array.isArray(i.content)
              ? i.content
              : (i.content?.postContent ?? []).map((s: any) => ({ type: 'text', text: s.text ?? '' })),
      })),
      hasMore: content.length >= 20,
    };
  } catch (e) {
    if (__DEV__) console.warn('[userPost] proto failed, fallback:', e);
    const raw = extractData(await apiPost<any>(
      '/c/u/feed/userpost',
      { uid, pn: String(page), is_thread: isThread ? '1' : '0', rn: '20', need_content: '1' },
      undefined,
      signal,
    ));
    const content = raw?.data?.content ?? raw?.content ?? [];
    return {
      // JSON 回退路径：服务端下发 snake_case（tid / create_time / time），UI 读 item.createTime 恒空。
      // 此处映射为 UI 读取的 camelCase：id ← tid ?? id、createTime ← create_time ?? time。
      // 注意：与 proto 路径一致，createTime 保持秒级（UI 侧按秒 *1000 消费，userPost 不走毫秒契约）。
      // 其余字段（title / content / forum_name 等）原样透传；映射字段放在展开后，保证始终生效。
      items: (Array.isArray(content) ? content : []).map((i: any) => ({
        ...i,
        id: String(i.tid ?? i.id ?? ''),
        threadId: String(i.tid ?? i.thread_id ?? i.id ?? ''),
        createTime: Number(i.create_time ?? i.time ?? 0),
      })),
      hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
    };
  }
}

/**
 * 映射 /c/f/forum/like 的 forum_list 单条（snake_case）为 ForumInfo（camelCase）。
 * 与 forumFollowed.ts 的 mapForumInfo 同构，兼容服务端两种下发形态。
 */
function mapForumLikeItem(item: any): ForumInfo {
  return {
    forumId: String(item.forum_id ?? item.forumId ?? item.fid ?? ''),
    forumName: item.forum_name ?? item.forumName ?? '',
    name: item.forum_name ?? item.forumName ?? '',
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

export async function userLikeForum(uid: string, page: number = 1, signal?: AbortSignal): Promise<{ items: ForumInfo[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/f/forum/like', { page_no: String(page), page_size: '50', uid }, signal);
  const forumList = raw?.data?.forum_list ?? raw?.forum_list ?? [];
  return {
    // 新字段形状：forum_list 映射为 camelCase ForumInfo（旧实现透传 snake_case，UI 读 item.forumName / item.levelName 恒空）
    items: Array.isArray(forumList) ? forumList.map(mapForumLikeItem) : [],
    hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
  };
}


