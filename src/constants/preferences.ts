import type { AppPreferences } from '@/types';

/**
 * Default application preferences used when no stored values exist.
 * Kept outside PreferencesStorage so the reactive preference cache can
 * share it without creating a circular import.
 */
export const DEFAULT_PREFERENCES: AppPreferences = {
  fontScale: 1.0,
  autoSign: false,
  autoSignTime: '08:00',
  imageLoadType: 'smart_load',
  incognitoMode: false,
  defaultStartTab: 'home', // Not consumed by tab startup yet; UI marks it as no-op.
  defaultSortType: '0',
  forumFabFunction: 'refresh',
  toolbarPrimaryColor: false,
  statusBarFontDark: false,
  showBothUsername: false,
  collectSeeLz: true,
  collectDescSort: false,
  showShortcutInThread: true,
  hideReply: false,
  forumSingleColumn: true, // 默认单列布局（设置里可切换双列）
  homeForumLayout: 'single', // 首页关注吧默认一行一个
  homeForumSort: 'name', // 默认按吧名排序
  blockVideo: false,
  hideMedia: false,
  showFollowedOnly: false, // Not consumed by feed pages yet.
  hideBlockedContent: false,
  imageWatermarkEnabled: false,
  imageWatermark: 'none',
  imageDarkenWhenNight: true,
  useBuiltInBrowser: true,
  slowSignMode: false,
  failAutoStop: true,
  useOfficialSign: true,
  liveActivitySignEnabled: true,
  homePageShowHistoryForum: true,
  exploreAutoRefresh: true,
  hapticFeedback: true,
};
