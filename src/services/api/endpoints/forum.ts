import { apiGetWeb, apiPost } from '../client';
import { TiebaApiError, getTiebaError } from '../interceptors';
import {
  protoForumRuleDetail,
  protoGeneralTabList,
  protoGetBawuInfo,
  protoGetForumDetail,
  protoGetMemberInfo,
} from '../protoClient';
import {
  assertProtoSuccess,
  extractData,
  getStoken,
  getTbs,
  postFormAction,
  type TiebaRes,
} from './helpers';
import type { ForumDetail, SignResult } from '@/types';
// Kotlin OfficialTiebaApi.forumGuideFlow: POST /c/f/forum/forumGuide (form-encoded)
export async function forumGuide(
  sortType: number = 3,
  callFrom: number = 3,
  pageNo: number = 1,
  resNum: number = 50,
  signal?: AbortSignal,
): Promise<any> {
  return extractData(await apiPost(
    '/c/f/forum/forumGuide',
    {
      sort_type: String(sortType),
      call_from: String(callFrom),
      page_no: String(pageNo),
      res_num: String(resNum),
      top_forum_num: '0',
      tbs: getTbs(),
      stoken: getStoken(),
    },
    undefined,
    signal,
  ));
}

// Kotlin protobuf: POST /c/f/forum/getforumdetail?cmd=303021&format=protobuf (v12)
// forumDetail is the web GET endpoint used by the detail page and as the
// JSON fallback when the protobuf detail endpoint rejects.
export async function forumDetail(forumId: string): Promise<ForumDetail> {
  const response = await apiGetWeb<TiebaRes<ForumDetail>>('/mo/q/forumDetail', { fid: forumId });
  return extractData(response).data;
}

/**
 * Protobuf forum detail used by the forum info page. Falls back to the
 * legacy JSON endpoint when protobuf returns an error.
 */
export async function getForumDetail(forumId: string): Promise<unknown> {
  try {
    const decoded = await protoGetForumDetail({ forumId });
    assertProtoSuccess(decoded);
    return decoded.data?.forum ?? decoded.data ?? null;
  } catch (error) {
    if (__DEV__) console.warn('[getForumDetail] protobuf failed, fallback:', error);
    return forumDetail(String(forumId));
  }
}

export async function forumRuleDetail(forumId: string): Promise<any> {
  try {
    const decoded = await protoForumRuleDetail({ forumId });
    assertProtoSuccess(decoded);
    return decoded.data ?? decoded;
  } catch (e) {
    if (__DEV__) console.warn('[forumRuleDetail] proto failed, fallback:', e);
    return extractData(await apiGetWeb('/mo/q/forumRuleDetail', { fid: forumId }));
  }
}

// ============================================================
// Sign-in — 对齐 Kotlin (POST, FORCE_LOGIN)
// ============================================================
// Kotlin MiniTiebaApi: POST /c/c/forum/sign {kw, tbs}
// Kotlin OfficialTiebaApi: POST /c/c/forum/msign {forum_ids, tbs}

export async function sign(forumName: string, tbs: string, forumId?: string): Promise<SignResult> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法签到', 400, 400);
  }
  // Kotlin OfficialTiebaApi: signFlow(fid, kw, tbs) — includes fid
  const body: Record<string, string> = { kw: forumName, tbs };
  if (forumId) body.fid = forumId;
  const raw = extractData(await apiPost<any>('/c/c/forum/sign', body)).data;
  return {
    forumId: raw?.forum_id ?? forumId ?? '', forumName: raw?.forum_name ?? forumName, exp: raw?.exp ?? 0,
    signRank: raw?.sign_rank ?? 0, isSuccess: getTiebaError(raw) === null,
    errorCode: raw?.error_code ? parseInt(raw.error_code, 10) : undefined, errorMsg: raw?.error_msg,
  };
}

export async function mSign(forumIds: string[], tbs: string): Promise<SignResult[]> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法批量签到', 400, 400);
  }
  const raw = extractData(await apiPost<any>('/c/c/forum/msign', {
    forum_ids: forumIds.join(','), tbs, authsid: 'null', stoken: getStoken(), user_id: '',
  })).data;
  return (raw?.sign_list ?? []).map((item: any) => ({
    forumId: item.forum_id ?? '', forumName: item.forum_name ?? '', exp: item.exp ?? 0,
    signRank: item.sign_rank ?? 0, isSuccess: getTiebaError(item) === null,
    errorCode: item.error_code ? parseInt(item.error_code, 10) : undefined, errorMsg: item.error_msg,
  }));
}

// ============================================================
// Forum Protobuf APIs — NEW (对齐 Kotlin protobuf endpoints)
// ============================================================

// Kotlin protobuf: POST /c/f/forum/getBawuInfo?cmd=309477
export async function getBawuInfo(forumId: string): Promise<any> {
  const decoded = await protoGetBawuInfo({ forumId });
  assertProtoSuccess(decoded);
  return decoded.data ?? decoded;
}

// Kotlin protobuf: POST /c/f/forum/getMemberInfo?cmd=309479
export async function getMemberInfo(forumId: string): Promise<any> {
  const decoded = await protoGetMemberInfo({ forumId });
  assertProtoSuccess(decoded);
  return decoded.data ?? decoded;
}

// Kotlin protobuf: POST /c/f/frs/generalTabList?cmd=309480
export async function generalTabList(forumId: string, opts?: {
  tabType?: number; pn?: number; rn?: number; sortType?: number; tabName?: string; tabId?: number;
}, signal?: AbortSignal): Promise<any> {
  const decoded = await protoGeneralTabList({
    forumId,
    tabType: opts?.tabType,
    pn: opts?.pn ?? 1,
    rn: opts?.rn ?? 20,
    sortType: opts?.sortType,
    tabName: opts?.tabName,
    tabId: opts?.tabId,
  }, signal);
  assertProtoSuccess(decoded);
  return decoded.data ?? decoded;
}

// ============================================================
// Additional Form-Encoded APIs
// ============================================================

// Kotlin MiniTiebaApi: POST /c/c/forum/like (FORCE_LOGIN)
export async function likeForum(forumId: string, forumName: string, tbs: string): Promise<{ success: boolean }> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法关注贴吧', 400, 400);
  }
  await postFormAction('/c/c/forum/like', {
    fid: forumId, kw: forumName, tbs,
  });
  return { success: true };
}

// Kotlin OfficialTiebaApi: POST /c/c/forum/unfavolike (FORCE_LOGIN)
export async function unfavolike(forumId: string, forumName: string, tbs: string): Promise<{ success: boolean }> {
  if (!tbs) {
    throw new TiebaApiError('缺少 tbs，无法取消关注贴吧', 400, 400);
  }
  await postFormAction('/c/c/forum/unfavolike', {
    fid: forumId, kw: forumName, tbs, stoken: getStoken(),
  });
  return { success: true };
}

