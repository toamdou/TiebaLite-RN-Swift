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
tieba.getLevelInfo = ns('getLevelInfo', {
  GetLevelInfoRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
    },
  },
  GetLevelInfoRequest: {
    fields: { data: { type: 'GetLevelInfoRequestData', id: 1 } },
  },
  GetLevelInfoResponseData: {
    fields: {
      levelInfo: { type: 'string', id: 1, protoName: 'level_info' },
    },
  },
  GetLevelInfoResponse: {
    fields: {
      error: { type: 'Error', id: 1 },
      data: { type: 'GetLevelInfoResponseData', id: 2 },
    },
  },
});

// 3. getMemberInfo (cmd=301004)
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
      common: { type: 'CommonRequest', id: 1 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
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
      error: { type: 'Error', id: 1 },
      data: { type: 'GetMemberInfoResponseData', id: 2 },
    },
  },
});

// 4. forumRuleDetail (cmd=309690)
tieba.forumRuleDetail = ns('forumRuleDetail', {
  ForumRuleDetailRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      forumId: { type: 'uint64', id: 2, protoName: 'forum_id' },
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
tieba.generalTabList = ns('generalTabList', {
  GeneralTabListRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      forumId: { type: 'int64', id: 2, protoName: 'forum_id' },
      tabType: { type: 'int32', id: 3, protoName: 'tab_type' },
      pn: { type: 'int32', id: 4 },
      rn: { type: 'int32', id: 5 },
      sortType: { type: 'int32', id: 6, protoName: 'sort_type' },
      tabName: { type: 'string', id: 7, protoName: 'tab_name' },
      tabCode: { type: 'string', id: 8, protoName: 'tab_code' },
    },
  },
  GeneralTabListRequest: {
    fields: { data: { type: 'GeneralTabListRequestData', id: 1 } },
  },
  GeneralTabListResponseData: {
    fields: {
      tabList: { rule: 'repeated', type: 'FrsTabInfo', id: 1, protoName: 'tab_list' },
      threadList: { rule: 'repeated', type: 'ThreadInfo', id: 2, protoName: 'thread_list' },
      userList: { rule: 'repeated', type: 'User', id: 3, protoName: 'user_list' },
      page: { type: 'Page', id: 4 },
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
tieba.personalized = ns('personalized', {
  PersonalizedRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      loadType: { type: 'int32', id: 2, protoName: 'load_type' },
      pn: { type: 'int32', id: 3 },
      needTags: { type: 'int32', id: 4, protoName: 'need_tags' },
      pageThreadCount: { type: 'int32', id: 5, protoName: 'page_thread_count' },
      preAdThreadCount: { type: 'int32', id: 6, protoName: 'pre_ad_thread_count' },
      sugCount: { type: 'int32', id: 7, protoName: 'sug_count' },
      tagCode: { type: 'int32', id: 8, protoName: 'tag_code' },
      qType: { type: 'int32', id: 9, protoName: 'q_type' },
      needForumlist: { type: 'int32', id: 10, protoName: 'need_forumlist' },
      newNetType: { type: 'int32', id: 11, protoName: 'new_net_type' },
      newInstall: { type: 'int32', id: 12, protoName: 'new_install' },
      requestTime: { type: 'int64', id: 13, protoName: 'request_time' },
      invokeSource: { type: 'string', id: 14, protoName: 'invoke_source' },
      scrDip: { type: 'double', id: 15, protoName: 'scr_dip' },
      scrH: { type: 'uint32', id: 16, protoName: 'scr_h' },
      scrW: { type: 'uint32', id: 17, protoName: 'scr_w' },
    },
  },
  PersonalizedRequest: {
    fields: { data: { type: 'PersonalizedRequestData', id: 1 } },
  },
  PersonalizedResponseData: {
    fields: {
      threadList: { rule: 'repeated', type: 'ThreadInfo', id: 1, protoName: 'thread_list' },
      userList: { rule: 'repeated', type: 'User', id: 2, protoName: 'user_list' },
      page: { type: 'Page', id: 3 },
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
tieba.userLike = ns('userLike', {
  UserLikeRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      loadType: { type: 'int32', id: 2, protoName: 'load_type' },
      pageTag: { type: 'string', id: 3, protoName: 'page_tag' },
      lastRequestUnix: { type: 'int64', id: 4, protoName: 'last_request_unix' },
    },
  },
  UserLikeRequest: {
    fields: { data: { type: 'UserLikeRequestData', id: 1 } },
  },
  UserLikeResponseData: {
    fields: {
      threadList: { rule: 'repeated', type: 'ThreadInfo', id: 1, protoName: 'thread_list' },
      userList: { rule: 'repeated', type: 'User', id: 2, protoName: 'user_list' },
      pageTag: { type: 'string', id: 3, protoName: 'page_tag' },
      hasMore: { type: 'int32', id: 4, protoName: 'has_more' },
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
tieba.userPost = ns('userPost', {
  UserPostRequestData: {
    fields: {
      common: { type: 'CommonRequest', id: 1 },
      uid: { type: 'uint64', id: 2 },
      rn: { type: 'int32', id: 3 },
      isThread: { type: 'int32', id: 4, protoName: 'is_thread' },
      needContent: { type: 'int32', id: 5, protoName: 'need_content' },
      pn: { type: 'int32', id: 6 },
      scrW: { type: 'int32', id: 7, protoName: 'scr_w' },
      scrH: { type: 'int32', id: 8, protoName: 'scr_h' },
      scrDip: { type: 'double', id: 9, protoName: 'scr_dip' },
      qType: { type: 'int32', id: 10, protoName: 'q_type' },
      isViewCard: { type: 'int32', id: 11, protoName: 'is_view_card' },
      subtype: { type: 'int32', id: 12 },
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
tieba.getForumDetail = ns('getForumDetail', {
  GetForumDetailRequestData: {
    fields: {
      forumId: { type: 'int64', id: 1, protoName: 'forum_id' },
      common: { type: 'CommonRequest', id: 2 },
    },
  },
  GetForumDetailRequest: {
    fields: { data: { type: 'GetForumDetailRequestData', id: 1 } },
  },
  GetForumDetailResponseData: {
    fields: {},
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
