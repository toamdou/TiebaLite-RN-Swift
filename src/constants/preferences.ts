import type { AppPreferences } from '@/types';

/**
 * Default application preferences used when no stored values exist.
 * Kept outside PreferencesStorage so the reactive preference cache can
 * share it without creating a circular import.
 */
export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'tieba',
  fontScale: 1.0,
  autoSign: false,
  autoSignTime: '08:00',
  imageLoadType: 'smart_load',
  incognitoMode: false,
  defaultStartTab: 'home', // Not consumed by tab startup yet; UI marks it as no-op.
  defaultSortType: '0',
  forumFabFunction: 'post',
  lightTheme: 'tieba',
  darkTheme: 'dark',
  darkMode: false,
  followSystemDarkMode: true,
  toolbarPrimaryColor: false,
  statusBarFontDark: false,
  showBothUsername: false,
  collectSeeLz: true,
  collectDescSort: false,
  showShortcutInThread: true,
  hideReply: false,
  blockVideo: false,
  hideMedia: false,
  hideBlockedContent: false,
  imageWatermarkEnabled: false,
  imageWatermark: 'none',
  imageDarkenWhenNight: true,
  useBuiltInBrowser: true,
  translucentAlpha: 0.85,
  customPrimaryColor: '#4477E0',
  slowSignMode: false,
  failAutoStop: true,
  useOfficialSign: true,
  liveActivitySignEnabled: true,
  /** 默认在灵动岛显示签到进度（可在设置改为通知栏） */
  signDisplayMode: 'liveActivity',
  /** 默认关闭静默签到（完成通知带声音提示） */
  signSilent: false,
  /** 默认按等级排序关注吧列表（右上角图标切换为按名称） */
  forumSortMode: 'level',
  homePageShowHistoryForum: true,
  /** 关注吧列表布局：true = 一行一个；false = 一行两个（Kotlin listSingle 对位） */
  forumListSingle: true,
  exploreAutoRefresh: true,
  hapticFeedback: true,
  /** 大图清晰度：默认 high（bigPic ~960px，省 60-80%）；origin=原图；lite=更省 */
  dataSaverMode: 'high',
};
