/**
 * Home Tab (关注) — SwiftUI 原生实现
 *
 * 界面渲染：
 * - 搜索栏：HStack + SF Symbol 放大镜 + 圆角灰底背景
 * - 最近访问：横向 ScrollView + 药丸按钮
 * - 关注吧列表：List + Section + Label(systemImage) 代替 emoji
 * - 签到按钮：buttonStyle('glass') 液态玻璃效果
 * - 未登录/空态：ContentUnavailableView
 * - 下拉刷新：refreshable modifier
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VStack, HStack, Button, Text, Label,
  ScrollView, ProgressView, ContentUnavailableView,
  Spacer, RNHostView,
} from '@expo/ui/swift-ui';
import {
  font, foregroundStyle, buttonStyle, buttonBorderShape, padding,
} from '@expo/ui/swift-ui/modifiers';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import {
  Alert, DeviceEventEmitter, View, Pressable, StyleSheet, Text as RNText, RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { GlassView } from 'expo-glass-effect';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { useForumStore } from '@/stores/forumStore';
import { useSignStore } from '@/stores/signStore';
import { useAppPreference } from '@/hooks/useAppPreference';
import { getVisitHistory, toForumHistoryItem, type ForumHistoryItem } from '@/services/storage/visitHistory';
import { formatCount, getLevelColor } from '@/utils';
import { SymbolView } from '@/components/ui/SymbolView';
import { Avatar } from '@/components/ui/Avatar';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASE_OUT, PRESS_ENTER, Radius, Spacing } from '@/theme';
import { typographyStyles } from '@/theme/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ForumInfo } from '@/types';

const forumKeyExtractor = (item: ForumInfo) => item.forumId;
const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

/** 首屏入场级联延迟上限：避免长列表把入场拖得太久 */
const ENTRANCE_STAGGER_LIMIT = 10;

/**
 * 首屏批次入场：opacity 0→1 + translateY 12→0，逐行 withDelay(DURATION.stagger) 级联。
 * 仅首次数据到达批次执行一次（ran ref 防重播）；reduceMotion 时直接静态显示。
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

const FORUM_MENU_ACTIONS: MenuAction[] = [
  {
    id: 'unfollow',
    title: '取消关注',
    image: 'person.badge.minus',
    attributes: { destructive: true },
  },
];

export default function HomeScreen() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  if (isLoading) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <VStack alignment="center" spacing={12}>
          <Spacer />
          <ProgressView />
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>加载中...</Text>
          <Spacer />
        </VStack>
      </ThemedHost>
    );
  }

  if (!isLoggedIn) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <VStack spacing={0}>
          <HStack spacing={0} modifiers={[padding({ horizontal: Spacing.lg })]}>
            <RNHostView>
              <SearchBarPill onPress={() => router.push('/search' as any)} />
            </RNHostView>
          </HStack>

          <Spacer />
          <ContentUnavailableView
            systemImage="person.crop.circle.badge.questionmark"
            title="你还未登录"
            description="登录后查看关注的贴吧动态"
          />
          <Button
            onPress={() => router.push('/login')}
            modifiers={[buttonStyle('glassProminent'), buttonBorderShape('capsule'), padding({ bottom: 80 })]}
          >
            <Label title="登录百度账号" systemImage="person.crop.circle.badge.checkmark" />
          </Button>
          <Spacer />
        </VStack>
      </ThemedHost>
    );
  }

  return <LoggedInHome />;
}

// ── 已登录首页 ──
function LoggedInHome() {
  const { colors } = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const followedForums = useForumStore((s) => s.followedForums);
  const isLoadingForums = useForumStore((s) => s.isLoadingForums);
  const loadFollowedForums = useForumStore((s) => s.loadFollowedForums);
  const unfollowForum = useForumStore((s) => s.unfollowForum);
  const startSign = useSignStore((s) => s.startSign);
  const isSigning = useSignStore((s) => s.isSigning);
  const showHistoryForum = useAppPreference('homePageShowHistoryForum', false);

  const [searchQuery] = useState('');
  const [recentForums, setRecentForums] = useState<ForumHistoryItem[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  // 关注吧加载失败态：用于替代静默 catch，展示重试入口
  const [forumsError, setForumsError] = useState('');

  // 首屏入场标记：仅数据首次到达批次做 stagger 入场（关注吧来自 store，首次到达后置位）。
  const entranceDoneRef = useRef(false);
  useEffect(() => {
    if (followedForums.length > 0) entranceDoneRef.current = true;
  }, [followedForums.length]);

  const filteredForums = useMemo(() => {
    if (!searchQuery.trim()) return followedForums;
    const q = searchQuery.trim().toLowerCase();
    return followedForums.filter((f) => f.forumName.toLowerCase().includes(q));
  }, [followedForums, searchQuery]);

  const handleLoadFollowedForums = useCallback(async () => {
    try {
      setForumsError('');
      await loadFollowedForums();
    } catch (e: any) {
      setForumsError(e?.message || '加载关注的贴吧失败');
    }
  }, [loadFollowedForums]);

  useFocusEffect(
    useCallback(() => {
      handleLoadFollowedForums();
      if (showHistoryForum) {
        getVisitHistory('forum')
          .then((items) => setRecentForums(items.map(toForumHistoryItem).filter((f): f is ForumHistoryItem => f !== null)))
          .catch(() => {});
      }
    }, [handleLoadFollowedForums, showHistoryForum]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'index') {
        handleLoadFollowedForums();
      }
    });
    return () => sub.remove();
  }, [handleLoadFollowedForums]);

  const handleSign = useCallback(() => {
    hapticForScene('action-success');
    startSign();
  }, [startSign]);

  const handleForumPress = useCallback((forum: ForumInfo) => {
    hapticForScene('press');
    router.push(`/forum/${encodeURIComponent(forum.forumName)}`);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    await handleLoadFollowedForums();
    hapticForScene('toggle');
  }, [handleLoadFollowedForums]);

  const handleUnfollowConfirm = useCallback((forum: ForumInfo) => {
    Alert.alert(
      '取消关注',
      `确定不再关注「${forum.forumName}吧」吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '取消关注',
          style: 'destructive',
          onPress: () => {
            unfollowForum(forum.forumId, forum.forumName)
              .then(() => {
                hapticForScene('action-success');
                return loadFollowedForums();
              })
              .catch(() => {
                hapticForScene('action-fail');
              });
          },
        },
      ],
    );
  }, [loadFollowedForums, unfollowForum]);

  const renderForumItem = useCallback(
    ({ item, index }: { item: ForumInfo; index: number }) => (
      <EntranceRow index={index} animateEntry={!entranceDoneRef.current}>
        <MenuView
          style={styles.forumMenu}
          actions={FORUM_MENU_ACTIONS}
          shouldOpenOnLongPress
          onPressAction={(event) => {
            if (event.nativeEvent.event === 'unfollow') {
              handleUnfollowConfirm(item);
            }
          }}
        >
          <PressScale onPress={() => handleForumPress(item)}>
            <View
              style={[styles.forumRow, { backgroundColor: colors.card }]}
            >
              <Avatar
                source={item.avatar || undefined}
                initials={(item.forumName || '吧')?.charAt(0)}
                size={38}
              />
              <View style={styles.forumRowText}>
                <RNText style={[styles.forumRowName, { color: colors.text }]} numberOfLines={1}>
                  {item.forumName}吧
                </RNText>
                {item.memberCount > 0 && (
                  <RNText style={[styles.forumRowMeta, { color: colors.textTertiary }]}>
                    {formatCount(item.memberCount)} 关注
                  </RNText>
                )}
              </View>
              <View style={styles.forumRowBadge}>
                {item.levelId > 0 && (
                  <RNText style={[styles.forumRowLevel, { color: getLevelColor(item.levelId) }]}>
                    Lv.{item.levelId}
                  </RNText>
                )}
                {item.isSign && <SymbolView name="checkmark.circle.fill" size={14} tintColor={colors.success} />}
              </View>
            </View>
          </PressScale>
        </MenuView>
      </EntranceRow>
    ),
    [colors, handleForumPress, handleUnfollowConfirm],
  );

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
      <VStack spacing={0}>
        {/* §5.7: 搜索栏 (flex-1) + 一键签到 同一行，签到按钮在右上 */}
        <HStack spacing={10} modifiers={[padding({ horizontal: Spacing.lg, top: Spacing.sm })]}>
          <RNHostView>
            <SearchBarPill onPress={() => router.push('/search' as any)} />
          </RNHostView>
          <Button
            onPress={handleSign}
            modifiers={[buttonStyle('glass'), buttonBorderShape('capsule')]}
          >
            <Label
              title={isSigning ? '签到中...' : '一键签到'}
              systemImage={isSigning ? 'checkmark.circle.fill' : 'checkmark.circle'}
            />
          </Button>
        </HStack>

        {/* 最近访问 */}
        {showHistoryForum && recentForums.length > 0 && (
          <HStack
            spacing={8}
            modifiers={[padding({ horizontal: Spacing.lg, top: 6, bottom: Spacing.xs })]}
          >
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' })]}>
              最近访问
            </Text>
            <Spacer />
            <Button
              onPress={() => setHistoryExpanded((prev) => !prev)}
              modifiers={[buttonStyle('plain'), buttonBorderShape('capsule')]}
            >
              <Label
                title={historyExpanded ? '收起' : '展开'}
                systemImage={historyExpanded ? 'chevron.up' : 'chevron.down'}
              />
            </Button>
          </HStack>
        )}
        {showHistoryForum && historyExpanded && recentForums.length > 0 && (
          <ScrollView axes="horizontal" showsIndicators={false}>
            <HStack spacing={8} modifiers={[padding({ horizontal: Spacing.lg, bottom: Spacing.sm })]}>
              {recentForums.map((f) => (
                <Button
                  key={f.forumName}
                  onPress={() => router.push(`/forum/${encodeURIComponent(f.forumName)}`)}
                  modifiers={[buttonStyle('bordered'), buttonBorderShape('capsule')]
                }>
                  <Text modifiers={[font({ textStyle: 'caption', weight: 'medium' })]}>
                    {f.forumName}
                  </Text>
                </Button>
              ))}
            </HStack>
          </ScrollView>
        )}

        {/* 吧列表 */}
        {isLoadingForums && followedForums.length === 0 ? (
          <SkeletonList variant="row" count={8} style={styles.forumSkeleton} />
        ) : forumsError && followedForums.length === 0 ? (
          <ErrorState
            title="加载失败"
            message={forumsError}
            icon="wifi.exclamationmark"
            onRetry={handleLoadFollowedForums}
            retryLabel="重试"
          />
        ) : filteredForums.length === 0 ? (
          <ContentUnavailableView
            systemImage={searchQuery ? 'magnifyingglass' : 'tray'}
            title={searchQuery ? '无匹配结果' : '暂无关注的贴吧'}
            description={searchQuery ? `没有找到包含"${searchQuery}"的吧` : '去发现页探索感兴趣的贴吧吧'}
          />
        ) : (
          <FlashList
            data={filteredForums}
            keyExtractor={forumKeyExtractor}
            renderItem={renderForumItem}
            contentContainerStyle={styles.forumListContent}
            estimatedItemSize={96}
            refreshControl={
              <RefreshControl
                refreshing={isLoadingForums && filteredForums.length > 0}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            drawDistance={200}
            maxItemsInRecyclePool={24}
          />
        )}
      </VStack>
      </View>
    </ThemedHost>
  );
}

// ── 液态玻璃搜索栏组件（参考设计：头像 + 玻璃搜索胶囊 + 签到按钮） ──

function SearchBarPill({ onPress }: { onPress: () => void }) {
  const { colors, isDark } = useThemeColors();
  const account = useAuthStore((s) => s.account);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const router = useRouter();

  return (
    <View style={[searchStyles.wrapper, { paddingTop: Spacing.xs }]}>
      <View style={searchStyles.row}>
        {/* Left: User Avatar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLoggedIn ? '个人主页' : '登录'}
          onPress={() => {
            if (isLoggedIn) {
              if (account?.uid) {
                router.push(`/user/${account.uid}` as any);
              } else {
                router.push('/settings/account');
              }
            } else {
              router.push('/login');
            }
          }}
          style={searchStyles.avatarWrap}
        >
          <Avatar
            source={account?.portrait || undefined}
            initials={account?.name?.charAt(0) || '?'}
            size={36}
          />
        </Pressable>

        {/* Center: Glass Search Pill */}
        <Pressable onPress={onPress} style={({ pressed }) => [searchStyles.pill, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          {/* 默认 glassEffectStyle（regular 磨砂）与全局 GlassView 质感统一，
              不再叠加 clear 液态玻璃 + 手写 rgba 底 */}
          <GlassView
            style={StyleSheet.absoluteFill}
            theme={isDark ? 'dark' : 'light'}
          />
          <View style={searchStyles.pillInner}>
            <SymbolView name="magnifyingglass" size={15} tintColor={colors.textTertiary} style={{ marginRight: Spacing.sm }} />
            <RNText style={[searchStyles.text, { color: colors.textTertiary }]} numberOfLines={1}>
              搜吧、搜贴、搜人
            </RNText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  forumMenu: {
    flex: 1,
  },
  forumSkeleton: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 24,
  },
  forumListContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 24,
  },
  forumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.card,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  forumRowText: { flex: 1, gap: 2 },
  forumRowName: { ...typographyStyles.subheadBold },
  forumRowMeta: { ...typographyStyles.caption1 },
  forumRowBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  forumRowLevel: { ...typographyStyles.caption1Bold },
});

const searchStyles = StyleSheet.create({
  wrapper: {
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  pill: {
    flex: 1,
    borderRadius: 18,
    height: 36,
    overflow: 'hidden',
  },
  pillInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  text: {
    ...typographyStyles.subhead,
  },
});
