/* global __dirname */
/**
 * Adds the hand-maintained protobuf API namespaces to a generated
 * protos.json descriptor. The function mutates and returns the parsed object.
 */
function applyProtosPatches(j) {
  const tieba = j.nested.tieba.nested;

function ns(name, nested) {
  return {
    options: { java_package: `com.huanchengfly.tieba.post.api.models.protos.${name}` },
    nested,
  };
}

// 1. getBawuInfo (cmd=301007)
tieba.getBawuInfo = ns('getBawuInfo', {
  GetBawuInfoRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
    },
  },
  GetBawuInfoRequest: {
    fields: { data: { type: 'GetBawuInfoRequestData', id: 1 } },
  },
  GetBawuInfoResponseData: {
    fields: {
      bawuTeamList: { rule: 'repeated', type: 'BawuTeam', id: 1, protoName: 'bawu_team_list' },
    },
  },
  GetBawuInfoResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetBawuInfoResponseData', id: 2 },
    },
  },
});

// 2. getLevelInfo (cmd=301005)
// 字段号对齐官方 tbclient.protobuf GetLevelInfo/DataReq.proto + GetLevelInfoResIdl.proto：
//   DataReq { uint64 forum_id=1; CommonReq common=2; }
//   GetLevelInfoResIdl { DataRes data=1; Error error=2; }
// LevelInfo 内联定义（protos_src/LevelInfo.proto，protos.json 基底未包含该类型；
// 缺失会导致 protobufjs Root.fromJSON resolveAll 抛异常，所有 proto 编码崩溃）。
tieba.getLevelInfo = ns('getLevelInfo', {
  LevelInfo: {
    fields: {
      id: { type: 'int32', id: 1 },
      name: { type: 'string', id: 2 },
      score: { type: 'int32', id: 3 },
    },
  },
  GetLevelInfoRequestData: {
    fields: {
      forumId: { type: 'uint64', id: 1, protoName: 'forum_id' },
      common: { type: 'CommonRequest', id: 2 },
    },
  },
  GetLevelInfoRequest: {
    fields: { data: { type: 'GetLevelInfoRequestData', id: 1 } },
  },
  GetLevelInfoResponseData: {
    fields: {
      levelInfo: { rule: 'repeated', type: 'LevelInfo', id: 1, protoName: 'level_info' },
      isLike: { type: 'int32', id: 2, protoName: 'is_like' },
      userLevel: { type: 'int32', id: 3, protoName: 'user_level' },
      levelName: { type: 'string', id: 4, protoName: 'level_name' },
    },
  },
  GetLevelInfoResponse: {
    fields: {
      data: { type: 'GetLevelInfoResponseData', id: 1 },
      error: { type: 'Error', id: 2 },
    },
  },
});

// 3. getMemberInfo (cmd=301004)
// 字段号对齐官方 GetMemberInfo/DataReq.proto + GetMemberInfoResIdl.proto：
//   DataReq { uint64 forum_id=1; CommonReq common=2; }
//   GetMemberInfoResIdl { DataRes data=1; Error error=2; }
tieba.getMemberInfo = ns('getMemberInfo', {
  ForumMember: {
    fields: {
      uid: { type: 'uint64', id: 1 },
      name: { type: 'string', id: 2 },
      portrait: { type: 'string', id: 3 },
      levelId: { type: 'int32', id: 4, protoName: 'level_id' },
      levelName: { type: 'string', id: 5, protoName: 'level_name' },
    },
  },
  GetMemberInfoRequestData: {
    fields: {
      forumId: { type: 'uint64', id: 1, protoName: 'forum_id' },
      common: { type: 'CommonRequest', id: 2 },
    },
  },
  GetMemberInfoRequest: {
    fields: { data: { type: 'GetMemberInfoRequestData', id: 1 } },
  },
  GetMemberInfoResponseData: {
    fields: {
      memberInfo: { rule: 'repeated', type: 'ForumMember', id: 1, protoName: 'member_info' },
    },
  },
  GetMemberInfoResponse: {
    fields: {
      data: { type: 'GetMemberInfoResponseData', id: 1 },
      error: { type: 'Error', id: 2 },
    },
  },
});

// 4. forumRuleDetail (cmd=309690)
// 字段号对齐官方 ForumRuleDetail/DataReq.proto：
//   DataReq { int64 forum_id=1; CommonReq common=2; int64 default_rule_version=3;
//             int64 customize_rule_version=4; int64 is_edit=5; }
tieba.forumRuleDetail = ns('forumRuleDetail', {
  ForumRuleDetailRequestData: {
    fields: {
      forumId: { type: 'int64', id: 1, protoName: 'forum_id' },
      common: { type: 'CommonRequest', id: 2 },
      defaultRuleVersion: { type: 'int64', id: 3, protoName: 'default_rule_version' },
      customizeRuleVersion: { type: 'int64', id: 4, protoName: 'customize_rule_version' },
      isEdit: { type: 'int64', id: 5, protoName: 'is_edit' },
    },
  },
  ForumRuleDetailRequest: {
    fields: { data: { type: 'ForumRuleDetailRequestData', id: 1 } },
  },
  ForumRuleDetailResponseData: {
    fields: {
      forumRule: { type: 'string', id: 1, protoName: 'forum_rule' },
      ruleHtml: { type: 'string', id: 2, protoName: 'rule_html' },
      ruleText: { type: 'string', id: 3, protoName: 'rule_text' },
      ruleTitle: { type: 'string', id: 4, protoName: 'rule_title' },
    },
  },
  ForumRuleDetailResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'ForumRuleDetailResponseData', id: 2 },
    },
  },
});

// 5. generalTabList (cmd=309622)
// 字段号对齐官方 GeneralTabList/DataReq.proto + DataRes.proto：
//   DataReq { common=1; tab_id=2; forum_id=3; pn=4; rn=5; scr_w=6; scr_h=7;
//             scr_dip=8; last_thread_id=9; is_default_navtab=10; tab_name=11;
//             is_general_tab=12; sort_type=13; tab_type=14; ... }
//   DataRes { repeated ThreadInfo general_list=1; int32 has_more=2;
//             repeated User user_list=3; ...; PageData page_data=14; }
tieba.generalTabList = ns('generalTabList', {
  GeneralTabListRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      tabId: { type: 'int32', id: 2, protoName: 'tab_id' },
      forumId: { type: 'int64', id: 3, protoName: 'forum_id' },
      pn: { type: 'int32', id: 4 },
      rn: { type: 'int32', id: 5 },
      scrW: { type: 'int32', id: 6, protoName: 'scr_w' },
      scrH: { type: 'int32', id: 7, protoName: 'scr_h' },
      scrDip: { type: 'int32', id: 8, protoName: 'scr_dip' },
      lastThreadId: { type: 'int64', id: 9, protoName: 'last_thread_id' },
      isDefaultNavtab: { type: 'int32', id: 10, protoName: 'is_default_navtab' },
      tabName: { type: 'string', id: 11, protoName: 'tab_name' },
      isGeneralTab: { type: 'int32', id: 12, protoName: 'is_general_tab' },
      sortType: { type: 'int32', id: 13, protoName: 'sort_type' },
      tabType: { type: 'int32', id: 14, protoName: 'tab_type' },
    },
  },
  GeneralTabListRequest: {
    fields: { data: { type: 'GeneralTabListRequestData', id: 1 } },
  },
  GeneralTabListResponseData: {
    fields: {
      generalList: { rule: 'repeated', type: 'ThreadInfo', id: 1, protoName: 'general_list' },
      hasMore: { type: 'int32', id: 2, protoName: 'has_more' },
      userList: { rule: 'repeated', type: 'User', id: 3, protoName: 'user_list' },
      sortType: { type: 'int32', id: 7, protoName: 'sort_type' },
    },
  },
  GeneralTabListResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GeneralTabListResponseData', id: 2 },
    },
  },
});

// 6. getHistoryForum (cmd=309601)
tieba.getHistoryForum = ns('getHistoryForum', {
  GetHistoryForumRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      fname: { type: 'string', id: 2 },
    },
  },
  GetHistoryForumRequest: {
    fields: { data: { type: 'GetHistoryForumRequestData', id: 1 } },
  },
  GetHistoryForumResponseData: {
    fields: {
      forumList: { rule: 'repeated', type: 'ForumInfo', id: 1, protoName: 'forum_list' },
    },
  },
  GetHistoryForumResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetHistoryForumResponseData', id: 2 },
    },
  },
});

// 7. forumGuide (cmd=309683)
tieba.forumGuide = ns('forumGuide', {
  LikeForum: {
    fields: {
      forumId: { type: 'uint64', id: 1, protoName: 'forum_id' },
      forumName: { type: 'string', id: 2, protoName: 'forum_name' },
      avatar: { type: 'string', id: 3 },
      memberCount: { type: 'uint32', id: 4, protoName: 'member_count' },
      threadCount: { type: 'uint32', id: 5, protoName: 'thread_count' },
      isLike: { type: 'int32', id: 6, protoName: 'is_like' },
    },
  },
  HotSearch: {
    fields: {
      word: { type: 'string', id: 1 },
      score: { type: 'int32', id: 2 },
    },
  },
  ForumGuideRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      sortType: { type: 'int32', id: 2, protoName: 'sort_type' },
      callFrom: { type: 'int32', id: 3, protoName: 'call_from' },
      pageNo: { type: 'int32', id: 4, protoName: 'page_no' },
      resNum: { type: 'int32', id: 5, protoName: 'res_num' },
    },
  },
  ForumGuideRequest: {
    fields: { data: { type: 'ForumGuideRequestData', id: 1 } },
  },
  ForumGuideResponseData: {
    fields: {
      likeForum: { rule: 'repeated', type: 'LikeForum', id: 1, protoName: 'like_forum' },
      hotSearch: { rule: 'repeated', type: 'HotSearch', id: 2, protoName: 'hot_search' },
    },
  },
  ForumGuideResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'ForumGuideResponseData', id: 2 },
    },
  },
});

// 8. forumRecommend (cmd=303011)
tieba.forumRecommend = ns('forumRecommend', {
  LikeForumRec: {
    fields: {
      forumId: { type: 'uint64', id: 1, protoName: 'forum_id' },
      forumName: { type: 'string', id: 2, protoName: 'forum_name' },
      avatar: { type: 'string', id: 3 },
      memberCount: { type: 'uint32', id: 4, protoName: 'member_count' },
      threadCount: { type: 'uint32', id: 5, protoName: 'thread_count' },
      isLike: { type: 'int32', id: 6, protoName: 'is_like' },
      levelId: { type: 'int32', id: 7, protoName: 'level_id' },
    },
  },
  ForumRecommendRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      likeForum: { type: 'string', id: 2, protoName: 'like_forum' },
      recommend: { type: 'string', id: 3 },
      topic: { type: 'string', id: 4 },
    },
  },
  ForumRecommendRequest: {
    fields: { data: { type: 'ForumRecommendRequestData', id: 1 } },
  },
  ForumRecommendResponseData: {
    fields: {
      likeForum: { rule: 'repeated', type: 'LikeForumRec', id: 1, protoName: 'like_forum' },
    },
  },
  ForumRecommendResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'ForumRecommendResponseData', id: 2 },
    },
  },
});

// 9. personalized (cmd=309264)
// 字段号对齐官方 Personalized/DataReq.proto + DataRes.proto：
//   DataReq { common=1; tag_code=2; need_tags=3; load_type=4; page_thread_count=5;
//             pn=6; sug_count=7; scr_w=8; scr_h=9; scr_dip=10; q_type=11; ...
//             need_forumlist=22; new_net_type=23; pre_ad_thread_count=26;
//             new_install=27; request_times=28; invoke_source=29; ... }
//   DataRes { repeated ThreadInfo thread_list=2; ... }
tieba.personalized = ns('personalized', {
  PersonalizedRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      tagCode: { type: 'uint32', id: 2, protoName: 'tag_code' },
      needTags: { type: 'uint32', id: 3, protoName: 'need_tags' },
      loadType: { type: 'uint32', id: 4, protoName: 'load_type' },
      pageThreadCount: { type: 'uint32', id: 5, protoName: 'page_thread_count' },
      pn: { type: 'uint32', id: 6 },
      sugCount: { type: 'uint32', id: 7, protoName: 'sug_count' },
      scrW: { type: 'int32', id: 8, protoName: 'scr_w' },
      scrH: { type: 'int32', id: 9, protoName: 'scr_h' },
      scrDip: { type: 'double', id: 10, protoName: 'scr_dip' },
      qType: { type: 'int32', id: 11, protoName: 'q_type' },
      needForumlist: { type: 'uint32', id: 22, protoName: 'need_forumlist' },
      newNetType: { type: 'uint32', id: 23, protoName: 'new_net_type' },
      preAdThreadCount: { type: 'int32', id: 26, protoName: 'pre_ad_thread_count' },
      newInstall: { type: 'int32', id: 27, protoName: 'new_install' },
      requestTimes: { type: 'int32', id: 28, protoName: 'request_times' },
      invokeSource: { type: 'string', id: 29, protoName: 'invoke_source' },
    },
  },
  PersonalizedRequest: {
    fields: { data: { type: 'PersonalizedRequestData', id: 1 } },
  },
  PersonalizedResponseData: {
    fields: {
      threadList: { rule: 'repeated', type: 'ThreadInfo', id: 2, protoName: 'thread_list' },
      threadPersonalized: { rule: 'repeated', type: 'ThreadPersonalized', id: 7, protoName: 'thread_personalized' },
    },
  },
  ThreadPersonalized: {
    fields: {
      tid: { type: 'uint64', id: 1 },
      weight: { type: 'string', id: 2 },
      source: { type: 'string', id: 3 },
      dislikeResource: { rule: 'repeated', type: 'DislikeReason', id: 5, protoName: 'dislikeResource' },
      extra: { type: 'string', id: 6 },
    },
  },
  DislikeReason: {
    fields: {
      dislikeReason: { type: 'string', id: 1 },
      dislikeId: { type: 'uint32', id: 2 },
      extra: { type: 'string', id: 3 },
    },
  },
  PersonalizedResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'PersonalizedResponseData', id: 2 },
    },
  },
});

// 10. userLike (cmd=309474)
// 字段号对齐官方 Userlike/DataReq.proto + DataRes.proto：
//   DataReq { common=1; page_tag=2; last_req_unix=3; follow_type=4; load_type=5; ... }
//   DataRes { repeated ConcernData thread_info=1; string page_tag=2;
//             repeated UserList user_list=3; int32 has_more=4; ... uint64 req_unix=10; }
//   ConcernData { ThreadInfo thread_list=1; PostData post_data=2; int32 recom_type=3;
//                 int32 source=4; repeated User recom_user_list=5; }
tieba.userLike = ns('userLike', {
  UserLikeRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      pageTag: { type: 'string', id: 2, protoName: 'page_tag' },
      lastRequestUnix: { type: 'uint64', id: 3, protoName: 'last_req_unix' },
      followType: { type: 'int32', id: 4, protoName: 'follow_type' },
      loadType: { type: 'int32', id: 5, protoName: 'load_type' },
    },
  },
  UserLikeRequest: {
    fields: { data: { type: 'UserLikeRequestData', id: 1 } },
  },
  ConcernData: {
    fields: {
      threadList: { type: 'ThreadInfo', id: 1, protoName: 'thread_list' },
      postData: { type: 'ConcernPostData', id: 2, protoName: 'post_data' },
      recommendType: { type: 'int32', id: 3, protoName: 'recom_type' },
      source: { type: 'int32', id: 4 },
      recommendUserList: { rule: 'repeated', type: 'User', id: 5, protoName: 'recom_user_list' },
    },
  },
  ConcernPostData: {
    fields: {
      id: { type: 'uint64', id: 1 },
      content: { rule: 'repeated', type: 'PbContent', id: 2 },
      postTitle: { type: 'string', id: 3, protoName: 'post_title' },
      author: { type: 'User', id: 4 },
      time: { type: 'uint64', id: 5 },
    },
  },
  UserLikeResponseData: {
    fields: {
      threadInfo: { rule: 'repeated', type: 'ConcernData', id: 1, protoName: 'thread_info' },
      pageTag: { type: 'string', id: 2, protoName: 'page_tag' },
      hasMore: { type: 'int32', id: 4, protoName: 'has_more' },
      requestUnix: { type: 'uint64', id: 10, protoName: 'req_unix' },
    },
  },
  UserLikeResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'UserLikeResponseData', id: 2 },
    },
  },
});

// 11. userPost (cmd=303002)
// 字段号对齐官方 UserPost/DataReq.proto + DataRes.proto：
//   DataReq { uid=1; rn=2; offset=3; is_thread=4; need_content=5; forum_id=6;
//             begin_time=7; end_time=8; subtype=9; ...; pn=26; common=27;
//             scr_w=29; scr_h=30; scr_dip=31; q_type=32; is_view_card=33; ... }
//   DataRes { repeated PostInfoList post_list=1; ... }
tieba.userPost = ns('userPost', {
  UserPostRequestData: {
    fields: {
      uid: { type: 'int64', id: 1 },
      rn: { type: 'uint32', id: 2 },
      offset: { type: 'uint32', id: 3 },
      isThread: { type: 'uint32', id: 4, protoName: 'is_thread' },
      needContent: { type: 'uint32', id: 5, protoName: 'need_content' },
      forumId: { type: 'uint64', id: 6, protoName: 'forum_id' },
      beginTime: { type: 'uint32', id: 7, protoName: 'begin_time' },
      endTime: { type: 'uint32', id: 8, protoName: 'end_time' },
      subtype: { type: 'uint32', id: 9 },
      moduleName: { type: 'string', id: 13, protoName: 'module_name' },
      stType: { type: 'uint32', id: 14, protoName: 'st_type' },
      userId: { type: 'int64', id: 19, protoName: 'user_id' },
      userName: { type: 'string', id: 20, protoName: 'user_name' },
      portrait: { type: 'string', id: 22 },
      pn: { type: 'uint32', id: 26 },
      common: { type: 'CommonRequest', id: 27 },
      isTwzhibo: { type: 'uint32', id: 28, protoName: 'is_twzhibo' },
      scrW: { type: 'int32', id: 29, protoName: 'scr_w' },
      scrH: { type: 'int32', id: 30, protoName: 'scr_h' },
      scrDip: { type: 'double', id: 31, protoName: 'scr_dip' },
      qType: { type: 'int32', id: 32, protoName: 'q_type' },
      isViewCard: { type: 'int32', id: 33, protoName: 'is_view_card' },
    },
  },
  UserPostRequest: {
    fields: { data: { type: 'UserPostRequestData', id: 1 } },
  },
  UserPostResponseData: {
    fields: {
      postList: { rule: 'repeated', type: 'PostInfoList', id: 1, protoName: 'post_list' },
      hidePost: { type: 'uint32', id: 2, protoName: 'hide_post' },
      time: { type: 'uint64', id: 3 },
    },
  },
  UserPostResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'UserPostResponseData', id: 2 },
    },
  },
});

// 12. getUserInfo (cmd=303024)
tieba.getUserInfo = ns('getUserInfo', {
  GetUserInfoRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      uid: { type: 'int64', id: 2 },
      scrW: { type: 'int32', id: 3, protoName: 'scr_w' },
    },
  },
  GetUserInfoRequest: {
    fields: { data: { type: 'GetUserInfoRequestData', id: 1 } },
  },
  GetUserInfoResponseData: {
    fields: {
      user: { type: 'User', id: 1 },
    },
  },
  GetUserInfoResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetUserInfoResponseData', id: 2 },
    },
  },
});

// 13. threadList (cmd=301002)
tieba.threadList = ns('threadList', {
  ThreadListRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 8 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
      forumName: { type: 'string', id: 14, protoName: 'forum_name' },
      needAbstract: { type: 'uint32', id: 3, protoName: 'need_abstract' },
      pn: { type: 'int32', id: 13 },
      qType: { type: 'uint32', id: 7, protoName: 'q_type' },
      scrDip: { type: 'double', id: 12, protoName: 'scr_dip' },
      scrH: { type: 'uint32', id: 6, protoName: 'scr_h' },
      scrW: { type: 'uint32', id: 5, protoName: 'scr_w' },
      sortType: { type: 'int32', id: 16, protoName: 'sort_type' },
      stType: { type: 'uint32', id: 4, protoName: 'st_type' },
      threadIds: { type: 'string', id: 1, protoName: 'thread_ids' },
      userId: { type: 'int64', id: 9, protoName: 'user_id' },
      platform: { type: 'string', id: 11 },
    },
  },
  ThreadListRequest: {
    fields: { data: { type: 'ThreadListRequestData', id: 1 } },
  },
  ThreadListResponseData: {
    fields: {
      threadList: { rule: 'repeated', type: 'ThreadInfo', id: 1, protoName: 'thread_list' },
      userList: { rule: 'repeated', type: 'User', id: 2, protoName: 'user_list' },
    },
  },
  ThreadListResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'ThreadListResponseData', id: 2 },
    },
  },
});

// 14. getForumDetail (cmd=303021)
// 字段号对齐官方 GetForumDetail/DataReq.proto + GetForumDetailResIdl.proto：
//   DataReq { int64 forum_id=1; CommonReq common=2; int32 is_newfrs=4; }
//   DataRes { RecommendForumInfo forum_info=1; repeated SimpleThreadInfo thread_list=2; ... }
tieba.getForumDetail = ns('getForumDetail', {
  GetForumDetailRequestData: {
    fields: {
      forumId: { type: 'int64', id: 1, protoName: 'forum_id' },
      common: { type: 'CommonRequest', id: 2 },
      isNewfrs: { type: 'int32', id: 4, protoName: 'is_newfrs' },
    },
  },
  GetForumDetailRequest: {
    fields: { data: { type: 'GetForumDetailRequestData', id: 1 } },
  },
  GetForumDetailResponseData: {
    fields: {
      forumInfo: { type: 'RecommendForumInfo', id: 1, protoName: 'forum_info' },
      threadList: { rule: 'repeated', type: 'SimpleThreadInfo', id: 2, protoName: 'thread_list' },
    },
  },
  RecommendForumInfo: {
    fields: {
      avatar: { type: 'string', id: 1 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
      forumName: { type: 'string', id: 3, protoName: 'forum_name' },
      isLike: { type: 'uint32', id: 4, protoName: 'is_like' },
      memberCount: { type: 'uint32', id: 5, protoName: 'member_count' },
      threadCount: { type: 'uint32', id: 6, protoName: 'thread_count' },
      slogan: { type: 'string', id: 7 },
    },
  },
  SimpleThreadInfo: {
    fields: {
      tid: { type: 'uint64', id: 1 },
      title: { type: 'string', id: 2 },
      replyNum: { type: 'int32', id: 3, protoName: 'reply_num' },
      lastTimeInt: { type: 'int32', id: 4, protoName: 'last_time_int' },
      _abstract: { rule: 'repeated', type: 'Abstract', id: 5 },
      threadType: { type: 'uint64', id: 7, protoName: 'thread_type' },
    },
  },
  GetForumDetailResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetForumDetailResponseData', id: 2 },
    },
  },
});

// 15. searchSug (cmd=309438)
tieba.searchSug = ns('searchSug', {
  SearchSugRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      word: { type: 'string', id: 2 },
      isforum: { type: 'string', id: 3 },
    },
  },
  SearchSugRequest: {
    fields: { data: { type: 'SearchSugRequestData', id: 1 } },
  },
  SearchSugResponseData: {
    fields: {
      forumLoc: { type: 'int32', id: 1, protoName: 'forum_loc' },
      list: { rule: 'repeated', type: 'string', id: 2 },
      forumList: { rule: 'repeated', type: 'ForumInfo', id: 3, protoName: 'forum_list' },
    },
  },
  SearchSugResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'SearchSugResponseData', id: 2 },
    },
  },
});

// 16. getDislikeList (cmd=309692) — 屏蔽吧列表查看（对齐权威 GetDislikeList proto）
tieba.getDislikeList = ns('getDislikeList', {
  ForumList: {
    fields: {
      forumId: { type: 'int64', id: 1, protoName: 'forum_id' },
      forumName: { type: 'string', id: 2, protoName: 'forum_name' },
      avatar: { type: 'string', id: 3 },
      memberCount: { type: 'int32', id: 4, protoName: 'member_count' },
      slogan: { type: 'string', id: 5 },
      content: { type: 'string', id: 6 },
      postNum: { type: 'int64', id: 7, protoName: 'post_num' },
      threadNum: { type: 'int64', id: 8, protoName: 'thread_num' },
    },
  },
  GetDislikeListRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      userId: { type: 'int64', id: 2, protoName: 'user_id' },
      pn: { type: 'int32', id: 3 },
      rn: { type: 'int32', id: 4 },
    },
  },
  GetDislikeListRequest: {
    fields: { data: { type: 'GetDislikeListRequestData', id: 1 } },
  },
  GetDislikeListResponseData: {
    fields: {
      forumList: { rule: 'repeated', type: 'ForumList', id: 1, protoName: 'forum_list' },
      hasMore: { type: 'int32', id: 2, protoName: 'has_more' },
      curPage: { type: 'int32', id: 3, protoName: 'cur_page' },
    },
  },
  GetDislikeListResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetDislikeListResponseData', id: 2 },
    },
  },
});

  return j;
}

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const protosPath = path.join(__dirname, '..', 'src', 'services', 'api', 'protos.json');
  const j = JSON.parse(fs.readFileSync(protosPath, 'utf8'));
  applyProtosPatches(j);
  fs.writeFileSync(protosPath, JSON.stringify(j));
  console.log('Done! Added 15 namespaces to protos.json');
  console.log('Total namespaces:', Object.keys(j.nested.tieba.nested).length);
}

module.exports = { applyProtosPatches };
