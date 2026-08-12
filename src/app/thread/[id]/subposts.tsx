/**
 * Sub-Posts Page (楼中楼) — Threaded conversation design
 *
 * Design philosophy: between flat list and heavy cards.
 * - No card borders or shadows (too cluttered)
 * - No plain flat list (too boring)
 * - Instead: subtle left accent bar + generous spacing + light hover tint
 * - Typography-driven hierarchy with inline metadata
 * - Smooth fade-in animation for lazy-loaded items
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, StyleSheet, Pressable, Text, useWindowDimensions,
  RefreshControl, Alert,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle, withTiming, withDelay, useSharedValue,
} from 'react-native-reanimated';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticImpact, hapticNotify, ImpactFeedbackStyle, NotificationFeedbackType } from '@/utils/haptics';
import * as Clipboard from 'expo-clipboard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useThemeColors } from '@/theme/ThemeContext';
import { EASE_OUT, DURATION } from '@/theme/springs';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAuthStore } from '@/stores/authStore';
import { flattenStyle, contentToText, relativeTime, formatCount, getLevelColor } from '@/utils';
import { openLink } from '@/utils/linkOpener';
import { pbFloor, agree, checkReportPost, delPost } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { SkeletonList } from '../../../../components/ui/Skeleton';
import { TiebaRichText } from '../../../../modules/tieba-native/src/TiebaRichText';
import { contentToRichTextRuns } from '@/utils/richTextRuns';
import type { SubPostInfo } from '@/types';

const subPostKeyExtractor = (item: SubPostInfo) => item.id;

const SUBPOST_LIST_OVERRIDES = { initialDrawBatchSize: 10 };

/** Extract image URLs from sub-post content */
function extractImages(content: SubPostInfo['content']): string[] {
  if (!content) return [];
  return content
    .filter((c) => c.type === 'image')
    .map((c) => (c as any).src || (c as any).cdnSrc || '')
    .filter(Boolean);
}

/** Inline sub-post content with tappable @mentions, links, and topics. */
function InlinePostContent({
  content,
  colors,
}: {
  content: SubPostInfo['content'];
  colors: any;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const runs = useMemo(() => contentToRichTextRuns(content), [content]);
  if (!content || content.length === 0) {
    return <Text style={[s.inlineText, { color: colors.textDisabled }]}>[内容已删除]</Text>;
  }
  return (
    <TiebaRichText
      runs={runs}
      contentWidth={Math.max(0, width - 55)}
      fontSize={15}
      lineHeight={22}
      textColor={colors.text}
      linkColor={colors.primary}
      onLinkPress={(url) => openLink(url)}
      onUserPress={(uid) => router.push(`/user/${uid}`)}
      onTopicPress={(topicId, topicName) =>
        router.push(`/topic/${topicId}?name=${encodeURIComponent(topicName)}`)
      }
    />
  );
}

// ─── Animated Reply Item ───
const ReplyItem = React.memo(function ReplyItem({
  item,
  index,
  colors,
  threadAuthorId,
  onAgree,
  animateIn,
  isOwn,
  onReport,
  onDelete,
}: {
  item: SubPostInfo;
  index: number;
  colors: any;
  threadAuthorId?: string;
  onAgree: (item: SubPostInfo) => void;
  animateIn: boolean;
  isOwn: boolean;
  onReport: (item: SubPostInfo) => void;
  onDelete: (item: SubPostInfo) => void;
}) {
  const router = useRouter();
  const { reduceMotion } = useReducedMotion();
  // Reanimated shared value — only the first loaded batch fades in with a
  // stagger; paginated/recycled rows stay opaque (effect self-corrects).
  const fade = useSharedValue(animateIn && !reduceMotion ? 0 : 1);
  const isLz = !!(threadAuthorId && item.authorId === threadAuthorId);
  const hasLevel = (item.authorLevelId ?? 0) > 0;
  const images = extractImages(item.content);

  useEffect(() => {
    if (!animateIn || reduceMotion) {
      fade.value = 1;
      return;
    }
    fade.value = withDelay(index * DURATION.stagger, withTiming(1, {
      duration: DURATION.enter,
      easing: EASE_OUT,
    }));
  }, [animateIn, index, fade, reduceMotion]);

  // ── Native long-press menu (MenuView) ──
  const menuActions = useMemo<MenuAction[]>(() => {
    const actions: MenuAction[] = [
      { id: 'copy', title: '复制内容', image: 'doc.on.doc' },
      { id: 'user', title: '查看用户', image: 'person.fill' },
      { id: 'report', title: '举报', image: 'exclamationmark.bubble', attributes: { destructive: true } },
    ];
    if (isOwn) {
      actions.push({ id: 'delete', title: '删除', image: 'trash', attributes: { destructive: true } });
    }
    return actions;
  }, [isOwn]);

  const handleMenuAction = useCallback((event: string) => {
    hapticImpact(ImpactFeedbackStyle.Medium);
    switch (event) {
      case 'copy':
        Clipboard.setStringAsync(contentToText(item.content) || '[内容已删除]');
        break;
      case 'user':
        router.push({ pathname: '/user/[uid]', params: { uid: item.authorId } });
        break;
      case 'report':
        onReport(item);
        break;
      case 'delete':
        onDelete(item);
        break;
    }
  }, [item, onReport, onDelete, router]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 8 }],
  }));

  return (
    <Reanimated.View style={animatedStyle}>
      <MenuView actions={menuActions} onPressAction={(e) => handleMenuAction(e.nativeEvent.event)}>
        <Pressable
          delayLongPress={400}
          style={({ pressed }) => [
            s.item,
            pressed && { backgroundColor: colors.surfaceSecondary },
          ]}
        >
        {/* Left accent bar */}
        <View style={[s.accentBar, { backgroundColor: isLz ? colors.primary : colors.separator }]} />

        {/* Main content area */}
        <View style={s.itemContent}>
          {/* Row 1: Avatar + Name + Badges */}
          <View style={s.headerRow}>
            <Link
              href={{ pathname: '/user/[uid]', params: { uid: item.authorId } }}
              push
              asChild
            >
              <Pressable style={s.avatarNameRow}>
                <Avatar
                  source={item.authorPortrait}
                  initials={item.authorName?.slice(0, 2)}
                  size={28}
                />
                <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                  {item.authorNameShow || item.authorName}
                </Text>
              </Pressable>
            </Link>

            {hasLevel && (
              <View style={[s.levelChip, { backgroundColor: getLevelColor(item.authorLevelId ?? 0) + '20' }]}>
                <Text style={[s.levelChipText, { color: getLevelColor(item.authorLevelId ?? 0) }]}>
                  Lv.{item.authorLevelId}
                </Text>
              </View>
            )}
            {isLz && (
              <View style={[s.lzChip, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[s.lzChipText, { color: colors.primary }]}>楼主</Text>
              </View>
            )}

            <View style={s.spacer} />

            {/* Time + IP inline */}
            <Text style={[s.meta, { color: colors.textTertiary }]} numberOfLines={1}>
              {relativeTime(item.createTime)}
              {item.ipLocation ? ` · ${item.ipLocation}` : ''}
            </Text>
          </View>

          {/* Row 2: Reply-to reference (if any) */}
          {item.replyToUserName ? (
            <View style={[s.replyChip, { backgroundColor: colors.primary + '08' }]}>
              <SymbolView name="arrow.turn.up.left" size={11} tintColor={colors.primary} />
              <Text style={[s.replyChipText, { color: colors.primary }]}>
                {item.replyToUserName}
              </Text>
            </View>
          ) : null}

          {/* Row 3: Content */}
          <View style={s.content}>
            <InlinePostContent content={item.content} colors={colors} />
          </View>

          {/* Row 3.5: Images */}
          {images.length > 0 && (
            <View style={s.imageRow}>
              {/* C8: subpost media caps at 3 thumbnails with a +N chip. */}
              {images.slice(0, 3).map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={s.thumbImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                />
              ))}
              {images.length > 3 && (
                <View style={[s.thumbImage, s.moreImagesBadge]}>
                  <Text style={s.moreImagesText}>+{images.length - 3}</Text>
                </View>
              )}
            </View>
          )}

          {/* Row 4: Actions (minimal) */}
          <View style={s.actionsRow}>
            <Pressable
              onPress={() => onAgree(item)}
              style={({ pressed }) => [
                s.agreeBtn,
                pressed && { opacity: 0.6 },
              ]}
              hitSlop={8}
            >
              <SymbolView
                name={item.isAgree ? 'heart.fill' : 'heart'}
                size={14}
                tintColor={item.isAgree ? colors.primary : colors.textTertiary}
              />
              {(item.agreeNum ?? 0) > 0 && (
                <Text style={[s.agreeCount, { color: item.isAgree ? colors.primary : colors.textTertiary }]}>
                  {formatCount(item.agreeNum ?? 0)}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Pressable>
      </MenuView>
    </Reanimated.View>
  );
});

// ─── Main Page ───
export default function SubPostsPage() {
  const { threadId, postId, forumId, floor, threadAuthorId, forumName, threadTitle } = useLocalSearchParams<{
    threadId: string; postId: string; forumId: string; floor: string; threadAuthorId?: string;
    forumName?: string; threadTitle?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const accountUid = useAuthStore((s) => s.account?.uid);
  const paged = usePagedList<SubPostInfo>({
    fetcher: async (page, _params, signal) => {
      const data = await pbFloor(threadId, postId, forumId, page, undefined, signal);
      return {
        items: data.posts,
        hasMore: data.page.hasMore,
        nextPage: data.page.current + 1,
        extra: data.page,
      };
    },
    initialPage: 1,
  });
  const {
    items: subPosts,
    hasMore,
    refreshing,
    loadingMore,
    loading,
    error,
    refresh: handleRefresh,
    loadMore: handleLoadMore,
    load,
    setItems: setSubPosts,
  } = paged;
  // C5: only the first loaded batch gets the fade-in; paginated rows render opaque.
  const initialBatchIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    if (!initialBatchIdsRef.current && subPosts.length > 0) {
      initialBatchIdsRef.current = new Set(subPosts.map((p) => p.id));
    }
  }, [subPosts]);

  const handleAgree = useCallback(
    async (item: SubPostInfo) => {
      if (!threadId || !item.id) return;
      try {
        hapticImpact(ImpactFeedbackStyle.Light);
        await agree(threadId, item.id, item.isAgree ? 0 : 1);
      } catch { /* silently fail */ }
    },
    [threadId],
  );

  const safeDecode = (value?: string) => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const decodedForumName = safeDecode(forumName);
  const decodedThreadTitle = safeDecode(threadTitle);

  const handleReport = useCallback(
    async (item: SubPostInfo) => {
      try {
        const reportUrl = await checkReportPost(item.id);
        if (reportUrl) {
          await openLink(reportUrl);
        } else {
          Alert.alert('提示', '当前回复不支持在线举报');
        }
      } catch {
        Alert.alert('错误', '举报失败');
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (item: SubPostInfo) => {
      Alert.alert('删除回复', '确定要删除这条回复吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await delPost(forumId || '', decodedForumName, threadId || '', item.id, false);
              setSubPosts((prev) => prev.filter((p) => p.id !== item.id));
              hapticNotify(NotificationFeedbackType.Success);
            } catch {
              Alert.alert('错误', '删除失败');
            }
          },
        },
      ]);
    },
    [forumId, decodedForumName, threadId, setSubPosts],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SubPostInfo; index: number }) => (
      <ReplyItem
        item={item}
        index={index}
        colors={colors}
        threadAuthorId={threadAuthorId}
        onAgree={handleAgree}
        animateIn={initialBatchIdsRef.current?.has(item.id) ?? false}
        isOwn={!!accountUid && accountUid === item.authorId}
        onReport={handleReport}
        onDelete={handleDelete}
      />
    ),
    [colors, threadAuthorId, handleAgree, accountUid, handleReport, handleDelete],
  );

  const mainPostCard = useMemo(
    () => (
      <View style={[s.mainPostCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <Text style={[s.mainPostLabel, { color: colors.textTertiary }]}>主楼</Text>
        {decodedThreadTitle ? (
          <Text style={[s.mainPostTitle, { color: colors.text }]} numberOfLines={2}>
            {decodedThreadTitle}
          </Text>
        ) : (
          <Text style={[s.mainPostTitle, { color: colors.text }]}>
            {decodedForumName || '原帖'} · 第{floor || '?'}楼回复
          </Text>
        )}
        {decodedForumName ? (
          <Text style={[s.mainPostMeta, { color: colors.textTertiary }]}>
            {decodedForumName} · 第{floor || '?'}楼回复
          </Text>
        ) : null}
        <Link href={{ pathname: '/thread/[id]', params: { id: threadId } }} push asChild>
          <Pressable style={({ pressed }) => [s.openThreadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}>
            <Text style={s.openThreadText}>打开原帖</Text>
          </Pressable>
        </Link>
      </View>
    ),
    [colors, decodedForumName, decodedThreadTitle, floor, threadId],
  );

  const renderFooter = useMemo(
    () => (
      <LoadMoreFooter
        hasMore={hasMore}
        loading={loadingMore}
        colors={colors}
        onLoadMore={handleLoadMore}
      />
    ),
    [hasMore, loadingMore, colors, handleLoadMore],
  );

  // States
  if (loading && subPosts.length === 0) {
    return (
      <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: `第${floor}楼回复` }} />
        <View style={s.loadingSkeleton}>
          <SkeletonList count={8} variant="row" />
        </View>
      </View>
    );
  }
  if (error && subPosts.length === 0) {
    return (
      <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: `第${floor}楼回复` }} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </View>
    );
  }

  return (
    <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
      <Stack.Screen options={{ title: `第${floor || '?'}楼回复` }} />
      <FlashList
        data={subPosts}
        keyExtractor={subPostKeyExtractor}
        decelerationRate="normal"
        renderItem={renderItem}
        estimatedItemSize={160}
        ListHeaderComponent={mainPostCard}
        ListEmptyComponent={<EmptyState title="暂无回复" description="还没有楼中楼回复" icon="bubble.left" />}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        drawDistance={500}
        maxItemsInRecyclePool={24}
        overrideProps={SUBPOST_LIST_OVERRIDES}
        ListFooterComponent={renderFooter}
      />
      {/* C4: pbFloor only returns current/total/hasMore (no hasPrev), so
          "上一页/最新回复" controls are intentionally omitted until the
          service exposes a previous-page flag. */}
    </View>
  );
}

// ─── Styles ───
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingSkeleton: { flex: 1, paddingTop: 8 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Main-post card at the top of the sub-post page
  mainPostCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  mainPostLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  mainPostTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  mainPostMeta: {
    fontSize: 12,
  },
  openThreadBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 6,
  },
  openThreadText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  inlineText: {
    fontSize: 15,
    lineHeight: 22,
  },

  // Item container
  item: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginVertical: 2,
  },

  // Left accent bar — thin, subtle visual anchor
  accentBar: {
    width: 3,
    borderRadius: 1.5,
    marginRight: 12,
    alignSelf: 'stretch',
  },

  // Content wrapper
  itemContent: {
    flex: 1,
  },

  // Header row: avatar + name + badges + time
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avatarNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  levelChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  levelChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  lzChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  lzChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  spacer: { flex: 1 },
  meta: {
    fontSize: 11,
    flexShrink: 0,
  },

  // Reply-to chip
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  replyChipText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Content text
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },

  // Image thumbnails
  imageRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  thumbImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  moreImagesBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreImagesText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  agreeCount: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Footer
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  footerEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  endLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
