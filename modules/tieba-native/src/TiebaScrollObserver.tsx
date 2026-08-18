import { requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

const NativeScrollObserver = requireNativeViewManager('TiebaNative', 'TiebaScrollObserverView');

export interface ScrollObserverProps {
  /** 滚动位置回调（y = contentOffset.y，pt），高频触发请自行节流 */
  onScrollChanged: (event: { nativeEvent: { y: number } }) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 原生滚动观察器：监听同容器内 FlashList 的 contentOffset（KVO），
 * 绕过 RNHostView 下 onScroll 事件到不了 JS 的限制。需与列表放在
 * 同一个 RN 容器里（兄弟节点），尺寸 0×0 即可。
 */
export function ScrollObserver({ onScrollChanged, style }: ScrollObserverProps) {
  return <NativeScrollObserver style={style} onScrollChanged={onScrollChanged} />;
}

export default ScrollObserver;
