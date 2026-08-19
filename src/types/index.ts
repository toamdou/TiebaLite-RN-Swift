// ============================================================
// TiebaLite React Native - Core Type Definitions
// Migrated from com.huanchengfly.tieba.post
// ============================================================

// ---------- API Enums ----------
export enum ForumSortType {
  REPLY_TIME = 'REPLY_TIME',
  SEND_TIME = 'SEND_TIME',
}

export enum SearchThreadOrder {
  NEW_FIRST = 5,
  OLD_FIRST = 0,
  RELEVANT = 2,
}

export enum SearchThreadFilter {
  ALL = 1,
  ONLY_THREAD = 2,
}

export enum LoadType {
  REFRESH = 1,
  LOAD_MORE = 2,
}

// ---------- Account ----------
export interface Account {
  id: number;
  uid: string;
  name: string;
  nameShow: string;
  portrait: string;
  bduss: string;
  sToken: string;
  tbs: string;
  cookie: string;
  uuid: string;
  zid: string;
  /** Cached profile fields used by cold-start UI before the profile API returns. */
  levelId?: number;
  levelName?: string;
  intro?: string;
  fansNum?: number;
  concernNum?: number;
  postNum?: number;
}

// ---------- User ----------
export interface UserInfo {
  id: string;
  name: string;
  nameShow: string;
  portrait: string;
  levelId: number;
  levelName: string;
  sex: number; // 1=male, 2=female
  intro: string;
  fansNum: number;
  concernNum: number;
  postNum: number;
  totalAgreeNum?: number;
  ipLocation: string;
  tbAge: number;
  isBawu: boolean;
  /** Baidu tieba UID (numeric) */
  tiebaUid?: string;
  /** Whether current user has followed/concerned this user (0=no, 1=yes) */
  hasConcerned?: number;
  /** 吧主 verification badge */
  bazhuGrade?: { desc: string };
  /** 大神 verification badge */
  newGodData?: { status: number; fieldName?: string };
}

export interface UserProfile {
  user: UserInfo;
  statue: {
    postsNum: number;
    threadsNum: number;
    concernForumsNum: number;
  };
}

// ---------- Forum ----------
export interface ForumInfo {
  forumId: string;
  forumName: string;
  /** Alias for forumName used in some contexts */
  name?: string;
  avatar: string;
  slogan: string;
  memberCount: number;
  threadCount: number;
  levelName: string;
  levelId: number;
  isLike: boolean;
  isSign: boolean;
  signCount?: number;
}

export interface ForumDetail {
  forumId: string;
  forumName: string;
  avatar: string;
  memberCount: number;
  threadCount: number;
  intro: string;
  isLike: boolean;
  /** Forum experience level (user's level in this forum) */
  levelId?: number;
  levelName?: string;
  /** Current experience score (for level progress bar) */
  curScore?: number;
  /** Experience needed for next level */
  levelupScore?: number;
  /** Sign-in info */
  signInInfo?: {
    isSignIn: boolean;
    contSignNum: number;
    userSignRank: number;
    signBonusPoint: number;
  };
  /** Anti-tbs token for sign/like operations */
  tbs?: string;
}

// ---------- Thread / Post ----------
export interface ThreadInfo {
  id: string;
  title: string;
  forumId: string;
  forumName: string;
  authorId: string;
  authorName: string;
  authorNameShow: string;
  authorPortrait: string;
  authorLevelId: number;
  replyNum: number;
  viewNum: number;
  lastTime: number;
  createTime: number;
  isTop: boolean;
  isGood: boolean;
  isVideo: boolean;
  mediaList: MediaInfo[];
  abstract: string;
  firstPostContent: PostContent[];
  zanNum?: number;
  shareNum?: number;
  /** Whether current user has agreed */
  hasAgree?: boolean;
  /** Forum avatar for chip display */
  forumAvatar?: string;
  /** Whether this thread is a shared/forwarded thread */
  isShareThread?: boolean;
  /** Original thread info for shared threads */
  originThreadInfo?: {
    title?: string;
    content?: string;
    forumName?: string;
    media?: MediaInfo[];
  };
}

export interface PostInfo {
  id: string;
  threadId: string;
  forumId: string;
  forumName: string;
  floor: number;
  authorId: string;
  authorName: string;
  authorNameShow: string;
  authorPortrait: string;
  authorLevelId: number;
  authorIsLz: boolean;
  content: PostContent[];
  createTime: number;
  subPostNum: number;
  subPosts?: SubPostInfo[];
  agreeNum: number;
  disagreeNum: number;
  isAgree: boolean;
  isDisagree: boolean;
  ipLocation: string;
  signiture?: string;
}

export interface SubPostInfo {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorNameShow: string;
  authorPortrait: string;
  authorLevelId?: number;
  content: PostContent[];
  createTime: number;
  replyToUserName?: string;
  ipLocation?: string;
  agreeNum?: number;
  isAgree?: boolean;
}

export type PostContent =
  | { type: 'text'; text: string }
  | { type: 'emoji'; text: string }
  | { type: 'emoticon'; text: string; src: string }
  | { type: 'image'; src: string; width: number; height: number; originSrc?: string }
  | { type: 'video'; src: string; poster: string; width: number; height: number }
  | { type: 'audio'; src: string; duration: number }
  | { type: 'link'; text: string; url: string }
  | { type: 'at'; text: string; uid: string }
  | { type: 'topic'; text: string; topicId: string }
  | { type: 'linebreak' }
  | { type: 'poll'; options: PollOption[]; totalVoteNum: number; hasVoted: boolean; votedOptionIndex?: number };

/** A single poll/vote option */
export interface PollOption {
  text: string;
  voteNum: number;
  index: number;
}

// ---------- Media ----------
export interface MediaInfo {
  type: 'image' | 'video';
  src: string;
  originSrc?: string;
  /** 更小一档的服务端派生图（srcPic，比 src/bigPic 更省流量；可能缺失） */
  smallSrc?: string;
  width: number;
  height: number;
  poster?: string;
  duration?: number;
}

// ---------- Feed / Personalized ----------
export interface FeedItem {
  type: 'thread' | 'forum' | 'topic' | 'user' | 'video_thread';
  threadInfo?: ThreadInfo;
  forumInfo?: ForumInfo;
  topicInfo?: TopicInfo;
  userInfo?: UserInfo;
}

// ---------- Topic ----------
export interface TopicInfo {
  topicId: string;
  topicName: string;
  topicDesc: string;
  discussNum: number;
  isHot: boolean;
  isNew: boolean;
}

/** Hot topic list item with optional rank and image */
export interface HotTopicListItem {
  topicId: string;
  topicName: string;
  topicDesc: string;
  discussNum: number;
  isHot: boolean;
  isNew: boolean;
  imageUrl?: string;
  rank?: number;
}

// ---------- Hot Thread (Kotlin protobuf aligned) ----------

/** Mirrors Kotlin RecommendTopicList proto */
export interface HotTopic {
  topicId: string;
  topicName: string;
  type: number;
  discussNum: number;
  /** 1 = new, 2 = hot */
  tag: number;
  topicDesc: string;
  topicPic: string;
}

/** Mirrors Kotlin FrsTabInfo proto — tab for filtering hot threads */
export interface HotTabInfo {
  tabId: number;
  tabType: number;
  tabName: string;
  tabCode: string;
  tabUrl: string;
  tabGid: string;
  tabTitle: string;
  isGeneralTab: number;
}

/** Mirrors Kotlin ThreadInfo proto (hot thread subset) */
export interface HotThreadInfo {
  /** Thread id (different from threadId in some contexts) */
  id: string;
  /** Actual thread id for navigation */
  threadId: string;
  title: string;
  replyNum: number;
  viewNum: number;
  forumId: string;
  forumName: string;
  authorId: string;
  authorName: string;
  authorNameShow: string;
  authorPortrait: string;
  firstPostId: string;
  createTime: number;
  agreeNum: number;
  /** Hot ranking score (displayed as "XXXX热度") */
  hotNum: number;
  /** Whether current user has agreed */
  hasAgree: number;
  /** Nested agree info from proto */
  agree?: { agreeNum: number; hasAgree: number; diffAgreeNum: number };
  /** Tab this thread belongs to */
  tabId: number;
  tabName: string;
}

/** Full hot page data (mirrors Kotlin HotThreadListResponseData) */
export interface HotPageData {
  topics: HotTopic[];
  tabs: HotTabInfo[];
  threads: HotThreadInfo[];
}

// ---------- Search ----------
export interface SearchForumResult {
  forumId: string;
  forumName: string;
  avatar: string;
  memberCount: number;
  threadCount: number;
  isLike: boolean;
}

export interface SearchMediaInfo {
  type: string;       // "pic" | "video"
  width: number;
  height: number;
  bigPic?: string;
  smallPic?: string;
  waterPic?: string;
  src?: string;
  vsrc?: string;
}

export interface SearchUserInfo {
  userName: string;
  showNickname?: string;
  userId: string;
  portrait?: string;
}

export interface SearchThreadResult {
  id: string;
  title: string;
  forumName: string;
  authorName: string;
  authorNameShow?: string;
  authorPortrait?: string;
  replyNum: number;
  likeNum: number;
  shareNum: number;
  createTime: number;
  content: string;
  /** Media attachments (images/videos from search results) */
  media: SearchMediaInfo[];
  /** Forum info (avatar for the forum chip) */
  forumAvatar?: string;
  /** Quoted main post (when search result is a quote) */
  mainPost?: {
    title: string;
    content: string;
    user?: SearchUserInfo;
    likeNum?: string;
    shareNum?: string;
    postNum?: string;
    /** Media attachments in the quoted main post */
    media?: SearchMediaInfo[];
  };
  /** Quoted post info (reply being quoted) */
  postInfo?: {
    tid?: number;
    pid?: number;
    title: string;
    content: string;
    user?: SearchUserInfo;
  };
}

export interface SearchUserResult {
  uid: string;
  name: string;
  nameShow: string;
  portrait: string;
  intro: string;
  fansNum: number;
}

export interface SearchPostResult {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorId: string;
  forumName: string;
  createTime: number;
  replyNum: number;
}

// ---------- Messages ----------
export interface MessageItem {
  id: string;
  type: 'reply' | 'at' | 'agree' | 'system';
  fromUserId: string;
  fromUserName: string;
  fromUserPortrait: string;
  threadId: string;
  threadTitle: string;
  postId?: string;
  content: string;
  createTime: number;
  isRead: boolean;
}

export interface NotificationCount {
  reply: number;
  at: number;
  agree: number;
  total: number;
}

// ---------- Sign ----------
export interface SignResult {
  forumId: string;
  forumName: string;
  exp: number;
  signRank: number;
  isSuccess: boolean;
  errorCode?: number;
  errorMsg?: string;
}

// ---------- Favorite ----------
export interface FavoriteThread {
  id: string;
  title: string;
  forumName: string;
  authorName: string;
  postId: string;
  floor: number;
  collectTime: number;
  updateTime: number;
  latestReplyNum: number;
}

// ---------- History ----------
export interface HistoryItem {
  id: string;
  type: 'thread' | 'forum';
  threadId?: string;
  forumName?: string;
  forumId?: string;
  avatar?: string;
  title?: string;
  authorName?: string;
  timestamp: number;
}

// ---------- Block ----------
export interface BlockedWord {
  id: string;
  keyword: string;
  isRegex?: boolean;
  category?: 'blacklist' | 'whitelist';
}

export interface BlockedUser {
  id: string;
  uid: string;
  username?: string;
}

// ---------- Theme ----------
export type ThemeName =
  | 'tieba'
  | 'blue'
  | 'black'
  | 'pink'
  | 'red'
  | 'purple'
  | 'dark'
  | 'blue_dark'
  | 'grey_dark'
  | 'amoled_dark'
  | 'translucent'
  | 'custom';

export interface ThemeColors {
  theme: ThemeName;
  primary: string;
  accent: string;
  background: string;
  windowBackground: string;
  card: string;
  floorCard: string;
  toolbar: string;
  toolbarSurface: string;
  onToolbarSurface: string;
  navBar: string;
  navBarSurface: string;
  onNavBarSurface: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  textOnPrimary: string;
  chip: string;
  onChip: string;
  divider: string;
  unselected: string;
  placeholder: string;
  shadow: string;
  indicator: string;
  isNight: boolean;
}

// ---------- App Preferences ----------
export interface AppPreferences {
  theme: ThemeName;
  fontScale: number;
  autoSign: boolean;
  autoSignTime: string; // HH:mm
  imageLoadType: 'smart_origin' | 'smart_load' | 'all_origin' | 'all_no' | 'original' | 'wifi_only';
  incognitoMode: boolean;
  defaultStartTab: 'home' | 'explore' | 'notifications' | 'user' | 'profile';
  defaultSortType: string;
  forumFabFunction: string;
  /** Light-mode theme name used by ThemeContext. */
  lightTheme: ThemeName;
  /** Dark-mode theme name used by ThemeContext. */
  darkTheme: ThemeName;
  /** Manual dark-mode override (used when followSystemDarkMode is false). */
  darkMode: boolean;
  /** Follow the iOS system appearance. */
  followSystemDarkMode: boolean;
  toolbarPrimaryColor: boolean;
  statusBarFontDark: boolean;
  showBothUsername: boolean;
  collectSeeLz: boolean;
  collectDescSort: boolean;
  showShortcutInThread: boolean;
  hideReply: boolean;
  blockVideo: boolean;
  hideMedia: boolean;
  hideBlockedContent: boolean;
  imageWatermarkEnabled: boolean;
  imageWatermark: 'none' | 'username' | 'forum_name';
  imageDarkenWhenNight: boolean;
  useBuiltInBrowser: boolean;
  translucentAlpha: number;
  customPrimaryColor: string;
  slowSignMode: boolean;
  failAutoStop: boolean;
  useOfficialSign: boolean;
  /** Whether one-click sign progress is shown as an iOS Live Activity. */
  liveActivitySignEnabled: boolean;
  /** 签到进度显示位置：灵动岛 Live Activity / 通知栏横幅（二选一）。 */
  signDisplayMode: 'liveActivity' | 'notification';
  /** 签到静默显示：完成通知不发声、不振动（横幅照常显示）。 */
  signSilent: boolean;
  /** 关注吧列表排序：按等级 / 按名称（首页右上角图标切换）。 */
  forumSortMode: 'level' | 'name';
  homePageShowHistoryForum: boolean;
  /** 关注吧列表布局：true = 一行一个；false = 一行两个 */
  forumListSingle: boolean;
  exploreAutoRefresh: boolean;
  hapticFeedback: boolean;
  /**
   * 大图清晰度（查看器加载哪一档图）：
   * - origin = 原图（originPic，数 MB，画质最佳）
   * - high   = 高清（bigPic ~960px，手机屏幕观感几乎无差，省 60-80%）
   * - lite   = 省流（srcPic 小档，不存在时回落 bigPic，最省流量）
   */
  dataSaverMode: 'origin' | 'high' | 'lite';
}
