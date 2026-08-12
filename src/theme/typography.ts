// ============================================================
// TiebaLite React Native - iOS Dynamic Type Scale
// design-taste-frontend: SF Pro Text + SF Pro Rounded (数字)
// 通过字号×字重跳跃实现对比，不加载第三方字体
// ============================================================

import { StyleSheet } from 'react-native';

// ---------- Typography Token ----------
export interface TypographyStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700' | '900';
  letterSpacing?: number;
}

// ---------- iOS Dynamic Type Scale ----------
// 规则: letterSpacing 全部 0（中文）; 行高≥1.4x; 相邻层级跳跃≥1.25x
export const Typography: Record<string, TypographyStyle> = {
  /** 34/41/700 — 页面大标题（首页"关注"、发现页"发现"） */
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: 0,
  },

  /** 22/28/700 — 分区标题、吧名 */
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },

  /** 20/25/600 — 用户昵称、卡片标题强调 */
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: 0,
  },

  /** 17/22/600 — 帖子标题、列表主文字 */
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0,
  },

  /** 17/24/400 — 帖子正文 */
  body: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },

  /** 16/21/400 — 引用、次级正文 */
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: 0,
  },

  /** 15/20/400 — 摘要、次级内容 */
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },

  /** 13/18/400 — 时间、统计数字 */
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0,
  },

  /** 12/16/400 — 操作栏文字、徽章 */
  caption1: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0,
  },

  /** 11/13/400 — 最小辅助文字 */
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400',
    letterSpacing: 0,
  },

  // ---------- Bold 变体（设计系统契约 v2，贴 SF 动态字号） ----------
  /** 34/41/900 */
  largeTitleBold: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '900',
    letterSpacing: 0,
  },
  /** 22/28/900 */
  title2Bold: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  /** 20/25/700 */
  title3Bold: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: 0,
  },
  /** 17/22/700 */
  headlineBold: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  /** 17/24/600 */
  bodyBold: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 16/21/600 */
  calloutBold: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 15/20/600 */
  subheadBold: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 13/18/600 */
  footnoteBold: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 12/16/600 */
  caption1Bold: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 11/13/600 */
  caption2Bold: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },

  /** 20/24/700 — 热榜排名、统计数字（SwiftUI 层用 design:'rounded'） */
  number: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
};

// ---------- RN StyleSheet shortcuts ----------
export const typographyStyles = StyleSheet.create({
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: 0,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: 0,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyBold: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0,
  },
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
  subheadBold: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: 0,
  },
  calloutBold: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: 0,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0,
  },
  footnoteBold: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  caption1: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0,
  },
  caption1Bold: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400',
    letterSpacing: 0,
  },
  caption2Bold: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  /** 热榜排名、统计数字 */
  number: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
});

// Legacy compatibility export
export { typographyStyles as TypographyStyles };
