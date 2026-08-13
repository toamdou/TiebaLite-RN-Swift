// ============================================================
// TiebaLite - useGlassBudget (实时玻璃预算 hook)
//
// 设计文档性能规则 2：每屏实时 UIVisualEffectView 玻璃最多 1 处。
// 模块级计数器（挂载 +1 / 卸载 -1）统计当前挂载的实时玻璃实例数，
// 超过 glassTokens.budget.maxRealTimePerScreen 即返回"应降级"信号。
// 参考 FeedCard.tsx 顶部"实时毛玻璃全局槽位"模块级计数器思路。
// 列表复用 / 卸载时计数器自动让位。
// ============================================================

import { useEffect, useState } from 'react';
import { glassTokens } from '@/theme/glass';

/** 模块级实时玻璃实例计数（跨组件实例共享，作用域近似整屏） */
let activeRealGlassCount = 0;

export interface GlassBudgetInfo {
  /** 当前实例是否应降级为 staticGlass（超预算为 true） */
  shouldUseStaticGlass: boolean;
  /** 当前挂载的实时玻璃实例数 */
  activeCount: number;
  /** 每屏实时玻璃上限（来自 glassTokens.budget） */
  maxRealTime: number;
}

/**
 * 返回实时玻璃预算状态。页面内每个尝试使用实时玻璃的组件挂载时
 * 调用一次本 hook：第一个实例（<= 预算）可用实时玻璃，其余降级。
 */
export function useGlassBudget(): GlassBudgetInfo {
  const maxRealTime = glassTokens.budget.maxRealTimePerScreen;
  const [activeCount, setActiveCount] = useState(activeRealGlassCount);

  useEffect(() => {
    activeRealGlassCount += 1;
    setActiveCount(activeRealGlassCount);
    if (activeRealGlassCount > maxRealTime) {
      // 降级日志便于后续排查（超预算 = 该实例改走 staticGlass）
      console.warn(
        `[useGlassBudget] 实时玻璃超预算 ${activeRealGlassCount}/${maxRealTime}，该实例已降级 staticGlass`,
      );
    }
    return () => {
      activeRealGlassCount -= 1;
      setActiveCount(activeRealGlassCount);
    };
  }, [maxRealTime]);

  return {
    shouldUseStaticGlass: activeCount > maxRealTime,
    activeCount,
    maxRealTime,
  };
}
