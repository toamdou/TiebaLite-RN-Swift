/**
 * Tab bar scroll auto-hide (动态页反馈需求)
 *
 * 需求：在可滚动标签页（动态）下滑时底栏完全隐藏到屏幕底部，上滑/回顶时
 * 从底部恢复。显式关闭 NativeTabs 的 minimizeBehavior（避免 iOS 26 默认
 * 收成圆形悬浮按钮），用滚动方向监听 + 宿主 `hidden` 开关驱动整条 tab bar。
 *
 * 滚动信号来源：
 * - 纯 RN 页（如吧内列表）：FlashList onScroll 直接可用；
 * - Host/SwiftUI 嵌套页（动态页）：onScroll 到不了 JS，用原生
 *   ScrollObserver（KVO 读 contentOffset）→ updateTabBarAutoHide(y)。
 */

import { DeviceEventEmitter, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

export const TAB_BAR_AUTO_HIDE_EVENT = 'tieba:tab-bar-auto-hide';

let lastContentOffsetY = 0;
let currentlyHidden = false;

function applyHidden(hidden: boolean) {
  currentlyHidden = hidden;
  DeviceEventEmitter.emit(TAB_BAR_AUTO_HIDE_EVENT, hidden);
}

/**
 * 方向判定 + 隐藏/显示：
 * - 内容回顶或上滑位移超过阈值 → 立即显示底栏
 * - 下滑位移超过阈值且在顶部之下 → 隐藏底栏
 * 阈值 12pt 过滤原地抖动，避免小幅滚动手感抽风。
 */
export function updateTabBarAutoHide(y: number) {
  const dy = y - lastContentOffsetY;
  lastContentOffsetY = y;

  if (y <= 0 || dy < -12) {
    if (currentlyHidden) applyHidden(false);
    return;
  }
  if (dy > 12 && !currentlyHidden) {
    applyHidden(true);
  }
}

/** RN 列表 onScroll 入口（纯 RN 树内可用） */
export function autoHideTabBarOnScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
  updateTabBarAutoHide(e.nativeEvent.contentOffset.y);
}

/** 切换标签/进入深层页等场景强制恢复底栏可见。 */
export function forceShowTabBar() {
  lastContentOffsetY = 0;
  if (currentlyHidden) applyHidden(false);
}
