// ============================================================
// TiebaLite React Native - Favorite Threads Page (我的收藏)
// FlatList of favorite threads with pull-to-refresh, infinite
// scroll, and swipe-to-remove, matching
// com.huanchengfly.tieba.post.ui.page.ThreadStorePage

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticNotify, NotificationFeedbackType } from '@/utils/haptics';
import { hapticForScene } from '@/theme/hapticsMap';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { VStack, Spacer, ContentUnavailableView, Button as SwiftButton, Label } from '@expo/ui/swift-ui';
import { buttonStyle, buttonBorderShape } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing, typographyStyles } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { threadStore, removeStore } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { relativeTime, formatCount } from '@/utils';
import type { FavoriteThread } from '@/types';

// threadStore 映射前原始项以 tid 承载收藏 ID（item.id 全为 undefined），
// 映射后为 camelCase id；两者都缺失时回退索引保证 FlashList key 稳定唯一。
const favoriteKeyExtractor = (item: any, index: number) =>
  String(item.id ?? item.tid ?? item.threadId ?? index);

const FAVORITE_MENU_ACTIONS: MenuAction[] = [
  { id: 'remove', title: '取消收藏', image: 'star.slash', attributes: { destructive: true } },
];

/** threadStore 时间戳容错：映射后 camelCase 毫秒，未映射 snake_case 秒 → 统一毫秒 */
function storeTimestamp(item: any): number {
  const raw = item.updateTime ?? item.update_time ?? item.collectTime ?? item.collect_time;
  const t = Number(raw);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t >= 1e11 ? t : t * 1000;
}

const FavoriteRowSeparator = () => <View style={styles.favSeparator} />;

const FAVORITE_LIST_OVERRIDES = { initialDrawBatchSize: 10 };

export default function ThreadStorePage() {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const router = useRouter();
  const { isLoggedIn } = useAuthStore();
  // fetcher 必须稳定引用：内联会导致 usePagedList 的 run/load 每次渲染重建，
  // 下方 useEffect([load]) 反复触发 → 请求风暴（thread/[id].tsx 同款修复）。
  const fetchThreadStore = useCallback(async (p: number, _params: unknown, signal?: AbortSignal) => {
    const data = await threadStore(p, signal);
    return { items: data.items, hasMore: data.hasMore, nextPage: p + 1 };
  }, []);
  const paged = usePagedList<FavoriteThread>({
    fetcher: fetchThreadStore,
    initialPage: 1,
  });
  const {
    items,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
    load,
    setItems,
  } = paged;
  const [undoRemoved, setUndoRemoved] = useState<{ item: FavoriteThread; index: number } | null>(null);

  useEffect(() => {
    // 未登录不请求收藏接口（避免报错刷屏），由下方登录引导态承接
    if (!isLoggedIn) return;
    load(1);
  }, [load, isLoggedIn]);

  // TODO(F3): FavoriteThread only carries the bookmarked floor and a total
  // latestReplyNum count, not a "newest floor/post id". threadStore() also
  // does not expose the delta needed for a reliable "更新到新楼层" prompt, so
  // the prompt is left out until the favorite API/model provides that field.

  const handleRemove = useCallback(
    async (item: FavoriteThread) => {
      if (!isLoggedIn) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const originalIndex = items.findIndex((i) => i.id === item.id);
      // Optimistic removal
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setUndoRemoved({ item, index: originalIndex });
      hapticNotify(NotificationFeedbackType.Warning);
      try {
        await removeStore(item.id);
        setUndoRemoved(null);
        hapticForScene('action-success');
      } catch {
        // Undo: put item back at its original index, not the end of the list.
        setItems((prev) => {
          const next = [...prev];
          const insertIndex = originalIndex >= 0 ? Math.min(originalIndex, next.length) : next.length;
          next.splice(insertIndex, 0, item);
          return next;
        });
        setUndoRemoved(null);
        Alert.alert('错误', '取消收藏失败');
      }
    },
    [isLoggedIn, items, setItems],
  );

  const handleUndo = useCallback(() => {
    if (undoRemoved) {
      const { item, index } = undoRemoved;
      setItems((prev) => {
        const next = [...prev];
        const insertIndex = index >= 0 ? Math.min(index, next.length) : next.length;
        next.splice(insertIndex, 0, item);
        return next;
      });
      setUndoRemoved(null);
      hapticForScene('action-success');
    }
  }, [undoRemoved, setItems]);

  const renderItem = useCallback(
    ({ item }: { item: FavoriteThread; index: number }) => (
      <View style={[styles.favRow, { backgroundColor: colors.card }]}>
        <Link href={{ pathname: '/thread/[id]', params: { id: item.id, fromFavorites: '1' } }} push asChild>
          <Pressable
            style={({ pressed }) => [
              styles.favItem,
              {
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`收藏帖子：${item.title}`}
            accessibilityHint="点击查看，更多操作中可取消收藏"
          >
            <View style={styles.favContent}>
              <Text style={[styles.favTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.forumName, { color: colors.textLink }]} numberOfLines={1}>
                  {item.forumName}
                </Text>
                {item.authorName ? (
                  <Text style={[styles.authorName, { color: colors.textTertiary }]} numberOfLines={1}>
                    {item.authorName}
                  </Text>
                ) : null}
              </View>
              <View style={styles.bottomRow}>
                <Text style={[styles.floor, { color: colors.textTertiary }]}>
                  #{item.floor || 1}
                </Text>
                <View style={styles.stats}>
                  <SymbolView
                    name="bubble.left"
                    size={11}
                    weight="regular"
                    tintColor={colors.textTertiary}
                  />
                  <Text style={[styles.statText, { color: colors.textTertiary }]}>
                    {formatCount(item.latestReplyNum)}
                  </Text>
                </View>
                <Text style={[styles.statText, { color: colors.textTertiary }]}>
                  {relativeTime(storeTimestamp(item))}
                </Text>
              </View>
            </View>
          </Pressable>
        </Link>
        <MenuView
          style={styles.favoriteMenu}
          actions={FAVORITE_MENU_ACTIONS}
          onPressAction={() => handleRemove(item)}
        >
          <Pressable
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="取消收藏"
          >
            <SymbolView name="ellipsis" size={15} weight="bold" tintColor={colors.textTertiary} />
          </Pressable>
        </MenuView>
      </View>
    ),
    [colors, handleRemove],
  );

  const renderFooter = useMemo(() => {
    if (loadingMore) {
      return <ActivityIndicator style={styles.loadingMore} color={colors.primary} />;
    }
    if (!hasMore && items.length > 0) {
      return <Text style={[styles.noMore, { color: colors.textDisabled }]}>没有更多了</Text>;
    }
    return null;
  }, [loadingMore, hasMore, items.length, colors]);

  // 未登录：不请求收藏接口，直接引导登录（登录后返回本页自动拉取）
  if (!isLoggedIn) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <VStack alignment="center" spacing={16}>
          <Spacer />
          <ContentUnavailableView
            systemImage="person.crop.circle.badge.questionmark"
            title="需要登录"
            description="登录后才能查看收藏的贴子"
          />
          <SwiftButton
            onPress={() => router.push('/login')}
            modifiers={[buttonStyle('glassProminent'), buttonBorderShape('capsule')]}
          >
            <Label title="登录百度账号" systemImage="person.crop.circle.badge.checkmark" />
          </SwiftButton>
          <Spacer />
        </VStack>
      </ThemedHost>
    );
  }

  // Loading
  if (loading && items.length === 0) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.skeletonWrap}>
            <SkeletonList variant="row" count={8} />
          </View>
        </View>
      </ThemedHost>
    );
  }

  // Error
  if (error && items.length === 0) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ThemedHost>
    );
  }

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={items}
        keyExtractor={favoriteKeyExtractor}
        getItemType={() => 'favorite'}
        decelerationRate="normal"
        renderItem={renderItem}
        drawDistance={250}
        maxItemsInRecyclePool={24}
        overrideProps={FAVORITE_LIST_OVERRIDES}
        ListEmptyComponent={
          <EmptyState
            title="暂无收藏"
            description="浏览帖子时点击收藏即可添加到此处"
            icon="star.fill"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.lg },
          items.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void refresh().then(() => hapticForScene('toggle')); }}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ItemSeparatorComponent={FavoriteRowSeparator}
      />
      {/* Undo Toast：浮动在列表底部，不再遮挡列表头数据（P2 最小修复） */}
      {undoRemoved && (
        <View style={[styles.undoBar, { backgroundColor: colors.surfaceSecondary, bottom: insets.bottom + 16 }]}>
          <Text style={[styles.undoText, { color: colors.text }]}>已取消收藏</Text>
          <View style={{ height: 32 }}>
            <Button title="撤销" variant="plain" onPress={handleUndo} />
          </View>
        </View>
      )}
      </View>
    </ThemedHost>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  emptyList: { flex: 1 },
  // Undo toast（浮动底部，不遮列表头）
  undoBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.chip,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  undoText: { fontSize: 14 },
  // Item
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.input,
    paddingRight: 6,
  },
  favItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    gap: 10,
  },
  favoriteMenu: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favContent: { flex: 1, gap: 6 },
  favTitle: { fontSize: 15, fontWeight: '600', lineHeight: 23, letterSpacing: 0 },
  metaRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  forumName: typographyStyles.caption1,
  authorName: typographyStyles.caption1,
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floor: typographyStyles.caption1,
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statText: typographyStyles.caption2,
  removeBtn: { padding: 6, marginTop: 2 },
  // Footer
  loadingMore: { paddingVertical: Spacing.lg },
  noMore: { textAlign: 'center', paddingVertical: Spacing.lg, ...typographyStyles.footnote },
  favSeparator: { height: Spacing.sm },
});
