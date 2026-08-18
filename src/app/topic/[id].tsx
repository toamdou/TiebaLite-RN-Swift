// ============================================================
// Topic Detail Page - 话题详情
// 迁移自: TopicDetailPage.kt

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming, interpolate } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/SymbolView';
import ImageViewer from '@/components/ImageViewer';
import TweetCard from '@/components/feed/TweetCard';
import { useThemeColors } from '@/theme/ThemeContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { hapticForScene } from '@/theme/hapticsMap';
import { useImageViewer } from '@/hooks/useImageViewer';
import { useAuthStore } from '@/stores/authStore';
import { BlockManager } from '@/utils/BlockManager';
import { topicDetail, mapProtoThread, agree, checkReportPost } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatCount, buildThreadUrl } from '@/utils';
import { Spacing, Radius, DURATION, EASE_OUT, HERO, typographyStyles } from '@/theme';
import type { ThreadInfo } from '@/types';

// ---------- 首屏级联入场（仅首次数据批次，Reduce Motion 跳过） ----------
function FirstBatchStagger({
  index,
  enabled,
  children,
}: {
  index: number;
  enabled: boolean;
  children: ReactNode;
}) {
  const { reduceMotion } = useReducedMotion();
  const progress = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || !enabled) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      Math.min(index, 10) * DURATION.stagger,
      withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }),
    );
    return () => {
      progress.value = 1;
    };
  }, [index, enabled, reduceMotion, progress]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }],
  }));
  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

export default function TopicDetailPage() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { colors } = useThemeColors();
  const { reduceMotion } = useReducedMotion();
  const topicName = name || '话题';
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const imageViewer = useImageViewer();
  const fetcher = useCallback(
    async (pageNum: number, _params: undefined, signal?: AbortSignal) => {
      const data = await topicDetail(id, topicName, pageNum, signal);
      // Defensive parse for related forums; render them below when present.
      const rawRelate =
        data?.relate_forum ??
        data?.relateForum ??
        data?.related_forum ??
        data?.topic_info?.relate_forum ??
        data?.topic_info?.relateForum ??
        [];
      const relateForums = Array.isArray(rawRelate)
        ? rawRelate
        : rawRelate && typeof rawRelate === 'object'
          ? Object.values(rawRelate)
          : [];
      const rawThreads = data?.relate_thread?.thread_list ?? data?.thread_list ?? [];
      const threadList: ThreadInfo[] = rawThreads.map((item: any) =>
        mapProtoThread(item.thread_info ?? item),
      );
      return {
        items: threadList,
        hasMore: threadList.length >= 10,
        nextPage: pageNum + 1,
        extra: {
          topicInfo: data?.topic_info ?? data?.topicInfo ?? null,
          relateForums,
        },
      };
    },
    [id, topicName],
  );
  const paged = usePagedList<ThreadInfo, undefined, { topicInfo: any; relateForums: any[] }>({
    fetcher,
    initialPage: 1,
  });
  const {
    items: threads,
    loading: isLoading,
    refreshing: isRefreshing,
    error,
    load,
    refresh: handleRefresh,
    loadMore: handleLoadMore,
    hasMore,
    loadingMore,
    extra,
    setItems,
  } = paged;
  const topicInfo = extra?.topicInfo ?? null;
  const relateForums = useMemo<any[]>(() => extra?.relateForums ?? [], [extra?.relateForums]);

  // ── 卡片操作：点赞 / 分享 / 屏蔽作者 / 举报（与吧内、动态页同款 TweetCard 交互）──
  const handleCardLike = useCallback(
    async (item: ThreadInfo) => {
      if (!isLoggedIn) {
        Alert.alert('提示', '请先登录');
        return;
      }
      try {
        await agree(item.id, item.id, item.hasAgree ? 0 : 1);
        setItems((prev) =>
          prev.map((t) =>
            t.id === item.id
              ? {
                  ...t,
                  hasAgree: !t.hasAgree,
                  zanNum: Math.max(0, (t.zanNum || 0) + (t.hasAgree ? -1 : 1)),
                }
              : t,
          ),
        );
      } catch {
        Alert.alert('错误', '点赞失败');
      }
    },
    [isLoggedIn, setItems],
  );

  const handleCardShare = useCallback(async (item: ThreadInfo) => {
    hapticForScene('press');
    try {
      const url = buildThreadUrl(item.id);
      await Share.share({ message: url, url }, { dialogTitle: '分享帖子' });
    } catch {}
  }, []);

  const handleImagePress = useCallback(
    (images: string[], index: number) => {
      hapticForScene('press');
      imageViewer.handleImagePress(images, index);
    },
    [imageViewer],
  );

  const handleBlockAuthor = useCallback(
    async (item: ThreadInfo) => {
      const authorId = item.authorId;
      if (!authorId) return;
      try {
        await BlockManager.addBlockedUser({
          id: Date.now().toString(),
          uid: authorId,
          username: item.authorNameShow || item.authorName || undefined,
        });
        hapticForScene('action-success');
        // 屏蔽成功后即时从当前话题贴列表移除该作者的贴子
        setItems((prev) => prev.filter((t) => t.authorId !== authorId));
      } catch {
        hapticForScene('action-fail');
      }
    },
    [setItems],
  );

  const handleReport = useCallback(
    async (item: ThreadInfo) => {
      try {
        const url = await checkReportPost(item.id);
        if (url) {
          router.push({ pathname: '/webview', params: { url, title: '举报' } });
        } else {
          Alert.alert('提示', '当前帖子不支持在线举报');
        }
      } catch {
        hapticForScene('action-fail');
        Alert.alert('错误', '举报失败');
      }
    },
    [router],
  );

  const handleMenuAction = useCallback(
    (action: string, item: ThreadInfo) => {
      if (action === 'block') void handleBlockAuthor(item);
      else if (action === 'report') void handleReport(item);
    },
    [handleBlockAuthor, handleReport],
  );

  // Hero entrance animation (fade + slide up when topic info loads) — Reanimated 4
  const heroAnim = useSharedValue(0);
  useEffect(() => {
    if (topicInfo) {
      if (reduceMotion) {
        heroAnim.value = 1;
      } else {
        heroAnim.value = withSpring(1, HERO);
      }
    }
  }, [topicInfo, heroAnim, reduceMotion]);
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroAnim.value,
    transform: [{ translateY: interpolate(heroAnim.value, [0, 1], [14, 0]) }],
  }));

  useEffect(() => {
    load(1);
  }, [load]);

  // 首次数据批次标记：仅首屏加载项做 stagger 渐入，分页加载不再重复动画。
  const firstBatchRef = useRef(true);
  useEffect(() => {
    if (threads.length > 0 && firstBatchRef.current) {
      firstBatchRef.current = false;
    }
  }, [threads.length]);

  const renderItem = useCallback(
    ({ item, index }: { item: ThreadInfo; index: number }) => (
      <FirstBatchStagger index={index} enabled={firstBatchRef.current}>
        <TweetCard
          thread={item}
          timeType="create"
          onMenuAction={handleMenuAction}
          onImagePress={handleImagePress}
          onLike={handleCardLike}
          onShare={handleCardShare}
        />
      </FirstBatchStagger>
    ),
    [handleMenuAction, handleImagePress, handleCardLike, handleCardShare],
  );

  const threadKeyExtractor = useCallback((item: ThreadInfo) => item.id, []);
  const listHeader = useCallback(
    () =>
      topicInfo ? (
        <Animated.View style={[styles.topicHeader, { borderBottomColor: colors.divider }, heroStyle]}>
          <View style={styles.topicHeroRow}>
            <View
              style={[
                styles.topicIconBadge,
                { backgroundColor: colors.isNight ? 'rgba(255,159,10,0.16)' : 'rgba(255,149,0,0.12)' },
              ]}
            >
              <SymbolView name="number" size={18} tintColor={colors.warning} />
            </View>
            <View style={styles.topicTitleCol}>
              <Text style={[styles.topicTitle, { color: colors.text }]} numberOfLines={2}>
                #{topicName}#
              </Text>
              {topicInfo.discuss_num ? (
                <View style={styles.topicStatRow}>
                  <SymbolView name="flame" size={13} tintColor={colors.error} />
                  <Text style={[styles.topicMeta, { color: colors.textSecondary }]}>
                    {formatCount(topicInfo.discuss_num)} 讨论
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {topicInfo.topic_desc ? (
            <Text style={[styles.topicDesc, { color: colors.textSecondary }]}>
              {topicInfo.topic_desc}
            </Text>
          ) : null}
          {relateForums.length > 0 && (
            <View style={styles.relateSection}>
              <Text style={[styles.relateTitle, { color: colors.textSecondary }]}>
                相关吧
              </Text>
              <View style={styles.relateWrap}>
                {relateForums.map((forum, idx) => {
                  const forumName = String(forum.forum_name ?? forum.forumName ?? forum.name ?? '');
                  const avatar = forum.avatar ?? forum.pic ?? '';
                  const chip = (
                    <Pressable
                      // expo-router Slot 断言：Link asChild 的唯一子元素 style 不能被数组
                      // 包裹（否则 dev 下抛 "-- passing an array of styles to child of <Slot>"），
                      // 这里用 flatten 合成单个样式对象。
                      style={StyleSheet.flatten([
                        styles.relateChip,
                        { backgroundColor: colors.surfaceSecondary },
                      ])}
                    >
                      {avatar ? (
                        <Image
                          source={{ uri: avatar }}
                          style={styles.relateAvatar}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={avatar}
                        />
                      ) : (
                        <View
                          style={[
                            styles.relateAvatar,
                            { backgroundColor: colors.chip },
                          ]}
                        >
                          <SymbolView
                            name="person.2.fill"
                            size={14}
                            tintColor={colors.textDisabled}
                          />
                        </View>
                      )}
                      <Text
                        style={[styles.relateName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {forumName || '相关吧'}
                      </Text>
                    </Pressable>
                  );
                  return forumName ? (
                    <Link
                      key={String(forum.forum_id ?? forum.forumId ?? idx)}
                      href={{
                        pathname: '/forum/[name]',
                        params: { name: forumName },
                      }}
                      asChild
                    >
                      {chip}
                    </Link>
                  ) : (
                    <View
                      key={String(forum.forum_id ?? forum.forumId ?? idx)}
                    >
                      {chip}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Animated.View>
      ) : (
        <View style={styles.simpleHeader}>
          <Text style={[styles.simpleHeaderText, { color: colors.text }]}>
            #{topicName}#
          </Text>
        </View>
      ),
    [topicInfo, topicName, heroStyle, colors, relateForums],
  );
  const listEmpty = useCallback(
    () => (
      <EmptyState
        icon="text.bubble"
        title="暂无讨论"
        description="这个话题下还没有内容"
      />
    ),
    [],
  );
  const listFooter = useCallback(
    () =>
      loadingMore ? (
        <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !hasMore && threads.length > 0 ? (
        <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
          <Text style={[typographyStyles.footnote, { color: colors.textTertiary }]}>— 没有更多了 —</Text>
        </View>
      ) : null,
    [loadingMore, hasMore, threads.length, colors.primary, colors.textTertiary],
  );

  if (isLoading) {
    return (
      <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: topicName, headerTransparent: false }} />
        <View style={styles.skeletonWrap}>
          <SkeletonList variant="thread" count={8} />
        </View>
      </View>
    );
  }

  if (error && threads.length === 0) {
    return (
      <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: topicName, headerTransparent: false }} />
        <ErrorState title="加载失败" message={error} onRetry={() => load(1)} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
      <Stack.Screen options={{ title: topicName, headerTransparent: false }} />
      <FlashList
        data={threads}
        keyExtractor={threadKeyExtractor}
        renderItem={renderItem}
        decelerationRate="normal"
        drawDistance={300}
        maxItemsInRecyclePool={24}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      <ImageViewer
        images={imageViewer.imageViewerImages}
        initialIndex={imageViewer.imageViewerIndex}
        visible={imageViewer.imageViewerVisible}
        onClose={imageViewer.closeImageViewer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletonWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  listContent: { paddingBottom: Spacing.hero },
  topicHeader: {
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor 走 colors.divider（组件内动态注入，见 listHeader）
  },
  topicHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  topicIconBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTitleCol: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  topicStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  topicMeta: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  topicDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  relateSection: {
    marginTop: Spacing.md,
  },
  relateTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  relateWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  relateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.input,
    maxWidth: 180,
  },
  relateAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relateName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  simpleHeader: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  simpleHeaderText: typographyStyles.number,
});
