// ============================================================
// TiebaLite RN — Protobuf Helpers (aligned with Kotlin Wire)
//
// 编码在 JS 侧用 protobufjs（预编译的 protos.json descriptor），
// 解码仍在 native TiebaNative codec（protoClient 内）。
// ============================================================

// -----------------------------------------------------------
// Init — lazily load descriptor on first use
// -----------------------------------------------------------
// The JSON descriptor is ~111KB. Parsing + resolveAll() used to run
// synchronously at module import time, which penalized app startup even when
// no protobuf call was made yet. We now defer it until the first encode.

// ⚠️ 编码在 JS 侧用 protobufjs 完成，不再走 native 编码器：
// native 编码器会把嵌套 message 平铺（FrsPageRequest.data.common 被压成
// 顶层字段），导致 frsPage/pbPage/profile 的请求结构错乱、服务器返回
// 210009 系统错误。热榜恰好因字段 id 巧合不受影响。protobufjs 编码输出
// 已验证与服务器兼容（嵌套正确、error=0）。解码仍走 native（正常）。
import protobuf from 'protobufjs';

type TypeRef = { fullName: string };

let protoRoot: protobuf.Root | null = null;

/** 惰性加载 protobuf descriptor（首次编码时才解析 111KB JSON） */
function getProtoRoot(): protobuf.Root {
  if (!protoRoot) {
    protoRoot = protobuf.Root.fromJSON(
      require('./protos.json') as unknown as protobuf.INamespace,
    );
  }
  return protoRoot;
}

/**
 * Create a memoized lazy type accessor. The lookup (and thus the descriptor
 * parse) only happens the first time the returned function is called.
 */
function lazyType(path: string): () => TypeRef {
  let cached: TypeRef | null = null;
  return () => cached || (cached = { fullName: path });
}

// -----------------------------------------------------------
// Type lookups (mirrors Kotlin package paths)
// -----------------------------------------------------------

/** HotThreadList request wrapper */
const HotThreadListRequest = lazyType(
  'tieba.hotThreadList.HotThreadListRequest',
);

/** TopicList request wrapper */
const TopicListRequest = lazyType(
  'tieba.topicList.TopicListRequest',
);

/** FrsPage (forum thread list) */
const FrsPageRequest = lazyType('tieba.frsPage.FrsPageRequest');

/** PbPage (thread detail + replies) */
const PbPageRequest = lazyType('tieba.pbPage.PbPageRequest');

/** Profile (user profile) */
const ProfileRequest = lazyType('tieba.profile.ProfileRequest');

/** PbFloor (sub-post / 楼中楼) */
const PbFloorRequest = lazyType('tieba.pbFloor.PbFloorRequest');

// -----------------------------------------------------------
// Encode helpers
// -----------------------------------------------------------

/**
 * Encode a plain JS object into protobuf base64 (native codec).
 * Mirrors Kotlin `data.encode()`.
 */

function encodeProtobuf(type: TypeRef, data: Record<string, unknown>): string {
  // JS 端 protobufjs 编码（native 编码器嵌套平铺 bug 的绕过方案，见文件头注释）
  const messageType = getProtoRoot().lookupType(type.fullName);
  const err = messageType.verify(data);
  if (err) throw new Error(`protobuf verify ${type.fullName}: ${err}`);
  const bytes = messageType.encode(messageType.create(data)).finish();
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return globalThis.btoa(binary);
}

// -----------------------------------------------------------
// Public API — encode request bodies
// -----------------------------------------------------------

/** Common request fields (mirrors Kotlin CommonRequest proto) — camelCase per protobufjs JSON descriptor */
export interface ProtoCommonRequest {
  _clientType?: number;
  _clientVersion?: string;
  _clientId?: string;
  _phoneImei?: string;
  from?: string;
  cuid?: string;
  _timestamp?: number;
  model?: string;
  BDUSS?: string;
  tbs?: string;
  netType?: number;
  _phoneNewimei?: string;
  sign?: string;
  pversion?: string;
  _osVersion?: string;
  brand?: string;
  legoLibVersion?: string;
  applist?: string;
  stoken?: string;
  zId?: string;
  cuidGalaxy2?: string;
  cuidGid?: string;
  oaid?: string;
  c3Aid?: string;
  sampleId?: string;
  scrW?: number;
  scrH?: number;
  scrDip?: number;
  qType?: number;
  isTeenager?: number;
  sdkVer?: string;
  frameworkVer?: string;
  nawsGameVer?: string;
  activeTimestamp?: number;
  firstInstallTime?: number;
  lastUpdateTime?: number;
  eventDay?: string;
  androidId?: string;
  cmode?: number;
  startScheme?: string;
  startType?: number;
  extra?: string;
  userAgent?: string;
  personalizedRecSwitch?: number;
  deviceScore?: string;
}

/**
 * Encode HotThreadList request to protobuf binary.
 * Mirrors Kotlin:
 *   HotThreadListRequest(
 *     HotThreadListRequestData(
 *       common = buildCommonRequest(),
 *       tabCode = tabCode,
 *       tabId = "1"
 *     )
 *   )
 */
export function encodeHotThreadListRequest(
  common: ProtoCommonRequest,
  tabCode: string,
): string {
  return encodeProtobuf(HotThreadListRequest(), {
    data: {
      common,
      tabId: '1',
      tabCode,
    },
  });
}

/**
 * Encode TopicList request to protobuf binary.
 * Mirrors Kotlin:
 *   TopicListRequest(
 *     TopicListRequestData(
 *       common = buildCommonRequest(),
 *       call_from = "newbang",
 *       list_type = "all",
 *       need_tab_list = "0",
 *       fid = 0
 *     )
 *   )
 */
export function encodeTopicListRequest(
  common: ProtoCommonRequest,
): string {
  return encodeProtobuf(TopicListRequest(), {
    data: {
      common,
      callFrom: 'newbang',
      listType: 'all',
      needTabList: '0',
      fid: 0,
    },
  });
}

/**
 * Encode FrsPage request to protobuf binary.
 * Mirrors Kotlin MixedTiebaApiImpl.frsPage():
 *   FrsPageRequest(FrsPageRequestData(
 *     common, kw, pn, rn=90, rn_need=30, q_type=2,
 *     sort_type, st_type="recom_flist", with_group=1, load_type, ...
 *   ))
 */
export function encodeFrsPageRequest(
  common: ProtoCommonRequest,
  opts: {
    kw: string;
    pn: number;
    sortType: number;
    isGood?: boolean;
    goodClassifyId?: number;
    loadType?: number;
  },
): string {
  return encodeProtobuf(FrsPageRequest(), {
    data: {
      common,
      // ⚠️ kw 必须 URL 编码（对齐 Kotlin 原版 frsPage 的 forumName.urlEncode()）。
      // 服务器靠 kw 定位吧，原始中文会被当成未知吧名 → 回退推荐/综合流 →
      // 吧页混入别的吧的帖子。之前"原始中文"结论是 native 编码器平铺 bug
      // 时代的误判（当时怎么编码都 210009）；protobufjs 编码下必须 urlEncode。
      kw: encodeURIComponent(opts.kw),
      pn: opts.pn,
      rn: 90,
      rnNeed: 30,
      qType: 2,
      sortType: opts.sortType,
      stType: 'recom_flist',
      withGroup: 1,
      loadType: opts.loadType ?? 0,
      isGood: opts.isGood ? 1 : 0,
      cid: opts.goodClassifyId ?? 0,
      scrW: 1170,
      scrH: 2532,
      scrDip: 3,
      callFrom: 0,
      categoryId: 0,
      ctime: 0,
      dataSize: 0,
      hotThreadId: 0,
      isDefaultNavtab: 0,
      isSelection: 0,
      lastClickTid: 0,
      netError: 0,
      stParam: 0,
      upSchema: '',
      yuelaouLocate: '',
    },
  });
}

/**
 * Encode PbPage request to protobuf binary.
 * Mirrors Kotlin MixedTiebaApiImpl.pbPageFlow():
 *   PbPageRequest(PbPageRequestData(
 *     common, kz, pid, pn, r, lz, rn=15, with_floor=1, floor_rn=4, ...
 *   ))
 */
export function encodePbPageRequest(
  common: ProtoCommonRequest,
  opts: {
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
  },
): string {
  return encodeProtobuf(PbPageRequest(), {
    data: {
      common,
      kz: Number(opts.kz),
      pid: Number(opts.pid ?? 0),
      pn: opts.pn,
      r: opts.sortType ?? 0,
      lz: opts.seeLz ? 1 : 0,
      forumId: Number(opts.forumId ?? 0),
      mark: opts.mark ?? 0,
      lastPid: Number(opts.lastPid ?? 0),
      back: opts.back ? 1 : 0,
      banner: 0,
      broadcastId: 0,
      floorRn: 4,
      floorSortType: 1,
      fromPush: 0,
      fromSmartFrs: 0,
      immersionVideoCommentSource: 0,
      isCommReverse: 0,
      isFoldCommentReq: 0,
      isJumpfloor: 0,
      jumpfloorNum: 0,
      needRepostRecommendForum: 0,
      objLocate: '',
      objParam1: '10',
      objSource: '',
      oriUgcType: 0,
      pbRn: 0,
      qType: 2,
      requestTimes: 0,
      rn: 15,
      sModel: 0,
      scrW: 1170,
      scrH: 2532,
      scrDip: 3,
      similarFrom: 0,
      sourceType: 2,
      stType: opts.stType ?? '',
      threadType: 0,
      weipost: 0,
      withFloor: 1,
    },
  });
}

/**
 * Encode Profile request to protobuf binary.
 * Mirrors Kotlin MixedTiebaApiImpl.userProfileFlow():
 *   ProfileRequest(ProfileRequestData(
 *     common, uid=selfUid, friend_uid=targetUid, is_guest, ...
 *   ))
 */
export function encodeProfileRequest(
  common: ProtoCommonRequest,
  opts: {
    selfUid: number | string;
    targetUid: number | string;
    isSelf: boolean;
  },
): string {
  return encodeProtobuf(ProfileRequest(), {
    data: {
      common,
      uid: Number(opts.selfUid) || undefined,
      friendUid: opts.isSelf ? undefined : Number(opts.targetUid),
      friendUidPortrait: '',
      hasPlist: 1,
      isFromUsercenter: 1,
      isGuest: opts.isSelf ? 0 : 1,
      needPostCount: 1,
      page: 1,
      pn: 1,
      qType: 0,
      rn: 20,
      scrW: 1170,
      scrH: 2532,
      scrDip: 3,
    },
  });
}

// -----------------------------------------------------------
// Public API — decode response bodies
// -----------------------------------------------------------

/** Decoded HotThreadList response (mirrors Kotlin protobuf response) */
export interface DecodedHotThreadListResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    topicList?: Record<string, unknown>[];
    threadInfo?: Record<string, unknown>[];
    hotThreadTabInfo?: Record<string, unknown>[];
  };
}

/**
 * Decode HotThreadList protobuf response bytes.
 * Mirrors Kotlin HotThreadListResponse.ADAPTER.decode(bytes).
 */

/** Decoded TopicList response */
export interface DecodedTopicListResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    topic_list?: Record<string, unknown>[];
  };
}

/**
 * Decode TopicList protobuf response bytes.
 */

// -----------------------------------------------------------
// FrsPage decode
// -----------------------------------------------------------

export interface DecodedFrsPageResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forum?: Record<string, any>;
    threadList?: Record<string, any>[];
    userList?: Record<string, any>[];
    page?: { currentPage?: number; totalPage?: number; totalCount?: number; pageSize?: number; hasMore?: number; hasPrev?: number };
    anti?: { tbs?: string; ifPost?: number; forbidFlag?: number };
    navTabInfo?: Record<string, any>[];
    threadIdList?: (number | string)[];
    forumRule?: { title?: string; hasForumRule?: number };
  };
}

// -----------------------------------------------------------
// PbPage decode
// -----------------------------------------------------------

export interface DecodedPbPageResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    thread?: Record<string, any>;
    postList?: Record<string, any>[];
    page?: { currentPage?: number; totalPage?: number; totalCount?: number; pageSize?: number; hasMore?: number; hasPrev?: number };
    userList?: Record<string, any>[];
    forum?: Record<string, any>;
    anti?: { tbs?: string; ifPost?: number; forbidFlag?: number; forbidInfo?: string };
    firstFloorPost?: Record<string, any>;
  };
}

// -----------------------------------------------------------
// Profile decode
// -----------------------------------------------------------

export interface DecodedProfileResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    user?: Record<string, any>;
  };
}

// -----------------------------------------------------------
// PbFloor encode / decode (楼中楼)
// -----------------------------------------------------------

export function encodePbFloorRequest(
  common: ProtoCommonRequest,
  opts: {
    kz: number | string;
    pid: number | string;
    pn: number;
    forumId?: number | string;
    subPostId?: number | string;
  },
): string {
  return encodeProtobuf(PbFloorRequest(), {
    data: {
      common,
      kz: Number(opts.kz),
      pid: Number(opts.pid),
      pn: opts.pn,
      forumId: Number(opts.forumId ?? 0),
      spid: Number(opts.subPostId ?? 0),
      scrW: 1080,
      scrH: 2400,
      scrDip: 3.0,
      isCommReverse: 0,
      oriUgcType: 0,
    },
  });
}

export interface DecodedPbFloorResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    page?: { currentPage?: number; totalPage?: number; totalCount?: number; hasMore?: number };
    post?: Record<string, any>;
    subpostList?: Record<string, any>[];
    thread?: Record<string, any>;
    forum?: Record<string, any>;
    anti?: { tbs?: string };
  };
}

// -----------------------------------------------------------
// SearchSug (搜索联想)
// -----------------------------------------------------------

const SearchSugRequest = lazyType('tieba.searchSug.SearchSugRequest');

export interface DecodedSearchSugResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forumLoc?: number;
    list?: string[];
    forumList?: Record<string, any>[];
  };
}

export function encodeSearchSugRequest(
  common: ProtoCommonRequest,
  opts: { word: string; isForum?: boolean },
): string {
  return encodeProtobuf(SearchSugRequest(), {
    data: {
      common,
      word: opts.word,
      isforum: opts.isForum ? '1' : '0',
    },
  });
}

// -----------------------------------------------------------
// GetBawuInfo (吧务信息)
// -----------------------------------------------------------

const GetBawuInfoRequest = lazyType('tieba.getBawuInfo.GetBawuInfoRequest');

export interface DecodedGetBawuInfoResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    bawuTeamInfo?: {
      totalNum?: number;
      bawuTeamList?: {
        roleName?: string;
        roleInfo?: {
          forumId?: number | string;
          userId?: number | string;
          roleId?: number;
          roleName?: string;
          portrait?: string;
          userLevel?: number;
          levelName?: string;
          userName?: string;
          nameShow?: string;
        }[];
      }[];
    };
    managerApplyInfo?: {
      managerLeftNum?: number;
      managerApplyUrl?: string;
      assistLeftNum?: number;
      assistApplyUrl?: string;
    };
    isPrivateForum?: number;
    [key: string]: any;
  };
}

export function encodeGetBawuInfoRequest(
  common: ProtoCommonRequest,
  opts: { forumId: number | string },
): string {
  return encodeProtobuf(GetBawuInfoRequest(), {
    data: { common, forumId: Number(opts.forumId) },
  });
}

// -----------------------------------------------------------
// GetLevelInfo (等级信息)
// -----------------------------------------------------------

const GetLevelInfoRequest = lazyType('tieba.getLevelInfo.GetLevelInfoRequest');

export interface DecodedGetLevelInfoResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    levelInfo?: string;
    [key: string]: any;
  };
}

export function encodeGetLevelInfoRequest(
  common: ProtoCommonRequest,
  opts: { forumId: number | string },
): string {
  return encodeProtobuf(GetLevelInfoRequest(), {
    data: { common, forumId: Number(opts.forumId) },
  });
}

// -----------------------------------------------------------
// GetMemberInfo (会员信息)
// -----------------------------------------------------------

const GetMemberInfoRequest = lazyType('tieba.getMemberInfo.GetMemberInfoRequest');

export interface DecodedGetMemberInfoResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    memberInfo?: Record<string, any>[];
    [key: string]: any;
  };
}

export function encodeGetMemberInfoRequest(
  common: ProtoCommonRequest,
  opts: { forumId: number | string },
): string {
  return encodeProtobuf(GetMemberInfoRequest(), {
    data: { common, forumId: Number(opts.forumId) },
  });
}

// -----------------------------------------------------------
// ForumRuleDetail (吧规详情)
// -----------------------------------------------------------

const ForumRuleDetailRequest = lazyType('tieba.forumRuleDetail.ForumRuleDetailRequest');

export interface DecodedForumRuleDetailResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forumRule?: string;
    ruleHtml?: string;
    ruleText?: string;
    ruleTitle?: string;
    [key: string]: any;
  };
}

export function encodeForumRuleDetailRequest(
  common: ProtoCommonRequest,
  opts: { forumId: number | string },
): string {
  return encodeProtobuf(ForumRuleDetailRequest(), {
    data: { common, forumId: Number(opts.forumId) },
  });
}

// -----------------------------------------------------------
// GeneralTabList (通用Tab列表)
// -----------------------------------------------------------

const GeneralTabListRequest = lazyType('tieba.generalTabList.GeneralTabListRequest');

export interface DecodedGeneralTabListResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    generalList?: Record<string, any>[];
    hasMore?: number;
    userList?: Record<string, any>[];
    [key: string]: any;
  };
}

export function encodeGeneralTabListRequest(
  common: ProtoCommonRequest,
  opts: {
    forumId: number | string;
    tabId?: number;
    tabType?: number;
    pn?: number;
    rn?: number;
    sortType?: number;
    tabName?: string;
    isGeneralTab?: number;
    lastThreadId?: number;
    isDefaultNavtab?: number;
  },
): string {
  return encodeProtobuf(GeneralTabListRequest(), {
    data: {
      common,
      tabId: opts.tabId ?? 0,
      forumId: Number(opts.forumId),
      pn: opts.pn ?? 1,
      rn: opts.rn ?? 30,
      scrW: 1170,
      scrH: 2532,
      scrDip: 3,
      lastThreadId: opts.lastThreadId ?? 0,
      isDefaultNavtab: opts.isDefaultNavtab ?? 0,
      tabName: opts.tabName ?? '',
      isGeneralTab: opts.isGeneralTab ?? 1,
      sortType: opts.sortType ?? 0,
      tabType: opts.tabType ?? 0,
    },
  });
}

// -----------------------------------------------------------
// GetHistoryForum (历史访问吧)
// -----------------------------------------------------------

const GetHistoryForumRequest = lazyType('tieba.getHistoryForum.GetHistoryForumRequest');

export interface DecodedGetHistoryForumResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forumList?: Record<string, any>[];
    [key: string]: any;
  };
}

export function encodeGetHistoryForumRequest(
  common: ProtoCommonRequest,
  opts: { fname: string },
): string {
  return encodeProtobuf(GetHistoryForumRequest(), {
    data: { common, fname: opts.fname },
  });
}

// -----------------------------------------------------------
// ForumRecommend (吧推荐)
// -----------------------------------------------------------

const ForumRecommendRequest = lazyType('tieba.forumRecommend.ForumRecommendRequest');

export interface DecodedForumRecommendResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    likeForum?: Record<string, any>[];
    forumList?: Record<string, any>[];
    [key: string]: any;
  };
}

export function encodeForumRecommendRequest(
  common: ProtoCommonRequest,
  opts: { likeForum?: string; like_forum?: string; recommend?: string; topic?: string },
): string {
  return encodeProtobuf(ForumRecommendRequest(), {
    data: {
      common,
      likeForum: opts.likeForum ?? opts.like_forum ?? '',
      recommend: opts.recommend ?? '',
      topic: opts.topic ?? '',
    },
  });
}

// -----------------------------------------------------------
// Personalized (个性化推荐)
// -----------------------------------------------------------

const PersonalizedRequest = lazyType('tieba.personalized.PersonalizedRequest');

export interface DecodedPersonalizedResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    threadList?: Record<string, any>[];
    userList?: Record<string, any>[];
    page?: Record<string, any>;
    hasMore?: number;
    [key: string]: any;
  };
}

export function encodePersonalizedRequest(
  common: ProtoCommonRequest,
  opts: {
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
    requestTimes?: number;
    invokeSource?: string;
    scrDip?: number;
    scrH?: number;
    scrW?: number;
  },
): string {
  return encodeProtobuf(PersonalizedRequest(), {
    data: {
      common,
      loadType: opts.loadType ?? 0,
      pn: opts.pn ?? 1,
      needTags: opts.needTags ?? 0,
      pageThreadCount: opts.pageThreadCount ?? 0,
      preAdThreadCount: opts.preAdThreadCount ?? 0,
      sugCount: opts.sugCount ?? 0,
      tagCode: opts.tagCode ?? 0,
      qType: opts.qType ?? 0,
      needForumlist: opts.needForumlist ?? 0,
      newNetType: opts.newNetType ?? 0,
      newInstall: opts.newInstall ?? 0,
      requestTimes: opts.requestTimes ?? 0,
      invokeSource: opts.invokeSource ?? '',
      scrDip: opts.scrDip ?? 3,
      scrH: opts.scrH ?? 2532,
      scrW: opts.scrW ?? 1170,
    },
  });
}

// -----------------------------------------------------------
// UserLike (用户关注动态)
// -----------------------------------------------------------

const UserLikeRequest = lazyType('tieba.userLike.UserLikeRequest');

export interface DecodedUserLikeResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    threadInfo?: Record<string, any>[];
    pageTag?: string;
    hasMore?: number;
    requestUnix?: number | string;
    [key: string]: any;
  };
}

export function encodeUserLikeRequest(
  common: ProtoCommonRequest,
  opts: { loadType?: number; pageTag?: string; lastRequestUnix?: number; followType?: number },
): string {
  return encodeProtobuf(UserLikeRequest(), {
    data: {
      common,
      pageTag: opts.pageTag ?? '',
      lastRequestUnix: opts.lastRequestUnix ?? 0,
      followType: opts.followType ?? 1,
      loadType: opts.loadType ?? 0,
    },
  });
}

// -----------------------------------------------------------
// UserPost (用户帖子)
// -----------------------------------------------------------

const UserPostRequest = lazyType('tieba.userPost.UserPostRequest');

export interface DecodedUserPostResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    postList?: Record<string, any>[];
    hidePost?: number;
    time?: number | string;
    content?: Record<string, any>[];
    hasMore?: number;
    [key: string]: any;
  };
}

export function encodeUserPostRequest(
  common: ProtoCommonRequest,
  opts: {
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
  },
): string {
  return encodeProtobuf(UserPostRequest(), {
    data: {
      common,
      uid: Number(opts.uid),
      rn: opts.rn ?? 20,
      isThread: opts.isThread ? 1 : 0,
      needContent: opts.needContent ?? 0,
      pn: opts.pn ?? 1,
      scrW: opts.scrW ?? 1170,
      scrH: opts.scrH ?? 2532,
      scrDip: opts.scrDip ?? 3,
      qType: opts.qType ?? 0,
      isViewCard: opts.isViewCard ?? 0,
      subtype: opts.subtype ?? 0,
    },
  });
}

// -----------------------------------------------------------
// GetUserInfo (用户信息)
// -----------------------------------------------------------

const GetUserInfoRequest = lazyType('tieba.getUserInfo.GetUserInfoRequest');

export interface DecodedGetUserInfoResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    user?: Record<string, any>;
    [key: string]: any;
  };
}

export function encodeGetUserInfoRequest(
  common: ProtoCommonRequest,
  opts: { uid: number | string; scrW?: number },
): string {
  return encodeProtobuf(GetUserInfoRequest(), {
    data: {
      common,
      uid: Number(opts.uid),
      scrW: opts.scrW ?? 1170,
    },
  });
}

// -----------------------------------------------------------
// ThreadList (帖子列表)
// -----------------------------------------------------------

const ThreadListRequest = lazyType('tieba.threadList.ThreadListRequest');

export interface DecodedThreadListResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    threadList?: Record<string, any>[];
    userList?: Record<string, any>[];
    [key: string]: any;
  };
}

export function encodeThreadListRequest(
  common: ProtoCommonRequest,
  opts: {
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
  },
): string {
  return encodeProtobuf(ThreadListRequest(), {
    data: {
      common,
      forumId: Number(opts.forumId ?? 0),
      forumName: opts.forumName ?? '',
      needAbstract: opts.needAbstract ?? 0,
      pn: opts.pn ?? 1,
      qType: opts.qType ?? 0,
      scrDip: opts.scrDip ?? 3,
      scrH: opts.scrH ?? 2532,
      scrW: opts.scrW ?? 1170,
      sortType: opts.sortType ?? 0,
      stType: opts.stType ?? 0,
      threadIds: opts.threadIds ?? '',
      userId: Number(opts.userId ?? 0),
      platform: opts.platform ?? '',
    },
  });
}

// -----------------------------------------------------------
// GetForumDetail (吧详情)
// -----------------------------------------------------------

const GetForumDetailRequest = lazyType('tieba.getForumDetail.GetForumDetailRequest');
export interface DecodedGetForumDetailResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forum?: Record<string, any>;
    [key: string]: any;
  };
}

export function encodeGetForumDetailRequest(
  common: ProtoCommonRequest,
  opts: { forumId: number | string },
): string {
  return encodeProtobuf(GetForumDetailRequest(), {
    data: { common, forumId: Number(opts.forumId) },
  });
}

// -----------------------------------------------------------
// GetDislikeList (屏蔽吧列表, cmd=309692)
// -----------------------------------------------------------

const GetDislikeListRequest = lazyType('tieba.getDislikeList.GetDislikeListRequest');

export interface DecodedGetDislikeListResponse {
  error?: { error_code?: number; error_msg?: string };
  data?: {
    forumList?: Record<string, any>[];
    hasMore?: number;
    curPage?: number;
    [key: string]: any;
  };
}

export function encodeGetDislikeListRequest(
  common: ProtoCommonRequest,
  opts: { userId: number | string; pn: number; rn: number },
): string {
  return encodeProtobuf(GetDislikeListRequest(), {
    data: {
      common,
      userId: Number(opts.userId),
      pn: opts.pn,
      rn: opts.rn,
    },
  });
}
