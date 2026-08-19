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
  RefreshControl, Alert, ScrollView,
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
import { hapticForScene } from '@/theme/hapticsMap';
import * as Clipboard from 'expo-clipboard';
import { Avatar } from '@/components/ui/Avatar';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useThemeColors } from '@/theme/ThemeContext';
import { EASE_OUT, DURATION } from '@/theme/springs';
import { Radius } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAuthStore } from '@/stores/authStore';
import { flattenStyle, contentToText, relativeTime, formatCount, getLevelColor } from '@/utils';
import { openLink } from '@/utils/linkOpener';
import { pbFloor, agree, checkReportPost, delPost } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { useImageViewer } from '@/hooks/useImageViewer';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { SkeletonList } from '@/components/ui/Skeleton';
import { TiebaRichText } from '../../../../modules/tieba-native/src/TiebaRichText';
import { contentToRichTextRuns } from '@/utils/richTextRuns';
import { thumbnailUrl, THUMB_CARD } from '@/utils/thumbnail';
import ImageViewer from '@/components/ImageViewer';
import { getParentPostSummary, type ParentPostSummary } from '@/stores/parentPostCache';
import type { SubPostInfo } from '@/types';

const subPostKeyExtractor = (item: SubPostInfo) => item.id;

const SUBPOST_LIST_OVERRIDES = { initialDrawBatchSize: 10 };

/** Extract image URLs from sub-post content (normalized to https) */
function extractImages(content: SubPostInfo['content']): string[] {
  if (!content) return [];
  return content
    .filter((c) => c && c.type === 'image')
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
  onImagePress,
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
  onImagePress: (images: string[], index: number) => void;
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
    hapticForScene('press');
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

          {/* Row 3.5: Images — P0: 楼中楼图片接入 ImageViewer 大图查看器。
              收集该楼全部图片 URL，点击任一张（含 +N 徽标）打开大图，
              初始定位到对应下标；分页/回收复用的行也能正常打开。 */}
          {images.length > 0 && (
            <View style={s.imageRow}>
              {/* C8: subpost media caps at 3 thumbnails with a +N chip.
                  80pt 缩略图走服务端 200px 缩略（原图可达数 MB，
                  楼中楼多图时内存/流量浪费严重）。 */}
              {images.slice(0, 3).map((uri, i) => (
                <Pressable
                  key={i}
                  onPress={() => onImagePress(images, i)}
                  style={({ pressed }) => [
                    s.thumbImage,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`查看第${i + 1}张图片`}
                >
                  <Image
                    source={{ uri: thumbnailUrl(uri, THUMB_CARD) }}
                    style={s.thumbImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                  />
                </Pressable>
              ))}
              {images.length > 3 && (
                <Pressable
                  onPress={() => onImagePress(images, 3)}
                  style={({ pressed }) => [
                    s.thumbImage,
                    s.moreImagesBadge,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="查看全部图片"
                >
                  <Text style={s.moreImagesText}>+{images.length - 3}</Text>
                </Pressable>
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

// ─── 上一级回复卡（ListHeader） ───
// 用户从帖子页点「查看更多回复」时被点击的回复会经 parentPostCache 快照过来。
// 这里展示它的完整内容（作者 + 富文本 + 图片），再下面是楼中楼列表。
function ParentReplyCard({
  parent,
  colors,
  floor,
  decodedForumName,
  decodedThreadTitle,
  threadId,
  onImagePress,
}: {
  parent: ParentPostSummary;
  colors: any;
  floor?: string;
  decodedForumName: string;
  decodedThreadTitle: string;
  threadId?: string;
  onImagePress: (images: string[], index: number) => void;
}) {
  const images = extractImages(parent.content);

  return (
    <View style={[s.mainPostCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <Text style={[s.mainPostLabel, { color: colors.textTertiary }]}>上一级回复</Text>

      {/* 作者行：头像 + 昵称 + 楼主徽标 + 时间 */}
      <View style={s.headerRow}>
        <Link href={{ pathname: '/user/[uid]', params: { uid: parent.authorId } }} push asChild>
          <Pressable style={s.avatarNameRow}>
            <Avatar
              source={parent.authorPortrait}
              initials={parent.authorName?.slice(0, 2)}
              size={30}
            />
            <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
              {parent.authorNameShow || parent.authorName}
            </Text>
          </Pressable>
        </Link>
        {!!parent.authorIsLz && (
          <View style={[s.lzChip, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[s.lzChipText, { color: colors.primary }]}>楼主</Text>
          </View>
        )}
        <View style={s.spacer} />
        <Text style={[s.meta, { color: colors.textTertiary }]} numberOfLines={1}>
          {relativeTime(parent.createTime)}
          {parent.ipLocation ? ` · ${parent.ipLocation}` : ''}
        </Text>
      </View>

      {/* 正文全文（原生富文本渲染 @/链接/表情） */}
      <View style={s.content}>
        <InlinePostContent content={parent.content} colors={colors} />
      </View>

      {/* 图片：横向缩略图滑动条 */}
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.parentImageStrip}
        >
          {images.map((uri, i) => (
            <Pressable
              key={i}
              onPress={() => onImagePress(images, i)}
              style={({ pressed }) => [s.thumbImage, { opacity: pressed ? 0.75 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`查看第${i + 1}张图片`}
            >
              <Image
                source={{ uri: thumbnailUrl(uri, THUMB_CARD) }}
                style={s.thumbImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={uri}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* 底部：帖子标题归属 + 打开原帖 */}
      <View style={s.parentFooter}>
        <Text style={[s.parentFloor, { color: colors.textTertiary }]} numberOfLines={2}>
          {decodedThreadTitle || decodedForumName || '原帖'} · 第{floor || '?'}楼回复
        </Text>
        <Link href={{ pathname: '/thread/[id]', params: { id: threadId ?? '' } }} push asChild>
          <Pressable style={({ pressed }) => [s.openThreadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}>
            <Text style={[s.openThreadText, { color: colors.textOnPrimary }]}>打开原帖</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

// ─── Main Page ───
export default function SubPostsPage() {
  const { threadId, postId, forumId, floor, threadAuthorId, forumName, threadTitle } = useLocalSearchParams<{
    threadId: string; postId: string; forumId: string; floor: string; threadAuthorId?: string;
    forumName?: string; threadTitle?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const accountUid = useAuthStore((s) => s.account?.uid);
  const imageViewer = useImageViewer();
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
      // 乐观更新：成功前就切换 UI（贴吧点赞是幂等操作），
      // 失败回滚 —— 旧实现无任何反馈，点了像没反应。
      const wasAgree = item.isAgree;
      const nextAgree = !wasAgree;
      hapticForScene('like');
      setSubPosts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                isAgree: nextAgree,
                agreeNum: Math.max(0, (p.agreeNum ?? 0) + (nextAgree ? 1 : -1)),
              }
            : p,
        ),
      );
      try {
        await agree(threadId, item.id, nextAgree ? 1 : 0);
      } catch {
        // 失败回滚
        hapticForScene('action-fail');
        setSubPosts((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  isAgree: wasAgree,
                  agreeNum: Math.max(0, (p.agreeNum ?? 0) + (wasAgree ? 1 : -1)),
                }
              : p,
          ),
        );
      }
    },
    [threadId, setSubPosts],
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
              hapticForScene('action-success');
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
        onImagePress={imageViewer.handleImagePress}
      />
    ),
    [colors, threadAuthorId, handleAgree, accountUid, handleReport, handleDelete, imageViewer.handleImagePress],
  );

  // 上一级回复：从模块级缓存取回被点击的那条回复（帖子页跳转前快照）。
  // 未命中（如整包 reload 后直接深链进入）时回退展示原"主楼/帖子标题"卡。
  const parentPost = useMemo(() => getParentPostSummary(postId), [postId]);

  const mainPostCard = useMemo(
    () => {
      // 有上一级回复快照 → 展示它（否则只会看到楼中楼列表，缺少上下文）
      if (parentPost) {
        return (
          <ParentReplyCard
            parent={parentPost}
            colors={colors}
            floor={floor}
            decodedForumName={decodedForumName}
            decodedThreadTitle={decodedThreadTitle}
            threadId={threadId}
            onImagePress={imageViewer.handleImagePress}
          />
        );
      }
      return (
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
              <Text style={[s.openThreadText, { color: colors.textOnPrimary }]}>打开原帖</Text>
            </Pressable>
          </Link>
        </View>
      );
    },
    [parentPost, colors, decodedForumName, decodedThreadTitle, floor, threadId, imageViewer.handleImagePress],
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
      <ThemedHost style={{ flex: 1 }}>
        <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
          <Stack.Screen options={{ title: `第${floor}楼回复` }} />
          <View style={s.loadingSkeleton}>
            <SkeletonList count={8} variant="row" />
          </View>
        </View>
      </ThemedHost>
    );
  }
  if (error && subPosts.length === 0) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
          <Stack.Screen options={{ title: `第${floor}楼回复` }} />
          <ErrorState message={error} onRetry={handleRefresh} />
        </View>
      </ThemedHost>
    );
  }

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={flattenStyle([s.container, { backgroundColor: colors.background }])}>
      <Stack.Screen options={{ title: `第${floor || '?'}楼回复` }} />
      <FlashList
        data={subPosts}
        keyExtractor={subPostKeyExtractor}
        decelerationRate="normal"
        renderItem={renderItem}
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
      {/* 楼中楼大图查看器（窗口化 + 低功耗 windowSize 2 + 关闭清缓存，
          由 ImageViewer 内部实现，接入模式与 thread/[id].tsx 一致） */}
      <ImageViewer
        images={imageViewer.imageViewerImages}
        initialIndex={imageViewer.imageViewerIndex}
        visible={imageViewer.imageViewerVisible}
        onClose={imageViewer.closeImageViewer}
        forumName={decodedForumName}
      />
      </View>
    </ThemedHost>
  );
}

// ─── Styles ───
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingSkeleton: { flex: 1, paddingTop: 8 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Main-post card at the top of the sub-post page
  mainPostCard: {
    borderRadius: Radius.card,
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
  parentImageStrip: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    paddingVertical: 2,
  },
  parentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  parentFloor: {
    fontSize: 12,
    flexShrink: 1,
  },
  openThreadBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 6,
  },
  openThreadText: {
    // color 走 colors.textOnPrimary（组件内动态注入）
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
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginVertical: 1,
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
    marginBottom: 4,
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
    marginBottom: 4,
  },
  replyChipText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Content text
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },

  // Image thumbnails
  imageRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
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
