/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * FeedCard — iOS 原生质感信息流卡片
 *
 * 设计规格（Hero Image Gallery Card）：
 * - 有图帖子：全宽 Hero 大图（200pt）+ 无缝毛玻璃信息区（作者 + 标题 + 摘要 + 操作栏）
 * - 无图帖子：头部行 + 标题 + 摘要 + 操作栏（纯文字卡片）
 * - 白色卡片 + 圆角 16 + 微阴影（Shadow.card），卡片间距 12
 * - 操作栏：分享 | 评论 | 点赞 均匀分布（SF Symbols via SymbolView）
 * - 按压：reanimated scale 0.97 spring
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { GradientBlurView } from '@/components/ui/GradientBlurView';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from '@/components/ui/SymbolView';
import { Avatar } from '@/components/ui/Avatar';
import { hapticForScene } from '@/theme/hapticsMap';
import * as Clipboard from 'expo-clipboard';
import { useThemeColors } from '@/theme/ThemeContext';
import { PRESS_ENTER, PRESS_EXIT, PRESS_SCALE } from '@/theme/springs';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { typographyStyles } from '@/theme/typography';
import { Radius, Shadows, Spacing } from '@/theme/spacing';
import { relativeTime, formatCount, buildThreadUrl } from '@/utils';
import { thumbnailUrl, THUMB_CARD } from '@/utils/thumbnail';
import { useAuthStore } from '@/stores/authStore';
import { BlockManager } from '@/utils/BlockManager';
import { agree } from '@/services/api/endpoints';
import type { FeedItem } from '@/types';

interface FeedMenuAction {
  id: string;
  title: string;
}

const FEED_MENU_ACTIONS: FeedMenuAction[] = [
  { id: 'dislike', title: '不感兴趣' },
  { id: 'block', title: '屏蔽作者' },
  { id: 'copy-title', title: '复制标题' },
];

/**
 * 实时毛玻璃全局槽位：整条信息流最多允许 1 张带图卡片使用
 * 实时 UIVisualEffectView 模糊（挂载最早 = 首屏顶部的那张），
 * 其余卡片一律使用"静态图 + 低透明渐变"模拟，避免逐卡跑实时高斯。
 * 模块级计数器在列表复用 / 卸载时自动让位。
 */
let realGlassHolderCount = 0;

/**
 * 卡片「···」菜单：原生 ActionSheetIOS（替代每卡常驻 SwiftUI MenuView ——
 * 与 PostCard 同因：几百条滚动的列表里每卡一个原生菜单子树是掉帧大头，
 * 点击时才拉起系统面板，零常驻视图）。
 */
function CardMenuButton({
  onAction,
  tintColor,
  style,
}: {
  onAction: (event: { nativeEvent: { event: string } }) => void;
  tintColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      style={[styles.cardMenuButton, style]}
      accessibilityRole="button"
      accessibilityLabel="更多操作"
      onPress={() => {
        hapticForScene('press');
        Alert.alert('更多操作', undefined, [
          ...FEED_MENU_ACTIONS.map((a) => ({
            text: a.title,
            onPress: () => onAction({ nativeEvent: { event: a.id } }),
          })),
          { text: '取消', style: 'cancel' as const },
        ]);
      }}
    >
      <SymbolView name="ellipsis" size={15} weight="bold" tintColor={tintColor} />
    </Pressable>
  );
}

/**
 * 吧卡片头像：forum.avatar 空串 / 加载失败时兜底为首字占位，
 * 避免暗色下出现空白方块。
 */
const ForumCardAvatar = React.memo(function ForumCardAvatar({
  avatar,
  name,
}: {
  avatar: string;
  name: string;
}) {
  const { colors } = useThemeColors();
  const [failed, setFailed] = useState(false);
  const showImage = !!avatar && !failed;
  if (showImage) {
    return (
      <Image
        cachePolicy="memory-disk"
        source={{ uri: avatar }}
        style={styles.forumCardAvatar}
        contentFit="cover"
        recyclingKey={avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={[
        styles.forumCardAvatar,
        styles.forumAvatarPlaceholder,
        { backgroundColor: colors.surfaceSecondary },
      ]}
    >
      <Text style={[styles.forumAvatarText, { color: colors.textSecondary }]}>
        {(name || '?').slice(0, 1)}
      </Text>
    </View>
  );
});

/**
 * Hero 信息区容器。
 *
 * `useRealGlass`（首屏顶部第 1 张带图卡）时走原生 TiebaGradientBlurView 实时毛玻璃；
 * 其余卡片用静态方案：底图 = 同一张 200px 缩略图（降低饱和度、叠加半透明
 * 表层渐变）再叠低透明黑渐变，视觉接近毛玻璃但零逐卡实时模糊。
 */
function SemiGlassInfoArea({
  useRealGlass,
  isDark,
  heroThumbUri,
  style,
  children,
}: {
  useRealGlass: boolean;
  isDark: boolean;
  heroThumbUri: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (useRealGlass) {
    return (
      <GradientBlurView
        intensity={60}
        tint={isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
        fadeHeight={20}
        style={style}
      >
        {children}
      </GradientBlurView>
    );
  }
  return (
    <View style={style}>
      <Image
        source={{ uri: thumbnailUrl(heroThumbUri, THUMB_CARD) }}
        style={styles.heroGlassBackdrop}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={heroThumbUri}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[
          styles.heroGlassScrim,
          { backgroundColor: isDark ? 'rgba(20,20,22,0.62)' : 'rgba(255,255,255,0.62)' },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.heroGlassShade,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.06)' },
        ]}
      />
      <View style={styles.heroGlassContent}>{children}</View>
    </View>
  );
}

interface FeedCardProps {
  item: FeedItem;
  onDislike?: (item: FeedItem) => void;
  /** 屏蔽作者成功后回调（用于从列表移除该条） */
  onBlockAuthor?: (item: FeedItem) => void;
  /** 点击图片时回调（打开图片浏览器），未提供则回退到整卡导航 */
  onImagePress?: (images: string[], index: number) => void;
}

const FeedCard = React.memo(function FeedCard({ item, onDislike, onBlockAuthor, onImagePress }: FeedCardProps) {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const { reduceMotion, reduceTransparency } = useReducedMotion();

  // 带图卡片才参与玻璃槽位竞争（首屏顶部第 1 张带图卡拿到实时毛玻璃）
  const isImageThreadCard =
    item.type === 'thread' &&
    !!item.threadInfo?.mediaList &&
    item.threadInfo.mediaList.length > 0;
  const glassSlotRef = useRef(false);
  // 玻璃槽位竞争结果镜像到 state：React Compiler 禁止渲染期读 ref，
  // 旧实现 `glassSlotRef.current` 直接参与渲染在严格模式下不可靠。
  const [holdsGlassSlot, setHoldsGlassSlot] = useState(false);
  useEffect(() => {
    if (!isImageThreadCard) return;
    if (realGlassHolderCount === 0) {
      realGlassHolderCount += 1;
      glassSlotRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性玻璃槽位认领：把 ref 镜像进 state（渲染期禁止读 ref），仅挂载时发生一次。
      setHoldsGlassSlot(true);
    }
    return () => {
      if (glassSlotRef.current) {
        glassSlotRef.current = false;
        realGlassHolderCount -= 1;
        setHoldsGlassSlot(false);
      }
    };
  }, [isImageThreadCard]);
  const useRealGlass = !reduceTransparency && holdsGlassSlot;

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const onPressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(PRESS_SCALE.default, PRESS_ENTER);
  }, [scale, reduceMotion]);
  const onPressOut = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(1, PRESS_EXIT);
  }, [scale, reduceMotion]);

  const handlePress = useCallback(() => {
    hapticForScene('press');
    if (item.type === 'thread' && item.threadInfo) {
      router.push(`/thread/${item.threadInfo.id}`);
    } else if (item.type === 'forum' && item.forumInfo) {
      router.push(`/forum/${encodeURIComponent(item.forumInfo.forumName)}`);
    } else if (item.type === 'topic' && item.topicInfo) {
      router.push(`/topic/${item.topicInfo.topicId}?name=${encodeURIComponent(item.topicInfo.topicName)}`);
    } else if (item.type === 'user' && item.userInfo) {
      router.push(`/user/${item.userInfo.id}`);
    }
  }, [item, router]);

  const handleDislike = useCallback(() => {
    onDislike?.(item);
  }, [item, onDislike]);

  const handleBlockAuthor = useCallback(async () => {
    const authorId = item.threadInfo?.authorId;
    if (!authorId) return;
    try {
      await BlockManager.addBlockedUser({
        id: Date.now().toString(),
        uid: authorId,
        username: item.threadInfo?.authorNameShow || item.threadInfo?.authorName || undefined,
      });
      hapticForScene('action-success');
      onBlockAuthor?.(item);
    } catch {
      hapticForScene('action-fail');
    }
  }, [item, onBlockAuthor]);

  const handleShare = useCallback(async () => {
    const thread = item.threadInfo;
    if (!thread) return;
    hapticForScene('press');
    try {
      await Clipboard.setStringAsync(thread.id ? buildThreadUrl(thread.id) : (thread.title || ''));
      hapticForScene('action-success');
    } catch {
      hapticForScene('action-fail');
    }
  }, [item]);

  const handleLike = useCallback(async () => {
    const thread = item.threadInfo;
    if (!thread) return;
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
  }, [item, isLoggedIn, router]);

  const handleMenuAction = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      switch (event.nativeEvent.event) {
        case 'dislike':
          handleDislike();
          break;
        case 'block':
          handleBlockAuthor();
          break;
        case 'copy-title': {
          const title = item.threadInfo?.title ?? '';
          if (title) {
            Clipboard.setStringAsync(title).catch(() => {});
          }
          break;
        }
      }
    },
    [handleDislike, handleBlockAuthor, item],
  );

  // Hero 大图点击 → 打开图片浏览器（未提供 onImagePress 时回退到整卡导航）
  const handleImageTap = useCallback(() => {
    if (item.type === 'thread' && item.threadInfo?.mediaList && item.threadInfo.mediaList.length > 0) {
      const images = item.threadInfo.mediaList.map(m => m.originSrc || m.src);
      if (onImagePress) {
        hapticForScene('press');
        onImagePress(images, 0);
        return;
      }
    }
    handlePress();
  }, [item, onImagePress, handlePress]);

  // 卡片内容区宽度（屏幕宽 - 左右各 16 边距 - 卡片内左右各 16 padding）
  // NOTE: 保留供未来扩展使用
  // const CONTENT_WIDTH = SCREEN_WIDTH - Spacing.lg * 2 - Spacing.lg * 2;

  // ═══════════════════════════════════════════════════════════
  // 帖子卡片
  // ═══════════════════════════════════════════════════════════
  if (item.type === 'thread' && item.threadInfo) {
    const thread = item.threadInfo;
    const hasImages = thread.mediaList && thread.mediaList.length > 0;
    const imageCount = thread.mediaList?.length ?? 0;
    const heroMedia = thread.mediaList?.[0];
    const heroSrc =
      heroMedia && heroMedia.type === 'video' && heroMedia.poster
        ? heroMedia.poster
        : (heroMedia?.src ?? '');
    // Hero 图只解码 200px 宽的服务端缩略图，点击/进帖时再看原图
    const heroThumbUri = thumbnailUrl(heroSrc, THUMB_CARD);

    // 信息区内容：实时毛玻璃槽位（首屏顶部第 1 张）用真 blur，其余卡片用
    // "静态缩略图 + 低透明渐变"模拟玻璃质感——零逐卡实时高斯模糊
    const heroInfoArea = (
      <>
        {/* 论坛标签 */}
        {thread.forumName ? (
          <Pressable onPress={() => router.push(`/forum/${encodeURIComponent(thread.forumName)}`)} style={[styles.forumChip, { backgroundColor: colors.chip }]}>
            <Text style={[styles.forumChipText, { color: colors.primary }]} numberOfLines={1}>
              {thread.forumName}吧
            </Text>
          </Pressable>
        ) : null}

        {/* 第 1 行：作者头像 + 作者 + 时间 + 图片数 */}
        <View style={styles.heroMetaRow}>
          {thread.authorId ? (
            // FeedCard is used in feed/topic lists, not thread detail, so
            // the author avatar navigates to the user page.
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                hapticForScene('press');
                router.push(`/user/${thread.authorId}`);
              }}
              onPressIn={(event) => event.stopPropagation?.()}
              onPressOut={(event) => event.stopPropagation?.()}
              accessibilityRole="button"
              accessibilityLabel="查看作者"
              style={styles.heroAuthorGroup}
            >
              <Avatar source={thread.authorPortrait || undefined} initials={(thread.authorNameShow || thread.authorName || '?').charAt(0)} size={24} />
              <Text style={[styles.heroAuthorName, { color: colors.text }]} numberOfLines={1}>
                {thread.authorNameShow || thread.authorName || thread.forumName}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.heroAuthorGroup}>
              <Avatar source={thread.authorPortrait || undefined} initials={(thread.authorNameShow || thread.authorName || '?').charAt(0)} size={24} />
              <Text style={[styles.heroAuthorName, { color: colors.text }]} numberOfLines={1}>
                {thread.authorNameShow || thread.authorName || thread.forumName}
              </Text>
            </View>
          )}
          <View style={styles.heroMetaRight}>
            <Text style={[styles.heroTime, { color: colors.textTertiary }]}>
              {thread.createTime ? relativeTime(thread.createTime) : ''}
              {imageCount > 1 ? `  ·  ${imageCount}图` : ''}
            </Text>
            <CardMenuButton
              onAction={handleMenuAction}
              tintColor="rgba(255,255,255,0.9)"
              style={styles.heroMenuButton}
            />
          </View>
        </View>

        {/* 标题（加粗、深色、最多 2 行） */}
        {thread.title ? (
          <Text style={[styles.heroTitleDark, { color: colors.text }]} numberOfLines={2}>
            {thread.isTop && <Text style={{ color: colors.error, fontWeight: '700' }}>置顶 </Text>}
            {thread.isGood && <Text style={{ color: colors.warning, fontWeight: '700' }}>精品 </Text>}
            {thread.title}
          </Text>
        ) : null}

        {/* 摘要（次要色、2 行截断） */}
        {thread.abstract ? (
          <Text style={[styles.heroAbstract, { color: colors.textSecondary }]} numberOfLines={2} ellipsizeMode="tail">
            {thread.abstract}
          </Text>
        ) : null}

        {/* 操作栏：分享 | 点赞 */}
        <View style={styles.heroActionBar}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); handleShare(); }}
            onPressIn={(e) => e.stopPropagation?.()}
            onPressOut={(e) => e.stopPropagation?.()}
            style={({ pressed }) => [styles.footerItem, pressed && styles.footerItemPressed]}
            hitSlop={4}
          >
            <SymbolView name="arrowshape.turn.up.left" size={15} tintColor={colors.textTertiary} />
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>分享</Text>
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); handleLike(); }}
            onPressIn={(e) => e.stopPropagation?.()}
            onPressOut={(e) => e.stopPropagation?.()}
            style={({ pressed }) => [styles.footerItem, pressed && styles.footerItemPressed]}
            hitSlop={4}
          >
            <SymbolView name="hand.thumbsup" size={15} tintColor={colors.textTertiary} />
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              {formatCount(thread.zanNum ?? 0)}
            </Text>
          </Pressable>
        </View>
      </>
    );

    // ══ 有图：Hero Image Gallery Card ══
    if (hasImages && heroMedia) {
      return (
        <Animated.View style={[styles.cardWrap, animatedStyle]}>
          {/* §4.4 + §5.4: AppleZoom hero transition (iOS 18+) */}
          <Link href={`/thread/${thread.id}`} asChild>
                  <Pressable
                    onPress={handlePress}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    style={[styles.heroCard, { backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.borderCard }, Shadows.card]}
                  >
            <Link.AppleZoom>
            {/* ── Hero 大图（可点 → 图片浏览器）── */}
            <Pressable onPress={handleImageTap} style={styles.heroImageWrap}>
              <Image
                cachePolicy="memory-disk"
                source={{ uri: heroThumbUri }}
                style={[
                  styles.heroImage,
                  {
                    width: SCREEN_WIDTH - Spacing.lg * 2,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  },
                ]}
                contentFit="cover"
                priority="high"
                transition={250}
                recyclingKey={heroThumbUri}
              />
              {/* 视频角标 */}
              {heroMedia.type === 'video' && (
                <View style={styles.heroVideoBadge}>
                  <SymbolView name="play.fill" size={13} tintColor="#FFF" />
                </View>
              )}
              {/* 不感兴趣 */}
              <Pressable onPress={handleDislike} hitSlop={10} style={styles.heroCloseBtn}>
                <SymbolView name="xmark" size={12} tintColor="rgba(255,255,255,0.9)" />
              </Pressable>
            </Pressable>

            {/* ── 信息区：首屏顶部第 1 张卡实时毛玻璃，其余静态模糊图 ── */}
            <SemiGlassInfoArea
              useRealGlass={useRealGlass}
              isDark={isDark}
              heroThumbUri={heroThumbUri}
              style={styles.heroInfoArea}
            >
              {heroInfoArea}
            </SemiGlassInfoArea>
            </Link.AppleZoom>
          </Pressable>
          </Link>
        </Animated.View>
      );
    }

    // ══ 无图：纯文字卡片 ══
    return (
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
                  onPress={handlePress}
                  onPressIn={onPressIn}
                  onPressOut={onPressOut}
                  style={[styles.card, { backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.borderCard }, Shadows.card]}
                >
          {/* ── 头部：吧头像 + 吧名 + 时间 ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {thread.forumAvatar ? (
                <Image
                  source={{ uri: thread.forumAvatar }}
                  style={styles.forumAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={thread.forumAvatar}
                />
              ) : (
                <View
                  style={[
                    styles.forumAvatar,
                    styles.forumAvatarPlaceholder,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <Text style={[styles.forumAvatarText, { color: colors.textSecondary }]}>
                    {(thread.forumName || '?').slice(0, 1)}
                  </Text>
                </View>
              )}
              <Pressable onPress={(e) => { e.stopPropagation?.(); router.push(`/forum/${encodeURIComponent(thread.forumName)}`); }}>
                <Text style={[styles.forumName, { color: colors.text }]} numberOfLines={1}>
                  {thread.forumName}吧
                </Text>
              </Pressable>
            </View>
            <View style={styles.headerRight}>
              {thread.createTime ? (
                <Text style={[styles.time, { color: colors.textTertiary }]}>
                  {relativeTime(thread.createTime)}
                </Text>
              ) : null}
              <Pressable onPress={handleDislike} hitSlop={8} style={styles.closeBtn}>
                <SymbolView name="xmark" size={15} tintColor={colors.textTertiary} />
              </Pressable>
              <CardMenuButton onAction={handleMenuAction} tintColor={colors.textTertiary} />
            </View>
          </View>

          {/* ── 标题 ── */}
          {thread.title ? (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {thread.isTop && <Text style={[styles.tag, { color: colors.error }]}>置顶 </Text>}
              {thread.isGood && <Text style={[styles.tag, { color: colors.warning }]}>精品 </Text>}
              {thread.title}
            </Text>
          ) : null}

          {/* ── 摘要 ── */}
          {thread.abstract ? (
            <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={3}>
              {thread.abstract}
            </Text>
          ) : null}

          {/* ── 底部操作栏：分享 | 点赞 ── */}
          <View style={styles.footer}>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleShare(); }}
              onPressIn={(e) => e.stopPropagation?.()}
              onPressOut={(e) => e.stopPropagation?.()}
              style={({ pressed }) => [styles.footerItem, pressed && styles.footerItemPressed]}
              hitSlop={4}
            >
              <SymbolView name="arrowshape.turn.up.left" size={16} tintColor={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textTertiary }]}>分享</Text>
            </Pressable>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleLike(); }}
              onPressIn={(e) => e.stopPropagation?.()}
              onPressOut={(e) => e.stopPropagation?.()}
              style={({ pressed }) => [styles.footerItem, pressed && styles.footerItemPressed]}
              hitSlop={4}
            >
              <SymbolView name="hand.thumbsup" size={16} tintColor={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                {formatCount(thread.zanNum ?? 0)}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 吧卡片
  // ═══════════════════════════════════════════════════════════
  if (item.type === 'forum' && item.forumInfo) {
    const forum = item.forumInfo;
    return (
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.forumCard, { backgroundColor: colors.card }, Shadows.card]}
        >
          <ForumCardAvatar avatar={forum.avatar} name={forum.forumName} />
          <View style={styles.forumCardInfo}>
            <Text style={[styles.forumCardName, { color: colors.text }]}>
              {forum.forumName}吧
            </Text>
            <Text style={[styles.forumCardStats, { color: colors.textTertiary }]} numberOfLines={1}>
              关注 {formatCount(forum.memberCount)}  贴子 {formatCount(forum.threadCount)}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={15} tintColor={colors.textDisabled} />
        </Pressable>
      </Animated.View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 话题卡片
  // ═══════════════════════════════════════════════════════════
  if (item.type === 'topic' && item.topicInfo) {
    const topic = item.topicInfo;
    return (
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.card, { backgroundColor: colors.card }, Shadows.card]}
        >
          <View style={styles.topicHeader}>
            <View
              style={[
                styles.topicIcon,
                { backgroundColor: isDark ? 'rgba(255,159,10,0.16)' : 'rgba(255,149,0,0.12)' },
              ]}
            >
              <SymbolView name="number" size={14} tintColor={colors.warning} />
            </View>
            <Text style={[styles.topicName, { color: colors.text }]} numberOfLines={1}>
              #{topic.topicName}#
            </Text>
            {topic.isHot && (
              <View style={[styles.hotBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.hotBadgeText}>热</Text>
              </View>
            )}
          </View>
          {topic.topicDesc ? (
            <Text style={[styles.topicDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {topic.topicDesc}
            </Text>
          ) : null}
          <View style={styles.topicFooter}>
            <SymbolView name="bubble.left.and.bubble.right" size={13} tintColor={colors.textTertiary} />
            <Text style={[styles.topicStat, { color: colors.textTertiary }]}>
              {formatCount(topic.discussNum)} 讨论
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return null;
});

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // 卡片外层：提供间距
  cardWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6, // 6pt 上下 → 卡片间 12pt
  },
  // 帖子/话题卡片容器
  card: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    overflow: 'hidden',
  },
  // ── Hero 图片卡片 ──
  heroCard: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  heroImageWrap: {
    overflow: 'hidden',
    // 无 borderRadius — 由父卡片统一裁剪
  },
  heroImage: {
    // 高度 200pt 为信息流首图的设计定值（Hero 图 16:9 横向版面），
    // 无对应 spacing token，保留常量；宽度由组件内动态按屏宽注入。
    height: 200,
  },
  heroVideoBadge: {
    position: 'absolute',
    top: Spacing.sm + 2,
    left: Spacing.sm + 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCloseBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Hero 信息区（毛玻璃，与图片无缝衔接）──
  heroInfoArea: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    // 无 borderRadius — 位于已裁剪的卡片内部
  },
  // 静态玻璃（非首屏槽位卡片）：模糊缩略底图 + 低透明渐变模拟
  heroGlassBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroGlassScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroGlassShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroGlassContent: {
    width: '100%',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroAuthorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  heroAuthorName: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  heroMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 2,
  },
  heroTime: {
    fontSize: 12,
    fontWeight: '400',
  },
  cardMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMenuButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroTitleDark: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  heroAbstract: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  heroActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  // ── 头部 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 4 条未收录为 token（spacing 刻度为 4/8/12/16），保持 2pt 更紧凑
    marginBottom: Spacing.sm + 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  forumAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.input,
  },
  forumAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  forumAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  forumName: {
    ...typographyStyles.subheadBold,
    flexShrink: 1,
  },
  forumChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    marginBottom: 6,
  },
  forumChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    ...typographyStyles.footnote,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  // ── 标题 / 摘要 ──
  title: {
    ...typographyStyles.headline,
    marginBottom: Spacing.xs,
  },
  tag: {
    ...typographyStyles.headline,
  },
  preview: {
    ...typographyStyles.subhead,
    // 2pt 微调（spacing 刻度无 10pt），保持与 header 一致
    marginBottom: Spacing.sm + 2,
  },
  // ── 底部操作栏 ──
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  footerItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerItemPressed: {
    opacity: 0.5,
  },
  footerText: {
    ...typographyStyles.caption1,
    fontWeight: '500',
  },

  // ── 吧卡片 ──
  forumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  forumCardAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.image,
    backgroundColor: 'rgba(120,120,128,0.12)',
  },
  forumCardInfo: {
    flex: 1,
  },
  forumCardName: {
    ...typographyStyles.headline,
    marginBottom: 3,
  },
  forumCardStats: {
    ...typographyStyles.caption1,
  },

  // ── 话题卡片 ──
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    // 2pt 微调（spacing 刻度无 10pt）
    marginBottom: Spacing.xs + 2,
  },
  topicIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.chip + 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicName: {
    ...typographyStyles.subheadBold,
    flex: 1,
  },
  hotBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  hotBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  topicDesc: {
    ...typographyStyles.subhead,
    // 2pt 微调（spacing 刻度无 10pt）
    marginBottom: Spacing.xs + 2,
  },
  topicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topicStat: {
    ...typographyStyles.caption1,
  },
});

export default FeedCard;
