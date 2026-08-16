/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * TweetCard — 推特（X）风格信息流卡片
 *
 * 设计规格（对齐参考图 Twitter timeline，iOS 设计语言）：
 * - 圆角卡片包裹（colors.card + 16pt 圆角 + hairline 描边 + 微阴影），无分割线
 * - 头部：44pt 圆头像（左）→ 一行 显示名(15/600) + @用户名(15 次要) + · 时间(15 次要)
 * - 正文：标题(17/700) + 摘要(15/400) 合并 Text 块，内容列与名字列对齐（缩进 54pt）
 * - 长文：超过 6 行截断 + 底部渐隐 + 「显示更多」按钮原位展开
 * - 媒体：圆角 16；单图按宽高比（钳制）；多图卡内横向分页滑动 + 底部页码点；
 *   点击图片进入大图浏览（带当前页索引）；视频帖显示 poster + 中央播放角标
 * - 转发帖：originThreadInfo 渲染为推特「引用帖」嵌套小卡
 * - 操作栏（仅 3 个）：回复 → 分享 → 点赞（heart/heart.fill 红色 + 弹簧 pop）
 * - 交互：点击卡片空白/文字区域进帖；头像→用户页、吧名→吧页、按钮各自独立
 *
 * 性能：
 * - React.memo + 父级 useCallback 稳定回调
 * - expo-image recyclingKey + 200px 服务端缩略图（点击再看原图）
 * - 页码点动画走 Reanimated UI 线程（useAnimatedScrollHandler）
 * - thread.id 变化时重置展开状态与分页偏移（FlashList 回收复用安全）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withSequence,
  interpolate,
  clamp,
  type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Avatar } from '@/components/ui/Avatar';
import { SymbolView } from '@/components/ui/SymbolView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { PRESS_ENTER, PRESS_EXIT, MOMENTUM } from '@/theme/springs';
import { Radius, Shadows } from '@/theme/spacing';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppPreference } from '@/hooks/useAppPreference';
import { formatCount, relativeTime } from '@/utils';
import { thumbnailUrl, THUMB_CARD } from '@/utils/thumbnail';
import type { ThreadInfo } from '@/types';

// ── 设计常量（推特 timeline 规格） ──
const AVATAR_SIZE = 44;
const AVATAR_GAP = 10;
/** 内容列缩进：与名字列对齐（推特 timeline 布局） */
const CONTENT_INDENT = AVATAR_SIZE + AVATAR_GAP;
const CARD_RADIUS = 16;
/** 长文截断行数（推特 Show more 阈值） */
const COLLAPSE_LINES = 6;
/** 媒体高度/宽度 钳制区间（推特约 2:3 ~ 4:3） */
const MEDIA_RATIO_MIN = 2 / 3;
const MEDIA_RATIO_MAX = 4 / 3;
const LIKE_COLOR = '#FF3B5C';

const TWEET_MENU_ACTIONS: MenuAction[] = [
  { id: 'dislike', title: '不感兴趣', image: 'hand.thumbsdown' },
  { id: 'block', title: '屏蔽作者', image: 'person.badge.minus' },
  { id: 'copy-title', title: '复制标题', image: 'doc.on.doc' },
];

export type TweetCardMenuAction = 'dislike' | 'block' | 'copy-title';

export interface TweetCardProps {
  thread: ThreadInfo;
  /** feed = 动态页（显示吧名 chip + 更多菜单）；forum = 吧内列表（不重复显示吧名） */
  variant?: 'feed' | 'forum';
  /** 头部时间字段：create = 发帖时间（按发帖时间排序/动态流）；last = 最后回复时间（按回复时间排序） */
  timeType?: 'create' | 'last';
  onImagePress?: (images: string[], index: number) => void;
  onLike?: (thread: ThreadInfo) => void;
  onShare?: (thread: ThreadInfo) => void;
  /** 提供时显示右上角「···」更多菜单（不感兴趣/屏蔽作者/复制标题），回传所属帖子 */
  onMenuAction?: (action: TweetCardMenuAction, thread: ThreadInfo) => void;
}

const TweetCard = React.memo(function TweetCard({
  thread,
  variant = 'feed',
  timeType = 'create',
  onImagePress,
  onLike,
  onShare,
  onMenuAction,
}: TweetCardProps) {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { reduceMotion } = useReducedMotion();
  const hideMedia = useAppPreference('hideMedia');

  // 卡片内容宽度：屏宽 - 列表左右边距 16*2 - 卡片左右 padding 12*2
  const contentWidth = screenWidth - 16 * 2 - 12 * 2;

  // ── 整卡按压反馈（scale 0.98 弹簧） ──
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    if (reduceMotion) return;
    scale.value = withSpring(0.98, PRESS_ENTER);
  }, [scale, reduceMotion]);
  const handlePressOut = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    if (reduceMotion) return;
    scale.value = withSpring(1, PRESS_EXIT);
  }, [scale, reduceMotion]);

  // ── 导航 ──
  const handleCardPress = useCallback(() => {
    hapticForScene('press');
    router.push(`/thread/${thread.id}`);
  }, [router, thread.id]);

  const handleAvatarPress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    if (!thread.authorId) return;
    hapticForScene('press');
    router.push(`/user/${thread.authorId}`);
  }, [router, thread.authorId]);

  const handleForumChipPress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    if (!thread.forumName) return;
    hapticForScene('press');
    router.push(`/forum/${encodeURIComponent(thread.forumName)}`);
  }, [router, thread.forumName]);

  // ── 长文展开（回收时按 thread.id 重置） ──
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- FlashList 回收复用：换帖时重置展开态
    setExpanded(false);
    setTruncatable(false);
  }, [thread.id]);

  const handleTextLayout = useCallback((e: any) => {
    if (e.nativeEvent?.lines?.length >= COLLAPSE_LINES) {
      setTruncatable(true);
    }
  }, []);

  const handleShowMore = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    hapticForScene('toggle');
    setExpanded(true);
  }, []);

  // ── 媒体 ──
  const mediaList = thread.mediaList ?? [];
  const images = mediaList.filter((m) => m.type === 'image' && (m.src || m.originSrc));
  const videoPoster = mediaList.find((m) => m.type === 'video')?.poster;
  const showMedia = !hideMedia && (images.length > 0 || !!videoPoster);

  const handleImagePress = useCallback(
    (index: number) => {
      if (!onImagePress || images.length === 0) {
        handleCardPress();
        return;
      }
      hapticForScene('press');
      onImagePress(images.map((m) => m.originSrc || m.src), index);
    },
    [onImagePress, images, handleCardPress],
  );

  // ── 操作栏 ──
  const handleLikePress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onLike?.(thread);
  }, [onLike, thread]);

  const handleSharePress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onShare?.(thread);
  }, [onShare, thread]);

  const handleReplyPress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    hapticForScene('press');
    router.push(`/thread/${thread.id}`);
  }, [router, thread.id]);

  const handleMenuPress = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      const action = event.nativeEvent.event as TweetCardMenuAction;
      onMenuAction?.(action, thread);
    },
    [onMenuAction, thread],
  );

  // ── 头部文案 ──
  const displayName = thread.authorNameShow || thread.authorName || '吧友';
  const rawName = thread.authorName || '';
  const showHandle = !!rawName && rawName !== displayName;
  const timeValue = timeType === 'last' ? thread.lastTime : thread.createTime;
  const timeText = timeValue ? relativeTime(timeValue) : '';

  const cardBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <Animated.View style={[styles.cardWrap, pressStyle]}>
      <Pressable
        onPress={handleCardPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorderColor }, Shadows.card]}
        accessibilityRole="button"
        accessibilityLabel={thread.title || '帖子'}
      >
        {/* ── 头部：头像 + 名字行 ── */}
        <View style={styles.headerRow}>
          <Pressable onPress={handleAvatarPress} onPressIn={stopPropagation} onPressOut={stopPropagation} hitSlop={4}>
            <Avatar
              source={thread.authorPortrait || undefined}
              initials={displayName.charAt(0)}
              size={AVATAR_SIZE}
            />
          </Pressable>
          <View style={styles.nameCol}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              {showHandle && (
                <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{rawName}
                </Text>
              )}
              {timeText ? (
                <Text style={[styles.time, { color: colors.textSecondary }]} numberOfLines={1}>
                  · {timeText}
                </Text>
              ) : null}
            </View>
            {/* feed 变体：吧名 chip（点击进吧） */}
            {variant === 'feed' && thread.forumName ? (
              <Pressable onPress={handleForumChipPress} onPressIn={stopPropagation} onPressOut={stopPropagation} hitSlop={4}>
                <Text style={[styles.forumChip, { color: colors.textSecondary }]} numberOfLines={1}>
                  {thread.forumName}吧
                </Text>
              </Pressable>
            ) : null}
          </View>
          {onMenuAction ? (
            <ThemedHost matchContents>
              <MenuView style={styles.menuButton} actions={TWEET_MENU_ACTIONS} onPressAction={handleMenuPress}>
                <Pressable
                  onPress={stopPropagation}
                  onPressIn={stopPropagation}
                  onPressOut={stopPropagation}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="更多操作"
                >
                  <SymbolView name="ellipsis" size={16} weight="bold" tintColor={colors.textTertiary} />
                </Pressable>
              </MenuView>
            </ThemedHost>
          ) : null}
        </View>

        {/* ── 内容列（与名字列对齐） ── */}
        <View style={styles.contentCol}>
          {/* 正文：标题(粗体) + 摘要 同一块，超行截断 + 渐隐 + 显示更多 */}
          {thread.title || thread.abstract ? (
            <View>
              <Text
                style={[styles.bodyText, { color: colors.text }]}
                numberOfLines={expanded ? undefined : COLLAPSE_LINES}
                onTextLayout={expanded ? undefined : handleTextLayout}
              >
                {thread.title ? (
                  <Text style={styles.bodyTitle}>
                    {thread.isTop && <Text style={{ color: colors.error }}>置顶 </Text>}
                    {thread.isGood && <Text style={{ color: colors.warning }}>精品 </Text>}
                    {thread.title}
                  </Text>
                ) : null}
                {thread.title && thread.abstract ? '\n' : null}
                {thread.abstract ? (
                  <Text style={{ color: colors.textSecondary }}>{thread.abstract}</Text>
                ) : null}
              </Text>
              {truncatable && !expanded ? (
                <LinearGradient
                  colors={['transparent', colors.card]}
                  style={styles.textFade}
                  pointerEvents="none"
                />
              ) : null}
              {truncatable && !expanded ? (
                <Pressable onPress={handleShowMore} onPressIn={stopPropagation} onPressOut={stopPropagation} hitSlop={6}>
                  <Text style={[styles.showMore, { color: colors.primary }]}>显示更多</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* 媒体区：单图按宽高比 / 多图分页滑动 / 视频 poster + 播放角标 */}
          {showMedia ? (
            <MediaPager
              images={images.map((m) => ({ src: m.src, originSrc: m.originSrc || m.src, width: m.width, height: m.height }))}
              videoPoster={images.length === 0 ? videoPoster : undefined}
              width={contentWidth}
              recycleKey={thread.id}
              onImagePress={handleImagePress}
              onFallbackPress={handleCardPress}
            />
          ) : null}

          {/* 转发帖：引用帖嵌套小卡（推特 quote tweet 样式） */}
          {thread.isShareThread && thread.originThreadInfo ? (
            <View style={[styles.quoteCard, { borderColor: colors.separator }]}>
              {thread.originThreadInfo.forumName ? (
                <Text style={[styles.quoteForum, { color: colors.textSecondary }]} numberOfLines={1}>
                  {thread.originThreadInfo.forumName}吧
                </Text>
              ) : null}
              {thread.originThreadInfo.title ? (
                <Text style={[styles.quoteTitle, { color: colors.text }]} numberOfLines={1}>
                  {thread.originThreadInfo.title}
                </Text>
              ) : null}
              {thread.originThreadInfo.content ? (
                <Text style={[styles.quoteContent, { color: colors.textSecondary }]} numberOfLines={2}>
                  {thread.originThreadInfo.content}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 操作栏：回复 → 分享 → 点赞 */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleReplyPress}
              onPressIn={stopPropagation}
              onPressOut={stopPropagation}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="回复"
            >
              <SymbolView name="bubble.left" size={17} tintColor={colors.textTertiary} />
              <Text style={[styles.actionText, { color: colors.textTertiary }]}>
                {formatCount(thread.replyNum)}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSharePress}
              onPressIn={stopPropagation}
              onPressOut={stopPropagation}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="分享"
            >
              <SymbolView name="square.and.arrow.up" size={17} tintColor={colors.textTertiary} />
              <Text style={[styles.actionText, { color: colors.textTertiary }]}>
                {thread.shareNum && thread.shareNum > 0 ? formatCount(thread.shareNum) : '分享'}
              </Text>
            </Pressable>
            <LikeButton
              liked={!!thread.hasAgree}
              count={thread.zanNum ?? 0}
              onPress={handleLikePress}
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

/** 事件冒泡阻断（子元素按压不触发整卡缩放/点击） */
function stopPropagation(e: GestureResponderEvent) {
  e.stopPropagation?.();
}

// ────────────────────────────────────────────────────────────
// LikeButton — heart 弹簧 pop 动画
// ────────────────────────────────────────────────────────────
const LikeButton = React.memo(function LikeButton({
  liked,
  count,
  onPress,
}: {
  liked: boolean;
  count: number;
  onPress: (e: GestureResponderEvent) => void;
}) {
  const { colors } = useThemeColors();
  const { reduceMotion } = useReducedMotion();
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    if (reduceMotion) return;
    // 弹簧 pop：1 → 1.35 → 1（点赞瞬间的推特式心跳）
    pop.value = withSequence(
      withSpring(1.35, { damping: 12, stiffness: 380, mass: 0.6 }),
      withSpring(1, MOMENTUM),
    );
  }, [pop, reduceMotion]);

  const tintColor = liked ? LIKE_COLOR : colors.textTertiary;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={stopPropagation}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={liked ? '取消点赞' : '点赞'}
    >
      <Animated.View style={popStyle}>
        <SymbolView
          name={liked ? 'heart.fill' : 'heart'}
          size={17}
          tintColor={tintColor}
        />
      </Animated.View>
      <Text style={[styles.actionText, { color: tintColor }]}>
        {count > 0 ? formatCount(count) : '赞'}
      </Text>
    </Pressable>
  );
});

// ────────────────────────────────────────────────────────────
// MediaPager — 卡内多图横向分页 + 页码点（Reanimated 驱动）
// ────────────────────────────────────────────────────────────
interface PagerImage {
  src: string;
  originSrc: string;
  width: number;
  height: number;
}

const DOT_IDLE = 6;
const DOT_ACTIVE = 16;
const DOT_HEIGHT = 4;

const MediaPager = React.memo(function MediaPager({
  images,
  videoPoster,
  width,
  recycleKey,
  onImagePress,
  onFallbackPress,
}: {
  images: PagerImage[];
  videoPoster?: string;
  width: number;
  recycleKey: string;
  onImagePress: (index: number) => void;
  onFallbackPress: () => void;
}) {
  const { isDark } = useThemeColors();
  const scrollRef = useRef<any>(null);
  const scrollX = useSharedValue(0);
  const pageRef = useRef(0);

  // FlashList 回收复用：换帖时重置分页偏移
  useEffect(() => {
    pageRef.current = 0;
    scrollX.value = 0;
    scrollRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [recycleKey, scrollX]);

  const firstRatio = images.length > 0
    ? (images[0].height > 0 && images[0].width > 0 ? images[0].height / images[0].width : 1)
    : 1;
  const ratio = Math.min(MEDIA_RATIO_MAX, Math.max(MEDIA_RATIO_MIN, firstRatio));
  const mediaHeight = Math.round(width * ratio);
  const placeholderBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const handleMomentumEnd = useCallback((e: any) => {
    const w = width || 1;
    pageRef.current = Math.round(e.nativeEvent.contentOffset.x / w);
  }, [width]);

  // ── 单图 / 视频 poster ──
  if (images.length <= 1) {
    const uri = images[0]?.src || videoPoster;
    if (!uri) return null;
    const thumb = thumbnailUrl(uri, THUMB_CARD);
    const isVideo = !images[0] && !!videoPoster;
    return (
      <View style={[styles.mediaWrap, { width, height: mediaHeight, backgroundColor: placeholderBg }]}>
        <Pressable
          onPress={() => (isVideo ? onFallbackPress() : onImagePress(0))}
          onPressIn={stopPropagation}
          onPressOut={stopPropagation}
          accessibilityRole="imagebutton"
          accessibilityLabel={isVideo ? '视频' : '查看图片'}
        >
          <Image
            source={{ uri: thumb }}
            style={{ width, height: mediaHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={thumb}
          />
          {isVideo ? (
            <View style={styles.videoBadge}>
              <SymbolView name="play.fill" size={20} tintColor="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  }

  // ── 多图分页 ──
  return (
    <View style={[styles.mediaWrap, { width, height: mediaHeight, backgroundColor: placeholderBg }]}>
      <Animated.ScrollView
        ref={scrollRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        nestedScrollEnabled
      >
        {images.map((img, i) => {
          const thumb = thumbnailUrl(img.src, THUMB_CARD);
          return (
            <Pressable
              key={`${recycleKey}-${i}`}
              onPress={() => onImagePress(i)}
              onPressIn={stopPropagation}
              onPressOut={stopPropagation}
              accessibilityRole="imagebutton"
              accessibilityLabel={`第${i + 1}张图片`}
            >
              <Image
                source={{ uri: thumb }}
                style={{ width, height: mediaHeight }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                recyclingKey={thumb}
              />
            </Pressable>
          );
        })}
      </Animated.ScrollView>
      {/* 页码点：当前页加宽胶囊，随滚动插值过渡（UI 线程） */}
      <View style={styles.dotsRow} pointerEvents="none">
        {images.map((_, i) => {
          return <PagerDot key={i} index={i} pageWidth={width} scrollX={scrollX} />;
        })}
      </View>
    </View>
  );
});

function PagerDot({ index, pageWidth, scrollX }: { index: number; pageWidth: number; scrollX: SharedValue<number> }) {
  const dotStyle = useAnimatedStyle(() => {
    const progress = scrollX.value / (pageWidth || 1);
    const d = Math.abs(progress - index);
    const w = interpolate(clamp(d, 0, 1), [0, 1], [DOT_ACTIVE, DOT_IDLE]);
    const opacity = interpolate(clamp(d, 0, 1), [0, 1], [1, 0.45]);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, dotStyle]} />;
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // 外层：列表边距 + 卡片间距（替代分割线）
  cardWrap: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    overflow: 'hidden',
  },

  // ── 头部 ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AVATAR_GAP,
  },
  nameCol: {
    flex: 1,
    justifyContent: 'center',
    minHeight: AVATAR_SIZE,
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  handle: {
    fontSize: 15,
    flexShrink: 1,
  },
  time: {
    fontSize: 15,
  },
  forumChip: {
    fontSize: 13,
    fontWeight: '500',
    alignSelf: 'flex-start',
  },
  menuButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 内容列（与名字列对齐） ──
  contentCol: {
    marginLeft: CONTENT_INDENT,
    marginTop: 6,
    gap: 8,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bodyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  textFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
  },
  showMore: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },

  // ── 媒体 ──
  mediaWrap: {
    borderRadius: CARD_RADIUS - 4,
    overflow: 'hidden',
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -22,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: DOT_IDLE,
    height: DOT_HEIGHT,
    borderRadius: DOT_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  // ── 引用帖（转发） ──
  quoteCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    padding: 10,
    gap: 3,
  },
  quoteForum: {
    fontSize: 12,
    fontWeight: '600',
  },
  quoteTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  quoteContent: {
    fontSize: 13,
    lineHeight: 18,
  },

  // ── 操作栏 ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 32,
  },
  actionBtnPressed: {
    opacity: 0.45,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});

export default TweetCard;
