// ============================================================
// TiebaLite React Native - Unified Spring Tokens
// Apple Design: damping ratio + response model
// ============================================================

import { Easing } from 'react-native-reanimated';

/**
 * SPRING_UI — Critically damped, no overshoot.
 * Use for: all UI state transitions (segment indicators, press feedback, overlays)
 * Apple: damping 1.0, response 0.3–0.4
 */
export const SPRING_UI = {
  damping: 20,
  stiffness: 250,
  mass: 1,
} as const;

/**
 * SPRING_MOMENTUM — Slightly under-damped, subtle overshoot.
 * Use for: gesture release, flick, drag-to-dismiss, sheet enter
 * Apple: damping ~0.8, response 0.3–0.4
 */
export const SPRING_MOMENTUM = {
  damping: 16,
  stiffness: 200,
  mass: 1,
} as const;

/**
 * SPRING_GENTLE — Very soft, for large surfaces / staggered reveals.
 * No overshoot, slower settle.
 */
export const SPRING_GENTLE = {
  damping: 22,
  stiffness: 170,
  mass: 1,
} as const;

/**
 * Press feedback scale values
 */
export const PRESS_SCALE = {
  /** Standard card / button press */
  default: 0.97,
  /** Smaller elements (chips, icons) */
  small: 0.93,
  /** Large surfaces (sheets) */
  large: 0.99,
} as const;

// ------------------------------------------------------------
// 动效令牌（设计系统契约 v2）
// damping/stiffness 采用 Reanimated 弹簧模型（damping 越高越不弹）
// ------------------------------------------------------------

/** PRESS_ENTER — 按压进入：快速起压，轻微回弹 */
export const PRESS_ENTER = {
  damping: 18,
  stiffness: 320,
  mass: 1,
} as const;

/** PRESS_EXIT — 按压释放：回位，带一点速率让收势更跟手 */
export const PRESS_EXIT = {
  damping: 18,
  stiffness: 320,
  velocity: 4,
  mass: 1,
} as const;

/** MOMENTUM — 手势释放/拖拽惯性，轻微过冲 */
export const MOMENTUM = {
  damping: 16,
  stiffness: 220,
  mass: 1,
} as const;

/** HERO — 大表面（Hero 图、转场、页面级出现）：慢速柔和，明显过冲 */
export const HERO = {
  damping: 14,
  stiffness: 140,
  mass: 1,
} as const;

/** EASE_OUT — 标准退场缓动（Reanimated 4 等效 cubic-bezier(0.32, 0.72, 0.00, 1.00)） */
export const EASE_OUT = Easing.bezier(0.32, 0.72, 0.0, 1.0);

/** DURATION — 时长令牌（ms） */
export const DURATION = {
  /** 入场 */
  enter: 220,
  /** 退场 */
  exit: 180,
  /** 级联入场间隔 */
  stagger: 35,
} as const;
