// ============================================================
// TiebaLite - Haptic Scene Map (震动风格映射表)
//
// 设计规范：场景 → expo-haptics 风格（设计文档 §5）。
// 现有 221 处调用点风格不统一，全部收敛到本映射表，一处修改全局生效。
// 本文件只建映射表，不改任何现有调用点（调用点收敛属 Task 8）。
// ============================================================

import {
  hapticImpact,
  hapticNotify,
  hapticSelection,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from '@/utils/haptics';

// ---------- 场景类型 ----------

export type HapticsScene =
  | 'press' // 轻按、卡片按压
  | 'toggle' // 开关、分段切换
  | 'like' // 点赞
  | 'favorite' // 收藏
  | 'sheet-present' // 浮层展开
  | 'action-success' // 任务成功
  | 'action-fail'; // 任务失败

// ---------- 映射表 ----------

type HapticEntry =
  | { kind: 'impact'; style: ImpactFeedbackStyle }
  | { kind: 'selection' }
  | { kind: 'notification'; type: NotificationFeedbackType };

export const HAPTICS_MAP: Record<HapticsScene, HapticEntry> = {
  press: { kind: 'impact', style: ImpactFeedbackStyle.Light },
  toggle: { kind: 'selection' },
  like: { kind: 'impact', style: ImpactFeedbackStyle.Light },
  favorite: { kind: 'impact', style: ImpactFeedbackStyle.Light },
  'sheet-present': { kind: 'impact', style: ImpactFeedbackStyle.Soft },
  'action-success': { kind: 'notification', type: NotificationFeedbackType.Success },
  'action-fail': { kind: 'notification', type: NotificationFeedbackType.Error },
};

// ---------- 便捷函数 ----------

/**
 * 按场景触发对应震动风格。内部走 src/utils/haptics.ts 的统一包装
 * （全局开关 isHapticEnabledSync 会在禁用时 no-op）。
 * 返回 Promise（未来调用点可 await）。
 */
export function hapticForScene(scene: HapticsScene): Promise<void> {
  const entry = HAPTICS_MAP[scene];
  switch (entry.kind) {
    case 'impact':
      return hapticImpact(entry.style);
    case 'selection':
      return hapticSelection();
    case 'notification':
      return hapticNotify(entry.type);
  }
}
