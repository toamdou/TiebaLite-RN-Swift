/**
 * In-Forum Search Page (吧内搜索)
 * Migrated from com.huanchengfly.tieba.post.ui.page.forum.ForumSearchPostPage
 *
 * Search posts within a specific forum with sort/filter options,
 * search history, and paginated results.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  ScrollView,
} from 'react-native';
import { Picker, Text as SWText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { hapticForScene } from '@/theme/hapticsMap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchPostList } from '@/components/search/SearchResultList';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';
import { typographyStyles } from '@/theme/typography';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { searchPost } from '@/services/api/endpoints';
import { usePagedList } from '@/hooks/usePagedList';
import {
  loadSearchHistory,
  appendSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  type SearchHistoryItem,
} from '@/storage/searchHistory';
import type { SearchPostResult } from '@/types';

// ---------- Constants ----------
const SORT_OPTIONS = [
  { label: '按时间', value: '0' },
  { label: '按相关性', value: '1' },
];
const FILTER_OPTIONS = [
  { label: '全部', value: '0' },
  { label: '仅主题贴', value: '1' },
];
const MAX_HISTORY_ITEMS = 10;

// ---------- Main Page ----------
export default function ForumSearchPage() {
  const { name, forumId } = useLocalSearchParams<{ name: string; forumId: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState('0'); // 0=time, 1=relevance
  const [filterType, setFilterType] = useState('0'); // 0=all, 1=only threads
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [searched, setSearched] = useState(false);

  // 原生 header 搜索栏（UISearchController）引用与当前文字镜像。
  // iOS 不支持 autoFocus / onClose 事件，改用命令式 focus() 实现自动聚焦；
  // 切换 tab 返回时重新聚焦，方便连续搜索。
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const searchQueryRef = useRef('');
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);
  const paged = usePagedList<SearchPostResult, { kw: string }>({
    fetcher: async (p, params, signal) => {
      const data = await searchPost(
        forumId,
        params.kw,
        name ?? '',
        p,
        parseInt(sortType, 10),
        parseInt(filterType, 10),
        signal,
      );
      return { items: data.items, hasMore: data.hasMore, nextPage: p + 1 };
    },
    params: { kw: searchedKeyword },
    initialPage: 1,
  });
  const {
    items: results,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    load,
    refresh,
    loadMore,
  } = paged;

  // Search history
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  // Load search history for this forum
  useEffect(() => {
    if (forumId) {
      let mounted = true;
      loadSearchHistory(forumId, MAX_HISTORY_ITEMS)
        .then((items) => {
          if (mounted) setHistory(items);
        })
        .catch(() => {});
      return () => {
        mounted = false;
      };
    }
  }, [forumId]);

  // Save keyword to history
  const saveToHistory = useCallback(
    async (kw: string) => {
      if (!forumId || !kw.trim()) return;
      const trimmed = kw.trim();
      try {
        setHistory(await appendSearchHistory(trimmed, forumId, MAX_HISTORY_ITEMS));
      } catch {}
    },
    [forumId],
  );

  // Clear history
  const clearHistory = useCallback(async () => {
    hapticForScene('press');
    setHistory([]);
    try {
      await clearSearchHistory(forumId);
    } catch {}
  }, [forumId]);

  // Delete a single history item
  const removeHistoryItem = useCallback(
    async (kw: string) => {
      if (!forumId) return;
      try {
        setHistory(await removeSearchHistory(kw, forumId));
      } catch {}
    },
    [forumId],
  );

  const handleHistoryLongPress = useCallback(
    (kw: string) => {
      Alert.alert('删除搜索历史', `确定删除“${kw}”？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => removeHistoryItem(kw),
        },
      ]);
    },
    [removeHistoryItem],
  );

  // Perform search
  const doSearch = useCallback(
    (kw: string, p: number = 1, isRefresh = false) => {
      if (!kw.trim() || !forumId) return;
      const trimmed = kw.trim();
      setSearchedKeyword(trimmed);
      setSearched(true);
      saveToHistory(trimmed);
      if (isRefresh || p === 1) {
        load(1, { kw: trimmed });
      } else {
        loadMore();
      }
    },
    [forumId, saveToHistory, load, loadMore],
  );

  // Re-search when sort/filter changes (if already searched)
  useEffect(() => {
    if (searched && searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-run search after sort/filter change; load transitions are managed by usePagedList.
      doSearch(searchQuery, 1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sort/filter changes should re-run the search; the latest query is captured by that render's closure.
  }, [sortType, filterType]);

  const handleRefresh = useCallback(async () => {
    await refresh();
    hapticForScene('toggle');
  }, [refresh]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await loadMore();
  }, [hasMore, loadingMore, loading, loadMore]);

  const handleSubmitSearch = useCallback(
    (text: string) => {
      if (text.trim()) {
        hapticForScene('press');
        doSearch(text, 1, true);
      }
    },
    [doSearch],
  );

  const handleHistoryTap = useCallback((kw: string) => {
    hapticForScene('toggle');
    setSearchQuery(kw);
    doSearch(kw, 1, true);
  }, [doSearch]);

  const handleOpenPost = useCallback(
    (item: SearchPostResult) => {
      // TODO(#30): SearchPostResult has no postInfo/postId/postFloor fields yet.
      // When the search API exposes them, navigate to /thread/[tid]/subposts with
      // threadId/postId/forumId/floor params instead of opening the thread page.
      router.push({ pathname: '/thread/[id]', params: { id: item.id } });
    },
    [router],
  );

  // Show loading indicator
  const showLoading = loading && results.length === 0;

  const searchBarOptions = useMemo(
    () => ({
      ref: searchBarRef,
      placeholder: '搜索吧内帖子...',
      hideWhenScrolling: false,
      placement: 'stacked' as const,
      autoCapitalize: 'none' as const,
      text: searchQuery,
      onChangeText: (e: { nativeEvent: { text: string } }) => setSearchQuery(e.nativeEvent.text),
      onSearchButtonPress: (e: { nativeEvent: { text: string } }) => handleSubmitSearch(e.nativeEvent.text),
      onCancelButtonPress: () => setSearchQuery(''),
    }),
    [searchQuery, handleSubmitSearch],
  );

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerSearchBarOptions: searchBarOptions }} />
      {/* Sort & Filter native menus（@expo/ui SwiftUI 组件须为 Host 直子，
          否则 RedBox "being mounted inside a standard UIView"） */}
      <View style={styles.controlsRow}>
        <ThemedHost matchContents>
          <Picker<string>
            selection={sortType}
            label={SORT_OPTIONS.find((opt) => opt.value === sortType)?.label ?? '排序'}
            onSelectionChange={(value) => {
              hapticForScene('toggle');
              setSortType(String(value));
            }}
            modifiers={[
              pickerStyle('menu'),
              frame({ minWidth: 104 }),
              accessibilityLabel('帖子排序'),
            ]}
          >
            {SORT_OPTIONS.map((opt) => (
              <SWText key={opt.value} modifiers={[tag(opt.value)]}>{opt.label}</SWText>
            ))}
          </Picker>
        </ThemedHost>
        <ThemedHost matchContents>
          <Picker<string>
            selection={filterType}
            label={FILTER_OPTIONS.find((opt) => opt.value === filterType)?.label ?? '筛选'}
            onSelectionChange={(value) => {
              hapticForScene('toggle');
              setFilterType(String(value));
            }}
            modifiers={[
              pickerStyle('menu'),
              frame({ minWidth: 104 }),
              accessibilityLabel('帖子筛选'),
            ]}
          >
            {FILTER_OPTIONS.map((opt) => (
              <SWText key={opt.value} modifiers={[tag(opt.value)]}>{opt.label}</SWText>
            ))}
          </Picker>
        </ThemedHost>
      </View>
      {/* Search History (only when no results and not searched) */}
      {!searched && history.length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>
              搜索历史
            </Text>
            <Pressable onPress={clearHistory} hitSlop={8}>
              <SymbolView
                name={'trash' as any}
                size={16}
                weight="regular"
                tintColor={colors.textTertiary}
              />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.historyChips}
          >
            {history.map((item, idx) => (
              <Pressable
                key={`${item.keyword}-${item.timestamp}-${idx}`}
                style={[styles.historyChip, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => handleHistoryTap(item.keyword)}
                onLongPress={() => handleHistoryLongPress(item.keyword)}
                accessibilityLabel={`搜索历史：${item.keyword}，点击搜索，长按删除`}
                accessibilityHint="轻点搜索该关键词，长按弹出删除确认"
              >
                <Text style={[styles.historyChipText, { color: colors.textSecondary }]}>
                  {item.keyword}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {/* Loading */}
      {showLoading && (
        <SkeletonList count={6} variant="thread" />
      )}
      {/* Error */}
      {error && results.length === 0 && !showLoading && (
        <ErrorState message={error} onRetry={() => doSearch(searchQuery, 1, true)} />
      )}
      {/* Empty */}
      {!showLoading && !error && searched && results.length === 0 && (
        <EmptyState
          title="未找到相关内容"
          description="换个关键词试试吧"
          icon={'doc.text.magnifyingglass' as any}
        />
      )}
      {/* Results */}
      {!showLoading && results.length > 0 && (
        <SearchPostList
          items={results}
          colors={colors}
          onPressItem={handleOpenPost}
          onEndReached={handleLoadMore}
          hasMore={hasMore}
          loadingMore={loadingMore}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
        />
      )}
      </View>
    </ThemedHost>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    gap: Spacing.sm,
  },
  // History
  historySection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  historyChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  historyChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.chip,
  },
  historyChipText: {
    ...typographyStyles.footnote,
  },
  // Results
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
});
