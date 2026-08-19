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
  Alert,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withSequence,
  clamp,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { MOMENTUM } from '@/theme/springs';
import { Radius, Shadows } from '@/theme/spacing';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppPreference } from '@/hooks/useAppPreference';
import { formatCount, relativeTime } from '@/utils';
import { thumbnailUrl, THUMB_POST, pickViewerImages } from '@/utils/thumbnail';
import type { ThreadInfo } from '@/types';

// ── 设计常量（推特 timeline 规格） ──
const AVATAR_SIZE = 44;
const AVATAR_GAP = 10;
/** 内容列缩进：与名字列对齐（推特 timeline 布局） */
const CONTENT_INDENT = AVATAR_SIZE + AVATAR_GAP;
/** 卡片圆角：统一 Radius.card（与 FeedCard/PostCard 卡片容器一致） */
const CARD_RADIUS = Radius.card;
/** 长文截断行数（推特 Show more 阈值） */
const COLLAPSE_LINES = 6;
/** 正文行高（标题 22 / 摘要 21，测量阈值取标题行高） */
const BODY_LINE_HEIGHT = 22;
/** 超过该高度判定为可截断长文（≈6 行）；onLayout 实测整段自然高度，避免
    numberOfLines + onTextLayout 在 iOS 上对短文误报"可展开"（点了没变化的根因） */
const COLLAPSE_MEASURE_THRESHOLD = COLLAPSE_LINES * BODY_LINE_HEIGHT + 1;
/** 媒体区高度钳制：长图全显不截断（contain），超高则限制高度防撑爆卡片 */
const MEDIA_HEIGHT_MIN = 200;
const MEDIA_HEIGHT_MAX = 520;
const LIKE_COLOR = '#FF3B5C';

export type TweetCardMenuAction = 'dislike' | 'block' | 'copy-title' | 'report';

export interface TweetCardProps {
  thread: ThreadInfo;
  /** 头部时间字段：create = 发帖时间（按发帖时间排序/动态流）；last = 最后回复时间（按回复时间排序） */
  timeType?: 'create' | 'last';
  /** 右上角 × 的菜单项（默认 屏蔽作者/举报；动态流传扩展项保留 不感兴趣/复制标题） */
  closeMenuOptions?: ('dislike' | 'block' | 'copy-title' | 'report')[];
  onImagePress?: (images: string[], index: number) => void;
  onLike?: (thread: ThreadInfo) => void;
  onShare?: (thread: ThreadInfo) => void;
  /** 提供时显示右上角「×」菜单，回传所属帖子 */
  onMenuAction?: (action: TweetCardMenuAction, thread: ThreadInfo) => void;
}

const TweetCard = React.memo(function TweetCard({
  thread,
  timeType = 'create',
  closeMenuOptions,
  onImagePress,
  onLike,
  onShare,
  onMenuAction,
}: TweetCardProps) {
  const { colors } = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const hideMedia = useAppPreference('hideMedia');
  const dataSaverMode = useAppPreference('dataSaverMode', 'off') ?? 'off';

  // 卡片内容宽度：屏宽 - 列表左右边距 16*2 - 卡片左右 padding 12*2
  const contentWidth = screenWidth - 16 * 2 - 12 * 2;
  // 媒体区位于内容列（marginLeft = CONTENT_INDENT 54pt）内：
  // 宽度必须再减去缩进，否则媒体右边界 = 缩进 + 整卡内容宽 > 屏宽，
  // 右侧（含圆角）被溢出裁掉（真机实测"图片右侧被截断/看不出右圆角"）。
  const mediaWidth = Math.max(0, contentWidth - CONTENT_INDENT);

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

  // ── 长文展开（回收时按 thread.id 重置） ──
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setTruncatable(false);
  }, [thread.id]);

  // 用 onLayout 实测整段文本的自然高度判断是否超过 6 行：
  // iOS 上 numberOfLines + onTextLayout 会把截断后的可见行数报上来（短文
  // 恰好 6 行/截断后 6 行区分不出来），导致短文误显示"显示更多"、点击后内容
  // 不变。这里在未截断时先渲染完整文本量一次高度，超过阈值才启用截断态。
  const handleBodyLayout = useCallback((e: any) => {
    if (e.nativeEvent?.layout?.height > COLLAPSE_MEASURE_THRESHOLD) {
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
      onImagePress(pickViewerImages(images, dataSaverMode), index);
    },
    [onImagePress, images, handleCardPress, dataSaverMode],
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

  // ── 右上角小 ×：按 closeMenuOptions 组装（默认 屏蔽/举报）──
  const handleClosePress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    hapticForScene('press');
    const options = closeMenuOptions ?? ['block', 'report'];
    const items: { title: string; action: TweetCardMenuAction }[] = [];
    if (options.includes('dislike')) items.push({ title: '不感兴趣', action: 'dislike' });
    if (options.includes('block')) items.push({ title: '屏蔽作者', action: 'block' });
    if (options.includes('report')) items.push({ title: '举报', action: 'report' });
    if (options.includes('copy-title')) items.push({ title: '复制标题', action: 'copy-title' });
    Alert.alert(thread.title || '帖子', undefined, [
      ...items.map((it) => ({ text: it.title, onPress: () => onMenuAction?.(it.action, thread) })),
      { text: '取消', style: 'cancel' as const },
    ]);
  }, [thread, onMenuAction, closeMenuOptions]);

  // ── 头部文案 ──
  const displayName = thread.authorNameShow || thread.authorName || '吧友';
  const rawName = thread.authorName || '';
  const showHandle = !!rawName && rawName !== displayName;
  const timeValue = timeType === 'last' ? thread.lastTime : thread.createTime;
  const timeText = timeValue ? relativeTime(timeValue) : '';

  const cardBorderColor = colors.borderCard;

  return (
    <View style={styles.cardWrap}>
      <Pressable
        onPress={handleCardPress}
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
          </View>
          {onMenuAction ? (
            /* 右上角小 ×（屏蔽/举报，按 closeMenuOptions 扩展） */
            <Pressable
              onPress={handleClosePress}
              onPressIn={stopPropagation}
              onPressOut={stopPropagation}
              style={styles.closeButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="屏蔽或举报"
            >
              <SymbolView name="xmark" size={13} weight="bold" tintColor={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {/* ── 内容列（与名字列对齐） ── */}
        <View style={styles.contentCol}>
          {/* 正文：标题(粗体) + 摘要 同一块，超行截断 + 显示更多（无背景） */}
          {thread.title || thread.abstract ? (
            <View>
              <Text
                style={[styles.bodyText, { color: colors.text }]}
                onLayout={truncatable || expanded ? undefined : handleBodyLayout}
                numberOfLines={truncatable && !expanded ? COLLAPSE_LINES : undefined}
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
                <Pressable
                  onPress={handleShowMore}
                  onPressIn={stopPropagation}
                  onPressOut={stopPropagation}
                  hitSlop={6}
                  style={styles.showMoreBtn}
                >
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
              width={mediaWidth}
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
    </View>
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

/** 多图分页统一显示高度（不再随首图比例伸缩，避免横+竖混排时被撑大） */
const MULTI_MEDIA_HEIGHT = 260;
/** 宽高比（h/w）超过该值视为竖长图 → 右下角“长图”徽标（对齐 Kotlin） */
const LONG_IMAGE_RATIO = 2.4;

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
  const [pageIndex, setPageIndex] = useState(0);

  // FlashList 回收复用：换帖时重置分页偏移
  useEffect(() => {
    setPageIndex(0);
    scrollX.value = 0;
    scrollRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [recycleKey, scrollX]);

  // 按首图原始宽高比计算高度（宽度固定）→ 图片完整显示不截断；
  // 超高（竖长截图）钳制在 MEDIA_HEIGHT_MAX 内，配合 contain 防越界。
  const firstRatio = images.length > 0
    ? (images[0].height > 0 && images[0].width > 0 ? images[0].height / images[0].width : 1)
    : 1;
  const mediaHeight = Math.round(clamp(width / Math.max(firstRatio, 0.01), MEDIA_HEIGHT_MIN, MEDIA_HEIGHT_MAX));
  const placeholderBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const handleMomentumEnd = useCallback((e: any) => {
    const w = width || 1;
    setPageIndex(Math.round(e.nativeEvent.contentOffset.x / w));
  }, [width]);

  // ── 单图 / 视频 poster ──
  if (images.length <= 1) {
    const uri = images[0]?.src || videoPoster;
    if (!uri) return null;
    const thumb = thumbnailUrl(uri, THUMB_POST);
    const isVideo = !images[0] && !!videoPoster;
    const img0 = images[0];
    const isLong = !!img0 && img0.height > 0 && img0.width > 0 && img0.height / img0.width > LONG_IMAGE_RATIO;
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
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={thumb}
          />
          {isVideo ? (
            <View style={styles.videoBadge}>
              <SymbolView name="play.fill" size={20} tintColor="#FFFFFF" />
            </View>
          ) : null}
          {!isVideo && isLong ? (
            <View style={styles.longBadge} pointerEvents="none">
              <SymbolView name="arrow.down" size={10} tintColor="#FFFFFF" />
              <Text style={styles.longBadgeText}>长图</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  }

  // ── 多图分页 ──
  // 横+竖图混排时统一用固定显示高度（MULTI_MEDIA_HEIGHT）+ contain：
  // 每张图在框内完整显示（竖图缩小、横图不撑爆），区域高度稳定不跳动。
  const multiHeight = MULTI_MEDIA_HEIGHT;
  return (
    <View style={[styles.mediaWrap, { width, height: multiHeight, backgroundColor: placeholderBg }]}>
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
          const thumb = thumbnailUrl(img.src, THUMB_POST);
          const isLong = img.height > 0 && img.width > 0 && img.height / img.width > LONG_IMAGE_RATIO;
          return (
            <View key={`${recycleKey}-${i}`} style={{ width, height: multiHeight }}>
              <Pressable
                onPress={() => onImagePress(i)}
                onPressIn={stopPropagation}
                onPressOut={stopPropagation}
                accessibilityRole="imagebutton"
                accessibilityLabel={`第${i + 1}张图片`}
                style={{ width, height: multiHeight, justifyContent: 'center', alignItems: 'center' }}
              >
                <Image
                  source={{ uri: thumb }}
                  style={{ width, height: multiHeight }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={200}
                  recyclingKey={thumb}
                />
                {isLong ? (
                  <View style={styles.longBadge} pointerEvents="none">
                    <SymbolView name="arrow.down" size={10} tintColor="#FFFFFF" />
                    <Text style={styles.longBadgeText}>长图</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </Animated.ScrollView>
      {/* 页码胶囊：右下角显示 “当前/总数”（替代圆点，直观显示发了几张图） */}
      <View style={styles.pageBadge} pointerEvents="none">
        <Text style={styles.pageBadgeText}>
          {Math.min(Math.max(pageIndex + 1, 1), images.length)}/{images.length}
        </Text>
      </View>
    </View>
  );
});

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

  // ── 内容列（与名字列对齐） ──
  contentCol: {
    marginLeft: CONTENT_INDENT,
    marginTop: 2,
    gap: 6,
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
  showMoreBtn: {
    marginTop: 2,
  },
  showMore: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.14)',
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
  /* 长图徽标：右下角深色胶囊（对齐 Kotlin 长图右下角标识） */
  longBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  longBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  /* 页码胶囊：右下角 "n/m" 指示发图总数 */
  pageBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
