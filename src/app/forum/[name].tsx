/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * Forum Page (吧页面) — iOS-native design · 对齐 Kotlin ForumPage
 *
 * Kotlin ForumPage 布局:
 *   ForumToolbar (back + title + search + more)
 *   ForumHeader (avatar + name + level progress + follow/sign btn)
 *   ScrollableTabRow (热门 | 最新 | 精品 | 自定义Tab...)
 *   HorizontalPager → ForumThreadListPage (per-tab FlatList)
 *   FAB (refresh/back_to_top/post)
 *
 * iOS 26+ design: hero spring animation, SF Symbols, glass cards, 120fps ProMotion.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Pressable, Text, Alert, Share,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withDelay,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker, Text as SWText, Menu, ConfirmationDialog, Button as SWButton } from '@expo/ui/swift-ui';
import { pickerStyle, tag, labelStyle, buttonStyle } from '@expo/ui/swift-ui/modifiers';
import BottomSheetComponent, { BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import { SymbolView } from '@/components/ui/SymbolView';
import * as Clipboard from 'expo-clipboard';
import { hapticForScene } from '@/theme/hapticsMap';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import ImageViewer from '@/components/ImageViewer';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { useThemeColors } from '@/theme/ThemeContext';
import { GlassView } from '@/components/ui/GlassView';
import { DURATION, EASE_OUT, HERO, MOMENTUM, PRESS_ENTER, Radius, Shadows, Spacing } from '@/theme';
import { typographyStyles } from '@/theme/typography';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { useImageViewer } from '@/hooks/useImageViewer';
import { usePagedList } from '@/hooks/usePagedList';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useForumStore } from '@/stores/forumStore';
import type { GoodClassifyItem } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { sign as signAPI, agree as apiAgree, generalTabList, mapProtoThread, checkReportPost } from '@/services/api/endpoints';
import { flattenStyle, getAvatarUrl, getLevelColor, buildThreadUrl } from '@/utils';
import { recordForumVisit } from '@/services/storage/visitHistory';
import { ForumSortType } from '@/types';
import type { ThreadInfo } from '@/types';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { SkeletonList } from '../../components/ui/Skeleton';
import TweetCard from '@/components/feed/TweetCard';
import { BlockManager } from '@/utils/BlockManager';

/** Tab segments for the SwiftUI segmented Picker (对齐 Kotlin: 热门 | 最新 | 精品) */
const TAB_SEGMENTS = [
  { label: '热门', value: '0' },
  { label: '最新', value: '1' },
  { label: '精品', value: '2' },
];

const EMPTY_TABS: any[] = [];

/** Cap the per-card stagger delay so long lists don't build up latency. */
const STAGGER_LIMIT = 10;

/**
 * First-render card entrance: fade + rise with a per-index delay
 * (DURATION.stagger). Runs once per mounted card. Pass animateEntry=false
 * (after the initial data render) so refreshes / tab switches skip it.
 */
const StaggeredCard = React.memo(function StaggeredCard({
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
  const translateY = useSharedValue(14);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!animateEntry || reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = Math.min(index, STAGGER_LIMIT - 1) * DURATION.stagger;
    opacity.value = withDelay(delay, withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }));
    translateY.value = withDelay(delay, withSpring(0, MOMENTUM));
  }, [animateEntry, reduceMotion, index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
});

// Hero entrance spring 直接复用 springs.ts 的 HERO token（damping:14/stiffness:140/mass:1）。

function parseGeneralThread(item: any, forumName: string, userList: any[]): ThreadInfo {
  return mapProtoThread(item, { userList, forumName });
}

export default function ForumPage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const router = useRouter();

  const currentForum = useForumStore((s) => s.currentForum);
  const isLoadingForums = useForumStore((s) => s.isLoadingForums);
  const forumSortType = useForumStore((s) => s.forumSortType);
  const latestThreads = useForumStore((s) => s.latestThreads);
  const goodThreads = useForumStore((s) => s.goodThreads);
  const newestThreads = useForumStore((s) => s.newestThreads);
  const latestPage = useForumStore((s) => s.latestPage);
  const goodPage = useForumStore((s) => s.goodPage);
  const newestPage = useForumStore((s) => s.newestPage);
  const latestHasMore = useForumStore((s) => s.latestHasMore);
  const goodHasMore = useForumStore((s) => s.goodHasMore);
  const newestHasMore = useForumStore((s) => s.newestHasMore);
  const currentTab = useForumStore((s) => s.currentTab);
  const setCurrentTab = useForumStore((s) => s.setCurrentTab);
  const goodClassify = useForumStore((s) => s.goodClassify);
  const goodClassifyId = useForumStore((s) => s.goodClassifyId);
  const navTabInfo = useForumStore((s) => s.navTabInfo);
  const setGoodClassifyId = useForumStore((s) => s.setGoodClassifyId);
  const loadForumData = useForumStore((s) => s.loadForumData);
  const followForum = useForumStore((s) => s.followForum);
  const unfollowForum = useForumStore((s) => s.unfollowForum);
  const markForumSigned = useForumStore((s) => s.markForumSigned);

  const incognitoMode = useAppPreference('incognitoMode', false);

  // 头部时间字段：热门(REPLY_TIME) 显示最后回复时间；最新(SEND_TIME) 显示发帖时间；
  // 精品按 forumSortType（默认排序偏好：按回复时间/按发贴时间）；自定义 Tab 兜底回复时间。
  const timeType: 'create' | 'last' = currentTab === 0
    ? 'last'
    : currentTab === 1
      ? 'create'
      : forumSortType === ForumSortType.SEND_TIME ? 'create' : 'last';

  const customTabs = useMemo(
    () => (Array.isArray(navTabInfo) ? navTabInfo : (navTabInfo as any)?.tab ?? EMPTY_TABS),
    [navTabInfo],
  );
  const allSegments = useMemo(
    () => [
      ...TAB_SEGMENTS,
      ...customTabs.map((tab: any, i: number) => ({
        label: tab.tabName || tab.name || `Tab ${i + 1}`,
        value: String(3 + i),
      })),
    ],
    [customTabs],
  );
  const customFetcher = useCallback(
    async (page: number, params: { tab: any; fid: string; forumName: string }, signal?: AbortSignal) => {
      if (!params.tab || !params.fid) return { items: [], hasMore: false };
      const data = await generalTabList(params.fid, {
        pn: page,
        rn: 30,
        // GeneralTabListRequestData 只有 tabId 字段（无 tabCode，旧代码被 protobuf 静默丢弃）
        tabId: Number(params.tab.tabId ?? 0),
        tabName: params.tab.tabName,
        tabType: params.tab.tabType,
        sortType: params.tab.sortType,
      }, signal);
      const rawThreads = data?.generalList ?? data?.general_list ?? data?.threadList ?? [];
      const userList = data?.userList ?? data?.user_list ?? [];
      const threads: ThreadInfo[] = rawThreads.map((item: any) =>
        parseGeneralThread(item, params.forumName, userList),
      );
      return {
        items: threads,
        hasMore: (data?.hasMore ?? data?.has_more ?? 0) === 1,
        nextPage: page + 1,
      };
    },
    [],
  );
  const customPaged = usePagedList<ThreadInfo, { tab: any; fid: string; forumName: string }>({
    fetcher: customFetcher,
    params: { tab: customTabs[currentTab - 3], fid: currentForum?.forumId ?? '', forumName: name },
    maxItems: 200,
  });
  const customPagedLoad = customPaged.load;
  const customPagedLoadMore = customPaged.loadMore;
  const customThreads = customPaged.items;
  const customPage = customPaged.page;
  const customHasMore = customPaged.hasMore;
  const loadingCustom = customPaged.loading;

  // Derive current tab's data — tab 2 = 精品 (good), tabs 0/1 = 热门/最新
  // （分桶缓存：最新 SEND_TIME 独立 newestThreads，切 tab 不再互相冲刷重拉）
  const isGoodTab = currentTab === 2;
  const isCustomTab = currentTab >= 3;
  const forumThreads = isCustomTab
    ? customThreads
    : isGoodTab
      ? goodThreads
      : currentTab === 1
        ? newestThreads
        : latestThreads;
  const forumPage = isCustomTab ? customPage : isGoodTab ? goodPage : currentTab === 1 ? newestPage : latestPage;
  const forumHasMore = isCustomTab ? customHasMore : isGoodTab ? goodHasMore : currentTab === 1 ? newestHasMore : latestHasMore;
  const { blockedWords, blockedUsers } = useBlockFilter();

  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // loadingMore 的同步镜像（见 handleLoadMore 注释）
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const forumFabFunction = useAppPreference('forumFabFunction', 'post');
  const [showClassifyPicker, setShowClassifyPicker] = useState(false);
  const [unfollowConfirmVisible, setUnfollowConfirmVisible] = useState(false);
  const fabScale = useSharedValue(1);

  const { reduceMotion } = useReducedMotion();

  const visibleThreads = useMemo(() => {
    if (blockedWords.length === 0 && blockedUsers.length === 0) return forumThreads;
    return forumThreads.filter((t) => {
      const text = `${t.title || ''} ${t.abstract || ''}`;
      if (BlockManager.shouldBlockContent(text, blockedWords)) return false;
      if (t.authorId && BlockManager.shouldBlockUser(t.authorId, t.authorName || null, blockedUsers)) return false;
      return true;
    });
  }, [forumThreads, blockedWords, blockedUsers]);

  // ── iOS 26+ Hero Entrance Animation (Reanimated 4) ──
  const heroAvatarScale = useSharedValue(0.92);
  const heroAvatarOpacity = useSharedValue(0);
  const heroContentOpacity = useSharedValue(0);
  const heroContentSlideY = useSharedValue(20);

  // ── List entrance + tab transition ──
  const listEntranceOpacity = useSharedValue(0);
  const listEntranceY = useSharedValue(16);
  const listOpacity = useSharedValue(1);
  const isFirstTabRender = useRef(true);
  // First data render has been staggered already — refresh/tab switches skip it.
  const hasStaggeredInitialRef = useRef(false);
  // Guards the initial load so a later currentForum (forumId/avatar) update
  // doesn't re-fire doLoad (P1 duplicate-request bug).
  const initialLoadKeyRef = useRef<string | null>(null);
  // 已加载过的 tab 集合（tab 分桶缓存标记；切吧/换排序时清空）
  const loadedTabRef = useRef<Set<number>>(new Set());

  // ── Reanimated animated styles ──
  const listAnimatedStyle = useAnimatedStyle(() => ({
    opacity: listEntranceOpacity.value * listOpacity.value,
    transform: [{ translateY: listEntranceY.value }],
  }));
  const heroAvatarStyle = useAnimatedStyle(() => ({
    opacity: heroAvatarOpacity.value,
    transform: [{ scale: heroAvatarScale.value }],
  }));
  const heroTextStyle = useAnimatedStyle(() => ({
    opacity: heroContentOpacity.value,
    transform: [{ translateY: heroContentSlideY.value }],
  }));
  const heroFollowStyle = useAnimatedStyle(() => ({
    opacity: heroContentOpacity.value,
    transform: [{ translateY: heroContentSlideY.value }],
  }));
  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  useEffect(() => {
    if (loaded && currentForum) {
      if (reduceMotion) {
        heroAvatarScale.value = 1;
        heroAvatarOpacity.value = 1;
        heroContentOpacity.value = 1;
        heroContentSlideY.value = 0;
        listEntranceOpacity.value = 1;
        listEntranceY.value = 0;
        return;
      }
      // Reanimated 4: springs/timings run on the UI thread; delays via withDelay.
      // 时长/延迟全部由 DURATION / HERO token 组合，禁止手写 magic number。
      heroAvatarScale.value = withSpring(1, HERO);
      heroAvatarOpacity.value = withTiming(1, { duration: DURATION.enter });
      heroContentOpacity.value = withDelay(DURATION.enter - DURATION.stagger * 2, withTiming(1, { duration: DURATION.enter }));
      heroContentSlideY.value = withDelay(DURATION.enter - DURATION.stagger * 2, withSpring(0, HERO));
      listEntranceOpacity.value = withDelay(DURATION.enter + DURATION.stagger, withTiming(1, { duration: DURATION.enter }));
      listEntranceY.value = withDelay(DURATION.enter + DURATION.stagger, withSpring(0, HERO));
    }
  }, [loaded, currentForum, reduceMotion, heroAvatarScale, heroAvatarOpacity, heroContentOpacity, heroContentSlideY, listEntranceOpacity, listEntranceY]);

  const flatListRef = useRef<any>(null);

  // ── Load forum data ──
  const doLoad = useCallback(async (p: number, isGood?: boolean) => {
    if (!name) return;
    try {
      const good = isGood ?? (currentTab === 2);
      // Tab 0 = 热门（固定按回复时间），Tab 1 = 最新（用用户选择的排序，
      // 对齐 Kotlin 最新 tab 的"按回复/按发帖"菜单），Tab 2 = 精品。
      const sort = good
        ? forumSortType
        : currentTab === 1
          ? forumSortType
          : ForumSortType.REPLY_TIME;
      await loadForumData(name, p, sort, good);
      setError(null);
      setLoaded(true);
    } catch (e: any) {
      if (p === 1) setError(e?.message || '加载失败');
    }
  }, [name, forumSortType, loadForumData, currentTab]);
  const doLoadRef = useRef(doLoad);
  useEffect(() => {
    doLoadRef.current = doLoad;
  }, [doLoad]);

  // ── 最新 tab 排序切换（对齐 Kotlin：按回复时间 / 按发帖时间）──
  const handleSortChange = useCallback((sort: ForumSortType) => {
    if (sort === forumSortType) return;
    hapticForScene('toggle');
    useForumStore.getState().setForumSortType(sort);
    // 清空当前列表并重新加载（setForumSortType 已清最新列表）
    doLoadRef.current(1, false);
  }, [forumSortType]);

  // Initial load — fire once per forum. Guarded by initialLoadKeyRef so the
  // store updating currentForum (forumId/avatar) after data arrives no longer
  // re-triggers doLoad (was firing the initial request twice).
  useEffect(() => {
    if (!name) return;
    if (initialLoadKeyRef.current !== name) {
      initialLoadKeyRef.current = name;
      doLoadRef.current(1);
    }
    if (!incognitoMode) {
      recordForumVisit({
        id: name,
        type: 'forum',
        forumId: currentForum?.forumId ?? '',
        forumName: name,
        avatar: currentForum?.avatar ?? '',
        title: `${name}吧`,
        timestamp: Date.now(),
      });
    }
  }, [name, incognitoMode, currentForum?.forumId, currentForum?.avatar]);

  // Mark the first data render as staggered (set after commit so the very
  // first render's cards still animate).
  useEffect(() => {
    if (loaded && forumThreads.length > 0) {
      hasStaggeredInitialRef.current = true;
    }
  }, [loaded, forumThreads.length]);

  // Re-load when tab changes (with fade transition)
  // 已加载过的 tab 不再重复请求（分桶缓存各自持有数据）；切换 forum /
  // 排序偏好变化时清空缓存标记。旧实现把 currentForum?.forumId 放进依赖，
  // forumId 异步回填（''→id）+ loaded 翻转会让同一 tab 连拉 2~3 次 page 1。
  useEffect(() => {
    loadedTabRef.current.clear();
  }, [name, forumSortType]);

  useEffect(() => {
    if (!name || !loaded) return;

    const firstDataRender = isFirstTabRender.current;
    isFirstTabRender.current = false;

    // Tab switch fade transition (skip first render)
    if (!firstDataRender && !reduceMotion) {
      listOpacity.value = withSequence(
        withTiming(0, { duration: DURATION.exit }),
        withTiming(1, { duration: DURATION.enter }),
      );
    }

    // First data arrival: doLoad already fetched the default tab — mark it.
    if (firstDataRender) {
      loadedTabRef.current.add(currentTab);
      return;
    }

    // Cached tab: data retained in its own bucket — no refetch.
    if (loadedTabRef.current.has(currentTab)) return;
    loadedTabRef.current.add(currentTab);

    if (currentTab === 0 || currentTab === 1) {
      // 热门 or 最新 — always reload with the correct sort type
      const sort = currentTab === 0 ? ForumSortType.REPLY_TIME : ForumSortType.SEND_TIME;
      loadForumData(name, 1, sort, false).catch(() => {});
    } else if (currentTab === 2) {
      // 精品 — only load if no data yet
      const hasGood = useForumStore.getState().goodThreads.length > 0;
      if (!hasGood) {
        loadForumData(name, 1, forumSortType, true).catch(() => {});
      }
    } else if (currentTab >= 3) {
      const tab = customTabs[currentTab - 3];
      if (tab) {
        customPagedLoad(1, { tab, fid: currentForum?.forumId ?? '', forumName: name });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentForum?.forumId 有意不进依赖：异步回填（''→id）会触发同 tab 重复拉取 page 1（本次修复的 P1 双重请求）。
  }, [currentTab, customTabs, customPagedLoad, name, loaded, forumSortType, listOpacity, reduceMotion, loadForumData]);

  // Re-load when good classify changes
  useEffect(() => {
    if (name && loaded && currentTab === 2 && goodClassifyId !== null) {
      doLoadRef.current(1, true);
    }
  }, [goodClassifyId, currentTab, loaded, name]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isCustomTab) {
      const tab = customTabs[currentTab - 3];
      if (tab) await customPagedLoad(1, { tab, fid: currentForum?.forumId ?? '', forumName: name });
    } else {
      await doLoad(1);
    }
    setRefreshing(false);
    hapticForScene('toggle');
  }, [isCustomTab, customTabs, currentTab, customPagedLoad, currentForum?.forumId, name, doLoad]);

  const handleLoadMore = useCallback(async () => {
    // 同步守卫：loadingMore 经 setState 异步生效，FlashList 同帧二次 onEndReached
    // 会拿旧闭包再跑一次 → 同一页重复追加（usePagedList 内已有同款守卫）。
    if (!forumHasMore || loadingMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      if (isCustomTab) {
        const tab = customTabs[currentTab - 3];
        if (tab) await customPagedLoadMore();
      } else {
        await doLoad(forumPage + 1);
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [forumHasMore, loadingMore, forumPage, isCustomTab, customTabs, currentTab, customPagedLoadMore, doLoad]);

  // ── Follow / Unfollow (with tbs — now fixed in forumStore) ──
  const handleToggleFollow = useCallback(async () => {
    if (!currentForum) return;
    hapticForScene('favorite');
    try {
      if (currentForum.isLike) await unfollowForum(currentForum.forumId, name);
      else await followForum(currentForum.forumId, name);
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '网络错误，请稍后重试');
    }
  }, [currentForum, name, followForum, unfollowForum]);

  // ── Sign (fixed: uses currentForum.tbs) ──
  const handleSign = useCallback(async () => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    if (!currentForum) return;
    if (currentForum.signInInfo?.isSignIn) {
      Alert.alert('提示', '今天已经签到过了');
      return;
    }
    hapticForScene('action-success');
    try {
      const tbs = currentForum.tbs || '';
      const result = await signAPI(name, tbs, currentForum.forumId);
      if (result.isSuccess) {
        markForumSigned(currentForum.forumId, result.exp ?? 0);
        Alert.alert('签到成功', `经验+${result.exp}`);
      } else if (result.errorCode === 1101) {
        // 1101 = 今天已签到（可能由后台自动签到/其他端先签）。与
        // runSignBatch / TiebaBackgroundSync 的语义一致：是成功状态，不是失败。
        markForumSigned(currentForum.forumId, result.exp ?? 0);
        Alert.alert('提示', '今天已签到');
      } else {
        Alert.alert('签到失败', result.errorMsg || '未知错误');
      }
    } catch { Alert.alert('签到失败', '网络错误'); }
  }, [isLoggedIn, name, currentForum, markForumSigned]);

  // ── Follow / Sign-in button handler (对齐 Kotlin ForumHeader onBtnClick) ──
  const handleFollowOrSign = useCallback(() => {
    if (!isLoggedIn) {
      Alert.alert('提示', '请先登录后再操作');
      return;
    }
    if (!currentForum) return;
    if (currentForum.isLike) {
      // Already followed → sign in (if not already signed)
      if (currentForum.signInInfo?.isSignIn) return;
      handleSign();
    } else {
      // Not followed → follow
      handleToggleFollow();
    }
  }, [isLoggedIn, currentForum, handleSign, handleToggleFollow]);

  // ── Tab switch via SwiftUI Picker ──
  const handleSegmentChange = useCallback((value: string) => {
    hapticForScene('toggle');
    const tab = parseInt(value, 10);
    if (!isNaN(tab)) setCurrentTab(tab);
  }, [setCurrentTab]);

  // ── Header right buttons ──
  const handleShareForum = useCallback(async () => {
    await Share.share({
      message: `${name}吧\nhttps://tieba.baidu.com/f?kw=${encodeURIComponent(name)}`,
    });
  }, [name]);

  const handleCopyForumLink = useCallback(async () => {
    await Clipboard.setStringAsync(`https://tieba.baidu.com/f?kw=${encodeURIComponent(name)}`);
    hapticForScene('action-success');
    Alert.alert('已复制', '吧链接已复制到剪贴板');
  }, [name]);

  const handleUnfollowConfirm = useCallback(async () => {
    if (!currentForum) return;
    hapticForScene('favorite');
    try {
      await unfollowForum(currentForum.forumId, name);
    } catch (e: any) {
      Alert.alert('取消失败', e?.message || '网络错误，请稍后重试');
    }
  }, [currentForum, name, unfollowForum]);

  const headerRight = useMemo(() => function HeaderRight() {
    return (
      <View style={styles.headerButtons}>
      {isLoggedIn && (
        <Pressable onPress={handleSign} style={styles.headerButton} hitSlop={8}>
          <SymbolView name="checkmark.seal" size={20} tintColor={colors.primary} />
        </Pressable>
      )}
      <Link href={`/forum/${encodeURIComponent(name)}/search?forumId=${currentForum?.forumId || ''}`} asChild>
        <Pressable style={styles.headerButton} hitSlop={8}>
          <SymbolView name="magnifyingglass" size={20} tintColor={colors.primary} />
        </Pressable>
      </Link>
      <ThemedHost matchContents style={{ alignSelf: 'center' }}>
        <Menu label="" systemImage="ellipsis" modifiers={[labelStyle('iconOnly'), buttonStyle('plain')]}>
          <SWButton label="分享" systemImage="square.and.arrow.up" onPress={handleShareForum} />
          <SWButton label="复制链接" systemImage="link" onPress={handleCopyForumLink} />
          {isLoggedIn && currentForum?.isLike && (
            <SWButton label="取消关注" systemImage="person.badge.minus" role="destructive" onPress={() => setUnfollowConfirmVisible(true)} />
          )}
        </Menu>
      </ThemedHost>
      </View>
    );
  }, [isLoggedIn, handleSign, name, currentForum?.forumId, currentForum?.isLike, colors.primary, handleShareForum, handleCopyForumLink]);

  // ── FAB ──
  const animateFab = useCallback(() => {
    // FAB press 反馈与卡片按压一致：PRESS_ENTER 弹簧（对齐 FeedCard/card press）
    fabScale.value = withSequence(
      withSpring(0.85, PRESS_ENTER),
      withSpring(1, PRESS_ENTER),
    );
  }, [fabScale]);

  const handleFabPress = useCallback(() => {
    hapticForScene('press');
    animateFab();
    switch (forumFabFunction) {
      case 'back_to_top':
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        break;
      case 'hide':
        setFabVisible((v) => !v);
        break;
      case 'refresh':
      default:
        handleRefresh();
        break;
    }
  }, [forumFabFunction, handleRefresh, animateFab]);

  const imageViewer = useImageViewer();

  // Forum hero avatar -> full-size preview (does not navigate to forum detail).
  const avatar = currentForum?.avatar;
  const handleAvatarPreview = useCallback((event: any) => {
    event.stopPropagation?.();
    if (!avatar) return;
    hapticForScene('press');
    imageViewer.handleImagePress([getAvatarUrl(avatar)], 0);
  }, [avatar, imageViewer]);

  const handleCardLike = useCallback(async (item: ThreadInfo) => {
    if (!isLoggedIn) { Alert.alert('提示', '请先登录'); return; }
    try {
      await apiAgree(item.id, item.id, item.hasAgree ? 0 : 1);
      const patch = (list: ThreadInfo[]) => list.map((t) =>
        t.id === item.id
          ? {
              ...t,
              hasAgree: !t.hasAgree,
              zanNum: Math.max(0, (t.zanNum || 0) + (t.hasAgree ? -1 : 1)),
            }
          : t,
      );
      // 热门/最新两个桶都可能持有该帖（当前 tab 只显示其一），一起 patch
      const state = useForumStore.getState();
      useForumStore.setState({
        goodThreads: state.currentTab === 2 ? patch(state.goodThreads) : state.goodThreads,
        latestThreads: patch(state.latestThreads),
        newestThreads: patch(state.newestThreads),
      });
    } catch {
      Alert.alert('错误', '点赞失败');
    }
  }, [isLoggedIn]);

  const handleCardShare = useCallback(async (item: ThreadInfo) => {
    hapticForScene('press');
    try {
      const url = buildThreadUrl(item.id);
      await Share.share({ message: url, url }, { dialogTitle: '分享帖子' });
    } catch {}
  }, []);

  // ── 信息流小 × / 菜单：屏蔽作者 + 举报 ──
  const handleFeedBlockAuthor = useCallback(async (item: ThreadInfo) => {
    const authorId = item.authorId;
    if (!authorId) return;
    try {
      await BlockManager.addBlockedUser({
        id: Date.now().toString(),
        uid: authorId,
        username: item.authorNameShow || item.authorName || undefined,
      });
      hapticForScene('action-success');
      // 从当前所有分桶移除该作者的帖子（热门/最新/精品都可能在展示
      // 相应 tab 时各有副本；useBlockFilter 只影响未来渲染，这里即时移除）
      const st = useForumStore.getState();
      const rm = (list: ThreadInfo[]) => list.filter((t) => t.authorId !== authorId);
      useForumStore.setState({
        latestThreads: rm(st.latestThreads),
        newestThreads: rm(st.newestThreads),
        goodThreads: rm(st.goodThreads),
      });
    } catch {
      hapticForScene('action-fail');
    }
  }, []);

  const handleFeedReport = useCallback(async (item: ThreadInfo) => {
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
  }, [router]);

  const handleForumMenuAction = useCallback((action: string, item: ThreadInfo) => {
    if (action === 'block') void handleFeedBlockAuthor(item);
    else if (action === 'report') void handleFeedReport(item);
  }, [handleFeedBlockAuthor, handleFeedReport]);

  const renderItem = useCallback(({ item, index }: { item: ThreadInfo; index: number }) => {
    // 统一卡片：单列 TweetCard，与动态页信息流同款样式
    return (
      <StaggeredCard index={index} animateEntry={!hasStaggeredInitialRef.current}>
        <TweetCard
          thread={item}
          timeType={timeType}
          onMenuAction={handleForumMenuAction}
          onImagePress={imageViewer.handleImagePress}
          onLike={handleCardLike}
          onShare={handleCardShare}
        />
      </StaggeredCard>
    );
  }, [timeType, handleCardLike, handleCardShare, imageViewer.handleImagePress, handleForumMenuAction]);

  // ── Follow button label ──
  const followBtnLabel = !isLoggedIn
    ? '关注'
    : !currentForum?.isLike
      ? '关注'
      : currentForum?.signInInfo?.isSignIn
        ? `已签到${currentForum.signInInfo.contSignNum > 0 ? ` ${currentForum.signInInfo.contSignNum}天` : ''}`
        : '签到';

  const followBtnActive = isLoggedIn && currentForum?.isLike;

  // ── Good classify selected label ──
  const selectedClassifyLabel = goodClassifyId
    ? goodClassify.find((c) => c.classId === goodClassifyId)?.className
    : undefined;

  const threadKeyExtractor = useCallback((item: ThreadInfo) => item.id, []);
  const getItemType = useCallback(
    (item: ThreadInfo) =>
      item.mediaList && item.mediaList.length > 0 ? 'tweet-media' : 'tweet-text',
    [],
  );
  const listHeader = useCallback(
    () => (
      <View style={styles.headerSection}>
        {/* ── Forum Info Card (对齐 Kotlin ForumHeader) ── */}
        <View style={[styles.forumCard, {
          backgroundColor: colors.card,
          ...Shadows.card,
        }]}>
          <View style={styles.forumInfoRow}>
            {/* Hero Avatar + Name (tappable → 吧详情) */}
            <Pressable
              style={styles.forumInfoPressable}
              onPress={() =>
                router.push(
                  `/forum/${encodeURIComponent(name)}/detail?forumId=${currentForum?.forumId || ''}`,
                )
              }
            >
              {/* Hero Avatar */}
              <Animated.View style={heroAvatarStyle}>
                <Avatar
                  source={currentForum?.avatar || undefined}
                  initials={(currentForum?.forumName || name)?.charAt(0)}
                  size={72}
                  onPress={handleAvatarPreview}
                />
              </Animated.View>
              <Animated.View style={[styles.forumTextCol, heroTextStyle]}>
                <Text style={[styles.forumTitle, { color: colors.text }]}>{name}吧</Text>
                {/* Level info below name (Kotlin: only when followed) */}
                {isLoggedIn && currentForum?.isLike && currentForum.levelId != null && currentForum.levelId > 0 && (
                  <View style={styles.forumLevelRow}>
                    <View style={[styles.levelBadgeSmall, { backgroundColor: getLevelColor(currentForum.levelId) }]}>
                      <Text style={styles.levelBadgeSmallText}>Lv.{currentForum.levelId}</Text>
                    </View>
                    {currentForum.levelName ? (
                      <Text style={[styles.forumLevelName, { color: colors.textTertiary }]}>
                        {currentForum.levelName}
                      </Text>
                    ) : null}
                  </View>
                )}
              </Animated.View>
            </Pressable>
            {/* Follow / Sign-in button */}
            {/* BUGFIX (T1): was translateX fed with the slide-Y value — the button
                slid in from the right instead of rising with the hero content. */}
            <Animated.View style={heroFollowStyle}>
              <Pressable
                onPress={handleFollowOrSign}
                style={({ pressed }) => [
                  styles.followBtn,
                  {
                    backgroundColor: followBtnActive
                      ? (currentForum?.signInInfo?.isSignIn ? colors.surfaceSecondary : colors.primary)
                      : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.followBtnText, {
                  color: followBtnActive && currentForum?.signInInfo?.isSignIn
                    ? colors.text
                    : colors.textOnPrimary,
                }]}>
                  {followBtnLabel}
                </Text>
              </Pressable>
            </Animated.View>
          </View>

          {/* Level progress bar (Kotlin: only visible when is_like==1 / followed) */}
          {isLoggedIn && currentForum?.isLike && currentForum?.levelId != null && currentForum.levelId > 0 && (
            <View style={styles.levelSection}>
              <View style={[styles.levelTrack, { backgroundColor: colors.surfaceSecondary }]}>
                <View
                  style={[
                    styles.levelFill,
                    {
                      width: `${currentForum?.levelupScore && currentForum.levelupScore > 0
                        ? Math.min(((currentForum.curScore ?? 0) / currentForum.levelupScore) * 100, 100)
                        : 0}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        {/* ── Tab Bar — SwiftUI Segmented Picker (对齐 Kotlin ScrollableTabRow) ── */}
        <ThemedHost style={styles.segmentedHost}>
          <Picker
            selection={String(currentTab)}
            onSelectionChange={handleSegmentChange as any}
            modifiers={[pickerStyle('segmented')]}
          >
            {allSegments.map((s) => (
              <SWText key={s.value} modifiers={[tag(s.value)]}>{s.label}</SWText>
            ))}
          </Picker>
        </ThemedHost>

        {/* 最新 tab 排序切换（原生 ActionSheet，与三点菜单同理——
            SwiftUI Menu 嵌 RN 树在 iOS 26 上点击无响应） */}
        {currentTab === 1 && (
          <View style={styles.sortRow}>
            <Pressable
              style={styles.sortBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="帖子排序方式"
              onPress={() => {
                hapticForScene('press');
                Alert.alert('帖子排序', undefined, [
                  { text: '按回复时间', onPress: () => handleSortChange(ForumSortType.REPLY_TIME) },
                  { text: '按发帖时间', onPress: () => handleSortChange(ForumSortType.SEND_TIME) },
                  { text: '取消', style: 'cancel' as const },
                ]);
              }}
            >
              <SymbolView name="arrow.up.arrow.down" size={14} weight="semibold" tintColor={colors.primary} />
              <Text style={[styles.sortBtnText, { color: colors.primary }]}>
                {forumSortType === ForumSortType.SEND_TIME ? '按发帖时间' : '按回复时间'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Good classify indicator + filter button */}
        {currentTab === 2 && (
          <View style={styles.classifyRow}>
            {selectedClassifyLabel ? (
              <View style={styles.classifyIndicator}>
                <Text style={[styles.classifyIndicatorText, { color: colors.primary }]}>
                  {selectedClassifyLabel}
                </Text>
                <Pressable onPress={() => setGoodClassifyId(null)} hitSlop={8}>
                  <SymbolView name="xmark" size={12} weight="semibold" tintColor={colors.primary} />
                </Pressable>
              </View>
            ) : null}
            {goodClassify.length > 0 && (
              <Pressable
                onPress={() => {
                  hapticForScene('press');
                  setShowClassifyPicker(true);
                }}
                style={styles.classifyFilterBtn}
                hitSlop={8}
              >
                <SymbolView name="line.3.horizontal.decrease.circle" size={18} tintColor={colors.primary} />
                <Text style={[styles.classifyFilterText, { color: colors.primary }]}>分类</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    ),
    [
      allSegments,
      colors,
      currentForum,
      currentTab,
      followBtnActive,
      followBtnLabel,
      goodClassify,
      handleAvatarPreview,
      handleFollowOrSign,
      handleSegmentChange,
      heroAvatarStyle,
      heroFollowStyle,
      heroTextStyle,
      isLoggedIn,
      name,
      router,
      selectedClassifyLabel,
      setGoodClassifyId,
      setShowClassifyPicker,
      forumSortType,
      handleSortChange,
    ],
  );
  const listEmpty = useCallback(
    () =>
      loaded && visibleThreads.length === 0 ? (
        <EmptyState title="暂无帖子" description="这个吧还没有帖子" icon="tray" />
      ) : null,
    [loaded, visibleThreads.length],
  );
  const listFooter = useCallback(
    () => (
      <LoadMoreFooter
        hasMore={forumHasMore}
        loading={loadingMore}
        colors={colors}
        onLoadMore={handleLoadMore}
      />
    ),
    [forumHasMore, loadingMore, colors, handleLoadMore],
  );

  // ── Loading state ──
  if ((isLoadingForums || (loadingCustom && isCustomTab)) && forumThreads.length === 0 && !loaded) {
    return (
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: `${name}吧`, headerRight }} />
        <SkeletonList count={6} variant="row" />
      </View>
    );
  }

  // ── Error state ──
  if (error && forumThreads.length === 0) {
    return (
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: `${name}吧`, headerRight }} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </View>
    );
  }

  return (
    <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
      <Stack.Screen
        options={{
          title: `${name}吧`,
          headerLargeTitle: false,
          headerRight,
        }}
      />

      <Animated.View style={[{ flex: 1 }, listAnimatedStyle]}>
      <FlashList
        key="forum-list"
        ref={flatListRef}
        data={visibleThreads}
        keyExtractor={threadKeyExtractor}
        getItemType={getItemType}
        maintainVisibleContentPosition={{ autoscrollToTopThreshold: 100 }}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListFooterComponent={listFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        drawDistance={300}
        maxItemsInRecyclePool={24}
        decelerationRate="normal"
      />
      </Animated.View>

      {/* ── FAB（iOS 26 液态玻璃 + 系统图标着色） ── */}
      {fabVisible && (
      <Animated.View style={[styles.fabContainer, { bottom: insets.bottom + Spacing.md }, fabAnimatedStyle]}>
        <GlassView
          borderRadius={Radius.capsule}
          glassEffectStyle="clear"
          tintColor={isDark ? 'rgba(28,28,30,0.18)' : 'rgba(255,255,255,0.18)'}
          style={styles.fab}
        >
          <Pressable
            onPress={handleFabPress}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.9 : 1 }],
            })}
            accessibilityRole="button"
            accessibilityLabel={forumFabFunction === 'back_to_top' ? '回到顶部' : forumFabFunction === 'hide' ? '隐藏悬浮按钮' : '刷新'}
          >
            <SymbolView
              name={
                forumFabFunction === 'back_to_top'
                  ? 'arrow.up'
                  : forumFabFunction === 'hide'
                    ? 'eye.slash'
                    : 'arrow.clockwise'
              }
              size={22}
              tintColor={colors.text}
              weight="semibold"
            />
          </Pressable>
        </GlassView>
      </Animated.View>
      )}

      {/* ── Image Viewer ── */}
      <ImageViewer
        images={imageViewer.imageViewerImages}
        initialIndex={imageViewer.imageViewerIndex}
        visible={imageViewer.imageViewerVisible}
        onClose={imageViewer.closeImageViewer}
      />

      {/* ── Good Classify Picker Modal (native bottom sheet) ── */}
      <ClassifyPickerSheet
        visible={showClassifyPicker}
        onClose={() => setShowClassifyPicker(false)}
        goodClassify={goodClassify}
        goodClassifyId={goodClassifyId}
        setGoodClassifyId={setGoodClassifyId}
        colors={colors}
      />

      {/* ── Unfollow ConfirmationDialog (SwiftUI) ── */}
      <ThemedHost matchContents style={{ position: 'absolute', width: 0, height: 0 }}>
        <ConfirmationDialog
          title="取消关注"
          isPresented={unfollowConfirmVisible}
          onIsPresentedChange={setUnfollowConfirmVisible}
          titleVisibility="visible"
        >
          <ConfirmationDialog.Actions>
            <SWButton label="确定" role="destructive" onPress={() => { handleUnfollowConfirm(); setUnfollowConfirmVisible(false); }} />
            <SWButton label="取消" role="cancel" />
          </ConfirmationDialog.Actions>
          <ConfirmationDialog.Message><SWText>{`确定要取消关注${name}吧吗？`}</SWText></ConfirmationDialog.Message>
        </ConfirmationDialog>
      </ThemedHost>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

// ── 精品分类选择（原生 bottom sheet） ──
const ClassifyPickerSheet = React.memo(function ClassifyPickerSheet({
  visible,
  onClose,
  goodClassify,
  goodClassifyId,
  setGoodClassifyId,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  goodClassify: GoodClassifyItem[];
  goodClassifyId: string | null;
  setGoodClassifyId: (id: string | null) => void;
  colors: any;
}) {
  const handleSelect = useCallback(
    (classId: string | null) => {
      hapticForScene('toggle');
      setGoodClassifyId(classId);
      onClose();
    },
    [setGoodClassifyId, onClose],
  );

  return (
    <BottomSheetComponent
      index={visible ? 0 : -1}
      snapPoints={['40%']}
      enablePanDownToClose
      onClose={onClose}
    >
      <BottomSheetScrollView
        style={styles.classifySheetScroll}
        contentContainerStyle={styles.classifySheetContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={[styles.menuTitle, { color: colors.textSecondary }]}>选择分类</Text>
        <Pressable
          style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => handleSelect(null)}
          accessibilityRole="button"
          accessibilityLabel="全部"
        >
          <Text style={[styles.menuItemText, { color: colors.text }]}>全部</Text>
          <View style={{ flex: 1 }} />
          {goodClassifyId === null && (
            <SymbolView name="checkmark" size={16} weight="semibold" tintColor={colors.primary} />
          )}
        </Pressable>
        {goodClassify.map((c) => {
          const selected = goodClassifyId === c.classId;
          return (
            <Pressable
              key={c.classId}
              style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => handleSelect(c.classId)}
              accessibilityRole="button"
              accessibilityLabel={c.className}
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>{c.className}</Text>
              <View style={{ flex: 1 }} />
              {selected && (
                <SymbolView name="checkmark" size={16} weight="semibold" tintColor={colors.primary} />
              )}
            </Pressable>
          );
        })}
        <Pressable
          style={({ pressed }) => [
            styles.menuCancelItem,
            styles.menuCancelPadding,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="取消"
        >
          <Text style={[styles.menuCancelText, { color: colors.textSecondary }]}>取消</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetComponent>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingTop: Spacing.xs },

  // ── Header section ──
  headerSection: { paddingTop: Spacing.sm },
  forumCard: {
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  forumInfoRow: { flexDirection: 'row', alignItems: 'center' },
  forumInfoPressable: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  forumTextCol: { flex: 1, marginLeft: Spacing.lg },
  forumTitle: { fontSize: 20, fontWeight: '700', letterSpacing: 0, marginBottom: Spacing.xs },
  forumLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  levelBadgeSmall: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  levelBadgeSmallText: { color: '#FFF', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  forumLevelName: { fontSize: 12, fontWeight: '500' },
  followBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    borderRadius: Radius.capsule,
  },
  followBtnText: { fontSize: 14, fontWeight: '700' },

  // ── Level progress ──
  levelSection: { marginTop: 14 },
  levelTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  levelFill: { height: 4, borderRadius: 2 },

  // ── Segmented Picker (SwiftUI) ──
  segmentedHost: {
    height: 36,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // ── 最新 tab 排序切换行 ──
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 10,
    borderRadius: Radius.chip,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600' },

  // ── Good classify row ──
  classifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  classifyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chip,
  },
  classifyIndicatorText: { ...typographyStyles.footnoteBold },
  classifyFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  classifyFilterText: { fontSize: 13, fontWeight: '500' },

  fabContainer: { position: 'absolute', right: Spacing.xl, zIndex: 100 },
  fab: {
    width: 52, height: 52, borderRadius: Radius.capsule,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Header buttons ──
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerButton: { padding: Spacing.sm },

  // ── Good classify picker (native bottom sheet) ──
  classifySheetScroll: {
    flex: 1,
  },
  classifySheetContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 24,
  },
  menuTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: Spacing.xl, paddingVertical: 14 },
  menuItemText: { ...typographyStyles.callout },
  menuCancelItem: {
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.xs,
  },
  menuCancelPadding: {
    paddingVertical: 14,
  },
  menuCancelText: { ...typographyStyles.calloutBold },
});
