/**
 * User Profile Page (用户主页)
 * Displays user profile with stats, tabs for posts/replies/forums.
 *
 * Mirrors Kotlin TiebaLite UserProfileDetail composable layout:
 * - Large avatar (80pt) with network image
 * - Username with showNickname
 * - 3-stat row: 关注 | 粉丝 | 获赞 with dividers
 * - Intro (or default "这个人很懒，什么都没留下")
 * - Verification badges: 吧主 (bazhuGrade), 大神认证 (newGodData status != 0)
 * - Chips row: gender, Tieba UID (copyable), IP location, tieba age
 * - Follow/Unfollow/Block action buttons
 * - Tabs: 帖子 | 回复 | 关注的吧 (each with inline count)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
  Alert,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { hapticForScene } from '@/theme/hapticsMap';
import { SymbolView } from '@/components/ui/SymbolView';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Picker, Text as SWText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import ImageViewer from '@/components/ImageViewer';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, DURATION, EASE_OUT, Spacing, typographyStyles } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAuthStore } from '@/stores/authStore';
import {
  profile,
  userPost,
  userLikeForum,
  followUser,
  unfollowUser,
  setUserBlack,
  cancelUserBlack,
  getFans,
  getFollows,
  type SocialUser,
} from '@/services/api/endpoints';
import { BlockManager } from '@/utils/BlockManager';

import { flattenStyle, contentToText, relativeTime, formatCount, getAvatarUrl } from '@/utils';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import type { UserInfo } from '@/types';

// ---------- Constants ----------

// 外层 segmented 只保留 3 段；粉丝/关注列表改为从头部统计区进入的独立视图，
// 避免「外层分段 + 内嵌分段」的双层分段控件（风险最小的方案）。
const PROFILE_TABS = [
  { label: '贴子', value: 'threads' },
  { label: '回复', value: 'replies' },
  { label: '关注的吧', value: 'forums' },
];

const DEFAULT_INTRO = '这个人很懒，什么都没留下';

const ProfileItemSeparator = () => <View style={{ height: Spacing.sm }} />;

// ---------- 首屏级联入场（仅项目挂载时执行一次，Reduce Motion 跳过） ----------

function StaggerItem({
  index,
  children,
  style,
}: {
  index: number;
  children: React.ReactNode;
  style?: any;
}) {
  const { reduceMotion } = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      index * DURATION.stagger,
      withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }),
    );
    return () => {
      progress.value = 0;
    };
  }, [index, reduceMotion, progress]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }],
  }));
  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

// ---------- Component ----------

export default function UserProfilePage() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const { isLoggedIn, account } = useAuthStore();
  const currentAccountUid = account?.uid;

  // Profile data
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  // TODO(#32): UserInfo has no isBlocked field and the profile response does
  // not map it either; keep local state until the API exposes the relation.
  const [isBlocked, setIsBlocked] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('threads');
  const displayedTab = !isOwnProfile && activeTab === 'replies' ? 'threads' : activeTab;

  // 粉丝/关注独立视图（从头部统计区进入，外层 segmented 不再嵌套）
  const [socialVisible, setSocialVisible] = useState(false);
  const [socialInitialMode, setSocialInitialMode] = useState<SocialMode>('fans');

  // Profile loading
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- Derived tab labels with counts ----------

  // 回复 tab is only shown on the current user's own profile (#33).
  const visibleTabs = useMemo(
    () => PROFILE_TABS.filter((tab) => tab.value !== 'replies' || isOwnProfile),
    [isOwnProfile],
  );

  // ---------- Load profile ----------

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setError(null);
    try {
      const result = await profile(uid);
      const u = result.user;
      setUser(u);
      // Check if current user follows this user (hasConcerned = 0 means not followed)
      setIsFollowing(u.hasConcerned ? u.hasConcerned !== 0 : false);
      setIsOwnProfile(currentAccountUid === uid);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoadingProfile(false);
    }
  }, [uid, currentAccountUid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial profile fetch; loading state is already true on mount.
    loadProfile();
  }, [uid, loadProfile]);

  const handleTabChange = useCallback((value: string) => {
    hapticForScene('toggle');
    setActiveTab(value);
  }, []);

  // ---------- Actions ----------

  const userName = user?.name;
  const userNameShow = user?.nameShow;

  const handleFollow = useCallback(async () => {
    if (!isLoggedIn || !account) {
      Alert.alert('提示', '请先登录');
      return;
    }
    try {
      if (isFollowing) {
        await unfollowUser(user?.portrait || '', account.tbs);
      } else {
        await followUser(user?.portrait || '', account.tbs);
      }
      setIsFollowing((v) => !v);
      hapticForScene('action-success');
    } catch {
      Alert.alert('错误', '操作失败');
    }
  }, [isLoggedIn, account, isFollowing, user]);

  const handleBlock = useCallback(async () => {
    if (!isLoggedIn || !account) {
      Alert.alert('提示', '请先登录');
      return;
    }
    try {
      if (isBlocked) {
        await cancelUserBlack(uid, account.tbs);
        await BlockManager.removeBlockedUser(uid);
        setIsBlocked(false);
        Alert.alert('已取消拉黑', '该用户已恢复访问');
        return;
      }
      await setUserBlack(uid, account.tbs);
      await BlockManager.addBlockedUser({
        id: Date.now().toString(),
        uid,
        username: userNameShow || userName || '',
      });
      setIsBlocked(true);
      Alert.alert('已拉黑', '该用户已被拉黑');
    } catch {
      Alert.alert('错误', '拉黑失败');
    }
  }, [isLoggedIn, account, isBlocked, uid, userName, userNameShow]);

  /** Copy UID to clipboard and show haptic feedback */
  const handleCopyUID = useCallback(async () => {
    if (!user) return;
    const uidToCopy = user.tiebaUid || user.id;
    try {
      await Clipboard.setStringAsync(uidToCopy);
      hapticForScene('action-success');
      Alert.alert('已复制', `贴吧UID: ${uidToCopy}`);
    } catch {
      // Ignore clipboard errors
    }
  }, [user]);

  // ---------- Profile header (Kotlin-aligned layout) ----------

  const renderHeader = useMemo(() => {
    if (!user) return null;

    // Gender chip — iOS 风格：性别色 + 纯文字，不使用 emoji 符号
    let genderLabel: string | null = null;
    let genderColor: string | null = null;
    if (user.sex === 1) {
      genderLabel = '男';
      genderColor = colors.tint;
    } else if (user.sex === 2) {
      genderLabel = '女';
      genderColor = colors.danger;
    }
    const uidText = user.tiebaUid || user.id;

    // Verification flags
    const hasBazhuBadge = !!(user as any).bazhuGrade;
    const bazhuDesc = (user as any).bazhuGrade?.desc || '吧主';
    const hasGodBadge = !!(user as any).newGodData && ((user as any).newGodData?.status ?? 0) !== 0;
    const godFieldName = (user as any).newGodData?.fieldName || '大神认证';
    const hasAnyBadge = hasBazhuBadge || hasGodBadge;

    return (
      <View style={styles.profileHeader}>
        {/* ---- Avatar + Name ---- */}
        <View style={styles.avatarSection}>
          <Avatar
            source={user.portrait}
            initials={user.name?.slice(0, 2)}
            size={80}
            level={user.levelId}
            onPress={user.portrait ? () => setAvatarPreviewVisible(true) : undefined}
          />
          <View style={styles.nameSection}>
            <Text style={[styles.userName, { color: colors.text }]}>
              {user.nameShow || user.name}
            </Text>
            <Text style={[styles.levelName, { color: colors.textSecondary }]}>
              {user.levelName || `Lv.${user.levelId}`}
            </Text>
          </View>
        </View>

        {/* ---- Stats Row (3 items) ---- */}
        <View style={[styles.statsRow, { borderColor: colors.separator }]}>
          {/* 关注 — 点击进入关注列表 */}
          <Pressable
            onPress={() => {
              hapticForScene('press');
              setSocialInitialMode('follows');
              setSocialVisible(true);
            }}
            style={styles.statItem}
            accessibilityRole="button"
            accessibilityLabel={`关注 ${formatCount(user.concernNum || 0)}，点击查看`}
          >
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatCount(user.concernNum || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>关注</Text>
          </Pressable>
          {/* Divider */}
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          {/* 粉丝 — 点击进入粉丝列表 */}
          <Pressable
            onPress={() => {
              hapticForScene('press');
              setSocialInitialMode('fans');
              setSocialVisible(true);
            }}
            style={styles.statItem}
            accessibilityRole="button"
            accessibilityLabel={`粉丝 ${formatCount(user.fansNum || 0)}，点击查看`}
          >
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatCount(user.fansNum || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>粉丝</Text>
          </Pressable>
          {/* Divider */}
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          {/* 获赞 */}
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatCount((user as any).totalAgreeNum || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>获赞</Text>
          </View>
        </View>

        {/* ---- Intro ---- */}
        <Text
          style={[styles.intro, { color: colors.textSecondary }]}
          numberOfLines={3}
        >
          {user.intro || DEFAULT_INTRO}
        </Text>

        {/* ---- Verification Badges ---- */}
        {hasAnyBadge && (
          <View style={styles.badgeRow}>
            {hasBazhuBadge && (
              <View style={[styles.verifyBadge, { backgroundColor: colors.primaryLight || colors.primary + '22' }]}>
                <SymbolView
                  name="checkmark.seal.fill"
                  size={14}
                  tintColor={colors.primary}
                />
                <Text style={[styles.verifyBadgeText, { color: colors.primary }]}>
                  {bazhuDesc}
                </Text>
              </View>
            )}
            {hasGodBadge && (
              <View style={[styles.verifyBadge, { backgroundColor: colors.primaryLight || colors.primary + '22' }]}>
                <SymbolView
                  name="rosette"
                  size={14}
                  tintColor={colors.primary}
                />
                <Text style={[styles.verifyBadgeText, { color: colors.primary }]}>
                  {godFieldName}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ---- Chips Row: Gender · UID · IP · Age ---- */}
        <View style={styles.chipsRow}>
          {/* Gender chip */}
          {genderLabel && (
            <View style={[styles.chip, { backgroundColor: (genderColor || colors.primary) + '1A' }]}>
              <Text style={[styles.chipText, { color: genderColor || colors.textSecondary }]}>
                {genderLabel}
              </Text>
            </View>
          )}

          {/* UID chip (copyable) */}
          <Pressable
            onPress={handleCopyUID}
            style={[styles.chip, { backgroundColor: colors.chip || colors.surfaceSecondary }]}
          >
            <Text style={[styles.chipText, { color: colors.onChip || colors.textSecondary }]}>
              贴吧UID: {uidText}
            </Text>
            <SymbolView
              name="doc.on.doc"
              size={11}
              tintColor={colors.onChip || colors.textTertiary}
              style={{ marginLeft: Spacing.xs }}
            />
          </Pressable>

          {/* IP location */}
          {user.ipLocation ? (
            <View style={[styles.chip, { backgroundColor: colors.chip || colors.surfaceSecondary }]}>
              <SymbolView
                name="location.fill"
                size={11}
                tintColor={colors.onChip || colors.textTertiary}
              />
              <Text style={[styles.chipText, { color: colors.onChip || colors.textSecondary, marginLeft: 3 }]}>
                IP: {user.ipLocation}
              </Text>
            </View>
          ) : null}

          {/* Tieba age */}
          {user.tbAge ? (
            <View style={[styles.chip, { backgroundColor: colors.chip || colors.surfaceSecondary }]}>
              <Text style={[styles.chipText, { color: colors.onChip || colors.textSecondary }]}>
                吧龄: {user.tbAge}年
              </Text>
            </View>
          ) : null}
        </View>

        {/* ---- Action Buttons ---- */}
        {isLoggedIn && (
          <View style={styles.actionRow}>
            {!isOwnProfile && (
              <>
                <Button
                  title={isFollowing ? '已关注' : '关注'}
                  variant={isFollowing ? 'plain' : 'filled'}
                  size="small"
                  icon={isFollowing ? 'person.badge.minus' : 'person.badge.plus'}
                  onPress={handleFollow}
                  style={styles.actionBtn}
                />
                <Button
                  title={isBlocked ? '已拉黑' : '拉黑'}
                  variant="plain"
                  size="small"
                  icon="nosign"
                  onPress={handleBlock}
                  style={styles.actionBtn}
                />
              </>
            )}
            <Button
              title="私信"
              variant="plain"
              size="small"
              icon="envelope"
              onPress={() => {
                hapticForScene('press');
                Alert.alert('暂不支持', '私信功能开发中，敬请期待');
              }}
              style={[styles.actionBtn, { opacity: 0.45 }]}
              textStyle={{ color: colors.textDisabled }}
              accessibilityHint="私信功能暂不支持"
            />
          </View>
        )}
      </View>
    );
  }, [user, isFollowing, isBlocked, isOwnProfile, colors, isLoggedIn, handleFollow, handleBlock, handleCopyUID]);

  // ---------- Loading state ----------

  if (loadingProfile && !user) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
          <Stack.Screen options={{ title: '用户' }} />
          <View style={styles.skeletonWrap}>
            <SkeletonList variant="row" count={8} />
          </View>
        </View>
      </ThemedHost>
    );
  }

  // ---------- Error state ----------

  if (error && !user) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
          <Stack.Screen options={{ title: '用户' }} />
          <ErrorState message={error} onRetry={loadProfile} />
        </View>
      </ThemedHost>
    );
  }

  // ---------- Main render ----------

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
      <Stack.Screen options={{ title: user?.nameShow || user?.name || '用户' }} />

      {socialVisible ? (
        <SocialTabList
          uid={uid}
          colors={colors}
          insets={insets}
          initialMode={socialInitialMode}
          onClose={() => setSocialVisible(false)}
        />
      ) : (
        <>
          {/* SegmentedControl tabs rendered outside FlatList */}
          <View style={styles.tabsRow}>
            <ThemedHost matchContents>
              <Picker
              selection={displayedTab}
                onSelectionChange={handleTabChange}
                modifiers={[pickerStyle('segmented')]}
              >
                {visibleTabs.map((tab) => (
                  <SWText key={tab.value} modifiers={[tag(tab.value)]}>{tab.label}</SWText>
                ))}
              </Picker>
            </ThemedHost>
          </View>

          {/* 懒挂载：仅挂载当前激活的 tab，切换时才 mount/加载，避免预渲染多份 FlashList */}
          <View style={styles.tabLists}>
            {visibleTabs
              .filter((tab) => tab.value === displayedTab)
              .map((tab) => (
                <View key={tab.value} style={styles.tabListWrap}>
                  <UserTabList
                    tab={tab.value}
                    uid={uid}
                    colors={colors}
                    insets={insets}
                    header={renderHeader}
                    onHeaderRefresh={loadProfile}
                  />
                </View>
              ))}
          </View>
        </>
      )}

      <ImageViewer
        images={user?.portrait ? [getAvatarUrl(user.portrait)] : []}
        visible={avatarPreviewVisible}
        onClose={() => setAvatarPreviewVisible(false)}
      />
      </View>
    </ThemedHost>
  );
}

// ---------- Independent tab list ----------

function UserTabList({
  tab,
  uid,
  colors,
  insets,
  header,
  onHeaderRefresh,
}: {
  tab: string;
  uid: string;
  colors: any;
  insets: any;
  header: React.ReactElement | null;
  onHeaderRefresh: () => Promise<void>;
}) {
  const paged = usePagedList<any, { tab: string; uid: string }>({
    fetcher: async (p, params, signal) => {
      let data: { items: any[]; hasMore: boolean };
      if (params.tab === 'threads') {
        data = await userPost(params.uid, p, true, signal);
      } else if (params.tab === 'replies') {
        data = await userPost(params.uid, p, false, signal);
      } else {
        data = await userLikeForum(params.uid, p, signal);
      }
      return { items: data.items, hasMore: data.hasMore, nextPage: p + 1 };
    },
    params: { tab, uid },
  });
  const {
    items,
    hasMore,
    loading,
    loadingMore,
    refreshing,
    error,
    load,
    refresh,
    loadMore,
  } = paged;

  useEffect(() => {
    load(1, { tab, uid });
  }, [tab, uid, load]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([onHeaderRefresh(), refresh()]);
  }, [onHeaderRefresh, refresh]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await loadMore();
  }, [hasMore, loadingMore, loading, loadMore]);

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      if (tab === 'forums') {
        return (
          <StaggerItem index={index}>
            <Link href={{ pathname: '/forum/[name]', params: { name: item.forumName || '' } }} push asChild>
              <Pressable
                style={flattenStyle([styles.forumItem, { backgroundColor: colors.card }])}
              >
                <Avatar
                  source={item.avatar}
                  initials={(item.forumName || '?')?.slice(0, 2)}
                  size={36}
                />
                <View style={styles.forumInfo}>
                  <Text style={[styles.forumName, { color: colors.text }]}>{item.forumName}吧</Text>
                  <Text style={[styles.forumLevel, { color: colors.textTertiary }]}>
                    {item.levelName || ''}
                  </Text>
                </View>
                <SymbolView name="chevron.right" size={14} tintColor={colors.textTertiary} />
              </Pressable>
            </Link>
          </StaggerItem>
        );
      }
      // Threads or replies
      return (
        <StaggerItem index={index}>
          <Link href={{ pathname: '/thread/[id]', params: { id: item.id || item.threadId } }} push asChild>
            <Pressable
              style={flattenStyle([styles.contentItem, { backgroundColor: colors.card }])}
            >
              <Text style={[styles.contentTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title || contentToText(item.content)}
              </Text>
              {item.forumName ? (
                <View style={styles.contentMeta}>
                  <Text style={[styles.contentForum, { color: colors.textLink }]}>{item.forumName}吧</Text>
                  <Text style={[styles.contentTime, { color: colors.textTertiary }]}>
                    {relativeTime((Number(item.createTime) || 0) * 1000)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Link>
        </StaggerItem>
      );
    },
    [tab, colors],
  );

  const userKeyExtractor = useCallback(
    (item: any, idx: number) => item.id || item.forumId || String(idx),
    [],
  );
  const userItemType = useCallback(
    () => (tab === 'forums' ? 'forum' : 'content'),
    [tab],
  );
  const listEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.listEmptySkeleton}>
          <SkeletonList variant="row" count={4} />
        </View>
      );
    }
    if (error) {
      return <ErrorState message={error} onRetry={() => load(1, { tab, uid })} />;
    }
    let description: string;
    if (tab === 'threads') description = '还没有发过贴子';
    else if (tab === 'replies') description = '还没有回复';
    else description = '还没有关注的吧';
    return (
      <EmptyState title="暂无内容" description={description} icon="tray.fill" />
    );
  }, [loading, error, tab, load, uid]);
  const listFooter = useCallback(
    () =>
      (
        <LoadMoreFooter
          hasMore={hasMore}
          loading={loadingMore}
          colors={colors}
          onLoadMore={handleLoadMore}
        />
      ),
    [loadingMore, hasMore, colors, handleLoadMore],
  );

  return (
    <FlashList
      data={items}
      keyExtractor={userKeyExtractor}
      // FlashList v2: separate recycling pools for the two item layouts
      // (forum rows vs thread/reply rows) so switching tabs never reuses a
      // recycled forum cell for content (or vice versa).
      getItemType={userItemType}
      decelerationRate="normal"
      drawDistance={250}
      maxItemsInRecyclePool={24}
      removeClippedSubviews={false}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={listEmpty}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + Spacing.lg },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListFooterComponent={listFooter}
      ItemSeparatorComponent={ProfileItemSeparator}
    />
  );
}

// ---------- 粉丝/关注独立视图 ----------
// 复用 social.ts 的 getFans/getFollows（20/页，pn 从 1 开始），
// SocialUser 无 level/时间字段，行内展示昵称 + 用户名副行。

type SocialMode = 'fans' | 'follows';

function SocialTabList({
  uid,
  colors,
  insets,
  initialMode,
  onClose,
}: {
  uid: string;
  colors: any;
  insets: any;
  initialMode: SocialMode;
  onClose: () => void;
}) {
  const listRef = useRef<any>(null);
  const [mode, setMode] = useState<SocialMode>(initialMode);

  const paged = usePagedList<SocialUser, { uid: string; mode: SocialMode }>({
    fetcher: async (p, params, signal) => {
      const data =
        params.mode === 'fans'
          ? await getFans(params.uid, p, signal)
          : await getFollows(params.uid, p, signal);
      return { items: data.items, hasMore: data.hasMore, nextPage: p + 1 };
    },
    params: { uid, mode },
  });

  const {
    items,
    hasMore,
    loading,
    loadingMore,
    refreshing,
    error,
    load,
    refresh,
    loadMore,
  } = paged;

  useEffect(() => {
    load(1, { uid, mode });
  }, [uid, mode, load]);

  const handleModeChange = useCallback((value: string) => {
    hapticForScene('toggle');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setMode(value === 'follows' ? 'follows' : 'fans');
  }, []);

  const handleRefresh = useCallback(async () => {
    await refresh();
    hapticForScene('toggle');
  }, [refresh]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await loadMore();
  }, [hasMore, loadingMore, loading, loadMore]);

  const listHeader = useCallback(
    () => (
      <View>
        <View style={styles.socialTopBar}>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={styles.socialCloseBtn}
            accessibilityRole="button"
            accessibilityLabel="关闭粉丝/关注列表"
          >
            <SymbolView name="xmark" size={16} weight="semibold" tintColor={colors.textSecondary} />
          </Pressable>
          <ThemedHost matchContents>
            <Picker
              selection={mode}
              onSelectionChange={handleModeChange}
              modifiers={[pickerStyle('segmented')]}
            >
              <SWText modifiers={[tag('fans')]}>粉丝</SWText>
              <SWText modifiers={[tag('follows')]}>关注</SWText>
            </Picker>
          </ThemedHost>
          {/* 平衡左侧关闭按钮占位，让分段居中 */}
          <View style={styles.socialCloseBtn} />
        </View>
      </View>
    ),
    [onClose, mode, handleModeChange, colors],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SocialUser; index: number }) => {
      const displayName = item.nickName || item.userName || '用户';
      const row = (
        <Pressable
          style={flattenStyle([styles.socialItem, { backgroundColor: colors.card }])}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          <Avatar source={item.portrait} initials={displayName.slice(0, 2)} size={40} />
          <View style={styles.socialInfo}>
            <Text style={[styles.socialName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {item.userName && item.userName !== displayName ? (
              <Text style={[styles.socialSub, { color: colors.textTertiary }]} numberOfLines={1}>
                @{item.userName}
              </Text>
            ) : null}
          </View>
          <SymbolView name="chevron.right" size={14} tintColor={colors.textTertiary} />
        </Pressable>
      );
      return (
        <StaggerItem index={index}>
          {item.uid ? (
            <Link href={{ pathname: '/user/[uid]', params: { uid: item.uid } }} push asChild>
              {row}
            </Link>
          ) : (
            row
          )}
        </StaggerItem>
      );
    },
    [colors],
  );

  const socialKeyExtractor = useCallback(
    (item: SocialUser, idx: number) => item.uid || String(idx),
    [],
  );

  const listEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.listEmptySkeleton}>
          <SkeletonList variant="row" count={4} />
        </View>
      );
    }
    if (error) {
      return <ErrorState message={error} onRetry={() => load(1, { uid, mode })} />;
    }
    return mode === 'fans' ? (
      <EmptyState
        title="暂无粉丝"
        description="还没有人关注 TA"
        icon="person.crop.circle.badge.questionmark"
      />
    ) : (
      <EmptyState
        title="暂无关注"
        description="TA 还没有关注任何人"
        icon="person.crop.circle.badge.plus"
      />
    );
  }, [loading, error, load, uid, mode]);

  const listFooter = useCallback(
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

  return (
    <FlashList
      ref={listRef}
      data={items}
      keyExtractor={socialKeyExtractor}
      decelerationRate="normal"
      drawDistance={250}
      maxItemsInRecyclePool={24}
      removeClippedSubviews={false}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + Spacing.lg },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListFooterComponent={listFooter}
      ItemSeparatorComponent={ProfileItemSeparator}
    />
  );
}

// ---------- Helpers ----------

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  listEmptySkeleton: { paddingTop: Spacing.md },
  listContent: { paddingHorizontal: Spacing.lg },

  // Profile Header
  profileHeader: {
    paddingTop: Spacing.xl,
    paddingBottom: 4,
  },

  // Avatar + Name
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: 18,
  },
  nameSection: { gap: 3 },
  userName: typographyStyles.title2,
  levelName: { fontSize: 13, fontWeight: '500' },

  // Stats Row (3 items with vertical dividers)
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
  },
  statItem: { alignItems: 'center', gap: 2, flex: 1 },
  statValue: typographyStyles.headline,
  statLabel: { fontSize: 12, fontWeight: '500' },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },

  // Intro
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },

  // Verification Badges
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: 10,
  },
  verifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.input,
  },
  verifyBadgeText: typographyStyles.caption1Bold,

  // Chips Row
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Action Buttons
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1 },

  // Tabs
  tabsRow: { paddingVertical: Spacing.md },
  tabLists: { flex: 1 },
  tabListWrap: { flex: 1 },

  // 粉丝/关注独立视图顶部栏
  socialTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  socialCloseBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content Items
  contentItem: { padding: 14, borderRadius: Radius.input },
  contentTitle: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  contentMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  contentForum: typographyStyles.caption1,
  contentTime: typographyStyles.caption2,

  // Forum Items
  forumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.input,
    gap: 10,
  },
  forumInfo: { flex: 1, gap: 2 },
  forumName: { fontSize: 14, fontWeight: '600' },
  forumLevel: typographyStyles.caption2,

  // Social Items (粉丝/关注)
  socialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.input,
    gap: 10,
  },
  socialInfo: { flex: 1, gap: 2 },
  socialName: { fontSize: 14, fontWeight: '600' },
  socialSub: typographyStyles.caption2,

  loadingItems: { paddingVertical: 32 },
  loadingMore: { paddingVertical: Spacing.lg },
  noMore: { textAlign: 'center', paddingVertical: Spacing.lg, ...typographyStyles.footnote },
});
