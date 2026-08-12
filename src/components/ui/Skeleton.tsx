// ============================================================
// TiebaLite React Native - Shared Skeleton (骨架屏)
// 全 App 共享的加载占位：形状 1:1 模拟真实卡片，呼吸动画
// 尊重 "Reduce Motion"（静态占位，不做脉冲）
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';

// ---------- 类型 ----------

export type SkeletonVariant = 'thread' | 'post' | 'card' | 'row';

export interface SkeletonCellProps {
  /** 骨架形状：thread=标题+摘要+左缩略图；post=头像+昵称+正文；card=大图+标题+两行；row=头像+两行文本 */
  variant?: SkeletonVariant;
  /** 自定义样式 */
  style?: any;
}

export interface SkeletonListProps {
  /** 骨架单元数量（默认 8） */
  count?: number;
  variant?: SkeletonVariant;
  /** 自定义单个单元高度 */
  itemHeight?: number;
  /** 列表容器自定义样式 */
  style?: any;
}

// ---------- 呼吸动画 ----------
// opacity: 0.45 → 0.9 → 0.45，每段 500ms，无限循环；Reduce Motion 时静态 0.9
function useBreathing(reduceMotion: boolean) {
  const opacity = useSharedValue(0.45);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reduceMotion) {
      // Reduce Motion：静态占位，不做脉冲
      cancelAnimation(opacity);
      opacity.value = 0.9;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 500 }),
        withTiming(0.9, { duration: 500 }),
      ),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  return pulseStyle;
}

// ---------- 单个骨架单元 ----------

export function SkeletonCell({ variant = 'row', style }: SkeletonCellProps) {
  const { colors } = useThemeColors();
  const { reduceMotion } = useReducedMotion();
  const pulseStyle = useBreathing(reduceMotion);

  // 占位色：theme.surfaceSecondary（语义色，深浅色自适应）
  const bg = colors.surfaceSecondary;
  const bar = useMemo(
    () => ({ backgroundColor: bg, borderRadius: Radius.chip }),
    [bg],
  );

  let content: React.ReactNode;
  switch (variant) {
    case 'thread':
      // 标题条 + 摘要两行 + 左侧缩略图块
      content = (
        <View style={styles.threadRow}>
          <View style={[styles.threadThumb, { backgroundColor: bg }]} />
          <View style={styles.threadColumn}>
            <View style={[styles.titleBar, bar]} />
            <View style={[styles.lineBar, { width: '92%' }, bar]} />
            <View style={[styles.lineBar, { width: '64%' }, bar]} />
          </View>
        </View>
      );
      break;
    case 'post':
      // 头像圆 + 昵称条 + 正文两行
      content = (
        <View>
          <View style={styles.postHeader}>
            <View style={[styles.avatar, { backgroundColor: bg }]} />
            <View style={[styles.nickBar, bar]} />
          </View>
          <View style={[styles.bodyBar, bar]} />
          <View style={[styles.bodyBar, { width: '72%' }, bar]} />
        </View>
      );
      break;
    case 'card':
      // 大图块 + 标题 + 两行
      content = (
        <View>
          <View style={[styles.cardHero, { backgroundColor: bg }]} />
          <View style={[styles.titleBar, { marginTop: Spacing.sm }, bar]} />
          <View style={[styles.lineBar, bar]} />
          <View style={[styles.lineBar, { width: '56%' }, bar]} />
        </View>
      );
      break;
    case 'row':
    default:
      // 头像圆 + 两行文本
      content = (
        <View style={styles.rowRow}>
          <View style={[styles.avatarSmall, { backgroundColor: bg }]} />
          <View style={styles.rowColumn}>
            <View style={[styles.rowBar1, bar]} />
            <View style={[styles.rowBar2, bar]} />
          </View>
        </View>
      );
      break;
  }

  return (
    <Animated.View style={[styles.cell, pulseStyle, style]} accessible={false}>
      {content}
    </Animated.View>
  );
}

// ---------- 骨架列表 ----------

export function SkeletonList({
  count = 8,
  variant = 'thread',
  itemHeight,
  style,
}: SkeletonListProps) {
  return (
    <View
      style={[styles.list, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="内容加载中"
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[styles.item, itemHeight ? { height: itemHeight } : undefined]}
        >
          <SkeletonCell variant={variant} />
        </View>
      ))}
    </View>
  );
}

// ---------- 样式 ----------

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: Spacing.md,
  },
  item: {
    width: '100%',
  },
  cell: {
    width: '100%',
  },
  // thread
  threadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  threadThumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.card,
  },
  threadColumn: {
    flex: 1,
    gap: Spacing.xs,
    paddingTop: 2,
  },
  // 公共条
  titleBar: {
    height: 16,
    borderRadius: Radius.chip,
    width: '100%',
  },
  lineBar: {
    height: 12,
    borderRadius: Radius.chip,
    width: '100%',
    marginTop: Spacing.xs,
  },
  // post
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  nickBar: {
    height: 12,
    borderRadius: Radius.chip,
    width: 120,
  },
  bodyBar: {
    height: 14,
    borderRadius: Radius.chip,
    width: '100%',
    marginTop: Spacing.md,
  },
  // card
  cardHero: {
    width: '100%',
    height: 160,
    borderRadius: Radius.cardLarge,
  },
  // row
  rowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rowColumn: {
    flex: 1,
    gap: Spacing.xs,
  },
  rowBar1: {
    height: 12,
    borderRadius: Radius.chip,
    width: '52%',
  },
  rowBar2: {
    height: 10,
    borderRadius: Radius.chip,
    width: '78%',
  },
});

export default SkeletonList;
