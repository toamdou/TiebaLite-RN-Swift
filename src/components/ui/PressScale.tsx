// ============================================================
// TiebaLite React Native - PressScale
// 按压进入用 PRESS_ENTER 弹簧缩放（默认 0.97），释放回 1。
// 抽取自首页关注 / 通知列表两份逐字节相同的实现，统一共享。
// ============================================================

/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
import { useCallback, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PRESS_ENTER } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface PressScaleProps {
  onPress?: () => void;
  /** 按压态缩放比例（默认 0.97） */
  scaleTo?: number;
  children: ReactNode;
}

export function PressScale({ onPress, scaleTo = 0.97, children }: PressScaleProps) {
  const { reduceMotion } = useReducedMotion();
  const scale = useSharedValue(1);

  const pressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(scaleTo, PRESS_ENTER);
  }, [reduceMotion, scale, scaleTo]);

  const pressOut = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(1, PRESS_ENTER);
  }, [reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>{children}</Pressable>
    </Animated.View>
  );
}
