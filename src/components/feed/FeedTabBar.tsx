/**
 * FeedTabBar — 推特（X）风格顶部标签栏
 *
 * 规格（对齐 Twitter "For you / Following" 顶栏）：
 * - 等宽文本标签：选中 17/700 主文字色；未选 17/500 次要色
 * - 选中标签下方：主题色胶囊下划线（28×3.5pt），Reanimated 弹簧滑动过渡
 * - 底部 hairline 分隔线；高度 44pt
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/theme/ThemeContext';
import { SPRING_UI } from '@/theme/springs';

export interface FeedTab {
  label: string;
  value: string;
}

export interface FeedTabBarProps {
  tabs: FeedTab[];
  active: string;
  onChange: (value: string) => void;
  /** 是否预留顶部安全区高度（由父级处理时传 false） */
  includeTopInset?: boolean;
}

const BAR_HEIGHT = 44;
const INDICATOR_WIDTH = 28;
const INDICATOR_HEIGHT = 3.5;

const FeedTabBar = React.memo(function FeedTabBar({
  tabs,
  active,
  onChange,
  includeTopInset = true,
}: FeedTabBarProps) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const index = Math.max(0, tabs.findIndex((t) => t.value === active));
  const tabBarWidth = screenWidth;
  const tabWidth = tabBarWidth / Math.max(1, tabs.length);

  const indicatorX = useSharedValue(index * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2);
  // React 更新驱动：active 变化时弹簧滑动到新位置
  useEffect(() => {
    indicatorX.value = withSpring(
      index * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2,
      SPRING_UI,
    );
  }, [index, tabWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const handlePress = useCallback(
    (value: string) => {
      if (value !== active) onChange(value);
    },
    [active, onChange],
  );

  const paddingTop = useMemo(
    () => (includeTopInset ? insets.top : 0),
    [includeTopInset, insets.top],
  );

  return (
    <View
      style={[
        styles.bar,
        { paddingTop, borderBottomColor: colors.separator },
      ]}
    >
      <View style={styles.row}>
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <Pressable
              key={tab.value}
              onPress={() => handlePress(tab.value)}
              style={({ pressed }) => [
                styles.tab,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabText,
                  isActive ? styles.tabTextActive : styles.tabTextIdle,
                  { color: isActive ? colors.text : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* 胶囊下划线：位置随选中项弹簧滑动 */}
      <Animated.View
        style={[styles.indicator, { backgroundColor: colors.primary }, indicatorStyle]}
        pointerEvents="none"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabText: {
    fontSize: 17,
  },
  tabTextActive: {
    fontWeight: '700',
  },
  tabTextIdle: {
    fontWeight: '500',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
  },
});

export default FeedTabBar;
