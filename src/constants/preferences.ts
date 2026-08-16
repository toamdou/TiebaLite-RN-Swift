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
  forumSingleColumn: false, // Not consumed by forum layout yet.
  blockVideo: false,
  hideMedia: false,
  showFollowedOnly: false, // Not consumed by feed pages yet.
  hideBlockedContent: false,
  imageWatermarkEnabled: false,
  imageWatermark: 'none',
  imageDarkenWhenNight: true,
  useBuiltInBrowser: true,
  useCustomTabs: true, // No UI or consumer yet.
  liftUpBottomBar: false, // No UI or consumer yet.
  statusBarDarker: false, // No UI or consumer yet.
  translucentAlpha: 0.85,
  translucentBlur: 10,
  translucentBackgroundPath: '',
  customPrimaryColor: '#4477E0',
  translucentPrimaryColor: '#FFFFFF',
  ignoreBatteryOptimizationsDialog: false,
  slowSignMode: false,
  failAutoStop: true,
  useOfficialSign: true,
  liveActivitySignEnabled: true,
  experimentalFeatures: false,
  homePageShowHistoryForum: true,
  exploreAutoRefresh: true,
  hapticFeedback: true,
  feedCardStyle: 'twitter',
};
