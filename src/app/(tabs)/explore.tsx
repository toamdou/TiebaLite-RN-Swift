/**
 * Explore Tab (发现) — 全面使用 @expo/ui/swift-ui 重写
 *
 * 界面渲染：
 * - 顶部：Picker segmented（推荐 | 关注 | 热榜）
 * - 推荐/关注：ScrollView + LazyVStack + 信息流卡片（RNHostView 嵌入远程图片）
 * - 热榜：话题网格 + Tab 分类 + 排名帖子列表
 * - 空态：ContentUnavailableView
 * - 加载：ProgressView
 * - 下拉刷新：refreshable modifier
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VStack, HStack, Button, Text, Label,
  Picker, ContentUnavailableView, Spacer,
  RNHostView, BottomSheet, Group,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag, font, padding, buttonStyle, buttonBorderShape, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import {
  View, Pressable, StyleSheet, Text as RNText, ActivityIndicator,
  ScrollView as RNScrollView, DeviceEventEmitter, RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { typographyStyles } from '@/theme/typography';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useImageViewer } from '@/hooks/useImageViewer';
import { BlockManager } from '@/utils/BlockManager';
import { Avatar } from '@/components/ui/Avatar';
import { SymbolView } from '@/components/ui/SymbolView';
import { formatCount, relativeTime, buildThreadUrl } from '@/utils';
import { LoadType } from '@/types';
import type { FeedItem, ForumInfo, HotTopic, HotTabInfo, HotThreadInfo, ThreadInfo } from '@/types';
import {
  personalized as apiPersonalized,
  userLike as apiUserLike,
  hotThreadList,
  submitDislike,
  mapProtoThread,
  agree,
} from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import FeedCard from '@/components/FeedCard';
import { FeedCell } from '../../../modules/tieba-native/src/TiebaFeedCell';
import * as Clipboard from 'expo-clipboard';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import ImageViewer from '@/components/ImageViewer';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASE_OUT, Shadows, Spacing, Radius, glassTokens } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

// ── 信息流字段映射（对齐 Kotlin PersonalizedBean.ThreadBean / UserLikeResponse.ConcernData）──
// endpoints.personalized()/userLike() 返回的是接口原始 JSON（thread 对象），
// FeedCard 需要 FeedItem.threadInfo（ThreadInfo）结构，这里统一转换：
//   avatar（吧头像）→ forum.avatar / forum_avatar
//   media（帖子图片/视频）→ mediaList（MediaInfo[]）
//   forumName（吧名）→ fname / forum_name / forum.name
function toFeedNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toFeedBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function mapFeedItem(raw: any): FeedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  // 已是 FeedItem 包装（防御性透传）
  if (raw.type && raw.threadInfo) return raw as FeedItem;
  if (raw.type && raw.forumInfo) return raw as FeedItem;

  // 关注流 ConcernData 包装：{ threadList, postData, recommendType, ... }
  const threadRaw = raw.threadList ?? raw.thread_list ?? raw;
  const tid = threadRaw?.id ?? threadRaw?.tid ?? threadRaw?.thread_id ?? threadRaw?.threadId;
  if (tid != null || threadRaw?.title != null) {
    const forum = threadRaw?.forum ?? raw?.forum ?? {};
    const thread = mapProtoThread(
      { ...threadRaw, author: threadRaw?.author ?? raw?.author },
      { forum },
    );
    return { type: thread.isVideo ? 'video_thread' : 'thread', threadInfo: thread };
  }

  // 吧卡片（如推荐吧/关注吧）
  const forumRaw = raw.forumInfo ?? raw;
  if (forumRaw?.forum_id != null || forumRaw?.forumId != null || (forumRaw?.name != null && forumRaw?.avatar != null)) {
    const forum: ForumInfo = {
      forumId: String(forumRaw?.forum_id ?? forumRaw?.forumId ?? forumRaw?.id ?? ''),
      forumName: String(forumRaw?.forum_name ?? forumRaw?.forumName ?? forumRaw?.name ?? ''),
      avatar: String(forumRaw?.avatar ?? ''),
      slogan: String(forumRaw?.slogan ?? ''),
      memberCount: toFeedNumber(forumRaw?.member_count ?? forumRaw?.memberCount ?? forumRaw?.concern_num),
      threadCount: toFeedNumber(forumRaw?.thread_count ?? forumRaw?.threadCount ?? forumRaw?.thread_num),
      levelName: String(forumRaw?.level_name ?? forumRaw?.levelName ?? ''),
      levelId: toFeedNumber(forumRaw?.level_id ?? forumRaw?.levelId),
      isLike: toFeedBoolean(forumRaw?.is_like ?? forumRaw?.isLike),
      isSign: toFeedBoolean(forumRaw?.is_sign ?? forumRaw?.isSign),
    };
    return { type: 'forum', forumInfo: forum };
  }

  return null;
}

// ── 分段类型 ──
type ExploreSegment = 'personalized' | 'concern' | 'hot';

// ── 不感兴趣原因（对齐 Kotlin DislikeReason；personalized 接口未透出 dislikeResource 时的兑底列表）──
const DEFAULT_DISLIKE_REASONS: { dislikeId: string; dislikeReason: string }[] = [
  { dislikeId: '1', dislikeReason: '内容质量差' },
  { dislikeId: '2', dislikeReason: '标题党' },
  { dislikeId: '3', dislikeReason: '重复推荐' },
  { dislikeId: '4', dislikeReason: '内容不适' },
  { dislikeId: '5', dislikeReason: '广告太多' },
  { dislikeId: '7', dislikeReason: '不想看这个吧' },
];

const SEGMENTS: { label: string; value: ExploreSegment }[] = [
  { label: '推荐', value: 'personalized' },
  { label: '关注', value: 'concern' },
  { label: '热榜', value: 'hot' },
];

// ── 热榜前三名排名色（与 topic/list.tsx 共用） ──
export const HOT_RANK_COLORS = ['#FF3B30', '#FF9500', '#FFCC00'] as const;

// 信息流驻留上限：对齐 usePagedList 默认上限（约 200 条），控制 JS 数据驻留。
const MAX_FEED_ITEMS = 200;

// ── 动效组件（列表首屏入场 + 分段切换 crossfade） ──

/** 首屏入场级联延迟上限：避免长列表把入场拖得太久 */
const ENTRANCE_STAGGER_LIMIT = 10;

/**
 * 首屏批次入场：opacity 0→1 + translateY 12→0，逐行 withDelay(DURATION.stagger) 级联。
 * 仅首次数据到达批次执行一次（ran ref 防重播），刷新/分页/回收复用不重复；
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

// ── 原生 FeedCell 帖子卡片（wave 2：原生入场级联 + RN 薄操作栏保留全部交互） ──

/** 原生 FeedCell 有图帖 Hero 高度，与 TiebaFeedCellView.swift 的 heroImageHeight=200 保持一致 */
const NATIVE_HERO_HEIGHT = 200;

/** 帖子卡片更多菜单（不感兴趣/屏蔽作者/复制标题），对齐 FeedCard.FEED_MENU_ACTIONS */
const THREAD_FEED_MENU_ACTIONS: MenuAction[] = [
  { id: 'dislike', title: '不感兴趣', image: 'hand.thumbsdown' },
  { id: 'block', title: '屏蔽作者', image: 'person.badge.minus' },
  { id: 'copy-title', title: '复制标题', image: 'doc.on.doc' },
];

/** 有图帖首图原址（视频取 poster）。原址直接交给原生 TiebaImageIO 做缩略缓存，
 *  原生 targetWidth 750 的效果优于 RN 侧传 200px 缩略图。 */
function threadHeroImage(thread: ThreadInfo): string | undefined {
  const hero = thread.mediaList?.[0];
  if (!hero) return undefined;
  return hero.type === 'video' && hero.poster ? hero.poster : hero.src || undefined;
}

/**
 * 帖子类目原生单元格复合：
 * - FeedCell（原生展示 + 原生入场级联，enterIndex=FlashList index，滚动复用不重放入场）
 * - 有图帖 Hero 区叠透明 Pressable：恢复 FeedCard 的“点图打开图片浏览器”交互
 * - 底部 RN 薄操作栏（EntranceRow 同步入场）：分享 | 点赞 | 更多（不感兴趣/屏蔽/复制标题）
 *
 * 操作栏选择理由：FeedCard 的操作栏含实际交互（点赞/分享/不感兴趣/屏蔽/copy），
 * 按 brief 采用“FeedCell 展示主体 + RN 薄操作栏叠加在底部”，原生滚动收益保留、交互不丢；
 * 回复数由 FeedCell 自带操作栏展示（纯展示）。
 */
const NativeThreadCell = memo(function NativeThreadCell({
  item,
  index,
  animateEntry,
  onPress,
  onShare,
  onLike,
  onDislike,
  onBlockAuthor,
  onCopyTitle,
  onImagePress,
}: {
  item: FeedItem;
  index: number;
  animateEntry: boolean;
  onPress: (thread: ThreadInfo) => void;
  onShare: (thread: ThreadInfo) => void;
  onLike: (thread: ThreadInfo) => void;
  onDislike: (item: FeedItem) => void;
  onBlockAuthor: (item: FeedItem) => void;
  onCopyTitle: (thread: ThreadInfo) => void;
  onImagePress: (images: string[], index: number) => void;
}) {
  const { colors, isDark } = useThemeColors();
  const thread = item.threadInfo as ThreadInfo;
  const heroImage = threadHeroImage(thread);
  const heroImages = useMemo(
    () => (thread.mediaList ?? []).map((m) => m.originSrc || m.src),
    [thread.mediaList],
  );
  // 玻璃语义：优先 glassTokens.tint 主题色（iOS 26 液态玻璃卡片）
  const cardBackground = glassTokens.tint[isDark ? 'dark' : 'light'];
  const hasTags = thread.isTop || thread.isGood;

  // 屏蔽作者：先写 BlockManager 黑名单（持久化），成功后才移除条目。
  // 对齐 FeedCard 内部同款实现（FeedCard.tsx handleBlockAuthor）。
  const handleBlockAuthorPress = useCallback(async () => {
    const authorId = thread.authorId;
    if (!authorId) return;
    try {
      await BlockManager.addBlockedUser({
        id: Date.now().toString(),
        uid: authorId,
        username: thread.authorNameShow || thread.authorName || undefined,
      });
      hapticForScene('action-success');
      onBlockAuthor(item);
    } catch {
      hapticForScene('action-fail');
    }
  }, [thread, item, onBlockAuthor]);

  const handleMenuAction = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      switch (event.nativeEvent.event) {
        case 'dislike':
          onDislike(item);
          break;
        case 'block':
          handleBlockAuthorPress();
          break;
        case 'copy-title':
          onCopyTitle(thread);
          break;
      }
    },
    [onDislike, onCopyTitle, item, thread, handleBlockAuthorPress],
  );

  return (
    <View
      style={[
        styles.nativeThreadCardWrap,
        {
          backgroundColor: cardBackground,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      <FeedCell
        title={hasTags ? `${thread.isTop ? '置顶 ' : ''}${thread.isGood ? '精品 ' : ''}${thread.title}` : thread.title}
        summary={thread.abstract || undefined}
        author={thread.authorNameShow || thread.authorName}
        forumName={thread.forumName}
        replyCount={thread.replyNum}
        timeText={thread.createTime ? relativeTime(thread.createTime) : ''}
        imageUrl={heroImage}
        accentColor={colors.primary}
        textPrimary={colors.text}
        textSecondary={colors.textSecondary}
        cardBackground={cardBackground}
        radius={Radius.card}
        enterIndex={index}
        onPress={() => onPress(thread)}
      />
      {/* 有图帖 Hero 区透明叠加：恢复 FeedCard 的点图打开图片浏览器交互 */}
      {heroImages.length > 0 ? (
        <Pressable
          style={[styles.nativeHeroOverlay, { height: NATIVE_HERO_HEIGHT }]}
          onPress={() => {
            hapticForScene('press');
            onImagePress(heroImages, 0);
          }}
          accessibilityRole="button"
          accessibilityLabel="查看图片"
        />
      ) : null}
      {/* RN 薄操作栏：分享 | 点赞 | 更多菜单（交互不可丢） */}
      <EntranceRow index={index} animateEntry={animateEntry}>
        <View style={[styles.nativeThreadActionBar, { backgroundColor: cardBackground }]}>
          <Pressable
            onPress={() => onShare(thread)}
            hitSlop={4}
            style={({ pressed }) => [styles.nativeActionItem, pressed && styles.nativeActionItemPressed]}
            accessibilityRole="button"
            accessibilityLabel="分享"
          >
            <SymbolView name="arrowshape.turn.up.left" size={15} tintColor={colors.textTertiary} />
            <RNText style={[styles.nativeActionText, { color: colors.textTertiary }]}>分享</RNText>
          </Pressable>
          <Pressable
            onPress={() => onLike(thread)}
            hitSlop={4}
            style={({ pressed }) => [styles.nativeActionItem, pressed && styles.nativeActionItemPressed]}
            accessibilityRole="button"
            accessibilityLabel="点赞"
          >
            <SymbolView name="hand.thumbsup" size={15} tintColor={colors.textTertiary} />
            <RNText style={[styles.nativeActionText, { color: colors.textTertiary }]}>
              {formatCount(thread.zanNum ?? 0)}
            </RNText>
          </Pressable>
          <View style={styles.nativeActionSpacer} />
          <ThemedHost matchContents>
            <MenuView
              style={styles.nativeActionMenu}
              actions={THREAD_FEED_MENU_ACTIONS}
              onPressAction={handleMenuAction}
            >
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [styles.nativeActionItem, pressed && styles.nativeActionItemPressed]}
                accessibilityRole="button"
                accessibilityLabel="更多操作"
              >
                <SymbolView name="ellipsis" size={15} weight="bold" tintColor={colors.textTertiary} />
              </Pressable>
            </MenuView>
          </ThemedHost>
        </View>
      </EntranceRow>
    </View>
  );
});

// ── 主页面 ──
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [activeSegment, setActiveSegment] = useState<ExploreSegment>('personalized');
  // 记录最后一次选中的信息流分段（推荐/关注）。切到热榜时 FeedContent 保持
  // 挂载（display 隐藏），用此值兜底 segment，避免切回时因 prop 变化重拉数据。
  const [lastFeedSegment, setLastFeedSegment] = useState<'personalized' | 'concern'>('personalized');

  const handleSegmentChange = useCallback((value: string) => {
    hapticForScene('toggle');
    const seg = value as ExploreSegment;
    setActiveSegment(seg);
    if (seg !== 'hot') setLastFeedSegment(seg);
  }, []);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <VStack spacing={0}>
        {/* 分段选择器：顶部安全区（对齐 notifications.tsx）+ token 间距 */}
        <View style={[styles.pickerWrap, { paddingTop: insets.top }]}>
          <Picker
            selection={activeSegment}
            onSelectionChange={handleSegmentChange as any}
            modifiers={[pickerStyle('segmented'), padding({ horizontal: Spacing.lg, top: Spacing.sm })]}
          >
            {SEGMENTS.map((s) => (
              <Text key={s.value} modifiers={[tag(s.value)]}>{s.label}</Text>
            ))}
          </Picker>
        </View>

        {/* 内容区：Feed 与热榜常驻挂载，display 隐藏切换 —— 热榜切回推荐
            不再卸载 FeedContent，数据与滚动位置得以保留；热榜数据同样驻留。 */}
        <View style={[styles.segmentContent, activeSegment === 'hot' && styles.segmentHidden]}>
          <FeedContent segment={lastFeedSegment} />
        </View>
        <View style={[styles.segmentContent, activeSegment !== 'hot' && styles.segmentHidden]}>
          <HotListContent />
        </View>
      </VStack>
    </ThemedHost>
  );
}

// ── 推荐/关注 信息流（自动懒加载） ──
function FeedContent({ segment }: { segment: 'personalized' | 'concern' }) {
  const { colors } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { blockedWords, blockedUsers } = useBlockFilter();
  const exploreAutoRefresh = useAppPreference('exploreAutoRefresh', true);
  const router = useRouter();
  const imageViewer = useImageViewer();
  // 不感兴趣面板状态
  const [dislikeTarget, setDislikeTarget] = useState<FeedItem | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  // 关注流（userLike）分页游标 — 对齐 Kotlin ConcernViewModel：userLikeFlow(pageTag, lastRequestUnix, loadType)
  const pageTagRef = useRef('');
  const pagedFetcher = useCallback(
    async (p: number, params: { segment: 'personalized' | 'concern'; isLoggedIn: boolean; blockedWords: any[]; blockedUsers: any[] }, signal?: AbortSignal) => {
      if (params.segment === 'concern' && !params.isLoggedIn) {
        return { items: [] as FeedItem[], hasMore: false };
      }
      const loadType = p === 1 ? LoadType.REFRESH : LoadType.LOAD_MORE;
      let result: { items: FeedItem[]; hasMore: boolean };
      if (params.segment === 'personalized') {
        result = await apiPersonalized(loadType, p, signal);
      } else {
        const tag = p === 1 ? '' : pageTagRef.current;
        const res = await apiUserLike(tag || undefined, undefined, loadType, signal);
        pageTagRef.current = res.pageTag ?? '';
        result = res;
      }
      const feedItems = (result.items ?? [])
        .map((raw: any) => mapFeedItem(raw))
        .filter((item: FeedItem | null): item is FeedItem => item !== null);
      const visibleItems = feedItems.filter((item) => {
        const info = item.threadInfo;
        if (!info) return true;
        const text = `${info.title || ''} ${info.abstract || ''}`;
        if (BlockManager.shouldBlockContent(text, params.blockedWords)) return false;
        if (info.authorId && BlockManager.shouldBlockUser(info.authorId, info.authorName || null, params.blockedUsers)) return false;
        return true;
      });
      return { items: visibleItems, hasMore: result.hasMore, nextPage: p + 1 };
    },
    [],
  );
  const paged = usePagedList<FeedItem, { segment: 'personalized' | 'concern'; isLoggedIn: boolean; blockedWords: any[]; blockedUsers: any[] }>({
    fetcher: pagedFetcher,
    params: { segment, isLoggedIn, blockedWords, blockedUsers },
    maxItems: MAX_FEED_ITEMS,
  });
  const { items, loading, error, hasMore, loadingMore, refreshing, load, loadMore, refresh, setItems } = paged;

  // 首屏入场标记：仅在数据首次到达的那次渲染批次做 stagger 入场，
  // 之后的下拉刷新 / 加载更多 / 分页切换均不重播（配合 EntranceRow 内 ran ref）。
  const entranceDoneRef = useRef(false);
  useEffect(() => {
    if (items.length > 0) entranceDoneRef.current = true;
  }, [items.length]);

  // 打开“不感兴趣”原因面板
  const handleDislikePress = useCallback((item: FeedItem) => {
    hapticForScene('sheet-present');
    setSelectedReasons([]);
    setDislikeTarget(item);
  }, []);

  // 屏蔽作者成功 → 从当前列表移除该条
  const handleBlockAuthor = useCallback((item: FeedItem) => {
    setItems((prev) => prev.filter((i) => i !== item));
  }, [setItems]);

  const toggleReason = useCallback((id: string) => {
    hapticForScene('toggle');
    setSelectedReasons((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }, []);

  const dislikeMutation = useMutation({
    mutationFn: submitDislike,
    onSuccess: () => {
      hapticForScene('action-success');
      if (dislikeTarget) {
        setItems((prev) => prev.filter((i) => i !== dislikeTarget));
      }
      setDislikeTarget(null);
      setSelectedReasons([]);
    },
    onError: () => {
      hapticForScene('action-fail');
      setDislikeTarget(null);
      setSelectedReasons([]);
    },
  });

  const handleSubmitDislike = useCallback(() => {
    if (!dislikeTarget) return;
    dislikeMutation.mutate({
      threadId: dislikeTarget.threadInfo?.id ?? '',
      dislikeIds: selectedReasons.join(',') || '1',
      forumId: dislikeTarget.threadInfo?.forumId,
      clickTime: Date.now(),
    });
  }, [dislikeTarget, selectedReasons, dislikeMutation]);

  const startLoad = useCallback((p = 1) => {
    pageTagRef.current = '';
    load(p);
  }, [load]);

  // 下拉刷新：走 refresh 模式（refreshing 置 true，spinner 有状态可依）
  const handleRefresh = useCallback(async () => {
    pageTagRef.current = '';
    await refresh();
    hapticForScene('toggle');
  }, [refresh]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'explore') startLoad(1);
    });
    return () => sub.remove();
  }, [startLoad]);

  useFocusEffect(
    useCallback(() => {
      if (exploreAutoRefresh && segment !== 'concern') {
        startLoad(1);
      } else if (segment === 'concern' && isLoggedIn) {
        startLoad(1);
      }
    }, [exploreAutoRefresh, segment, isLoggedIn, startLoad]),
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    loadMore();
  }, [hasMore, loadingMore, loading, loadMore]);

  // ── 原生 FeedCell 帖子卡片交互（对齐 FeedCard 既有行为，仅换实现载体） ──
  const handleThreadPress = useCallback((thread: ThreadInfo) => {
    hapticForScene('press');
    router.push(`/thread/${thread.id}`);
  }, [router]);

  const handleThreadShare = useCallback(async (thread: ThreadInfo) => {
    hapticForScene('press');
    try {
      await Clipboard.setStringAsync(thread.id ? buildThreadUrl(thread.id) : (thread.title || ''));
      hapticForScene('action-success');
    } catch {
      hapticForScene('action-fail');
    }
  }, []);

  const handleThreadLike = useCallback(async (thread: ThreadInfo) => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    hapticForScene('like');
    try {
      await agree(thread.id, thread.id, thread.hasAgree ? 0 : 1);
      hapticForScene('action-success');
    } catch {
      hapticForScene('action-fail');
    }
  }, [isLoggedIn, router]);

  const handleCopyTitle = useCallback((thread: ThreadInfo) => {
    const title = thread.title ?? '';
    if (title) {
      Clipboard.setStringAsync(title).catch(() => {});
    }
  }, []);

  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === 'thread' || item.type === 'video_thread') {
      // 帖子类目：原生 FeedCell（入场级联 enterIndex）+ RN 薄操作栏（分享/点赞/更多）
      return (
        <NativeThreadCell
          item={item}
          index={index}
          animateEntry={!entranceDoneRef.current}
          onPress={handleThreadPress}
          onShare={handleThreadShare}
          onLike={handleThreadLike}
          onDislike={handleDislikePress}
          onBlockAuthor={handleBlockAuthor}
          onCopyTitle={handleCopyTitle}
          onImagePress={imageViewer.handleImagePress}
        />
      );
    }
    return (
      <EntranceRow index={index} animateEntry={!entranceDoneRef.current}>
        <FeedCard
          item={item}
          onImagePress={imageViewer.handleImagePress}
          onDislike={handleDislikePress}
          onBlockAuthor={handleBlockAuthor}
        />
      </EntranceRow>
    );
  }, [imageViewer.handleImagePress, handleDislikePress, handleBlockAuthor, handleThreadPress, handleThreadShare, handleThreadLike, handleCopyTitle]);

  const keyExtractor = useCallback((item: FeedItem, index: number) => {
    const id = item.threadInfo?.id || item.forumInfo?.forumId || item.topicInfo?.topicId || '';
    return id ? `${item.type}-${id}` : `item-${index}`;
  }, []);

  const getItemType = useCallback((item: FeedItem) => item.type, []);

  const listFooter = useMemo(
    () => (
      <LoadMoreFooter
        hasMore={hasMore}
        loading={loadingMore}
        colors={colors}
        onLoadMore={handleLoadMore}
      />
    ),
    [loadingMore, hasMore, colors, handleLoadMore],
  );

  // 未登录关注（Kotlin 未登录时隐藏关注 tab；RN 降级为提示登录）
  if (segment === 'concern' && !isLoggedIn) {
    return (
      <VStack alignment="center" spacing={16}>
        <Spacer />
        <ContentUnavailableView
          systemImage="person.crop.circle.badge.questionmark"
          title="请先登录"
          description="登录后查看关注动态"
        />
        <Button
          onPress={() => router.push('/login')}
          modifiers={[buttonStyle('glassProminent'), buttonBorderShape('capsule')]}
        >
          <Label title="登录百度账号" systemImage="person.crop.circle.badge.checkmark" />
        </Button>
        <Spacer />
      </VStack>
    );
  }

  // 加载中：骨架屏（thread 变体，1:1 模拟信息流卡片）
  if (loading && items.length === 0) {
    return (
      <SkeletonList
        variant="thread"
        count={8}
        style={styles.feedSkeleton}
      />
    );
  }

  // 错误
  if (error && items.length === 0) {
    return (
      <VStack alignment="center" spacing={16}>
        <Spacer />
        <ContentUnavailableView
          systemImage="wifi.exclamationmark"
          title="加载失败"
          description={error}
        />
        <Button onPress={() => startLoad(1)}>
          <Label title="重试" systemImage="arrow.clockwise" />
        </Button>
        <Spacer />
      </VStack>
    );
  }

  // 空态
  if (items.length === 0) {
    return (
      <ContentUnavailableView
        systemImage="tray"
        title="暂无内容"
        description={segment === 'personalized' ? '去关注一些贴吧获取推荐' : '暂无关注动态'}
      />
    );
  }

  return (
    <VStack spacing={0}>
      <RNHostView>
        <View style={{ flex: 1 }}>
          {/* FlashList 2.x 不支持 FlatList 风格的 initialNumToRender/maxToRenderPerBatch/windowSize，
              使用 estimatedItemSize + drawDistance + getItemType 做分批与回收控制。
              分段切换时 SegmentFade 负责 crossfade，下拉刷新走 refresh 模式。 */}
          <SegmentFade segment={segment}>
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemType={getItemType}
              estimatedItemSize={300}
              drawDistance={400}
              maxItemsInRecyclePool={24}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 100 }}
              decelerationRate="normal"
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={listFooter}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                />
              }
            />
          </SegmentFade>
          <ImageViewer
            images={imageViewer.imageViewerImages}
            initialIndex={imageViewer.imageViewerIndex}
            visible={imageViewer.imageViewerVisible}
            onClose={imageViewer.closeImageViewer}
          />
        </View>
      </RNHostView>

      {/* 不感兴趣原因面板 */}
      <BottomSheet
        isPresented={dislikeTarget !== null}
        onIsPresentedChange={(presented) => {
          if (!presented) {
            setDislikeTarget(null);
            setSelectedReasons([]);
          }
        }}
      >
        <Group modifiers={[presentationDetents(['medium']), presentationDragIndicator('visible')]}>
          <VStack alignment="leading" spacing={16} modifiers={[padding({ horizontal: 20, top: 12, bottom: 24 })]}>
            <Text modifiers={[font({ textStyle: 'headline' })]}>不感兴趣</Text>
            <RNHostView matchContents>
              <View style={styles.dislikeChips}>
                {DEFAULT_DISLIKE_REASONS.map((reason) => {
                  const selected = selectedReasons.includes(reason.dislikeId);
                  return (
                    <Pressable
                      key={reason.dislikeId}
                      onPress={() => toggleReason(reason.dislikeId)}
                      style={({ pressed }) => [
                        styles.dislikeChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                          borderColor: selected ? colors.primary : 'transparent',
                          opacity: pressed ? 0.8 : 1,
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                        },
                      ]}
                    >
                      <RNText style={[styles.dislikeChipText, { color: selected ? colors.textOnPrimary : colors.textSecondary }]}>
                        {reason.dislikeReason}
                      </RNText>
                    </Pressable>
                  );
                })}
              </View>
            </RNHostView>
            <HStack spacing={12}>
              <Spacer />
              <Button
                onPress={handleSubmitDislike}
                modifiers={[buttonStyle('borderedProminent'), buttonBorderShape('capsule')]}
              >
                <Label title="提交" systemImage="hand.thumbsdown.fill" />
              </Button>
            </HStack>
          </VStack>
        </Group>
      </BottomSheet>
    </VStack>
  );
}

// ── 热榜 ──
function hotThreadKeyExtractor(item: HotThreadInfo) {
  return item.threadId;
}

function HotListContent() {
  const { colors } = useThemeColors();
  const router = useRouter();
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [tabs, setTabs] = useState<HotTabInfo[]>([]);
  const [threads, setThreads] = useState<HotThreadInfo[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 首屏入场标记（同 FeedContent）
  const entranceDoneRef = useRef(false);
  useEffect(() => {
    if (threads.length > 0) entranceDoneRef.current = true;
  }, [threads.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHot(activeTab, true);
    } finally {
      setRefreshing(false);
    }
    hapticForScene('toggle');
  }, [activeTab, loadHot]);

  const loadHot = useCallback(async (tabCode = 'all', silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const data = await hotThreadList(tabCode);
      setTopics(data.topics ?? []);
      setTabs(data.tabs ?? []);
      setThreads(data.threads ?? []);
      setActiveTab(tabCode);
    } catch (e: any) {
      setError(e?.message || '加载热榜失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; state updates happen after the async boundary.
  useEffect(() => { loadHot('all', true); }, [loadHot]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'explore') loadHot();
    });
    return () => sub.remove();
  }, [loadHot]);

  // stale-while-revalidate: 切换 Tab 时保留旧内容并降低透明度
  const isReloading = loading && threads.length > 0;

  const renderHotItem = useCallback(({ item, index }: { item: HotThreadInfo; index: number }) => {
    const rank = index + 1;
    const rankColor = rank <= 3 ? HOT_RANK_COLORS[rank - 1] : colors.textTertiary;
    const rankBg = rank <= 3 ? rankColor + '15' : 'transparent';
    return (
      <EntranceRow index={index} animateEntry={!entranceDoneRef.current}>
        <Pressable
        style={({ pressed }) => [
          styles.hotCard,
          { backgroundColor: colors.card },
          { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={() => {
          hapticForScene('press');
          router.push(`/thread/${item.threadId}`);
        }}
      >
        <View style={[styles.hotRankBadge, { backgroundColor: rankBg }]}>
          <RNText style={[styles.hotRankNum, { color: rankColor }]}>{rank}</RNText>
        </View>
        <View style={styles.hotCardBody}>
          <RNText style={[styles.hotTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </RNText>
          <View style={styles.hotMetaRow}>
            {item.authorId ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  hapticForScene('press');
                  router.push(`/user/${item.authorId}`);
                }}
                onPressIn={(event) => event.stopPropagation?.()}
                onPressOut={(event) => event.stopPropagation?.()}
                accessibilityRole="button"
                accessibilityLabel="查看作者"
                style={styles.hotAuthorGroup}
              >
                <Avatar source={item.authorPortrait || undefined} initials={item.authorNameShow?.charAt(0)} size={18} />
                <RNText style={[styles.hotUserName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.authorNameShow || item.authorName}
                </RNText>
              </Pressable>
            ) : (
              <View style={styles.hotAuthorGroup}>
                <Avatar source={item.authorPortrait || undefined} initials={item.authorNameShow?.charAt(0)} size={18} />
                <RNText style={[styles.hotUserName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.authorNameShow || item.authorName}
                </RNText>
              </View>
            )}
            <RNText style={[styles.hotDot, { color: colors.textTertiary }]}>·</RNText>
            <Pressable onPress={() => router.push(`/forum/${encodeURIComponent(item.forumName)}`)} style={[styles.hotForumChip, { backgroundColor: colors.surfaceSecondary }]}>
              <RNText style={[styles.hotForumText, { color: colors.textSecondary }]}>{item.forumName}</RNText>
            </Pressable>
          </View>
          <View style={styles.hotActions}>
            <SymbolView name="bubble.left" size={13} tintColor={colors.textTertiary} />
            <RNText style={[styles.hotActionText, { color: colors.textTertiary }]}>{formatCount(item.replyNum)}</RNText>
            <SymbolView name="hand.thumbsup" size={13} tintColor={colors.textTertiary} />
            <RNText style={[styles.hotActionText, { color: colors.textTertiary }]}>{formatCount(item.agreeNum)}</RNText>
            <View style={{ flex: 1 }} />
            <View style={styles.hotHotNumWrap}>
              <SymbolView name="flame" size={13} tintColor={rankColor} />
              <RNText style={[styles.hotHotNum, { color: rankColor }]}>{formatCount(item.hotNum)}</RNText>
            </View>
          </View>
        </View>
      </Pressable>
      </EntranceRow>
    );
  }, [colors, router]);

  const HotListHeader = useCallback(() => (
    <View style={{ opacity: isReloading ? 0.5 : 1 }}>
      {isReloading && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 12 }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      {topics.length > 0 && (
        <View style={styles.topicSection}>
          <View style={styles.topicSectionHeader}>
            <SymbolView name="flame" size={20} tintColor={colors.error} />
            <RNText style={[styles.topicSectionTitle, { color: colors.text }]}>热门话题</RNText>
          </View>
          <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicScrollContent}>
            {topics.slice(0, 8).map((topic, idx) => {
              const chipColors = [
                { bg: '#FF3B3012', rank: '#FF3B30', border: '#FF3B3030' },
                { bg: '#FF950012', rank: '#FF9500', border: '#FF950030' },
                { bg: '#FFCC0012', rank: '#CC9900', border: '#FFCC0030' },
                { bg: '#34C75912', rank: '#34C759', border: '#34C75930' },
                { bg: '#5AC8FA12', rank: '#5AC8FA', border: '#5AC8FA30' },
                { bg: '#007AFF12', rank: '#007AFF', border: '#007AFF30' },
                { bg: '#5856D612', rank: '#5856D6', border: '#5856D630' },
                { bg: '#AF52DE12', rank: '#AF52DE', border: '#AF52DE30' },
              ];
              const c = chipColors[idx % chipColors.length];
              return (
                <Pressable
                  key={topic.topicId}
                  style={({ pressed }) => [
                    styles.topicChip,
                    { backgroundColor: c.bg, borderColor: c.border },
                    { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                  onPress={() => router.push(`/topic/${topic.topicId}?name=${encodeURIComponent(topic.topicName)}`)}
                >
                  <View style={[styles.topicRankBadge, { backgroundColor: c.rank }]}>
                    <RNText style={styles.topicRankNum}>{idx + 1}</RNText>
                  </View>
                  <RNText style={[styles.topicChipText, { color: colors.text }]} numberOfLines={1}>
                    {topic.topicName}
                  </RNText>
                </Pressable>
              );
            })}
          </RNScrollView>
        </View>
      )}
      {tabs.length > 0 && (
        <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
          <Pressable
            style={({ pressed }) => [
              styles.tabItem,
              { backgroundColor: activeTab === 'all' ? colors.primary : colors.surfaceSecondary },
              { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}
            onPress={() => loadHot('all')}
          >
            <RNText style={[styles.tabItemText, { color: activeTab === 'all' ? colors.textOnPrimary : colors.textSecondary }]}>全部</RNText>
          </Pressable>
          {tabs.slice(0, 6).map((tab) => (
            <Pressable
              key={tab.tabCode}
              style={({ pressed }) => [
                styles.tabItem,
                { backgroundColor: activeTab === tab.tabCode ? colors.primary : colors.surfaceSecondary },
                { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
              onPress={() => loadHot(tab.tabCode)}
            >
              <RNText style={[styles.tabItemText, { color: activeTab === tab.tabCode ? colors.textOnPrimary : colors.textSecondary }]} numberOfLines={1}>
                {tab.tabName}
              </RNText>
            </Pressable>
          ))}
        </RNScrollView>
      )}
      <RNText style={[styles.rankTip, { color: colors.textTertiary }]}>
        排名按热度计算 · 实时更新
      </RNText>
    </View>
  ), [topics, tabs, activeTab, colors, isReloading, loadHot, router]);

  const HotListFooter = useCallback(() => (
    threads.length > 0 ? (
      <View style={styles.hotFooter}>
        <RNText style={[styles.hotFooterText, { color: colors.textTertiary }]}>
          — 已展示全部热榜内容 —
        </RNText>
      </View>
    ) : null
  ), [threads.length, colors.textTertiary]);

  if (loading && threads.length === 0) {
    return (
      <SkeletonList
        variant="row"
        count={8}
        style={styles.hotSkeleton}
      />
    );
  }

  if (error && threads.length === 0) {
    return (
      <VStack alignment="center" spacing={16}>
        <Spacer />
        <ContentUnavailableView systemImage="wifi.exclamationmark" title="加载失败" description={error} />
        <Button onPress={() => loadHot()}>
          <Label title="重试" systemImage="arrow.clockwise" />
        </Button>
        <Spacer />
      </VStack>
    );
  }

  // 加载成功但无数据
  if (!loading && threads.length === 0 && topics.length === 0) {
    return (
      <VStack alignment="center" spacing={16}>
        <Spacer />
        <ContentUnavailableView systemImage="flame" title="暂无热榜内容" description="稍后再来看看吧" />
        <Button onPress={() => loadHot()}>
          <Label title="刷新" systemImage="arrow.clockwise" />
        </Button>
        <Spacer />
      </VStack>
    );
  }

  return (
    <RNHostView>
      <View style={{ flex: 1 }}>
        <SegmentFade segment={activeTab}>
          <FlashList
            data={threads}
            keyExtractor={hotThreadKeyExtractor}
            renderItem={renderHotItem}
            ListHeaderComponent={HotListHeader}
            ListFooterComponent={HotListFooter}
            estimatedItemSize={120}
            contentContainerStyle={{ paddingBottom: 100 }}
            decelerationRate="normal"
            drawDistance={300}
            maxItemsInRecyclePool={24}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          />
        </SegmentFade>
      </View>
    </RNHostView>
  );
}

// ── 样式 ──
const styles = StyleSheet.create({
  // 分段内容区：crossfade 动画容器需占满剩余空间
  segmentFade: { flex: 1 },
  // 分段选择器：安全区间距由组件内 insets.top 提供
  pickerWrap: { width: '100%' },
  // 分段内容常驻挂载容器：display 切换隐藏，切换回来不重拉数据/不丢滚动位置
  segmentContent: { flex: 1 },
  segmentHidden: { display: 'none' },
  // 骨架屏容器
  feedSkeleton: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  hotSkeleton: { paddingHorizontal: 16, paddingTop: 8 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 16 },
  loadMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  loadMoreText: { fontSize: 13, fontWeight: '500' },
  // 不感兴趣原因 chips
  dislikeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 4 },
  dislikeChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1,
  },
  dislikeChipText: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  // ── 原生 FeedCell 帖子卡片（wave 2）──
  nativeThreadCardWrap: {
    marginHorizontal: Spacing.lg,
    marginVertical: 6,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // 有图帖 Hero 区透明叠加：点图打开图片浏览器（高度对齐原生 heroImageHeight=200）
  nativeHeroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  nativeThreadActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  nativeActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    minHeight: 28,
    justifyContent: 'center',
  },
  nativeActionItemPressed: { opacity: 0.5 },
  nativeActionText: { fontSize: 13, fontWeight: '500', letterSpacing: 0 },
  nativeActionSpacer: { flex: 1 },
  nativeActionMenu: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  // 话题横向滚动
  topicSection: { paddingTop: 16, paddingBottom: 6 },
  topicSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  topicSectionTitle: { ...typographyStyles.title2, letterSpacing: 0 },
  topicScrollContent: { paddingHorizontal: 14, gap: 10 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22,
    borderWidth: 1,
  },
  topicRankBadge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  topicRankNum: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  topicChipText: { fontSize: 14, fontWeight: '600', maxWidth: 130, letterSpacing: 0 },
  // Tab 横向滚动
  tabScrollContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, gap: 8 },
  tabItem: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  tabItemText: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  rankTip: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, fontSize: 12, letterSpacing: 0 },
  // 热帖卡片
  hotCard: {
    flexDirection: 'row', marginHorizontal: 14, marginVertical: 6,
    padding: 16, borderRadius: 16,
    ...Shadows.card,
  },
  hotRankBadge: {
    width: 38, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2, borderRadius: 10,
  },
  hotRankNum: { fontSize: 22, fontWeight: '800', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  hotCardBody: { flex: 1, paddingLeft: 10 },
  hotTitle: { ...typographyStyles.headline, marginBottom: 8 },
  hotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  hotAuthorGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hotUserName: { fontSize: 13, fontWeight: '500', maxWidth: 80 },
  hotDot: { fontSize: 13 },
  hotForumChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  hotForumText: { fontSize: 12, fontWeight: '500' },
  hotActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hotActionText: { fontSize: 13, marginRight: 12 },
  hotHotNumWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hotHotNum: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hotFooter: { alignItems: 'center', paddingVertical: 32 },
  hotFooterText: { fontSize: 13, letterSpacing: 0 },
});
