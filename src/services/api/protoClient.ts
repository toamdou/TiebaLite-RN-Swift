// ============================================================
// TiebaLite RN — Protobuf Multipart API Client
//
// Handles POST requests to tiebac.baidu.com with multipart/form-data
// body containing protobuf-encoded request data.
//
// Mirrors Kotlin:
//   RetrofitTiebaApi.OFFICIAL_PROTOBUF_TIEBA_API (tiebac.baidu.com)
//   buildProtobufRequestBody() → multipart form body
//   CommonParamInterceptor → adds common params to form fields
//   SortAndSignInterceptor → signs form fields
//
// iOS native transport — protobuf encode/decode, multipart and URLSession
// all run inside the TiebaNative module.
// ============================================================

import { TIEBAC, buildCommonParams, buildProtoCommonRequest, COMMON_HEADERS, getCuid, DEFAULT_TIMEOUT, CLIENT_VERSION_V12 } from './config';
import { buildCookieHeader } from './cookies';
import { buildProtobufFormFields } from './multipart';
import { TiebaNative } from '../../../modules/tieba-native/src/TiebaNative';
import { getStoken, getUid } from './authState';
import {
  encodeHotThreadListRequest,
  encodeTopicListRequest,
  encodeFrsPageRequest,
  encodePbPageRequest,
  encodePbFloorRequest,
  encodeProfileRequest,
  encodeSearchSugRequest,
  // New APIs
  encodeGetBawuInfoRequest,
  encodeGetLevelInfoRequest,
  encodeGetMemberInfoRequest,
  encodeForumRuleDetailRequest,
  encodeGeneralTabListRequest,
  encodeGetHistoryForumRequest,
  encodeForumRecommendRequest,
  encodePersonalizedRequest,
  encodeUserLikeRequest,
  encodeUserPostRequest,
  encodeGetUserInfoRequest,
  encodeThreadListRequest,
  encodeGetForumDetailRequest,
  encodeGetDislikeListRequest,
} from './proto';
import type {
  ProtoCommonRequest,
  DecodedHotThreadListResponse,
  DecodedTopicListResponse,
  DecodedFrsPageResponse,
  DecodedPbPageResponse,
  DecodedPbFloorResponse,
  DecodedProfileResponse,
  DecodedSearchSugResponse,
  // New APIs
  DecodedGetBawuInfoResponse,
  DecodedGetLevelInfoResponse,
  DecodedGetMemberInfoResponse,
  DecodedForumRuleDetailResponse,
  DecodedGeneralTabListResponse,
  DecodedGetHistoryForumResponse,
  DecodedForumRecommendResponse,
  DecodedPersonalizedResponse,
  DecodedUserLikeResponse,
  DecodedUserPostResponse,
  DecodedGetUserInfoResponse,
  DecodedThreadListResponse,
  DecodedGetForumDetailResponse,
  DecodedGetDislikeListResponse,
} from './proto';
import { TiebaApiError, TiebaErrorCode, handleAuthExpired } from './interceptors';

// -----------------------------------------------------------
// Generic protobuf POST
// -----------------------------------------------------------

/**
 * POST a protobuf-encoded request to the Tieba protobuf API.
 *
 * @param path - API path (e.g., '/c/f/forum/hotThreadList')
 * @param cmd - cmd query param (e.g., '309661')
 * @param protoCommon - CommonRequest for embedding in protobuf data
 * @param encodeFn - Function to encode the specific request protobuf
 */
async function protoPost<T>(
  path: string,
  cmd: string,
  protoCommon: ProtoCommonRequest,
  encodeFn: (common: ProtoCommonRequest) => string,
  responseTypePath: string,
  opts?: {
    v12?: boolean;
    needSToken?: boolean;
    extraHeaders?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const isV12 = opts?.v12 ?? false;

  // 1. Build form fields
  //    Kotlin V12 API (OFFICIAL_PROTOBUF_TIEBA_V12_API): NO CommonParamInterceptor!
  //    Form body only contains what buildProtobufRequestBody() adds:
  //      - V12: NO _client_version (skipped for V12/V12_POST)
  //      - stoken: only if needSToken=true
  //    NOTE: Server may require at least 1 form field for multipart parsing,
  //    so we ALWAYS include stoken for V12 (even if Kotlin passes needSToken=false).
  //    Kotlin V11 API: CommonParamInterceptor adds ALL params + sign
  let formFields: [string, string][];
  if (isV12) {
    // V12: minimal form body — stoken only (no common params, no sign)
    formFields = [];
    const stoken = getStoken();
    if (stoken) formFields.push(['stoken', stoken]);
  } else {
    // V11: all common params (matches Kotlin defaultCommonParamInterceptor chain)
    const commonParams = buildCommonParams();
    formFields = buildProtobufFormFields(commonParams);
  }

  // 2. Encode the request protobuf data (native codec)
  const protoData = encodeFn(protoCommon);

  const uid = getUid();
  const cookieStr = buildCookieHeader({ protoVariant: isV12 ? 'v12' : 'v11' });

  // 5. Debug logging — never print cookie/stoken/BDUSS values or multipart
  //    body bytes. Only field names and lengths are logged.
  if (__DEV__) {
    const fullUrl = `${TIEBAC.replace(/\/$/, '')}${path}?cmd=${cmd}`;
    console.log(`[protoClient] POST ${fullUrl}`, {
      v12: isV12,
      formFieldCount: formFields.length,
      formFieldNames: formFields.map(([k]) => k),
      cookieLength: cookieStr.length,
      protoDataSize: protoData.length,
    });
  }

  // 6. Send POST request matching Kotlin OFFICIAL_PROTOBUF_TIEBA_V12_API headers
  //    Kotlin V12: CLIENT_TYPE header IS included ("2")
  //    User-Agent: getUserAgent("tieba/12.52.1.0") = browser UA + " tieba/12.52.1.0"
  const url = `${TIEBAC.replace(/\/$/, '')}${path}?cmd=${cmd}`;
  // Tieba API protocol uses these client UA strings; keep them stable for server-side compatibility.
  const v12UserAgent = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.0.0 Mobile Safari/537.36 tieba/${CLIENT_VERSION_V12}`;
  const headers: Record<string, string> = {
    'User-Agent': isV12 ? v12UserAgent : `bdtb for Android 11.10.8.6`,
    'Accept-Language': COMMON_HEADERS['Accept-Language'] ?? 'zh-CN,zh;q=0.9',
    'x_bd_data_type': 'protobuf',
    Charset: 'UTF-8',
    client_user_token: uid || '',
    Cookie: cookieStr,
    cuid: getCuid(),
    cuid_galaxy2: getCuid(),
    cuid_gid: '',
    cuid_galaxy3: getCuid(),
    c3_aid: getCuid(),
    client_type: '2',
  };

  // Merge per-request extra headers (e.g. forum_name for frsPage)
  if (opts?.extraHeaders) {
    Object.assign(headers, opts.extraHeaders);
  }

  // 手动 Accept-Encoding / Connection 头删除：URLSession 自管 gzip 解压与
  // 连接复用；手动传 "gzip, deflate" 时若服务端按 deflate 响应，原生层不会
  // 自动解压导致解码失败。
  const externalSignal = opts?.signal ?? null;
  const requestId = `proto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const onExternalAbort = () => TiebaNative.cancelProtoRequest(requestId);
  if (externalSignal?.aborted) {
    throw new TiebaApiError('Protobuf API request cancelled', -1, -1);
  }
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const decoded = await TiebaNative.protoPost(
      url,
      headers,
      formFields,
      protoData,
      isV12,
      responseTypePath,
      requestId,
      DEFAULT_TIMEOUT,
    );
    // proto 通道不经过 axios interceptor，这里补 NOT_LOGIN 清理逻辑。
    const protoErr = (decoded as any)?.error;
    const protoErrCode = protoErr ? Number(protoErr.error_code ?? protoErr.errorCode ?? 0) : 0;
    if (protoErrCode === TiebaErrorCode.NOT_LOGIN) {
      handleAuthExpired();
    }
    return decoded as T;
  } catch (error: any) {
    const message = String(error?.message ?? error?.name ?? '');
    if (externalSignal?.aborted || /cancelled/i.test(message)) {
      throw new TiebaApiError('Protobuf API request cancelled', -1, -1);
    }
    if (/timed out|timeout/i.test(message)) {
      throw new TiebaApiError('Protobuf API request timed out', 408, 408);
    }
    throw error;
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

// -----------------------------------------------------------
// Public API — Hot Thread List
// -----------------------------------------------------------

/**
 * Fetch hot thread list with topics and tabs.
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().hotThreadListFlow(tabCode)
 *   → POST /c/f/forum/hotThreadList?cmd=309661
 *
 * The response is ONE protobuf containing { topicList, threadInfo, hotThreadTabInfo }
 * — unlike the old JSON API which returned tab_list only.
 */
export async function protoHotThreadList(
  tabCode: string = 'all',
): Promise<DecodedHotThreadListResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedHotThreadListResponse>(
    '/c/f/forum/hotThreadList',
    '309661',
    protoCommon,
    (common) => encodeHotThreadListRequest(common, tabCode),
    'tieba.hotThreadList.HotThreadListResponse',
  );
}

// -----------------------------------------------------------
// Public API — Topic List
// -----------------------------------------------------------

/**
 * Fetch hot topic list.
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().topicListFlow()
 *   → POST /c/f/recommend/topicList?cmd=309289
 */
export async function protoTopicList(): Promise<DecodedTopicListResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedTopicListResponse>(
    '/c/f/recommend/topicList',
    '309289',
    protoCommon,
    encodeTopicListRequest,
    'tieba.topicList.TopicListResponse',
  );
}

// -----------------------------------------------------------
// Public API — FrsPage (Forum Thread List)
// -----------------------------------------------------------

/**
 * Fetch forum thread list (protobuf).
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().frsPage(forumName, page, loadType, sortType, goodClassifyId)
 *   → POST /c/f/frs/page?cmd=301001
 */
export async function protoFrsPage(opts: {
  kw: string;
  pn: number;
  sortType: number;
  isGood?: boolean;
  goodClassifyId?: number;
  loadType?: number;
}): Promise<DecodedFrsPageResponse> {
  const protoCommon = buildProtoCommonRequest('v12');
  // Kotlin: @Header("forum_name") forumName.urlEncode()
  const encodedKw = encodeURIComponent(opts.kw);

  return protoPost<DecodedFrsPageResponse>(
    '/c/f/frs/page',
    '301001',
    protoCommon,
    (common) => encodeFrsPageRequest(common, opts),
    'tieba.frsPage.FrsPageResponse',
    { v12: true, extraHeaders: { forum_name: encodedKw } },
  );
}

// -----------------------------------------------------------
// Public API — PbPage (Thread Detail + Replies)
// -----------------------------------------------------------

/**
 * Fetch thread detail and replies (protobuf).
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().pbPageFlow(threadId, page, postId, seeLz, back, sortType, forumId, stType, mark, lastPostId)
 *   → POST /c/f/pb/page?cmd=302001&format=protobuf
 */
export async function protoPbPage(opts: {
  kz: number | string;
  pn: number;
  pid?: number | string;
  seeLz?: boolean;
  back?: boolean;
  sortType?: number;
  forumId?: number | string;
  stType?: string;
  mark?: number;
  lastPid?: number | string;
}, signal?: AbortSignal): Promise<DecodedPbPageResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedPbPageResponse>(
    '/c/f/pb/page',
    '302001&format=protobuf',
    protoCommon,
    (common) => encodePbPageRequest(common, opts),
    'tieba.pbPage.PbPageResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — Profile (User Profile)
// -----------------------------------------------------------

/**
 * Fetch user profile (protobuf).
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().userProfileFlow(uid)
 *   → POST /c/u/user/profile?cmd=303012&format=protobuf
 */
export async function protoProfile(opts: {
  selfUid: number | string;
  targetUid: number | string;
  isSelf: boolean;
}): Promise<DecodedProfileResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedProfileResponse>(
    '/c/u/user/profile',
    '303012&format=protobuf',
    protoCommon,
    (common) => encodeProfileRequest(common, opts),
    'tieba.profile.ProfileResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — PbFloor (楼中楼 / Sub-posts)
// -----------------------------------------------------------

/**
 * Fetch sub-posts (楼中楼) for a given floor (protobuf).
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().pbFloorFlow(threadId, postId, forumId, page, subPostId)
 *   → POST /c/f/pb/floor?cmd=302002&format=protobuf
 */
export async function protoPbFloor(opts: {
  kz: number | string;
  pid: number | string;
  pn: number;
  forumId?: number | string;
  subPostId?: number | string;
}, signal?: AbortSignal): Promise<DecodedPbFloorResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedPbFloorResponse>(
    '/c/f/pb/floor',
    '302002&format=protobuf',
    protoCommon,
    (common) => encodePbFloorRequest(common, opts),
    'tieba.pbFloor.PbFloorResponse',
    { v12: true, needSToken: false, signal },
  );
}

// -----------------------------------------------------------
// Public API — SearchSug (搜索联想)
// -----------------------------------------------------------

/**
 * Fetch search suggestions (protobuf).
 *
 * Mirrors Kotlin:
 *   TiebaApi.getInstance().searchSuggestionsFlow(keyword, isForum)
 *   → POST /c/s/searchSug?cmd=309438&format=protobuf
 */
export async function protoSearchSug(opts: {
  word: string;
  isForum?: boolean;
}, signal?: AbortSignal): Promise<DecodedSearchSugResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedSearchSugResponse>(
    '/c/s/searchSug',
    '309438&format=protobuf',
    protoCommon,
    (common) => encodeSearchSugRequest(common, opts),
    'tieba.searchSug.SearchSugResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — GetBawuInfo (吧务信息)
// -----------------------------------------------------------

export async function protoGetBawuInfo(opts: {
  forumId: number | string;
}): Promise<DecodedGetBawuInfoResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetBawuInfoResponse>(
    '/c/f/forum/getBawuInfo',
    '301007',
    protoCommon,
    (common) => encodeGetBawuInfoRequest(common, opts),
    'tieba.getBawuInfo.GetBawuInfoResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — GetLevelInfo (等级信息)
// -----------------------------------------------------------

export async function protoGetLevelInfo(opts: {
  forumId: number | string;
}): Promise<DecodedGetLevelInfoResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetLevelInfoResponse>(
    '/c/f/forum/getLevelInfo',
    '301005',
    protoCommon,
    (common) => encodeGetLevelInfoRequest(common, opts),
    'tieba.getLevelInfo.GetLevelInfoResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — GetMemberInfo (会员信息)
// -----------------------------------------------------------

export async function protoGetMemberInfo(opts: {
  forumId: number | string;
}): Promise<DecodedGetMemberInfoResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetMemberInfoResponse>(
    '/c/f/forum/getMemberInfo',
    '301004',
    protoCommon,
    (common) => encodeGetMemberInfoRequest(common, opts),
    'tieba.getMemberInfo.GetMemberInfoResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — ForumRuleDetail (吧规详情)
// -----------------------------------------------------------

export async function protoForumRuleDetail(opts: {
  forumId: number | string;
}): Promise<DecodedForumRuleDetailResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedForumRuleDetailResponse>(
    '/c/f/forum/forumRuleDetail',
    '309690',
    protoCommon,
    (common) => encodeForumRuleDetailRequest(common, opts),
    'tieba.forumRuleDetail.ForumRuleDetailResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — GeneralTabList (通用Tab列表)
// -----------------------------------------------------------

export async function protoGeneralTabList(opts: {
  forumId: number | string;
  tabType?: number;
  pn?: number;
  rn?: number;
  sortType?: number;
  tabName?: string;
  tabCode?: string;
}, signal?: AbortSignal): Promise<DecodedGeneralTabListResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGeneralTabListResponse>(
    '/c/f/frs/generalTabList',
    '309622',
    protoCommon,
    (common) => encodeGeneralTabListRequest(common, opts),
    'tieba.generalTabList.GeneralTabListResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — GetHistoryForum (历史访问吧)
// -----------------------------------------------------------

export async function protoGetHistoryForum(opts: {
  fname: string;
}): Promise<DecodedGetHistoryForumResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetHistoryForumResponse>(
    '/c/f/forum/getHistoryForum',
    '309601',
    protoCommon,
    (common) => encodeGetHistoryForumRequest(common, opts),
    'tieba.getHistoryForum.GetHistoryForumResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — ForumRecommend (吧推荐)
// -----------------------------------------------------------

export async function protoForumRecommend(opts: {
  likeForum?: string;
  like_forum?: string;
  recommend?: string;
  topic?: string;
}): Promise<DecodedForumRecommendResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedForumRecommendResponse>(
    '/c/f/forum/forumRecommend',
    '303011',
    protoCommon,
    (common) => encodeForumRecommendRequest(common, opts),
    'tieba.forumRecommend.ForumRecommendResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — Personalized (个性化推荐)
// -----------------------------------------------------------

export async function protoPersonalized(opts: {
  loadType?: number;
  pn?: number;
  needTags?: number;
  pageThreadCount?: number;
  preAdThreadCount?: number;
  sugCount?: number;
  tagCode?: number;
  qType?: number;
  needForumlist?: number;
  newNetType?: number;
  newInstall?: number;
  requestTime?: number;
  invokeSource?: string;
  scrDip?: number;
  scrH?: number;
  scrW?: number;
}, signal?: AbortSignal): Promise<DecodedPersonalizedResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedPersonalizedResponse>(
    '/c/f/recommend/personalized',
    '309264',
    protoCommon,
    (common) => encodePersonalizedRequest(common, opts),
    'tieba.personalized.PersonalizedResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — UserLike (用户关注动态)
// -----------------------------------------------------------

export async function protoUserLike(opts: {
  loadType?: number;
  pageTag?: string;
  lastRequestUnix?: number;
}, signal?: AbortSignal): Promise<DecodedUserLikeResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedUserLikeResponse>(
    '/c/f/recommend/userLike',
    '309474',
    protoCommon,
    (common) => encodeUserLikeRequest(common, opts),
    'tieba.userLike.UserLikeResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — UserPost (用户帖子)
// -----------------------------------------------------------

export async function protoUserPost(opts: {
  uid: number | string;
  rn?: number;
  isThread?: number | boolean;
  needContent?: number;
  pn?: number;
  scrW?: number;
  scrH?: number;
  scrDip?: number;
  qType?: number;
  isViewCard?: number;
  subtype?: number;
}, signal?: AbortSignal): Promise<DecodedUserPostResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedUserPostResponse>(
    '/c/u/user/userPost',
    '303002',
    protoCommon,
    (common) => encodeUserPostRequest(common, opts),
    'tieba.userPost.UserPostResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — GetUserInfo (用户信息)
// -----------------------------------------------------------

export async function protoGetUserInfo(opts: {
  uid: number | string;
  scrW?: number;
}, signal?: AbortSignal): Promise<DecodedGetUserInfoResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetUserInfoResponse>(
    '/c/u/user/getUserInfo',
    '303024',
    protoCommon,
    (common) => encodeGetUserInfoRequest(common, opts),
    'tieba.getUserInfo.GetUserInfoResponse',
    { v12: true, signal },
  );
}

// -----------------------------------------------------------
// Public API — ThreadList (帖子列表)
// -----------------------------------------------------------

export async function protoThreadList(opts: {
  forumId?: number | string;
  forumName?: string;
  needAbstract?: number;
  pn?: number;
  qType?: number;
  scrDip?: number;
  scrH?: number;
  scrW?: number;
  sortType?: number;
  stType?: number;
  threadIds?: string;
  userId?: number | string;
  platform?: string;
}): Promise<DecodedThreadListResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedThreadListResponse>(
    '/c/f/frs/threadList',
    '301002',
    protoCommon,
    (common) => encodeThreadListRequest(common, opts),
    'tieba.threadList.ThreadListResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — GetForumDetail (吧详情)
// -----------------------------------------------------------

export async function protoGetForumDetail(opts: {
  forumId: number | string;
}): Promise<DecodedGetForumDetailResponse> {
  const protoCommon = buildProtoCommonRequest('v12');

  return protoPost<DecodedGetForumDetailResponse>(
    '/c/f/forum/getforumdetail',
    '303021&format=protobuf',
    protoCommon,
    (common) => encodeGetForumDetailRequest(common, opts),
    'tieba.getForumDetail.GetForumDetailResponse',
    { v12: true },
  );
}

// -----------------------------------------------------------
// Public API — GetDislikeList (屏蔽吧列表, cmd=309692)
// -----------------------------------------------------------

export async function protoGetDislikeList(opts: {
  userId: number | string;
  pn?: number;
  rn?: number;
}, signal?: AbortSignal): Promise<DecodedGetDislikeListResponse> {
  const protoCommon = buildProtoCommonRequest('v12');
  const uid = getUid();

  return protoPost<DecodedGetDislikeListResponse>(
    '/c/u/user/getDislikeList',
    '309692',
    protoCommon,
    (common) => encodeGetDislikeListRequest(common, {
      userId: opts.userId || uid || 0,
      pn: opts.pn ?? 1,
      rn: opts.rn ?? 20,
    }),
    'tieba.getDislikeList.GetDislikeListResponse',
    { v12: true, signal },
  );
}
