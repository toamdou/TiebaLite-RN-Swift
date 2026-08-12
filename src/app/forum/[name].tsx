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
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker, Text as SWText, Host, Menu, ConfirmationDialog, Button as SWButton } from '@expo/ui/swift-ui';
import { pickerStyle, tag, labelStyle, buttonStyle } from '@expo/ui/swift-ui/modifiers';
import BottomSheetComponent, { BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import type { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { SymbolView } from '@/components/ui/SymbolView';
import * as Clipboard from 'expo-clipboard';
import { hapticImpact, hapticNotify, hapticSelection, ImpactFeedbackStyle, NotificationFeedbackType } from '@/utils/haptics';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import ImageViewer from '@/components/ImageViewer';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { useThemeColors } from '@/theme/ThemeContext';
import { DURATION, EASE_OUT, MOMENTUM, PRESS_ENTER, Radius, Shadows } from '@/theme';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { useImageViewer } from '@/hooks/useImageViewer';
import { usePagedList } from '@/hooks/usePagedList';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useForumStore } from '@/stores/forumStore';
import type { GoodClassifyItem } from '@/stores/forumStore';
import { useAuthStore } from '@/stores/authStore';
import { sign as signAPI, agree as apiAgree, generalTabList, mapProtoThread } from '@/services/api/endpoints';
import { flattenStyle, relativeTime, formatCount, getAvatarUrl, getLevelColor, buildThreadUrl } from '@/utils';
import { recordForumVisit } from '@/services/storage/visitHistory';
import { ForumSortType } from '@/types';
import type { ThreadInfo } from '@/types';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { SkeletonList } from '../../components/ui/Skeleton';
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

/** Hero entrance spring (≈ RN Animated friction 12 / tension 120) */
const HERO_SPRING = { damping: 14, stiffness: 140, mass: 1 } as const;

function parseGeneralThread(item: any, forumName: string, userList: any[]): ThreadInfo {
  return mapProtoThread(item, { userList, forumName });
}

export default function ForumPage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const router = useRouter();

  const currentForum = useForumStore((s) => s.currentForum);
  const isLoadingForums = useForumStore((s) => s.isLoadingForums);
  const forumSortType = useForumStore((s) => s.forumSortType);
  const latestThreads = useForumStore((s) => s.latestThreads);
  const goodThreads = useForumStore((s) => s.goodThreads);
  const latestPage = useForumStore((s) => s.latestPage);
  const goodPage = useForumStore((s) => s.goodPage);
  const latestHasMore = useForumStore((s) => s.latestHasMore);
  const goodHasMore = useForumStore((s) => s.goodHasMore);
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
  const forumSingleColumn = useAppPreference('forumSingleColumn', false);
  const numColumns = forumSingleColumn ? 1 : 2;

  const customTabs = useMemo(
    () => (Array.isArray(navTabInfo) ? navTabInfo : EMPTY_TABS),
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
        tabCode: params.tab.tabCode,
        tabName: params.tab.tabName,
        tabType: params.tab.tabType,
        sortType: params.tab.sortType,
      }, signal);
      const rawThreads = data?.threadList ?? data?.thread_list ?? [];
      const userList = data?.userList ?? data?.user_list ?? [];
      const threads: ThreadInfo[] = rawThreads.map((item: any) =>
        parseGeneralThread(item, params.forumName, userList),
      );
      return {
        items: threads,
        hasMore: (data?.page?.hasMore ?? data?.page?.has_more ?? 0) === 1,
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

  // Derive current tab's data — tab 2 = 精品 (good), tabs 0/1 = latest with different sort
  const isGoodTab = currentTab === 2;
  const isCustomTab = currentTab >= 3;
  const forumThreads = isCustomTab ? customThreads : isGoodTab ? goodThreads : latestThreads;
  const forumPage = isCustomTab ? customPage : isGoodTab ? goodPage : latestPage;
  const forumHasMore = isCustomTab ? customHasMore : isGoodTab ? goodHasMore : latestHasMore;
  const { blockedWords, blockedUsers } = useBlockFilter();

  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
      // Reanimated 4: springs/timings run on the UI thread; delays via withDelay
      heroAvatarScale.value = withSpring(1, HERO_SPRING);
      heroAvatarOpacity.value = withTiming(1, { duration: 250 });
      heroContentOpacity.value = withDelay(150, withTiming(1, { duration: 300 }));
      heroContentSlideY.value = withDelay(150, withSpring(0, HERO_SPRING));
      listEntranceOpacity.value = withDelay(250, withTiming(1, { duration: 300 }));
      listEntranceY.value = withDelay(250, withSpring(0, HERO_SPRING));
    }
  }, [loaded, currentForum, reduceMotion, heroAvatarScale, heroAvatarOpacity, heroContentOpacity, heroContentSlideY, listEntranceOpacity, listEntranceY]);

  const flatListRef = useRef<any>(null);

  // ── Load forum data ──
  const doLoad = useCallback(async (p: number, isGood?: boolean) => {
    if (!name) return;
    try {
      const good = isGood ?? (currentTab === 2);
      // Tab 0 = 热门 (REPLY_TIME), Tab 1 = 最新 (SEND_TIME), Tab 2 = 精品
      const sort = good
        ? forumSortType
        : currentTab === 1
          ? ForumSortType.SEND_TIME
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
  useEffect(() => {
    if (!name || !loaded) return;

    const firstDataRender = isFirstTabRender.current;
    isFirstTabRender.current = false;

    // Tab switch fade transition (skip first render)
    if (!firstDataRender && !reduceMotion) {
      listOpacity.value = withSequence(
        withTiming(0, { duration: 100 }),
        withTiming(1, { duration: 200 }),
      );
    }

    // First data arrival: doLoad already fetched the default tab (0/1) and
    // 精品 (tab 2) — skip the duplicate initial fetch (P1).
    if (firstDataRender && (currentTab === 0 || currentTab === 1 || currentTab === 2)) {
      return;
    }

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
  }, [currentTab, customTabs, customPagedLoad, currentForum?.forumId, name, loaded, forumSortType, listOpacity, reduceMotion, loadForumData]);

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
  }, [isCustomTab, customTabs, currentTab, customPagedLoad, currentForum?.forumId, name, doLoad]);

  const handleLoadMore = useCallback(async () => {
    if (!forumHasMore || loadingMore) return;
    setLoadingMore(true);
    if (isCustomTab) {
      const tab = customTabs[currentTab - 3];
      if (tab) await customPagedLoadMore();
    } else {
      await doLoad(forumPage + 1);
    }
    setLoadingMore(false);
  }, [forumHasMore, loadingMore, forumPage, isCustomTab, customTabs, currentTab, customPagedLoadMore, doLoad]);

  // ── Follow / Unfollow (with tbs — now fixed in forumStore) ──
  const handleToggleFollow = useCallback(async () => {
    if (!currentForum) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
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
    hapticImpact(ImpactFeedbackStyle.Medium);
    try {
      const tbs = currentForum.tbs || '';
      const result = await signAPI(name, tbs, currentForum.forumId);
      if (result.isSuccess) {
        markForumSigned(currentForum.forumId, result.exp ?? 0);
        Alert.alert('签到成功', `经验+${result.exp}`);
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
    hapticSelection();
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
    hapticNotify(NotificationFeedbackType.Success);
    Alert.alert('已复制', '吧链接已复制到剪贴板');
  }, [name]);

  const handleUnfollowConfirm = useCallback(async () => {
    if (!currentForum) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
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
    fabScale.value = withSequence(
      withTiming(0.85, { duration: 80 }),
      withTiming(1, { duration: 120 }),
    );
  }, [fabScale]);

  const handleFabPress = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Light);
    animateFab();
    // 'post' (发帖) was removed together with the /compose feature — the FAB
    // now falls back to refresh for that preference.
    switch (forumFabFunction) {
      case 'back_to_top':
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        break;
      case 'hide':
        setFabVisible((v) => !v);
        break;
      case 'post':
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
    hapticImpact(ImpactFeedbackStyle.Light);
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
      const state = useForumStore.getState();
      if (useForumStore.getState().currentTab === 2) {
        useForumStore.setState({ goodThreads: patch(state.goodThreads) });
      } else {
        useForumStore.setState({ latestThreads: patch(state.latestThreads) });
      }
    } catch {
      Alert.alert('错误', '点赞失败');
    }
  }, [isLoggedIn]);

  const renderItem = useCallback(({ item, index }: { item: ThreadInfo; index: number }) => (
    <StaggeredCard index={index} animateEntry={!hasStaggeredInitialRef.current}>
      <View style={[styles.cardOuter, numColumns === 2 && styles.cardOuterGrid]}>
        <ForumThreadCard
          item={item}
          colors={colors}
          onImagePress={imageViewer.handleImagePress}
          onLike={handleCardLike}
        />
      </View>
    </StaggeredCard>
  ), [colors, handleCardLike, imageViewer.handleImagePress, numColumns]);

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
                    : '#FFFFFF',
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
                  hapticImpact(ImpactFeedbackStyle.Light);
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
    ],
  );
  const listEmpty = useCallback(
    () =>
      loaded && visibleThreads.length === 0 ? (
        <EmptyState title="暂无帖子" subtitle="这个吧还没有帖子" icon="tray" />
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
        <SkeletonList count={6} variant={numColumns === 2 ? 'card' : 'thread'} />
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
        key={`forum-list-${numColumns}`}
        ref={flatListRef}
        data={visibleThreads}
        keyExtractor={threadKeyExtractor}
        numColumns={numColumns}
        estimatedItemSize={numColumns === 2 ? 290 : 160}
        maintainVisibleContentPosition={{ autoscrollToTopThreshold: 100, minIndexForVisible: 0 }}
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

      {/* ── FAB ── */}
      {fabVisible && (
      <Animated.View style={[styles.fabContainer, fabAnimatedStyle]}>
        <Pressable
          onPress={handleFabPress}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.93 : 1 }],
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 8,
            },
          ]}
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
            tintColor="#FFFFFF"
            weight="semibold"
          />
        </Pressable>
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
      <Host matchContents style={{ position: 'absolute', width: 0, height: 0 }}>
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
      </Host>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Forum Thread Card
// 有图：Hero 大图 + 底部渐变遮罩 + 白色文字叠加
// ────────────────────────────────────────────────────────────
// Card shadows use the shared Shadows.card token from @/theme.
// ────────────────────────────────────────────────────────────
// ForumThreadCard — 统一双层卡片结构 (iOS 26+ HeroUI)
//   外层 cardWrapper: borderRadius + shadow (not clipped by overflow:hidden)
//   内层 cardInner:   borderRadius + overflow:hidden + backgroundColor
//   有图 → heroContent (full-bleed image + gradient overlay)
//   无图 → textContent (author + title + abstract + action bar)
// ────────────────────────────────────────────────────────────

const ForumThreadCard = React.memo(function ForumThreadCard({
  item, colors, onLike,
}: {
  item: ThreadInfo; colors: any;
  onImagePress: (images: string[], index: number) => void;
  onLike?: (item: ThreadInfo) => void;
}) {
  const hideMedia = useAppPreference('hideMedia');
  const hasMedia = item.mediaList && item.mediaList.length > 0;
  const mediaCount = item.mediaList?.length ?? 0;
  const mediaHidden = hideMedia === true;
  const showHero = !!hasMedia && !mediaHidden;

  const handleShare = useCallback(async () => {
    hapticImpact(ImpactFeedbackStyle.Light);
    try {
      const url = buildThreadUrl(item.id);
      await Share.share({ message: url, url }, { dialogTitle: '分享帖子' });
    } catch {}
  }, [item.id]);

  // Press feedback: scale + fade driven by the PRESS_ENTER spring (replaces
  // the previous static opacity-only press style).
  const pressScale = useSharedValue(1);
  const pressOpacity = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    opacity: pressOpacity.value,
    transform: [{ scale: pressScale.value }],
  }));
  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(0.97, PRESS_ENTER);
    pressOpacity.value = withTiming(0.88, { duration: DURATION.exit });
  }, [pressScale, pressOpacity]);
  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, PRESS_ENTER);
    pressOpacity.value = withTiming(1, { duration: DURATION.enter });
  }, [pressScale, pressOpacity]);

  return (
    <Link href={{ pathname: '/thread/[id]', params: { id: item.id } }} push asChild>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.cardWrapper, pressStyle]}>
        <View style={[styles.cardInner, { backgroundColor: colors.card }]}>
          {showHero ? (
            /* == 有图：全幅图片 + 底部渐变遮罩 + 白色文字叠加 == */
            <View style={styles.heroContent}>
              <Image
                source={{ uri: item.mediaList![0].src }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                recyclingKey={item.mediaList![0].src}
              />

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)']}
                locations={[0, 1]}
                style={styles.heroGradient}
              />

              {item.isVideo && (
                <View style={styles.heroVideoBadge}>
                  <SymbolView name="play.fill" size={14} tintColor="#FFFFFF" />
                </View>
              )}

              <View style={styles.heroOverlayText}>
                {item.title ? (
                  <Text style={styles.heroOverlayTitle} numberOfLines={2}>
                    {item.isTop && <Text style={{ color: '#FFD60A', fontWeight: '700' }}>置顶 </Text>}
                    {item.isGood && <Text style={{ color: '#FFD60A', fontWeight: '700' }}>精品 </Text>}
                    {item.title}
                  </Text>
                ) : null}
                <Text style={styles.heroOverlayMeta} numberOfLines={1}>
                  {item.authorNameShow || item.authorName}
                  {'  ·  '}
                  {formatCount(item.replyNum)}回复
                  {mediaCount > 1 ? `  ·  ${mediaCount}图` : ''}
                </Text>
              </View>
            </View>
          ) : (
            /* == 无图：作者 + 标题 + 摘要 + 操作栏 == */
            <View style={styles.textContent}>
              {/* -- Author Header Row -- */}
              <View style={styles.cardAuthorRow}>
                <Avatar
                  source={item.authorPortrait || undefined}
                  initials={(item.authorNameShow || item.authorName)?.charAt(0)}
                  size={36}
                />
                <View style={styles.cardAuthorInfo}>
                  <View style={styles.cardAuthorNameRow}>
                    <Text style={[styles.cardAuthorName, { color: colors.text }]} numberOfLines={1}>
                      {item.authorNameShow || item.authorName}
                    </Text>
                    {item.authorLevelId > 0 && (
                      <View style={[styles.cardLevelBadge, { backgroundColor: getLevelColor(item.authorLevelId) }]}>
                        <Text style={styles.cardLevelBadgeText}>Lv.{item.authorLevelId}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardTime, { color: colors.textTertiary }]}>
                    {relativeTime(item.lastTime)}
                  </Text>
                </View>
              </View>

              {/* -- Title -- */}
              {item.title ? (
                <Text style={[styles.threadTitle, { color: colors.text }]} numberOfLines={2}>
                  {item.isTop && <Text style={{ color: colors.error, fontWeight: '700' }}>置顶 </Text>}
                  {item.isGood && <Text style={{ color: colors.warning, fontWeight: '700' }}>精品 </Text>}
                  {item.title}
                </Text>
              ) : null}

              {/* -- Abstract / preview -- */}
              {item.abstract ? (
                <Text style={[styles.threadAbstract, { color: colors.textSecondary }]} numberOfLines={4}>
                  {item.abstract}
                </Text>
              ) : null}

              {/* Video placeholder (when isVideo but no media) */}
              {item.isVideo && (!hasMedia || mediaHidden) && (
                <View style={[styles.videoPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                  <SymbolView name="play.rectangle.fill" size={28} tintColor={colors.primary} />
                  <Text style={[styles.videoPlaceholderText, { color: colors.primary }]}>视频</Text>
                </View>
              )}

              {/* Origin Thread Card */}
              {item.isShareThread && item.originThreadInfo && (
                <View style={[styles.originThreadCard, { backgroundColor: colors.surfaceSecondary }]}>
                  {item.originThreadInfo.title ? (
                    <Text style={[styles.originThreadTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.originThreadInfo.title}
                    </Text>
                  ) : null}
                  {item.originThreadInfo.content ? (
                    <Text style={[styles.originThreadContent, { color: colors.textSecondary }]} numberOfLines={2}>
                      {item.originThreadInfo.content}
                    </Text>
                  ) : null}
                  {item.originThreadInfo.forumName ? (
                    <View style={[styles.originForumChip, { backgroundColor: colors.surfaceTertiary || colors.surfaceSecondary }]}>
                      <Text style={[styles.originForumChipText, { color: colors.textTertiary }]}>
                        {item.originThreadInfo.forumName}吧
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* -- Action bar: share | like -- */}
              <View style={styles.actionBar}>
                <Pressable style={styles.actionBtn} onPress={() => onLike?.(item)}>
                  <SymbolView
                    name={item.hasAgree ? 'heart.fill' : 'heart'}
                    size={14}
                    tintColor={item.hasAgree ? '#FF3B30' : colors.textTertiary}
                  />
                  <Text style={[styles.actionText, { color: item.hasAgree ? '#FF3B30' : colors.textTertiary }]}>
                    {item.zanNum && item.zanNum > 0 ? formatCount(item.zanNum) : '赞'}
                  </Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleShare}>
                  <SymbolView name="arrowshape.turn.up.right" size={14} tintColor={colors.textTertiary} />
                  <Text style={[styles.actionText, { color: colors.textTertiary }]}>
                    {item.shareNum && item.shareNum > 0 ? formatCount(item.shareNum) : '分享'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
        </Animated.View>
      </Pressable>
    </Link>
  );
});

// ────────────────────────────────────────────────────────────
// ClassifyPickerSheet — native bottom sheet (audit #15)
// ────────────────────────────────────────────────────────────

function ClassifyPickerSheet({
  visible, onClose, goodClassify, goodClassifyId, setGoodClassifyId, colors,
}: {
  visible: boolean;
  onClose: () => void;
  goodClassify: GoodClassifyItem[];
  goodClassifyId: string | null;
  setGoodClassifyId: (id: string | null) => void;
  colors: any;
}) {
  const sheetRef = useRef<BottomSheet>(null);

  const handleSelect = useCallback((id: string | null) => {
    setGoodClassifyId(id);
    onClose();
  }, [setGoodClassifyId, onClose]);

  return (
    <BottomSheetComponent
      ref={sheetRef}
      index={visible ? 0 : -1}
      snapPoints={['50%', '80%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.card }}
    >
      <BottomSheetScrollView
        style={styles.classifySheetScroll}
        contentContainerStyle={styles.classifySheetContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <Text style={[styles.menuTitle, { color: colors.text }]}>精品分类</Text>
        {/* "全部" option */}
        <Pressable
          style={styles.menuItem}
          onPress={() => handleSelect(null)}
        >
          <SymbolView
            name={goodClassifyId === null ? 'checkmark' : 'circle'}
            size={20}
            tintColor={goodClassifyId === null ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.menuItemText, {
            color: goodClassifyId === null ? colors.primary : colors.text,
            fontWeight: goodClassifyId === null ? '700' : '500',
          }]}>
            全部
          </Text>
        </Pressable>
        {goodClassify.map((c: GoodClassifyItem) => (
          <Pressable
            key={c.classId}
            style={styles.menuItem}
            onPress={() => handleSelect(c.classId)}
          >
            <SymbolView
              name={goodClassifyId === c.classId ? 'checkmark' : 'circle'}
              size={20}
              tintColor={goodClassifyId === c.classId ? colors.primary : colors.textTertiary}
            />
            <Text style={[styles.menuItemText, {
              color: goodClassifyId === c.classId ? colors.primary : colors.text,
              fontWeight: goodClassifyId === c.classId ? '700' : '500',
            }]}>
              {c.className}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.menuItem, styles.menuCancelItem]}
          onPress={onClose}
        >
          <Text style={[styles.menuCancelText, { color: colors.textSecondary }]}>取消</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetComponent>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingTop: 4 },

  // ── Header section ──
  headerSection: { paddingTop: 8 },
  forumCard: {
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  forumInfoRow: { flexDirection: 'row', alignItems: 'center' },
  forumInfoPressable: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  forumTextCol: { flex: 1, marginLeft: 16 },
  forumTitle: { fontSize: 20, fontWeight: '700', letterSpacing: 0, marginBottom: 4 },
  forumLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  levelBadgeSmall: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  levelBadgeSmallText: { color: '#FFF', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  forumLevelName: { fontSize: 12, fontWeight: '500' },
  followBtn: {
    paddingHorizontal: 20,
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
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // ── Good classify row ──
  classifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  classifyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  classifyIndicatorText: { fontSize: 13, fontWeight: '600' },
  classifyFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  classifyFilterText: { fontSize: 13, fontWeight: '500' },

  // ── Unified card (双层结构：外层shadow + 内层bg + overflow:hidden) ──
  cardOuter: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  cardOuterGrid: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  cardWrapper: {
    borderRadius: Radius.card,
    ...Shadows.card,
  },
  cardInner: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  heroContent: {
    height: 240,
  },
  textContent: {
    padding: 16,
  },
  threadTitle: { fontSize: 18, fontWeight: '700', lineHeight: 26, marginBottom: 8, letterSpacing: -0.2 },
  threadAbstract: { fontSize: 15, lineHeight: 22, marginBottom: 12, letterSpacing: 0, opacity: 0.85 },

  // ── Hero image overlay styles (card structure handled by cardWrapper/cardInner) ──
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  heroVideoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlayText: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroOverlayTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroOverlayMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // ── Video indicator ──
  videoPlaceholder: {
    borderRadius: Radius.input,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  videoPlaceholderText: { fontSize: 14, fontWeight: '600' },

  // ── Origin thread card ──
  originThreadCard: {
    borderRadius: Radius.input,
    padding: 10,
    marginBottom: 12,
  },
  originThreadTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 4 },
  originThreadContent: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  originForumChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  originForumChipText: { fontSize: 11, fontWeight: '500' },

  // ── Action bar ──
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.12)',
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionText: { fontSize: 13, fontWeight: '500' },

  // ── Card author row ──
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardAuthorInfo: { flex: 1, marginLeft: 10 },
  cardAuthorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAuthorName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardLevelBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  cardLevelBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  cardTime: { fontSize: 12, marginTop: 2 },

  // ── FAB ──
  fabContainer: { position: 'absolute', right: 20, bottom: 24, zIndex: 100 },
  fab: {
    width: 52, height: 52, borderRadius: Radius.capsule,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Header buttons ──
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerButton: { padding: 8 },

  // ── Good classify picker (native bottom sheet) ──
  classifySheetScroll: {
    flex: 1,
  },
  classifySheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  menuTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  menuItemText: { fontSize: 16 },
  menuCancelItem: {
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
    marginTop: 4,
  },
  menuCancelText: { fontSize: 16, fontWeight: '600' },
});
