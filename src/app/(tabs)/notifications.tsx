/**
 * Notifications Tab (消息) — SwiftUI 原生实现
 *
 * 界面渲染：
 * - 顶部：Picker segmented（回复我的 | 提到我的）
 * - 中部：List 消息行（Label 头像 + 用户名 + 类型徽章 + 内容 + 原贴引用 + 时间）
 * - 未读：Circle 蓝色圆点
 * - 空态：ContentUnavailableView（bell.slash 图标）
 * - 加载：ProgressView
 * - 底部：没有更多了文字
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VStack, Button, Text, Label,
  Picker, ProgressView, ContentUnavailableView, Spacer,
} from '@expo/ui/swift-ui';
import {
  pickerStyle, tag, foregroundStyle, padding,
  buttonStyle, buttonBorderShape,
} from '@expo/ui/swift-ui/modifiers';
import {
  View, Pressable, Text as RNText, RefreshControl, StyleSheet, DeviceEventEmitter,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { hapticImpact, hapticSelection, ImpactFeedbackStyle } from '@/utils/haptics';
import { useThemeColors } from '@/theme/ThemeContext';
import { Avatar } from '@/components/ui/Avatar';
import { SymbolView } from '@/components/ui/SymbolView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { resetNotificationBaseline } from '@/services/NotificationPoller';
import { getMoreMsg } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { ErrorState } from '@/components/ui/ErrorState';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { BlockManager } from '@/utils/BlockManager';
import { relativeTime } from '@/utils';
import { SkeletonList } from '@/components/ui/Skeleton';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASE_OUT, PRESS_ENTER } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { MessageItem } from '@/types';

/** getMoreMsg 合并查询返回的条目：原 MessageItem + 分类打标 category */
type CategorizedMessage = MessageItem & { category: 'reply' | 'at' | 'agree' };

// 合并流中不同分类可能产生重复 id，键加分类前缀避免 FlashList 复用冲突
const messageKeyExtractor = (item: CategorizedMessage) => `${item.category}:${item.id}`;
const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

// ── 分段选项 ──
// 与 notificationStore 的 activeTab 类型保持一致（store 支持 'agree' 赞消息）
type MessageTab = 'reply' | 'at' | 'agree';

const SEGMENTS: { label: string; value: MessageTab }[] = [
  { label: '回复我的', value: 'reply' },
  { label: '提到我的', value: 'at' },
  { label: '赞我的', value: 'agree' },
];

/** 首屏入场级联延迟上限：避免长列表把入场拖得太久 */
const ENTRANCE_STAGGER_LIMIT = 10;

/**
 * 首屏批次入场：opacity 0→1 + translateY 12→0，逐行 withDelay(DURATION.stagger) 级联。
 * 仅首次数据到达批次执行一次（ran ref 防重播），下拉刷新/分页/回收复用不重复；
 * reduceMotion 时直接静态显示。
 */
const EntranceRow = memo(function EntranceRow({
  index,
  animateEntry,
  children,
}: {
  index: number;
  animateEntry: boolean;
  children: React.ReactNode;
}) {
  const { reduceMotion } = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!animateEntry || reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = Math.min(index, ENTRANCE_STAGGER_LIMIT - 1) * DURATION.stagger;
    opacity.value = withDelay(delay, withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }));
    translateY.value = withDelay(delay, withTiming(0, { duration: DURATION.enter, easing: EASE_OUT }));
  }, [animateEntry, reduceMotion, index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
});

/**
 * 分段内容切换 crossfade：segment 变化时透明度快速 0→1（淡入新内容），
 * reduceMotion 时直接显示、不做过渡。
 */
function SegmentFade({ segment, children }: { segment: string; children: React.ReactNode }) {
  const { reduceMotion } = useReducedMotion();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: DURATION.enter, easing: EASE_OUT });
  }, [segment, reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.segmentFade, animatedStyle]}>{children}</Animated.View>;
}

/**
 * 按压反馈：进入用 PRESS_ENTER 弹簧缩放（0.97），释放回 1。
 * 替代原先 opacity-only 的按压态（index/notifications 同步统一）。
 */
function PressScale({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  const { reduceMotion } = useReducedMotion();
  const scale = useSharedValue(1);

  const pressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(0.97, PRESS_ENTER);
  }, [reduceMotion, scale]);

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

function getSegmentLabel(tab: MessageTab): string {
  switch (tab) {
    case 'reply': return '回复消息';
    case 'at': return '@消息';
    case 'agree': return '赞消息';
  }
}

/** 类型图标（SF Symbol）与颜色：回复 / @ / 点赞 可一眼区分 */
function getTypeIcon(type: CategorizedMessage['category']): { name: string; color: string } {
  switch (type) {
    case 'reply': return { name: 'arrowshape.turn.up.left.fill', color: '#4477E0' };
    case 'at': return { name: 'at', color: '#FF9500' };
    case 'agree': return { name: 'hand.thumbsup.fill', color: '#FF3B30' };
  }
}

/**
 * 头像 / 昵称的"查看用户"点击封装：点击跳转作者主页，并阻止事件冒泡
 * （避免触发整行的消息点击）。
 */
const AvatarPressable = memo(function AvatarPressable({
  msg,
  onAuthorPress,
  style,
  children,
}: {
  msg: MessageItem;
  onAuthorPress: (msg: MessageItem) => void;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        onAuthorPress(msg);
      }}
      onPressIn={(event) => event.stopPropagation?.()}
      onPressOut={(event) => event.stopPropagation?.()}
      accessibilityRole="button"
      accessibilityLabel="查看用户"
      style={style}
    >
      {children}
    </Pressable>
  );
});

// ── 主页面 ──
export default function NotificationsScreen() {
  const { colors } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { blockedWords, blockedUsers } = useBlockFilter();
  const activeTab = useNotificationStore((s) => s.activeTab);
  const loadNotificationCounts = useNotificationStore((s) => s.loadNotificationCounts);
  const setActiveTab = useNotificationStore((s) => s.setActiveTab);

  const paged = usePagedList<CategorizedMessage, { type: MessageTab; isLoggedIn: boolean }>({
    fetcher: async (p, params, signal) => {
      if (!params.isLoggedIn) return { items: [], hasMore: false };
      // getMoreMsg：并行拉取 reply/at/agree 三来源并按 category 打标合并。
      // 分段仅作前端过滤（合并流已含全部三类消息）。
      const data = await getMoreMsg(p - 1, signal);
      const items = data.items.filter((i) => i.category === params.type);
      return { items, hasMore: data.hasMore, nextPage: p + 1 };
    },
    params: { type: activeTab, isLoggedIn },
  });
  const {
    items: messages,
    loading: msgLoading,
    refreshing,
    hasMore,
    loadingMore,
    error: msgError,
    load,
    refresh,
    loadMore,
  } = paged;
  const { initialTab } = useLocalSearchParams<{ initialTab?: string }>();

  // 首屏入场标记：仅数据首次到达批次做 stagger 入场。
  const entranceDoneRef = useRef(false);
  useEffect(() => {
    if (messages.length > 0) entranceDoneRef.current = true;
  }, [messages.length]);

  const visibleMessages = useMemo(() => {
    if (blockedWords.length === 0 && blockedUsers.length === 0) return messages;
    return messages.filter((m) => {
      if (BlockManager.shouldBlockContent(m.content || '', blockedWords)) return false;
      if (m.fromUserId && BlockManager.shouldBlockUser(m.fromUserId, m.fromUserName || null, blockedUsers)) return false;
      return true;
    });
  }, [messages, blockedWords, blockedUsers]);

  // 深链接跳转
  useEffect(() => {
    if (initialTab !== undefined) {
      const TAB_MAP: Record<number, MessageTab> = { 0: 'reply', 1: 'at', 2: 'agree' };
      const tab = TAB_MAP[parseInt(initialTab, 10)];
      if (tab) setActiveTab(tab);
    }
  }, [initialTab, setActiveTab]);

  // 聚焦时刷新计数（仅登录时）
  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;
      (async () => {
        try {
          await loadNotificationCounts();
        } catch {}
        try {
          await resetNotificationBaseline();
        } catch {}
      })();
    }, [loadNotificationCounts, isLoggedIn]),
  );

  // Tab 切换加载（仅登录时）
  useEffect(() => {
    if (isLoggedIn) load(1, { type: activeTab, isLoggedIn });
  }, [activeTab, isLoggedIn, load]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'notifications' && isLoggedIn) {
        refresh();
        loadNotificationCounts().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [isLoggedIn, refresh, loadNotificationCounts]);

  const handleTabChange = useCallback((value: string) => {
    hapticSelection();
    setActiveTab(value as MessageTab);
  }, [setActiveTab]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), loadNotificationCounts()]);
  }, [refresh, loadNotificationCounts]);

  // 错误态重试：走 initial 模式，让骨架屏重新出现
  const handleRetry = useCallback(() => {
    load(1, { type: activeTab, isLoggedIn }, 'initial');
  }, [load, activeTab, isLoggedIn]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    await loadMore();
  }, [loadingMore, hasMore, loadMore]);

  const handleMessagePress = useCallback((msg: MessageItem) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    if (msg.threadId) {
      router.push(`/thread/${msg.threadId}${msg.postId ? `?postId=${msg.postId}` : ''}`);
    }
  }, [router]);

  const handleAuthorPress = useCallback((msg: MessageItem) => {
    if (!msg.fromUserId) return;
    hapticImpact(ImpactFeedbackStyle.Light);
    router.push(`/user/${msg.fromUserId}`);
  }, [router]);

  const renderMessageItem = useCallback(
    ({ item, index }: { item: CategorizedMessage; index: number }) => {
      const icon = getTypeIcon(item.category);
      return (
        <EntranceRow index={index} animateEntry={!entranceDoneRef.current}>
          <PressScale onPress={() => handleMessagePress(item)}>
            <View
              style={[styles.messageRow, { backgroundColor: colors.card }]}
            >
              {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
              {item.fromUserId ? (
                <AvatarPressable msg={item} onAuthorPress={handleAuthorPress} style={styles.messageAvatarPressable}>
                  <Avatar
                    source={item.fromUserPortrait || undefined}
                    initials={(item.fromUserName || '吧')?.charAt(0)}
                    size={40}
                  />
                </AvatarPressable>
              ) : (
                <Avatar
                  source={item.fromUserPortrait || undefined}
                  initials={(item.fromUserName || '吧')?.charAt(0)}
                  size={40}
                />
              )}
              <View style={styles.messageBody}>
                <View style={styles.messageHeader}>
                  {item.fromUserId ? (
                    <AvatarPressable msg={item} onAuthorPress={handleAuthorPress} style={styles.messageNamePressable}>
                      <RNText style={[styles.messageName, { color: colors.text }]} numberOfLines={1}>
                        {item.fromUserName}
                      </RNText>
                    </AvatarPressable>
                  ) : (
                    <RNText style={[styles.messageName, { color: colors.text }]} numberOfLines={1}>
                      {item.fromUserName}
                    </RNText>
                  )}
                  <SymbolView
                    name={icon.name}
                    size={13}
                    weight="semibold"
                    tintColor={icon.color}
                  />
                </View>
                <RNText style={[styles.messageContent, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.content || '...'}
                </RNText>
                {item.threadTitle ? (
                  <RNText style={[styles.messageThread, { color: colors.textTertiary }]} numberOfLines={1}>
                    原贴: {item.threadTitle}
                  </RNText>
                ) : null}
                <RNText style={[styles.messageTime, { color: colors.textDisabled }]}>
                  {relativeTime(item.createTime * 1000)}
                </RNText>
              </View>
            </View>
          </PressScale>
        </EntranceRow>
      );
    },
    [colors, handleMessagePress, handleAuthorPress],
  );

  const renderFooter = useCallback(
    () => (
      <LoadMoreFooter
        hasMore={hasMore}
        loading={loadingMore}
        colors={colors}
        onLoadMore={handleLoadMore}
      />
    ),
    [hasMore, loadingMore, colors, handleLoadMore],
  );

  // ── 未登录 ──
  if (isLoading) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <ThemedHost style={{ flex: 1 }}>
          <VStack alignment="center" spacing={12}>
            <Spacer />
            <ProgressView />
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>加载中...</Text>
            <Spacer />
          </VStack>
        </ThemedHost>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}>
        <ThemedHost style={{ flex: 1 }}>
          <VStack alignment="center" spacing={16}>
            <Spacer />
            <ContentUnavailableView
              systemImage="bell.slash"
              title="请先登录"
              description="登录后查看消息通知"
            />
            <Button
              onPress={() => router.push('/login')}
              modifiers={[buttonStyle('glassProminent'), buttonBorderShape('capsule')]}
            >
              <Label title="登录百度账号" systemImage="person.crop.circle.badge.checkmark" />
            </Button>
            <Spacer />
          </VStack>
        </ThemedHost>
      </View>
    );
  }

  // ── 已登录 ──
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ThemedHost style={{ flex: 1 }}>
      <VStack spacing={0}>
        {/* 分段选择器 */}
        <Picker
          selection={activeTab}
          onSelectionChange={handleTabChange as any}
          modifiers={[pickerStyle('segmented'), padding({ horizontal: 16, top: 8, bottom: 4 })]}
        >
          {SEGMENTS.map((s) => (
            <Text key={s.value} modifiers={[tag(s.value)]}>{s.label}</Text>
          ))}
        </Picker>

        {/* 消息列表 */}
        {msgLoading && messages.length === 0 ? (
          <SkeletonList variant="row" count={8} style={styles.messageSkeleton} />
        ) : msgError && messages.length === 0 ? (
          <ErrorState
            title="加载失败"
            message={msgError}
            icon="exclamationmark.triangle"
            onRetry={handleRetry}
            retryLabel="重试"
          />
        ) : visibleMessages.length === 0 ? (
          <ContentUnavailableView
            systemImage="bell"
            title="暂无消息"
            description={`暂无${getSegmentLabel(activeTab)}`}
          />
        ) : (
          <SegmentFade segment={activeTab}>
            <FlashList
              data={visibleMessages}
              keyExtractor={messageKeyExtractor}
              renderItem={renderMessageItem}
              ListFooterComponent={renderFooter}
              contentContainerStyle={styles.messageListContent}
              estimatedItemSize={96}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              drawDistance={300}
              maxItemsInRecyclePool={24}
            />
          </SegmentFade>
        )}
      </VStack>
    </ThemedHost>
    </View>
  );
}

const styles = StyleSheet.create({
  // 分段内容区：crossfade 动画容器需占满剩余空间
  segmentFade: { flex: 1 },
  // 骨架屏容器
  messageSkeleton: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    position: 'relative',
  },
  messageAvatarPressable: {
    borderRadius: 20,
  },
  messageNamePressable: {
    flexShrink: 1,
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messageBody: { flex: 1, gap: 3 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageName: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  messageContent: { fontSize: 14, lineHeight: 20 },
  messageThread: { fontSize: 12 },
  messageTime: { fontSize: 11 },
  messageFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  messageFooterText: { fontSize: 13, fontWeight: '600' },
});
