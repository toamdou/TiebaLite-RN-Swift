// ============================================================
// TiebaLite React Native - API Service Layer
// Barrel export for all API modules.
// ============================================================

// ---------- Configuration ----------
export {
  C_TIEBA,
  TIEBAC,
  TIEBA_WEB,
  CLIENT_VERSION,
  CLIENT_TYPE,
  COMMON_HEADERS,
  SIGN_SECRET,
  getDeviceModel,
  getDeviceBrand,
  generateClientId,
  getClientId,
  setClientId,
  buildCommonParams,
  COOKIE_KEY_BDUSS,
  COOKIE_KEY_STOKEN,
  COOKIE_KEY_TBS,
  DEFAULT_PAGE_SIZE,
  FORUM_PAGE_SIZE,
  DEFAULT_TIMEOUT,
  UPLOAD_TIMEOUT,
  getCuid,
  setCuid,
} from './config';

// ---------- Signing ----------
export { md5, signParams, signFields, generateSign } from './sign';

// ---------- Cookies ----------
export { buildCookieHeader } from './cookies';
export type { CookieOptions } from './cookies';

// ---------- Interceptors ----------
export {
  setAuthCredentials,
  clearAuthCredentials,
  getBduss,
  getStoken,
  addCommonHeadersInterceptor,
  addCommonParamsInterceptor,
  addSignInterceptor,
  addAuthInterceptor,
  errorInterceptor,
  networkErrorInterceptor,
  describeActionFailure,
  TiebaApiError,
  TiebaErrorCode,
} from './interceptors';

// ---------- Client Instances ----------
export {
  tiebaClient,
  tiebacClient,
  tiebaWebClient,
  uploadClient,
  apiGet,
  apiPost,
  apiGetHybrid,
  apiPostHybrid,
  apiUpload,
} from './client';

export type { AxiosInstance, AxiosResponse } from './client';

// ---------- API Endpoints (all functions) ----------
export {
  // Auth
  login,
  initNickname,
  getUserInfo,
  fetchTbs,
  ensureTbs,
  refreshTbsIfNeeded,
  // Forums
  forumGuide,
  forumDetail,
  getForumDetail,
  forumRuleDetail,
  // Threads
  pbPage,
  pbFloor,
  // Posts — 发帖/回复/发图已移除
  delPost,
  delThread,
  // Interactions
  agree,
  disagree,
  likeForum,
  unfavolike,
  followUser,
  unfollowUser,
  // Feed
  personalized,
  userLike,
  hotThreadList,
  topicList,
  // Search
  searchForum,
  searchThread,
  searchUser,
  searchPost,
  // Messages
  msg,
  replyMe,
  atMe,
  agreeMe,
  getMoreMsg,
  // Favorites
  threadStore,
  addStore,
  removeStore,
  // Sign-in
  sign,
  mSign,
  // Profile
  profile,
  profileModify,
  uploadPortrait,
  // User Content
  userPost,
  userLikeForum,
  // Misc
  submitDislike,
  checkReportPost,
  topicDetail,
  setUserBlack,
  cancelUserBlack,
  // Social — 粉丝/关注/黑名单/屏蔽吧/吧成员/等级排行/成长任务
  getFans,
  getFollows,
  getBlacklist,
  delBlacklist,
  getDislikeForums,
  getMemberUsers,
  parseMemberUsersHtml,
  getRankUsers,
  parseRankUsersHtml,
  signGrowth,
  assertProtoSuccess,
  postFormAction,
  mapMediaList,
  mapProtoThread,
} from './endpoints';
