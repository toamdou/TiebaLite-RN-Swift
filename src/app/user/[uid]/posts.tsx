/**
 * User Posts Page (用户帖子)
 * Displays a user's threads and replies with a segmented tab switcher.
 *
 * - Two tabs: 帖子 (threads) | 回复 (replies)
 * - FlashList with infinite scroll + pull-to-refresh
 * - Data source: userPost(uid, page, isThread) protobuf endpoint
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
} from 'react-native';
import { Picker, Text as SWText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link } from 'expo-router';
import { hapticImpact, hapticSelection, ImpactFeedbackStyle } from '@/utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';
import { userPost } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { flattenStyle, contentToText, relativeTime, formatCount } from '@/utils';

// ---------- Constants ----------

const POST_TABS = [
  { label: '帖子', value: 'threads' },
  { label: '回复', value: 'replies' },
];

const UserPostsItemSeparator = () => <View style={{ height: Spacing.sm }} />;

// ---------- Component ----------

export default function UserPostsPage() {
  const { uid, name } = useLocalSearchParams<{ uid: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();

  // Tab state
  const [activeTab, setActiveTab] = useState('threads');
  const paged = usePagedList<any, { isThread: boolean }>({
    fetcher: async (p, params, signal) => {
      const data = await userPost(uid, p, params.isThread, signal);
      return { items: data.items, hasMore: data.hasMore, nextPage: p + 1 };
    },
    initialPage: 1,
  });
  const {
    items,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh: handleRefresh,
    loadMore: handleLoadMore,
    load,
    setItems,
  } = paged;

  // Initial load + reload when tab changes
  useEffect(() => {
    // 切换 tab 后旧 tab 数据若残留，loading && items.length===0 不成立 → 新 tab 下会闪现旧数据。
    // 先清空再请求，配合 listEmpty 骨架立即展示加载态。
    setItems([]);
    load(1, { isThread: activeTab === 'threads' });
  }, [uid, activeTab, load, setItems]);

  const handleTabChange = useCallback((value: string) => {
    hapticSelection();
    setActiveTab(value);
  }, []);

  // ---------- Render item ----------

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const title = item.title || contentToText(item.content);
      const replyCount = Number(item.replyNum ?? item.postNum ?? 0);
      return (
        <Link href={{ pathname: '/thread/[id]', params: { id: item.id || item.threadId } }} push asChild>
          <Pressable
            onPress={() => hapticImpact(ImpactFeedbackStyle.Light)}
            style={flattenStyle([styles.contentItem, { backgroundColor: colors.card }])}
          >
            {item.forumName ? (
              <View style={styles.forumChipRow}>
                <View style={[styles.forumChip, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.forumChipText, { color: colors.textLink }]}>
                    {item.forumName}吧
                  </Text>
                </View>
              </View>
            ) : null}
            {title ? (
              <Text style={[styles.contentTitle, { color: colors.text }]} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            <View style={styles.contentMeta}>
              <Text style={[styles.contentTime, { color: colors.textTertiary }]}>
                {relativeTime((Number(item.createTime) || 0) * 1000)}
              </Text>
              {replyCount > 0 && (
                <View style={styles.replyCountRow}>
                  <SymbolView name="bubble.left" size={12} tintColor={colors.textTertiary} />
                  <Text style={[styles.replyCountText, { color: colors.textTertiary }]}>
                    {formatCount(replyCount)}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Link>
      );
    },
    [colors],
  );

  const userPostsKeyExtractor = useCallback(
    (item: any, idx: number) => item.id || item.threadId || String(idx),
    [],
  );
  // 单份 ListEmptyComponent：loading / error / 空数据 三态合一，
  // 取代原先"提前 return 骨架屏"+"ListEmptyComponent 空态"的双份骨架逻辑。
  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.skeletonWrap}>
          <SkeletonList variant="thread" count={8} />
        </View>
      );
    }
    if (error) {
      return <ErrorState message={error} onRetry={handleRefresh} />;
    }
    return (
      <EmptyState
        title="暂无内容"
        description={activeTab === 'threads' ? '还没有发过帖子' : '还没有回复'}
        icon="tray.fill"
      />
    );
  }, [loading, error, activeTab, handleRefresh]);
  const listFooter = useMemo(
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

  const headerTitle = name || '用户帖子';

  // ---------- Main render ----------

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={flattenStyle([styles.container, { backgroundColor: colors.background }])}>
        <Stack.Screen options={{ title: headerTitle }} />

        {/* Segmented tabs */}
        <View style={styles.tabsRow}>
          <ThemedHost matchContents>
            <Picker
              selection={activeTab}
              onSelectionChange={handleTabChange}
              modifiers={[pickerStyle('segmented')]}
            >
              {POST_TABS.map((tab) => (
                <SWText key={tab.value} modifiers={[tag(tab.value)]}>{tab.label}</SWText>
              ))}
            </Picker>
          </ThemedHost>
        </View>

      <FlashList
        data={items}
        keyExtractor={userPostsKeyExtractor}
        decelerationRate="normal"
        drawDistance={250}
        maxItemsInRecyclePool={24}
        renderItem={renderItem}
        estimatedItemSize={140}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 16 },
          items.length === 0 && styles.emptyList,
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
        ItemSeparatorComponent={UserPostsItemSeparator}
      />
      </View>
    </ThemedHost>
  );
}

// ---------- Helpers ----------

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: 16, paddingTop: 20 },
  listContent: { paddingHorizontal: 16 },
  // 空数据/加载/错误态撑满容器，保证 ListEmptyComponent 内骨架与空态居中
  emptyList: { flex: 1 },

  // Tabs
  tabsRow: { paddingVertical: 12 },

  // Content Items
  contentItem: { padding: 14, borderRadius: Radius.input },
  forumChipRow: { flexDirection: 'row', marginBottom: 8 },
  forumChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  forumChipText: { fontSize: 11, fontWeight: '500' },
  contentTitle: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  contentMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contentTime: { fontSize: 11 },
  replyCountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  replyCountText: { fontSize: 11 },

  loadingMore: { paddingVertical: 16 },
  noMore: { textAlign: 'center', paddingVertical: 16, fontSize: 13 },
});
