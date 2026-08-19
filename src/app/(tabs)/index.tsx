/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
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
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { useForumStore } from '@/stores/forumStore';
import { useSignStore } from '@/stores/signStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useAppPreference } from '@/hooks/useAppPreference';
import { getVisitHistory, toForumHistoryItem, type ForumHistoryItem } from '@/services/storage/visitHistory';
import { formatCount, getLevelColor } from '@/utils';
import { SymbolView } from '@/components/ui/SymbolView';
import { Avatar } from '@/components/ui/Avatar';
import { GlassView } from '@/components/ui/GlassView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { PressScale } from '@/components/ui/PressScale';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASE_OUT, Radius, Spacing } from '@/theme';
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
 * 共享实现见 @/components/ui/PressScale（index/notifications/…… 统一）。
 */
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

  // 未登录时一键签到同样可见：点击后提示先登录（登录后跳转登录页）
  const handleSignRequireLogin = useCallback(() => {
    Alert.alert('提示', '签到需要先登录百度账号', [
      { text: '去登录', onPress: () => router.push('/login') },
      { text: '取消', style: 'cancel' },
    ]);
  }, [router]);

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
          {/* 顶部操作条：搜索栏 + 签到图标按钮（未登录也可点，点击提示登录） */}
          <HomeTopActions
            isSigning={false}
            onSignPress={handleSignRequireLogin}
            sortMode="level"
            onSortPress={() => {}}
          />

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

// ── 首页顶部操作条：搜索栏（左）+ 一键签到 / 排序切换 图标按钮（右） ──
// 排序切换（按等级 ⇄ 按名称）在右上角；单列/双列布局入口已移入设置页。
function HomeTopActions({
  isSigning,
  onSignPress,
  sortMode,
  onSortPress,
}: {
  isSigning: boolean;
  onSignPress: () => void;
  sortMode: 'level' | 'name';
  onSortPress: () => void;
}) {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();

  const tint = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(120,120,128,0.10)';
  const border = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(120,120,128,0.45)';

  return (
    /* 整条顶栏放进单个 RNHostView 的 RN 行：RN 的 flex:1 才让搜索胶囊真正铺满、
       按钮贴右（RNHostView 在 SwiftUI HStack 里拿不到弹性宽度会把胶囊塌缩成固有宽） */
    <RNHostView>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <SearchBarPill onPress={() => router.push('/search' as any)} />
        </View>

        {/* 一键签到：纯图标（无文字），点击直接开始签到（Kotlin 同款无确认弹窗） */}
        <TopIconButton
          theme={isDark ? 'dark' : 'light'}
          tint={tint}
          border={border}
          onPress={onSignPress}
          symbol={isSigning ? 'checkmark.seal.fill' : 'checkmark.seal'}
          symbolTint={isSigning ? colors.primary : colors.text}
        />

        {/* 排序切换：按等级（arrow.up.arrow.down 等级徽章） ⇄ 按名称（character 排序） */}
        <TopIconButton
          theme={isDark ? 'dark' : 'light'}
          tint={tint}
          border={border}
          onPress={onSortPress}
          symbol={sortMode === 'level' ? 'arrow.up.arrow.down' : 'textformat.abc'}
          symbolTint={colors.text}
        />
      </View>
    </RNHostView>
  );
}

/** 顶部 34pt 图标按钮：下单玻璃胶囊 + 可见描边（浅色白底也看得出轮廓） */
function TopIconButton({
  theme,
  tint,
  border,
  symbol,
  symbolTint,
  onPress,
}: {
  theme: 'light' | 'dark';
  tint: string;
  border: string;
  symbol: string;
  symbolTint: string;
  onPress: () => void;
}) {
  return (
    <GlassView
      borderRadius={17}
      glassEffectStyle="clear"
      theme={theme}
      tintColor={tint}
      style={styles.topIconBtn}
    >
      <Pressable onPress={onPress} style={styles.topIconBtnInner}>
        <SymbolView name={symbol} size={17} tintColor={symbolTint} />
      </Pressable>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 17,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: border,
          },
        ]}
      />
    </GlassView>
  );
}

// ── 已登录首页 ──
function LoggedInHome() {
  const { colors } = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const followedForums = useForumStore((s) => s.followedForums);
  const isLoadingForums = useForumStore((s) => s.isLoadingForums);
  const loadFollowedForums = useForumStore((s) => s.loadFollowedForums);
  const unfollowForum = useForumStore((s) => s.unfollowForum);
  const startSign = useSignStore((s) => s.startSign);
  const isSigning = useSignStore((s) => s.isSigning);
  const showHistoryForum = useAppPreference('homePageShowHistoryForum', false);
  const forumListSingle = useAppPreference('forumListSingle', true);
  const forumSortMode = useAppPreference('forumSortMode', 'level') ?? 'level';
  const setPreference = usePreferencesStore((s) => s.setPreference);

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

  // 排序：按等级（高→低，未关注等级为 0 排最后）或按名称（中文拼音序）。
  // 右上角图标一键切换（Kotlin 关注列表排序语义）。
  const sortedForums = useMemo(() => {
    const list = [...filteredForums];
    if (forumSortMode === 'name') {
      list.sort((a, b) => a.forumName.localeCompare(b.forumName, 'zh-Hans-CN'));
    } else {
      list.sort((a, b) => (b.levelId ?? 0) - (a.levelId ?? 0));
    }
    return list;
  }, [filteredForums, forumSortMode]);

  const toggleSortMode = useCallback(() => {
    hapticForScene('toggle');
    setPreference('forumSortMode', forumSortMode === 'level' ? 'name' : 'level');
  }, [forumSortMode, setPreference]);

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
    if (!isLoggedIn) {
      Alert.alert('提示', '签到需要先登录百度账号', [
        { text: '去登录', onPress: () => router.push('/login') },
        { text: '取消', style: 'cancel' },
      ]);
      return;
    }
    // 点击即开始（Kotlin 同款无确认弹窗）：仅对“未签到”的吧执行；
    // 全部已签到时直接提示。
    const unsigned = followedForums.filter((f) => !f.isSign).length;
    if (unsigned === 0) {
      Alert.alert('提示', '今天所有关注的吧都已签到过了');
      return;
    }
    hapticForScene('action-success');
    startSign();
  }, [isLoggedIn, followedForums, router, startSign]);

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
          style={forumListSingle ? styles.forumMenu : styles.forumMenuGrid}
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
              style={[
                forumListSingle ? styles.forumRow : styles.forumCardGrid,
                { backgroundColor: colors.card },
              ]}
            >
              <Avatar
                source={item.avatar || undefined}
                initials={(item.forumName || '吧')?.charAt(0)}
                size={forumListSingle ? 38 : 42}
              />
              <View style={styles.forumRowText}>
                <RNText style={[styles.forumRowName, { color: colors.text }]} numberOfLines={1}>
                  {item.forumName}吧
                </RNText>
                {item.memberCount > 0 && (
                  <RNText style={[styles.forumRowMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                    {formatCount(item.memberCount)} 关注
                  </RNText>
                )}
              </View>
              {/* 等级胶囊（Kotlin 样式）：chip 底 + Lv.X + 已签对勾（同色 12dp 圆角勾） */}
              <View style={[styles.levelCapsule, { backgroundColor: colors.surfaceSecondary }]}>
                {item.levelId > 0 && (
                  <RNText style={[styles.forumRowLevel, { color: getLevelColor(item.levelId) }]}>
                    Lv.{item.levelId}
                  </RNText>
                )}
                {item.isSign && (
                  <SymbolView name="checkmark" size={10} weight="bold" tintColor={getLevelColor(item.levelId)} />
                )}
              </View>
            </View>
          </PressScale>
        </MenuView>
      </EntranceRow>
    ),
    [colors, handleForumPress, handleUnfollowConfirm, forumListSingle],
  );

  return (
    // ⚠️ 登录后主界面：ThemedHost 直包 VStack（SwiftUI 组件须为 Host 直子，
    // 否则在 RN View 中间层时挂 "being mounted inside a standard UIView"
    // RedBox）。top inset/padding 由外层 RN View 承担（同 notifications 写法）。
    <View style={[styles.container, { paddingTop: insets.top }]}>
    <ThemedHost style={{ flex: 1 }}>
    <VStack spacing={0}>
        {/* 顶部操作条：搜索栏 + 一键签到 / 排序切换 图标按钮（同一行，按钮在右顶端） */}
        <HomeTopActions
          isSigning={isSigning}
          onSignPress={handleSign}
          sortMode={forumSortMode}
          onSortPress={toggleSortMode}
        />

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

        {/* 吧列表 / 骨架 / 错误态：RN 子树必须经 RNHostView 挂进 SwiftUI
            VStack（文件头部搜索栏同款模式），flex 布局语义才能生效。 */}
        {isLoadingForums && followedForums.length === 0 ? (
          <RNHostView>
            <View style={{ flex: 1, width: '100%' }}>
              <SkeletonList variant="row" count={8} style={styles.forumSkeleton} />
            </View>
          </RNHostView>
        ) : forumsError && followedForums.length === 0 ? (
          <RNHostView>
            <View style={{ flex: 1, width: '100%' }}>
              <ErrorState
                title="加载失败"
                message={forumsError}
                icon="wifi.exclamationmark"
                onRetry={handleLoadFollowedForums}
                retryLabel="重试"
              />
            </View>
          </RNHostView>
        ) : filteredForums.length === 0 ? (
          <ContentUnavailableView
            systemImage={searchQuery ? 'magnifyingglass' : 'tray'}
            title={searchQuery ? '无匹配结果' : '暂无关注的贴吧'}
            description={searchQuery ? `没有找到包含"${searchQuery}"的吧` : '去发现页探索感兴趣的贴吧吧'}
          />
        ) : (
          <RNHostView>
            <View style={{ flex: 1, width: '100%' }}>
              <FlashList
                key={forumListSingle ? 'forum-list-single' : 'forum-list-grid'}
                data={sortedForums}
                keyExtractor={forumKeyExtractor}
                numColumns={forumListSingle ? 1 : 2}
                renderItem={renderForumItem}
                contentContainerStyle={styles.forumListContent}
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
            </View>
          </RNHostView>
        )}
      </VStack>
    </ThemedHost>
    </View>
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

        {/* Center: Glass Search Pill —— 用应用内 GlassView（带 glassTokens 描边/高光，
            静态降级时也保持玻璃质感，避免 expo-glass-effect raw 组件的纯白降级） */}
        <Pressable onPress={onPress} style={({ pressed }) => [searchStyles.pill, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <GlassView
            style={StyleSheet.absoluteFill}
            borderRadius={18}
            glassEffectStyle="clear"
            theme={isDark ? 'dark' : 'light'}
            tintColor={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(120,120,128,0.10)'}
          />
          {/* 可见描边：浅色白底上液态玻璃需要一条浅灰边才有轮廓，
              glassTokens 浅色 border 是白色，白对白不可见 → 这里显式覆盖 */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 18,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(120,120,128,0.45)',
              },
            ]}
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
  forumMenuGrid: {
    flex: 1,
  },
  /* 顶部图标按钮：34pt 胶囊玻璃钮（签到 / 布局切换），无文字 */
  topIconBtn: {
    width: 34,
    height: 34,
  },
  topIconBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* 首页顶部条：RN 行，搜索胶囊 flex:1 铺满、图标按钮贴右 */
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
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
  /* 双列（一行两个）卡片：略小的内边距以适配窄卡。
     列间间隙用 marginHorizontal（FlashList numColumns 不支持 columnWrapperStyle） */
  forumCardGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.card,
    paddingHorizontal: 10,
    paddingVertical: Spacing.sm + 2,
    marginHorizontal: Spacing.xs / 2,
    marginBottom: Spacing.xs,
  },
  forumRowText: { flex: 1, gap: 2 },
  forumRowName: { ...typographyStyles.subheadBold },
  forumRowMeta: { ...typographyStyles.caption1 },
  /* 等级胶囊（Kotlin ForumItemContent 对位）：chip 底色圆角盒，
     Lv.X + 已签对勾（对勾与 Lv 文字同色、12dp 圆角勾） */
  levelCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
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
