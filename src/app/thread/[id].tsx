/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * Thread Detail Page (帖子详情) — Apple News + Twitter/X + iOS 26+ design
 *
 * Layout (top to bottom, matching Kotlin ThreadPage):
 * 1. Stack Header (handled by _layout.tsx) — forum name chip
 * 2. Thread Header — author row, time+IP, divider
 * 3. Main Post Content — PostCard (immersive=false)
 * 4. Reply Count + Toolbar — seeLz toggle, sort toggle
 * 5. Reply Cards — avatar, badges, content, agree
 * 6. Floating Glass Bottom Bar — jump, agree, more
 * 7. More Menu Sheet — glass modal, grid + list items
 * 8. Pull-to-refresh via RefreshControl (single indicator)
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View, StyleSheet, Pressable, Text,
  Alert,
  Dimensions, Platform, ScrollView,
  RefreshControl,
} from 'react-native';
import {
  ConfirmationDialog, Button as SWButton, Text as SWText,
  Alert as SWAlert, TextField, useNativeState,
} from '@expo/ui/swift-ui';
import { keyboardType } from '@expo/ui/swift-ui/modifiers';
import Reanimated, {
  useSharedValue, useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GlassContainer } from 'expo-glass-effect';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { GlassView } from '@/components/ui/GlassView';
import { hapticForScene } from '@/theme/hapticsMap';
import { Toast, type ToastRef } from '@/components/ui/Toast';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import ImageViewer from '@/components/ImageViewer';
import PostCard from '@/components/thread/PostCard';
import PostContent from '@/components/thread/PostContent';
import ThreadMoreSheet from '@/components/thread/ThreadMoreSheet';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useThemeColors } from '@/theme/ThemeContext';
import { EASE_OUT, DURATION } from '@/theme/springs';
import { Radius } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useImageViewer } from '@/hooks/useImageViewer';
import { usePagedList } from '@/hooks/usePagedList';
import { recordThreadVisit } from '@/services/storage/visitHistory';
import { useThreadActions } from '@/services/threadActions';
import { flattenStyle, relativeTime, formatCount, getLevelColor } from '@/utils';
import {
  pbPage, agree as apiAgree, disagree as apiDisagree,
  addStore, removeStore,
} from '@/services/api/endpoints';
import type { PostInfo, ThreadInfo } from '@/types';

/** Hard cap for retained posts in a thread to bound long-thread memory. */
const MAX_POSTS = 400;

const replyKeyExtractor = (item: PostInfo) => item.id;

const PostSeparator = () => <View style={styles.postSep} />;

/** 浮动按钮按压反馈：按下缩到 0.88 */
const pressedScale = ({ pressed }: { pressed: boolean }) => [
  styles.floatingBtn,
  { transform: [{ scale: pressed ? 0.88 : 1 }] },
];

/** Debug 日志行着色：ERR 红 / OK 绿 / 其余默认 */
function debugLineColor(log: string) {
  if (log.includes('[ERR]')) return { color: '#FF453A' };
  if (log.includes('[OK]')) return { color: '#30D158' };
  return undefined;
}

// ────────────────────────────────────────────────────────────
// Thread Header — memoized so pagination (loadMore) never
// rebuilds the main post + reply toolbar. Depends on thread
// data (plus the stable first post reference), not the whole
// posts array.
// ────────────────────────────────────────────────────────────

interface ThreadHeaderProps {
  thread: ThreadInfo | null;
  mainPost: PostInfo | null;
  seeLz: boolean;
  reverse: boolean;
  colors: any;
  onToggleSeeLz: () => void;
  onToggleSort: () => void;
  onImagePress: (images: string[], index?: number) => void;
}

const ThreadHeader = memo(function ThreadHeader({
  thread,
  mainPost,
  seeLz,
  reverse,
  colors,
  onToggleSeeLz,
  onToggleSort,
  onImagePress,
}: ThreadHeaderProps) {
  if (!thread) return null;
  const replyCount = thread.replyNum ?? 0;

  return (
    <View>
      {/* ── Main Post (OP) — visually distinct glass card section ── */}
      {/* 原生 GlassSurface 声明了 bubbling onPress 事件，与内部 Pressable 的
          direct onPress 冲突（"Event cannot be both direct and bubbling"），
          改用 RN View 模拟玻璃卡片，避免整页崩溃。 */}
      <View
        style={[
          styles.mainPostSection,
          styles.glassCard,
          {
            marginHorizontal: 12,
            marginBottom: 8,
            padding: 16,
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.divider,
          },
        ]}
      >
        {/* Author row */}
        <Link href={{ pathname: '/user/[uid]', params: { uid: thread.authorId } }} push asChild>
          <Pressable style={styles.authorRow}>
            <Avatar
              source={thread.authorPortrait}
              initials={thread.authorNameShow?.slice(0, 2) || thread.authorName?.slice(0, 2)}
              size={40}
              level={thread.authorLevelId > 0 ? thread.authorLevelId : undefined}
            />
            <View style={styles.authorInfo}>
              <View style={styles.authorNameRow}>
                <Text style={[styles.authorDisplayName, { color: colors.text }]} numberOfLines={1}>
                  {thread.authorNameShow || thread.authorName}
                </Text>
                <View style={[styles.lzBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.lzBadgeText, { color: colors.textOnPrimary }]}>楼主</Text>
                </View>
                {thread.authorLevelId > 0 && (
                  <View style={[styles.lzBadge, { backgroundColor: getLevelColor(thread.authorLevelId) }]}>
                    <Text style={[styles.lzBadgeText, { color: '#FFFFFF' }]}>Lv.{thread.authorLevelId}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.authorMeta, { color: colors.textTertiary }]}>
                {relativeTime(thread.createTime)}
                {mainPost?.ipLocation ? ` · IP属地:${mainPost.ipLocation}` : ''}
              </Text>
            </View>
          </Pressable>
        </Link>

        {/* Main post content */}
        {mainPost && mainPost.content.length > 0 && (
          <View style={styles.mainPostContent}>
            <PostContent
              content={mainPost.content}
              forumName={thread?.forumName}
              onImagePress={onImagePress}
            />
          </View>
        )}
      </View>

      {/* ── Reply Toolbar (below main post) ── */}
      <View
        style={[
          styles.replyToolbar,
          styles.glassCard,
          {
            marginHorizontal: 12,
            marginBottom: 8,
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.divider,
          },
        ]}
      >
        <Text style={[styles.replyCount, { color: colors.text }]}>
          回复 {formatCount(replyCount)}
        </Text>
        <View style={styles.replyToolbarRight}>
          <Pressable
            onPress={onToggleSeeLz}
            style={({ pressed }) => [
              styles.seeLzPill,
              {
                backgroundColor: seeLz ? colors.primary : colors.surfaceSecondary,
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <Text style={[styles.seeLzPillText, { color: seeLz ? colors.textOnPrimary : colors.textSecondary }]}>
              只看楼主
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleSort}
            style={({ pressed }) => [
              styles.sortPill,
              {
                backgroundColor: reverse ? colors.primary : colors.surfaceSecondary,
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <Text style={[styles.sortPillText, { color: reverse ? colors.textOnPrimary : colors.textSecondary }]}>
              {reverse ? '倒序' : '正序'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

/**
 * StaggerItem — single shared-value entrance wrapper. Only the
 * first loaded batch animates in (stagger per index); reduceMotion
 * keeps everything opaque.
 */
const StaggerItem = memo(function StaggerItem({
  index,
  entrance,
  entryTotal,
  children,
}: {
  index: number;
  entrance: SharedValue<number>;
  entryTotal: SharedValue<number>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    'worklet';
    const p = entrance.value;
    const enter = DURATION.enter;
    const stagger = DURATION.stagger;
    const total = enter + stagger * Math.max(entryTotal.value, 1);
    const start = (index * stagger) / total;
    const span = enter / total;
    const local = Math.min(Math.max((p - start) / span, 0), 1);
    return {
      opacity: local,
      transform: [{ translateY: (1 - local) * 10 }],
    };
  });
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
});

const POST_LIST_OVERRIDES = { initialDrawBatchSize: 8 };

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FLOATING_BAR_WIDTH = SCREEN_WIDTH * 0.72;


// ────────────────────────────────────────────────────────────
// Main Thread Page
// ────────────────────────────────────────────────────────────

export default function ThreadPage() {
  const { id, postId, seeLz: initialSeeLz, fromFavorites } = useLocalSearchParams<{
    id: string; postId?: string; seeLz?: string; fromFavorites?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const { reduceMotion } = useReducedMotion();
  // Selectors (Issue #3): subscribe only to the slices this screen uses
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const accountUid = useAuthStore((s) => s.account?.uid);
  const { filterPosts, blockedWords, blockedUsers } = useBlockFilter();
  const hideBlockedContent = useAppPreference('hideBlockedContent', false);
  const collectSeeLz = useAppPreference('collectSeeLz', true);
  const collectDescSort = useAppPreference('collectDescSort', false);
  const incognitoMode = useAppPreference('incognitoMode', false);
  const showShortcutInThread = useAppPreference('showShortcutInThread', true);
  const openFromFavorites = fromFavorites === '1';

  // ── State ──
  // fetcher 必须 useCallback 稳定引用：内联会导致每次渲染 run/load 变化，
  // useEffect 反复触发 load → 同一请求被 abort+重发多次、一直处于 loading。
  const fetchThreadPage = useCallback(
    async (page: number, params: { id: string; postId?: string; seeLz: boolean; reverse: boolean }, signal?: AbortSignal) => {
      try {
        const data = await pbPage(params.id, page, params.postId, params.seeLz, false, params.reverse ? 1 : 0, signal);
        if (__DEV__) console.log('[thread] pbPage OK page=', page, 'posts=', data.posts.length, 'hasMore=', data.page.hasMore);
        return {
          items: data.posts,
          hasMore: data.page.hasMore,
          nextPage: data.page.current + 1,
          extra: { thread: data.thread, total: data.page.total },
        };
      } catch (e: any) {
        if (__DEV__) console.warn('[thread] pbPage ERR page=', page, 'err=', e?.message, 'code=', e?.code, 'errorCode=', e?.errorCode);
        throw e;
      }
    },
    [],
  );
  const paged = usePagedList<PostInfo, { id: string; postId?: string; seeLz: boolean; reverse: boolean }, { thread: ThreadInfo | null; total: number }>({
    fetcher: fetchThreadPage,
    params: { id, postId, seeLz: initialSeeLz === '1' || (openFromFavorites && !!collectSeeLz), reverse: openFromFavorites && !!collectDescSort },
    maxItems: MAX_POSTS,
  });
  const {
    items: posts,
    page: currentPage,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    extra,
    load,
    refresh: handleRefresh,
    loadMore: handleLoadMore,
    setItems: setPosts,
    setExtra,
  } = paged;
  const totalPages = extra?.total ?? 0;
  const thread = extra?.thread ?? null;
  const [seeLz, setSeeLz] = useState<boolean>(initialSeeLz === '1' || (openFromFavorites && !!collectSeeLz));
  const [reverse, setReverse] = useState<boolean>(openFromFavorites && !!collectDescSort);
  const [isCollected, setIsCollected] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  // ── Debug state ──
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // ── SwiftUI ConfirmationDialog state (report / delete) ──
  const [confirmState, setConfirmState] = useState<{
    visible: boolean; title: string; message: string; onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // Memoized on stable deps (Issue #1) so per-frame scroll renders never
  // recompute the filter or fork a fresh array reference for FlashList.
  const filteredPosts = useMemo(
    () => (hideBlockedContent ? filterPosts(posts) : posts),
    // filterPosts is an unstable closure; anchor on its inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, blockedWords, blockedUsers, hideBlockedContent],
  );
  // Skip first post (rendered in header as main post)
  const replyPosts = useMemo(
    () => (filteredPosts.length > 1 ? filteredPosts.slice(1) : []),
    [filteredPosts],
  );
  const flatListRef = useRef<any>(null);
  const toastRef = useRef<ToastRef | null>(null);

  // ── Floating bar auto-hide on scroll — fully on the UI thread (Issue #1) ──
  // Shared values (not React state) so scrolling never re-renders ThreadPage.
  const barTranslateY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const lastScrollTime = useSharedValue(0);
  const barVisible = useSharedValue(1); // 1 = visible, 0 = hidden
  const lastScrollProcessedAt = useSharedValue(0);
  const reduceMotionSV = useSharedValue(reduceMotion);

  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
  }, [reduceMotion, reduceMotionSV]);

  // ── First-batch stagger entrance (main post + initial replies "刷" in) ──
  // Shared values so only the first successful load plays the animation;
  // loadMore items render opaque (progress is already 1 by then).
  const entranceProgress = useSharedValue(0);
  const entryTotalSV = useSharedValue(1);
  const entranceStartedRef = useRef(false);

  useEffect(() => {
    if (entranceStartedRef.current || loading || posts.length === 0) return;
    entranceStartedRef.current = true;
    entryTotalSV.value = Math.max(posts.length, 1);
    if (reduceMotion) {
      entranceProgress.value = 1;
    } else {
      entranceProgress.value = withTiming(1, {
        duration: DURATION.enter + DURATION.stagger * Math.max(posts.length - 1, 0),
        easing: EASE_OUT,
      });
    }
  }, [loading, posts.length, reduceMotion, entranceProgress, entryTotalSV]);

  // ⚠️ FlashList 2.3.2 要求 onScroll 是普通函数（内部直接 props.onScroll(event)
  // 调用）；useAnimatedScrollHandler 返回的对象会触发
  // "TypeError: undefined is not a function"。改普通函数 + JS 线程设
  // sharedValue（withTiming 动画仍在 UI 线程跑）。
  const scrollHandler = useCallback((event: any) => {
    const e = event?.nativeEvent ?? event ?? {};
    const y = e?.contentOffset?.y ?? 0;
    const now = typeof e?.timestamp === 'number' ? e.timestamp : Date.now();
    const animateBar = (visible: boolean) => {
      barVisible.value = visible ? 1 : 0;
      barTranslateY.value = reduceMotionSV.value
        ? (visible ? 0 : 120)
        : withTiming(visible ? 0 : 120, { duration: visible ? DURATION.enter : DURATION.exit });
    };

    // Near the top: reveal immediately, never throttle.
    if (y < 10) {
      lastScrollProcessedAt.value = now;
      if (barVisible.value === 0) animateBar(true);
      return;
    }

    // Sample velocity at most every 60ms; mid-list scrolls only drive shared values.
    if (now - lastScrollProcessedAt.value < 60) return;
    lastScrollProcessedAt.value = now;

    const dt = now - lastScrollTime.value;
    const dy = y - lastScrollY.value;
    lastScrollY.value = y;
    lastScrollTime.value = now;

    const velocity = dt > 0 ? dy / dt : 0;
    if (velocity > 0.3 && barVisible.value === 1) {
      animateBar(false);
    } else if (velocity < -0.3 && barVisible.value === 0) {
      animateBar(true);
    }
  }, [reduceMotionSV, barVisible, barTranslateY, lastScrollProcessedAt, lastScrollTime, lastScrollY]);

  const floatingBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barTranslateY.value }],
  }));

  const imageViewer = useImageViewer();
  const threadActions = useThreadActions({
    threadId: id,
    forumId: thread?.forumId,
    forumName: thread?.forumName,
  });
  const { report: reportAction, remove: removeAction, copy: copyAction } = threadActions;

  // ──────────────────────────────────────────────
  // Data Loading
  // ──────────────────────────────────────────────

  // Initial load + reload when seeLz/reverse changes
  useEffect(() => {
    load(1, { id, postId, seeLz, reverse });
  }, [seeLz, reverse, id, postId, load]);

  useEffect(() => {
    if (thread?.id && !incognitoMode) {
      recordThreadVisit({
        id,
        type: 'thread' as const,
        title: thread.title ?? '',
        timestamp: Date.now(),
      });
    }
  }, [thread?.id, thread?.title, id, incognitoMode]);

  // ──────────────────────────────────────────────
  // Toolbar / Menu Actions
  // ──────────────────────────────────────────────

  const handleToggleSeeLz = useCallback(() => {
    hapticForScene('toggle');
    setSeeLz((v) => !v);
  }, []);

  const handleToggleSort = useCallback(() => {
    hapticForScene('toggle');
    setReverse((v) => !v);
  }, []);

  const handleToggleImmersive = useCallback(() => {
    hapticForScene('toggle');
    setImmersive((v) => !v);
  }, []);

  const handleToggleCollect = useCallback(async () => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    try {
      if (isCollected) await removeStore(id);
      else await addStore(id);
      setIsCollected((v) => !v);
      hapticForScene('action-success');
    } catch { Alert.alert('错误', '操作失败'); }
  }, [isLoggedIn, isCollected, id]);

  /** 乐观更新单个 post 的字段（按 id 匹配 prev state 中的当前项） */
  const patchPost = useCallback(
    (postId: string, patch: (post: PostInfo) => Partial<PostInfo>) =>
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch(p) } : p))),
    [setPosts],
  );

  const handleAgree = useCallback(async (postId: string, opType: number) => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    try {
      if (post.isAgree && opType === 1) {
        // Already agreed, treat as cancel
        await apiAgree(id, postId, 0);
        patchPost(postId, (p) => ({ isAgree: false, agreeNum: Math.max(0, p.agreeNum - 1) }));
      } else if (!post.isAgree && opType === 1) {
        await apiAgree(id, postId, 1);
        patchPost(postId, (p) => ({ isAgree: true, agreeNum: p.agreeNum + 1 }));
      }
      hapticForScene('like');
    } catch { Alert.alert('错误', '操作失败'); }
  }, [isLoggedIn, id, posts, patchPost]);

  const handleDisagree = useCallback(async (postId: string, opType: number) => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    try {
      if (post.isDisagree && opType === 1) {
        await apiDisagree(id, postId, 0);
        patchPost(postId, (p) => ({ isDisagree: false, disagreeNum: Math.max(0, p.disagreeNum - 1) }));
      } else if (!post.isDisagree && opType === 1) {
        await apiDisagree(id, postId, 1);
        patchPost(postId, (p) => ({ isDisagree: true, disagreeNum: p.disagreeNum + 1 }));
      }
      hapticForScene('like');
    } catch { Alert.alert('错误', '操作失败'); }
  }, [isLoggedIn, id, posts, patchPost]);

  /** Agree on the thread itself (from floating bar heart button) */
  const handleThreadAgree = useCallback(async () => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    if (!thread) return;
    try {
      hapticForScene('like');
      // Agree to the first post as thread-level agree
      const opType = thread.hasAgree ? 0 : 1;
      await apiAgree(id, id, opType);
      setExtra((prev) => {
        const current = prev?.thread ?? thread;
        return {
          ...(prev ?? { thread: null, total: 0 }),
          thread: current
            ? {
                ...current,
                hasAgree: !current.hasAgree,
                zanNum: Math.max(0, (current.zanNum ?? 0) + (opType === 1 ? 1 : -1)),
              }
            : current,
        };
      });
    } catch { Alert.alert('错误', '操作失败'); }
  }, [isLoggedIn, id, thread, setExtra]);

  const handleCollectFloor = useCallback(async (postId: string) => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    try {
      await addStore(id, postId);
      hapticForScene('action-success');
      Alert.alert('已收藏', '已收藏到此楼');
    } catch { Alert.alert('错误', '收藏失败'); }
  }, [isLoggedIn, id]);

  const handleReport = useCallback((postId?: string) => {
    const targetPostId = postId || id;
    setConfirmState({
      visible: true,
      title: '举报',
      message: '确定要举报这条帖子吗？',
      onConfirm: () => reportAction(targetPostId),
    });
  }, [id, reportAction]);

  const handleDelete = useCallback((postId?: string) => {
    const targetPostId = postId || id;
    const deletingThread = !postId || postId === id;
    setConfirmState({
      visible: true,
      title: deletingThread ? '删除帖子' : '删除回复',
      message: deletingThread ? '确定要删除这条帖子吗？' : '确定要删除这条回复吗？',
      onConfirm: async () => {
        if (await removeAction(targetPostId)) {
          if (!deletingThread) {
            setPosts((prev) => prev.filter((p) => p.id !== targetPostId));
          } else {
            router.back();
          }
        }
      },
    });
  }, [id, removeAction, setPosts]);

  const handleCopyLink = useCallback(async () => {
    if (await copyAction()) {
      toastRef.current?.show({
        title: '已复制',
        message: '链接已复制到剪贴板',
        type: 'success',
        icon: 'link',
      });
    }
  }, [copyAction]);

  // ── Jump-to-page dialog (SwiftUI Alert + TextField) ──
  const [jumpDialogVisible, setJumpDialogVisible] = useState(false);
  const jumpText = useNativeState('');

  const openJumpDialog = useCallback(() => {
    jumpText.value = String(currentPage);
    setJumpDialogVisible(true);
  }, [currentPage, jumpText]);

  const handleJumpConfirm = useCallback(async () => {
    const pageNum = parseInt(jumpText.value.trim(), 10);
    setJumpDialogVisible(false);
    if (!Number.isFinite(pageNum) || pageNum < 1 || (totalPages > 0 && pageNum > totalPages)) {
      Alert.alert('提示', totalPages > 0 ? `请输入 1-${totalPages} 之间的页码` : '请输入有效的页码');
      return;
    }
    if (pageNum === currentPage) return;
    await load(pageNum, { id, postId, seeLz, reverse }, 'initial');
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [jumpText, totalPages, currentPage, load, id, postId, seeLz, reverse]);

  const canDelete = accountUid === thread?.authorId;

  // ──────────────────────────────────────────────
  // Thread Header (ListHeaderComponent)
  // ──────────────────────────────────────────────

  // Stable first-post reference (posts[0]) so loadMore appends never
  // recreate the header; the memoized ThreadHeader bails out on equal props.
  const mainPost = posts.length > 0 ? posts[0] : null;

  const renderHeader = useMemo(() => {
    if (!thread) return null;

    return (
      <StaggerItem index={0} entrance={entranceProgress} entryTotal={entryTotalSV}>
        <ThreadHeader
          thread={thread}
          mainPost={mainPost}
          seeLz={seeLz}
          reverse={reverse}
          colors={colors}
          onToggleSeeLz={handleToggleSeeLz}
          onToggleSort={handleToggleSort}
          onImagePress={imageViewer.handleImagePress}
        />
      </StaggerItem>
    );
  }, [thread, mainPost, seeLz, reverse, colors, handleToggleSeeLz, handleToggleSort, imageViewer.handleImagePress, entranceProgress, entryTotalSV]);

  // ──────────────────────────────────────────────
  // Render individual post / reply
  // ──────────────────────────────────────────────

  // Thread actions (share/copy/report/delete) are hosted by the native
  // ThreadMoreSheet bottom sheet rendered below the list.

  // Extracted from renderItem so the PostCard callback identity is stable (Issue #8)
  const threadAuthorId = thread?.authorId;
  const handleSubPostsPress = useCallback((post: any) => {
    router.push(
      `/thread/${id}/subposts?postId=${post.id}&threadId=${id}&forumId=${thread?.forumId || ''}&floor=${post.floor}&threadAuthorId=${thread?.authorId || ''}&forumName=${encodeURIComponent(thread?.forumName || '')}&threadTitle=${encodeURIComponent(thread?.title || '')}`,
    );
  }, [id, thread?.forumId, thread?.authorId, thread?.forumName, thread?.title]);

  const renderPost = useCallback(({ item, index }: { item: PostInfo; index: number }) => {
    // Determine if this reply is from the OP (楼主)
    const isReplyLz = item.authorIsLz || (!!threadAuthorId && item.authorId === threadAuthorId);

    const card = (
      <PostCard
        post={item}
        forumName={thread?.forumName}
        isLz={isReplyLz}
        subPosts={item.subPosts}
        immersive={immersive}
        onAgree={handleAgree}
        onDisagree={handleDisagree}
        onReport={handleReport}
        onCollectFloor={handleCollectFloor}
        onDelete={accountUid === item.authorId ? handleDelete : undefined}
        onSubPostsPress={handleSubPostsPress}
        onImagePress={imageViewer.handleImagePress}
      />
    );

    return (
      <StaggerItem index={index} entrance={entranceProgress} entryTotal={entryTotalSV}>
        {card}
      </StaggerItem>
    );
  }, [handleAgree, handleDisagree, handleReport, handleCollectFloor, handleDelete, imageViewer.handleImagePress, handleSubPostsPress, accountUid, threadAuthorId, thread?.forumName, immersive, entranceProgress, entryTotalSV]);

  const renderFooter = useMemo(() => (
    <LoadMoreFooter
      hasMore={hasMore} loading={loadingMore}
      colors={colors} onLoadMore={handleLoadMore}
    />
  ), [hasMore, loadingMore, colors, handleLoadMore]);

  // ──────────────────────────────────────────────
  // Render states
  // ──────────────────────────────────────────────

  if (loading && posts.length === 0) {
    return (
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: thread?.title || '帖子', headerTransparent: false }} />
        <View style={styles.loadingSkeleton}>
          <SkeletonList count={5} variant="post" />
        </View>
      </View>
    );
  }

  if (error && posts.length === 0) {
    return (
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: '帖子', headerTransparent: false }} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────────

  // 完整标题交给原生 Stack header，由 header 原生省略号（numberOfLines=1）处理，
  // 避免手动 slice(0,14)+'...' 与导航栏截断双重缩略。
  const threadTitle = thread?.title || '帖子';

  return (
    <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
      {/* Stack header — forum name chip as tappable title */}
      <Stack.Screen
        options={{
          title: threadTitle,
          headerTransparent: false,
          headerRight: () => (
            <Link
              href={{ pathname: '/forum/[name]', params: { name: thread?.forumName || '' } }}
              push
              asChild
            >
              <Pressable
                style={styles.forumAvatarBtn}
                onPressIn={() => hapticForScene('press')}
              >
                <Avatar
                  source={thread?.forumAvatar || undefined}
                  initials={(thread?.forumName || '吧')?.charAt(0)}
                  size={28}
                />
              </Pressable>
            </Link>
          ),
        }}
      />

      {/* Pull-to-refresh handled by RefreshControl; the old top overlay
          indicator was removed to avoid a double spinner. */}

      {/* Main FlatList */}
      <FlashList
        ref={flatListRef}
        data={replyPosts}
        keyExtractor={replyKeyExtractor}
        renderItem={renderPost}
        estimatedItemSize={220}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState title="暂无回复" description="还没有人回复这个帖子" icon="bubble.left" />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void handleRefresh().then(() => hapticForScene('toggle')); }}
            tintColor={colors.primary}
          />
        }
        ItemSeparatorComponent={PostSeparator}
        drawDistance={300}
        maxItemsInRecyclePool={24}
        overrideProps={POST_LIST_OVERRIDES}
        decelerationRate="normal"
        onScroll={scrollHandler}
        scrollEventThrottle={48}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* iOS 26 Stack.Toolbar 说明：官方 Stack.Toolbar (placement="bottom") 提供原生液态玻璃工具栏，但只支持标准按钮，无法承载自定义点赞数展示；居中 72% 宽度胶囊是匹配 iOS 26 浮动控件的刻意设计；Stack.Toolbar 必须放在页面组件（而非 layout），未来可迁移。 */}

      {/* Floating Glass Bottom Bar */}
      {showShortcutInThread && (
      <Reanimated.View
        style={[
          styles.floatingBarWrapper,
          { bottom: insets.bottom + 12 },
          floatingBarStyle,
        ]}
        pointerEvents="box-none"
      >
        <GlassView
          theme={isDark ? 'dark' : 'light'}
          borderRadius={999}
          glassEffectStyle="clear"
          tintColor={isDark ? 'rgba(28,28,30,0.15)' : 'rgba(255,255,255,0.15)'}
          style={[
            styles.floatingBar,
            {
              backgroundColor: isDark
                ? 'rgba(28,28,30,0.55)'
                : 'rgba(255,255,255,0.7)',
            },
          ]}
        >
          {/* §5.5: GlassContainer combines child glass views into a unified effect */}
          <GlassContainer spacing={0} style={styles.floatingBarInner}>
          {/* Copy link */}
          <Pressable
            onPress={() => { hapticForScene('press'); handleCopyLink(); }}
            style={pressedScale}
          >
            <SymbolView name="link" size={20} tintColor={colors.text} />
          </Pressable>

          {/* Thread agree / like */}
          <Pressable
            onPress={handleThreadAgree}
            style={pressedScale}
          >
            <SymbolView
              name={thread?.hasAgree ? 'heart.fill' : 'heart'}
              size={20}
              tintColor={thread?.hasAgree ? colors.error : colors.text}
            />
            {(thread?.zanNum ?? 0) > 0 && (
              <Text style={[styles.floatingAgreeCount, { color: thread?.hasAgree ? colors.error : colors.textSecondary }]}>
                {formatCount(thread?.zanNum ?? 0)}
              </Text>
            )}
          </Pressable>

          {/* Collect / Favorite */}
          <Pressable
            onPress={() => { hapticForScene('favorite'); handleToggleCollect(); }}
            style={pressedScale}
          >
            <SymbolView
              name={isCollected ? 'star.fill' : 'star'}
              size={20}
              tintColor={isCollected ? '#FFCC00' : colors.text}
            />
          </Pressable>

          {/* Reply button removed — reply/compose entry lives in PostContent */}

          {/* More menu */}
          <Pressable
            onPress={() => {
              hapticForScene('sheet-present');
              setMoreSheetVisible(true);
            }}
            style={pressedScale}
          >
            <SymbolView name="ellipsis" size={20} tintColor={colors.text} />
          </Pressable>
          </GlassContainer>
        </GlassView>
      </Reanimated.View>
      )}

      {/* Jump-to-page dialog (SwiftUI Alert + TextField) */}
      <ThemedHost matchContents style={{ position: 'absolute', width: 0, height: 0 }}>
        <SWAlert title="跳转页面" isPresented={jumpDialogVisible} onIsPresentedChange={setJumpDialogVisible}>
          <SWAlert.Actions>
            <SWButton label="跳转" onPress={handleJumpConfirm} />
            <SWButton label="取消" role="cancel" />
          </SWAlert.Actions>
          <SWAlert.Message>
            <TextField placeholder={`1-${totalPages > 0 ? totalPages : '?'}`} text={jumpText} modifiers={[keyboardType('numeric')]} autoFocus />
          </SWAlert.Message>
        </SWAlert>
      </ThemedHost>

      {/* Confirmation dialog (report / delete) */}
      <ThemedHost matchContents style={{ position: 'absolute', width: 0, height: 0 }}>
        <ConfirmationDialog
          title={confirmState.title}
          isPresented={confirmState.visible}
          onIsPresentedChange={(v) => setConfirmState((s) => ({ ...s, visible: v }))}
          titleVisibility="visible"
        >
          <ConfirmationDialog.Actions>
            <SWButton label="确定" role="destructive" onPress={() => { confirmState.onConfirm(); setConfirmState((s) => ({ ...s, visible: false })); }} />
            <SWButton label="取消" role="cancel" />
          </ConfirmationDialog.Actions>
          <ConfirmationDialog.Message><SWText>{confirmState.message}</SWText></ConfirmationDialog.Message>
        </ConfirmationDialog>
      </ThemedHost>

      {/* Image Viewer */}
      <ImageViewer
        images={imageViewer.imageViewerImages}
        initialIndex={imageViewer.imageViewerIndex}
        visible={imageViewer.imageViewerVisible}
        onClose={imageViewer.closeImageViewer}
        forumName={thread?.forumName}
      />

      {/* More menu (native bottom sheet) */}
      <ThreadMoreSheet
        visible={moreSheetVisible}
        onClose={() => setMoreSheetVisible(false)}
        threadId={id}
        forumId={thread?.forumId}
        forumName={thread?.forumName}
        authorId={thread?.authorId}
        canDelete={canDelete}
        isLoggedIn={isLoggedIn}
        seeLz={seeLz}
        isCollected={isCollected}
        immersive={immersive}
        reverse={reverse}
        onToggleSeeLz={handleToggleSeeLz}
        onToggleCollect={handleToggleCollect}
        onToggleImmersive={handleToggleImmersive}
        onToggleSort={handleToggleSort}
        onJumpToPage={openJumpDialog}
      />

      {/* In-page toast (no global ToastProvider mounted) */}
      <Toast ref={toastRef} />

      {/* Debug Panel Toggle + Panel (dev only) */}
      {__DEV__ && (<>
      <Pressable
        style={[styles.debugToggle, { backgroundColor: isDark ? 'rgba(255,149,0,0.9)' : 'rgba(255,149,0,0.85)' }]}
        onPress={() => setDebugVisible((v) => !v)}
        onLongPress={() => setDebugLogs([])}
      >
        <Text style={styles.debugToggleText}>DBG</Text>
      </Pressable>

      {/* Debug Panel */}
      {debugVisible && (
        <View style={[styles.debugPanel, { backgroundColor: isDark ? 'rgba(0,0,0,0.92)' : 'rgba(30,30,30,0.92)', bottom: insets.bottom + 70 }]}>
          <View style={styles.debugHeader}>
            <Text style={styles.debugTitle}>Debug Logs (long-press DBG to clear)</Text>
            <Pressable onPress={() => setDebugVisible(false)} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView style={styles.debugScroll} nestedScrollEnabled>
            {debugLogs.length === 0 ? (
              <Text style={styles.debugLine}>No logs yet. Pull to refresh.</Text>
            ) : (
              debugLogs.map((log, i) => (
                <Text key={i} style={[styles.debugLine, debugLineColor(log)]}>
                  {log}
                </Text>
              ))
            )}
            <Text style={[styles.debugLine, { color: '#8E8E93' }]}>── thread={thread?.id} posts={posts.length} page={currentPage}/{totalPages}</Text>
          </ScrollView>
        </View>
      )}
      </>)}
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 4, paddingTop: 8 },

  // ── Thread Header ──
  loadPrevBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, marginBottom: 10, borderRadius: 12, gap: 6,
  },
  loadPrevText: { fontSize: 13, fontWeight: '600' },

  // 玻璃卡片降级样式（替代原生 GlassSurface，规避 bubbling/direct 事件冲突）
  glassCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  mainPostSection: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  mainPostContent: {
    marginTop: 12,
  },

  authorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 4,
  },
  authorInfo: { flex: 1, gap: 2 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorDisplayName: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  lzBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  lzBadgeText: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  authorMeta: { fontSize: 13, fontWeight: '400' },

  // ── Reply toolbar ──
  replyToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16,
  },
  replyCount: { fontSize: 16, fontWeight: '700' },
  replyToolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seeLzPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
  },
  seeLzPillText: { fontSize: 13, fontWeight: '600' },
  sortPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
  },
  sortPillText: { fontSize: 13, fontWeight: '600' },

  // ── Forum avatar (header right) ──
  forumAvatarBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },

  // ── Loading skeleton ──
  loadingSkeleton: {
    flex: 1,
    paddingTop: 12,
  },

  // ── Posts ──
  postSep: { height: 1 },

  // ── Floating glass bottom bar ──
  floatingBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    // Fully transparent — only the floating pill has glass; no side/bottom strips
    backgroundColor: 'transparent',
  },
  floatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: FLOATING_BAR_WIDTH,
    height: 54,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  floatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  floatingBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    flex: 1,
  },
  floatingAgreeCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // ── Jump-to-page dialog ──
  jumpDialogOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
  },
  jumpDialogBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  jumpDialogCardWrap: {
    width: '100%',
    maxWidth: 320,
  },
  jumpDialogCard: {
    width: '100%',
    maxWidth: 320,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  jumpDialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  jumpDialogSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  jumpDialogInput: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    textAlign: 'center',
  },
  jumpDialogActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  jumpDialogBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  jumpDialogBtnText: {
    fontSize: 16,
  },
  jumpDialogDividerV: {
    width: StyleSheet.hairlineWidth,
    height: 20,
  },


  // ── Debug Panel ──
  debugToggle: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 36,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  debugToggleText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  debugPanel: {
    position: 'absolute',
    left: 8,
    right: 8,
    maxHeight: 220,
    borderRadius: 12,
    padding: 10,
    zIndex: 200,
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  debugTitle: { color: '#FF9500', fontSize: 11, fontWeight: '700' },
  debugClose: { color: '#FFF', fontSize: 16, padding: 4 },
  debugScroll: { maxHeight: 160 },
  debugLine: { color: '#E0E0E0', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
});
