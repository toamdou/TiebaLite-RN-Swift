// ============================================================
// TiebaLite - Motion Tokens (动效令牌补齐)
//
// 复用 springs.ts 的 EASE_OUT / DURATION 风格，参数与现有
// SPRING_UI / SPRING_MOMENTUM 同一模型（damping/stiffness/mass
// withSpring 配置），不引入第三方动画库。设计文档 §3.3。
// ============================================================

import { DURATION, EASE_OUT } from './springs';

/**
 * LIST_ENTER — 列表入场：fade 0→1 + translateY 8→0，stagger 35ms。
 * 滚动复用单元格不重放（仅首帧入场触发）。
 */
export const LIST_ENTER = {
  fade: { from: 0, to: 1, duration: DURATION.enter, easing: EASE_OUT },
  translateY: { from: 8, to: 0, duration: DURATION.enter, easing: EASE_OUT },
  /** 级联入场间隔（ms） */
  stagger: DURATION.stagger,
} as const;

/**
 * SHEET_PRESENT — 浮层展开：轻微过冲，跟随手感。
 */
export const SHEET_PRESENT = {
  spring: { damping: 18, stiffness: 240, mass: 1 },
  translateY: { from: 0.15, to: 0 },
  opacity: { from: 0, to: 1 },
} as const;

/**
 * SHEET_DISMISS — 浮层收起：标准退场缓动，快于入场。
 */
export const SHEET_DISMISS = {
  duration: DURATION.exit,
  easing: EASE_OUT,
  translateY: { from: 0, to: 0.05 },
  opacity: { from: 1, to: 0 },
} as const;

/**
 * ICON_POP — 图标弹跳（小过冲）：scale 1 → 1.15 → 1。
 * 轻量 transform，不触发重排。
 */
export const ICON_POP = {
  spring: { damping: 10, stiffness: 300, mass: 0.6 },
  scale: { from: 1, overshoot: 1.15, settle: 1 },
} as const;
