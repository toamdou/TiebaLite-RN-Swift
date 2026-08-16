import { useState, useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo';

/**
 * tieba-system — iOS 系统能力桥接：低功耗模式 + 内存警告。
 * 原生侧见 modules/tieba-system/ios/TiebaSystemModule.swift。
 * 模块缺失（如 Expo Go / 未重新构建 dev client）时全部 API 优雅降级：
 * getLowPowerMode() 返回 false，事件订阅返回 null，不会抛错。
 */

export interface TiebaSystemNativeModule {
  getLowPowerMode(): Promise<boolean>;
  addListener(eventName: string, listener: (payload: unknown) => void): {
    remove: () => void;
  };
}

type ListenerRemover = { remove(): void } | null;

let cached: TiebaSystemNativeModule | null | undefined;

function getNative(): TiebaSystemNativeModule | null {
  if (cached === undefined) {
    cached = requireOptionalNativeModule<TiebaSystemNativeModule>('TiebaSystem') ?? null;
  }
  return cached;
}

/** 读取当前低功耗模式状态（iOS Low Power Mode）。 */
export async function getLowPowerMode(): Promise<boolean> {
  const native = getNative();
  if (!native) return false;
  try {
    return (await native.getLowPowerMode()) === true;
  } catch {
    return false;
  }
}

/**
 * 订阅低功耗模式变化，回调携带最新开关状态。
 * 返回 { remove() } 用于清理；原生模块缺失时返回 null。
 */
export function addLowPowerModeListener(
  listener: (enabled: boolean) => void,
): ListenerRemover {
  const native = getNative();
  if (!native) return null;
  const sub = native.addListener('onLowPowerModeChange', (payload: unknown) => {
    listener((payload as { enabled?: boolean } | null)?.enabled === true);
  });
  return { remove: () => sub.remove() };
}

/**
 * 订阅 iOS 内存警告。回调里应做全局内存清理（如 expo-image 内存缓存）。
 * 返回 { remove() } 用于清理；原生模块缺失时返回 null。
 */
export function onMemoryWarning(listener: () => void): ListenerRemover {
  const native = getNative();
  if (!native) return null;
  const sub = native.addListener('onMemoryWarning', () => listener());
  return { remove: () => sub.remove() };
}

/**
 * React Hook：读取并跟踪低功耗模式。
 * 初始值来自原生快照，随后由事件推送保持同步。
 */
export function useLowPowerMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    void getLowPowerMode().then((value) => {
      if (mounted) setEnabled(value);
    });
    const sub = addLowPowerModeListener((value) => {
      if (mounted) setEnabled(value);
    });
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  return enabled;
}
