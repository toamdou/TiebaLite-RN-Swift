/**
 * Search Page (搜索页) — 贴吧原版样式 + 综合/贴/吧/人 tab
 *
 * 设计：
 * - 顶部搜索：原生 header 的 headerSearchBarOptions（UISearchController，placeholder "搜吧、搜贴、搜人"）
 * - 搜索前：搜索历史（标题行 + 药丸标签）
 * - 搜索后：分段 tab（贴/吧/人，SwiftUI segmented）+ 排序（原生 menu）+ 对应结果列表
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { hapticForScene } from '@/theme/hapticsMap';
import { Picker, Text as SWText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { SymbolView } from '@/components/ui/SymbolView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  SearchForumList,
  SearchThreadList,
  SearchUserList,
} from '@/components/search/SearchResultList';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, DURATION, EASE_OUT } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { searchThread, searchForum, searchUser, searchSuggestions } from '@/services/api/endpoints';
import { relativeTime } from '@/utils';
import {
  loadSearchHistory,
  appendSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  type SearchHistoryItem,
} from '@/storage/searchHistory';
import { SearchThreadOrder } from '@/types';
import type { SearchThreadResult, SearchForumResult, SearchUserResult } from '@/types';

// ── 常量 ──
const MAX_HISTORY = 20;
const VISIBLE_HISTORY_COUNT = 6;
const MAX_SEARCH_RESULTS = 300;

type SearchTab = 'thread' | 'forum' | 'user';
const TABS: { key: SearchTab; label: string }[] = [
  { key: 'thread', label: '贴' },
  { key: 'forum', label: '吧' },
  { key: 'user', label: '人' },
];

// ---------- 首屏级联入场（仅首次搜索结果批次执行，Reduce Motion 跳过） ----------
function FirstBatchStagger({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const { reduceMotion } = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      index * DURATION.stagger,
      withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }),
    );
    return () => {
      progress.value = 0;
    };
  }, [index, reduceMotion, progress]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }],
  }));
  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ── 主页面 ──
export default function SearchPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('thread');
  const [sortOrder, setSortOrder] = useState<string>(String(SearchThreadOrder.NEW_FIRST));
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // 原生 header 搜索栏（UISearchController）引用与当前文字镜像。
  // iOS 不支持 autoFocus / onClose 事件，改用命令式 focus() 实现自动聚焦。
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const inputTextRef = useRef('');
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);
  useEffect(() => {
    // 待原生 header 搜索栏挂载后再聚焦，避免过早调用被吞。
    const timer = setTimeout(() => {
      searchBarRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // 搜索结果
  const [threads, setThreads] = useState<SearchThreadResult[]>([]);
  const [forums, setForums] = useState<SearchForumResult[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 贴子分页
  const [threadPage, setThreadPage] = useState(1);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchSeqRef = useRef(0);
  const suggestionSeqRef = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const resetSuggestions = useCallback(() => {
    suggestionSeqRef.current += 1;
    setSuggestions([]);
  }, []);
  const handleInputChange = useCallback((text: string) => {
    resetSuggestions();
    setInputText(text);
  }, [resetSuggestions]);

  // 搜索建议：输入变化后 400ms 防抖请求，序号丢弃过期响应；
  // 输入全为空白时不发请求（避免无效流量）；abort 上一未完成请求。
  useEffect(() => {
    const trimmed = inputText.trim();
    const seq = suggestionSeqRef.current;
    if (!trimmed || hasSearched) return;

    const timer = setTimeout(async () => {
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      try {
        const res = await searchSuggestions(trimmed, false, controller.signal);
        if (seq !== suggestionSeqRef.current) return;
        setSuggestions(res.list.slice(0, 8));
      } catch {
        // 静默忽略，不影响历史/搜索
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      if (suggestionSeqRef.current === seq) suggestionSeqRef.current += 1;
    };
  }, [inputText, hasSearched]);

  // 加载搜索历史（统一仓库，自动迁移旧 key）
  useEffect(() => {
    let mounted = true;
    loadSearchHistory(undefined, MAX_HISTORY)
      .then((items) => {
        if (mounted) setHistory(items);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const saveToHistory = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    try {
      setHistory(await appendSearchHistory(trimmed, undefined, MAX_HISTORY));
    } catch {}
  }, []);

  const clearHistory = useCallback(async () => {
    hapticForScene('press');
    setHistory([]);
    try {
      await clearSearchHistory();
    } catch {}
  }, []);

  const removeHistoryItem = useCallback(async (kw: string) => {
    try {
      setHistory(await removeSearchHistory(kw));
    } catch {}
  }, []);

  const handleHistoryLongPress = useCallback(
    (kw: string) => {
      hapticForScene('press');
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

  const doSearch = useCallback(async (kw: string, tab: SearchTab, orderOverride?: number) => {
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError('');
    try {      if (tab === 'thread') {
        const res = await searchThread(kw, 1, orderOverride ?? parseInt(sortOrder, 10));
        if (seq !== searchSeqRef.current) return;
        setThreads(res.items.slice(0, MAX_SEARCH_RESULTS));
        setThreadPage(1);
        setThreadHasMore(res.hasMore);
      } else if (tab === 'forum') {
        const res = await searchForum(kw);
        if (seq !== searchSeqRef.current) return;
        setForums(res);
      } else {
        const res = await searchUser(kw);
        if (seq !== searchSeqRef.current) return;
        setUsers(res);
      }
    } catch (e: any) {
      if (seq !== searchSeqRef.current) return;
      setError(e?.message || '搜索失败');
    } finally {
      if (seq !== searchSeqRef.current) return;
      setLoadingMore(false);
      setLoading(false);
    }
  }, [sortOrder]);

  // 贴子加载更多
  const loadMoreThreads = useCallback(async () => {
    if (!threadHasMore || loadingMore || loading || !searchedKeyword) return;
    const seq = searchSeqRef.current;
    setLoadingMore(true);
    try {
      const nextPage = threadPage + 1;
      const res = await searchThread(searchedKeyword, nextPage, parseInt(sortOrder, 10));
      if (seq !== searchSeqRef.current) return;
      setThreads((prev) => [...prev, ...res.items].slice(-MAX_SEARCH_RESULTS));
      setThreadPage(nextPage);
      setThreadHasMore(res.hasMore);
    } catch {
      // 静默失败，保留已有结果
    } finally {
      setLoadingMore(false);
    }
  }, [threadHasMore, loadingMore, loading, searchedKeyword, threadPage, sortOrder]);

  const handleSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    hapticForScene('press');
    resetSuggestions();
    saveToHistory(trimmed);
    setSearchedKeyword(trimmed);
    setHasSearched(true);
    doSearch(trimmed, activeTab);
  }, [resetSuggestions, saveToHistory, doSearch, activeTab]);

  const handleTabChange = useCallback((tab: SearchTab) => {
    hapticForScene('toggle');
    setActiveTab(tab);
    if (searchedKeyword) {
      doSearch(searchedKeyword, tab);
    }
  }, [searchedKeyword, doSearch]);

  const handleSortChange = useCallback(
    (value: string) => {
      hapticForScene('toggle');
      setSortOrder(value);
      if (searchedKeyword) {
        doSearch(searchedKeyword, activeTab, parseInt(value, 10));
      }
    },
    [searchedKeyword, activeTab, doSearch],
  );

  const handleKeywordTap = useCallback((kw: string) => {
    hapticForScene('press');
    resetSuggestions();
    setInputText(kw);
    setSearchedKeyword(kw);
    setHasSearched(true);
    saveToHistory(kw);
    doSearch(kw, activeTab);
  }, [resetSuggestions, doSearch, activeTab, saveToHistory]);

  // 原生搜索栏取消语义：有输入时清空并收起键盘（恢复搜索前状态），无输入时返回。
  const handleCancelPress = useCallback(() => {
    const hasText = inputTextRef.current.trim().length > 0;
    if (hasText) {
      inputTextRef.current = '';
      resetSuggestions();
      setInputText('');
      setHasSearched(false);
      setSearchedKeyword('');
    } else {
      router.back();
    }
  }, [resetSuggestions, router]);

  const searchBarOptions = useMemo(
    () => ({
      ref: searchBarRef,
      placeholder: '搜吧、搜贴、搜人',
      hideWhenScrolling: false,
      placement: 'stacked' as const,
      autoCapitalize: 'none' as const,
      text: inputText,
      onChangeText: (e: { nativeEvent: { text: string } }) => handleInputChange(e.nativeEvent.text),
      onSearchButtonPress: (e: { nativeEvent: { text: string } }) => handleSearch(e.nativeEvent.text),
      onCancelButtonPress: handleCancelPress,
    }),
    [inputText, handleInputChange, handleSearch, handleCancelPress],
  );

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '搜索', headerSearchBarOptions: searchBarOptions }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* ── Tab 栏（搜索后显示，SwiftUI segmented） ── */}
        {hasSearched && (
          <View style={styles.tabBar}>
            <Picker
              selection={activeTab}
              onSelectionChange={handleTabChange as any}
              modifiers={[pickerStyle('segmented')]}
            >
              {TABS.map((tab) => (
                <SWText key={tab.key} modifiers={[tag(tab.key)]}>{tab.label}</SWText>
              ))}
            </Picker>
          </View>
        )}

        {/* ── 贴子排序（搜索后显示，原生 menu Picker） ── */}
        {hasSearched && activeTab === 'thread' && (
          <View style={styles.sortHost}>
            <Picker
              selection={sortOrder}
              onSelectionChange={handleSortChange as any}
              modifiers={[pickerStyle('menu')]}
            >
              <SWText modifiers={[tag(String(SearchThreadOrder.NEW_FIRST))]}>按时间</SWText>
              <SWText modifiers={[tag(String(SearchThreadOrder.RELEVANT))]}>按相关性</SWText>
            </Picker>
          </View>
        )}

      {/* ── 内容区 ── */}
      {!hasSearched ? (
        /* 搜索前：搜索历史 */
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {suggestions.length > 0 && (
            <View style={styles.historySection}>
              <View style={styles.historyHeader}>
                <Text style={[styles.historyTitle, { color: colors.text }]}>搜索建议</Text>
              </View>
              <View style={styles.tagWrap}>
                {suggestions.map((item, idx) => (
                  <Pressable
                    key={`sug-${item}-${idx}`}
                    onPress={() => handleKeywordTap(item)}
                    style={[styles.tagPill, { backgroundColor: colors.chip }]}
                  >
                    <Text style={[styles.tagText, { color: colors.text }]} numberOfLines={1}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <View style={styles.historyHeader}>
                <Pressable
                  onPress={() => setHistoryExpanded((v) => !v)}
                  hitSlop={8}
                  style={styles.historyTitleRow}
                  accessibilityLabel={historyExpanded ? '收起搜索历史' : '展开搜索历史'}
                >
                  <Text style={[styles.historyTitle, { color: colors.text }]}>搜索历史</Text>
                  <SymbolView
                    name={historyExpanded ? 'chevron.up' : 'chevron.down'}
                    size={14}
                    tintColor={colors.textTertiary}
                  />
                </Pressable>
                <View style={styles.historyHeaderActions}>
                  {history.length > VISIBLE_HISTORY_COUNT && (
                    <Pressable
                      onPress={() => setHistoryExpanded((v) => !v)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Text style={[styles.historyToggleText, { color: colors.textTertiary }]}>
                        {historyExpanded ? '收起' : '全部'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={clearHistory} hitSlop={8} style={{ padding: 4 }}>
                    <SymbolView name="trash" size={16} tintColor={colors.textTertiary} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.tagWrap}>
                {(historyExpanded ? history : history.slice(0, VISIBLE_HISTORY_COUNT)).map((item, idx) => (
                  <Pressable
                    key={`${item.keyword}-${item.timestamp}-${idx}`}
                    onPress={() => handleKeywordTap(item.keyword)}
                    onLongPress={() => handleHistoryLongPress(item.keyword)}
                    style={[styles.historyPill, { backgroundColor: colors.chip }]}
                  >
                    <Text style={[styles.tagText, { color: colors.text }]} numberOfLines={1}>
                      {item.keyword}
                    </Text>
                    <Text style={[styles.historyTime, { color: colors.textTertiary }]}>
                      {relativeTime(item.timestamp)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {history.length === 0 && (
            <View style={styles.emptyWrap}>
              <SymbolView name="tray" size={40} tintColor={colors.textDisabled} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>搜索贴吧、帖子和用户</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* 搜索后：结果列表 */
        <View style={styles.body}>
          {loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonList variant="card" count={6} />
            </View>
          ) : error ? (
            <View style={styles.centerWrap}>
              <SymbolView name="wifi.exclamationmark" size={36} tintColor={colors.textDisabled} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{error}</Text>
              <Pressable onPress={() => doSearch(searchedKeyword, activeTab)} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.retryText, { color: colors.textOnPrimary }]}>重试</Text>
              </Pressable>
            </View>
          ) : activeTab === 'thread' ? (
            <FirstBatchStagger index={0}>
              <SearchThreadList
                items={threads}
                colors={colors}
                onPressItem={(item) => router.push(`/thread/${item.id}`)}
                onEndReached={loadMoreThreads}
                hasMore={threadHasMore}
                loadingMore={loadingMore}
              />
            </FirstBatchStagger>
          ) : activeTab === 'forum' ? (
            <FirstBatchStagger index={0}>
              <SearchForumList
                items={forums}
                colors={colors}
                onPressItem={(item) => router.push(`/forum/${encodeURIComponent(item.forumName)}`)}
              />
            </FirstBatchStagger>
          ) : (
            <FirstBatchStagger index={0}>
              <SearchUserList
                items={users}
                colors={colors}
                onPressItem={(item) => router.push(`/user/${item.uid}`)}
              />
            </FirstBatchStagger>
          )}
        </View>
      )}
      </View>
    </ThemedHost>
  );
}

// ── 样式 ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Tab 栏（SwiftUI segmented） ──
  tabBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  // ── 贴子排序 ──
  sortHost: {
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  // ── 主体 ──
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.chip,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // ── 搜索历史 ──
  historySection: {
    marginBottom: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyToggleText: {
    fontSize: 13,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.capsule,
    maxWidth: 200,
  },
  historyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.capsule,
    maxWidth: 220,
  },
  historyTime: {
    fontSize: 10,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '400',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
  },
});
