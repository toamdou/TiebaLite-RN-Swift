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
    return { items: content, hasMore: content.length >= 20 };
  } catch (e) {
    if (__DEV__) console.warn('[userPost] proto failed, fallback:', e);
    const raw = extractData(await apiPost<any>(
      '/c/u/feed/userpost',
      { uid, pn: String(page), is_thread: isThread ? '1' : '0', rn: '20', need_content: '1' },
      undefined,
      signal,
    ));
    return { items: raw?.data?.content ?? raw?.content ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
  }
}

export async function userLikeForum(uid: string, page: number = 1, signal?: AbortSignal): Promise<{ items: ForumInfo[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/f/forum/like', { page_no: String(page), page_size: '50', uid }, signal);
  return { items: raw?.data?.forum_list ?? raw?.forum_list ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
}


