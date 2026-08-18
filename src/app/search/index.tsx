/**
 * Search Page (搜索页) — 贴吧原版样式 + 综合/贴/吧/人 tab
 *
 * 设计：
 * - 顶部搜索：原生 header 的 headerSearchBarOptions（UISearchController，placeholder "搜吧、搜贴、搜人"）
 * - 搜索前：搜索历史（标题行 + 药丸标签）
 * - 搜索后：分段 tab（贴/吧/人，SwiftUI segmented）+ 排序（原生 menu）+ 对应结果列表
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { hapticForScene } from '@/theme/hapticsMap';
import { Picker, Text as SWText, VStack, RNHostView } from '@expo/ui/swift-ui';
import { pickerStyle, tag, padding, frame } from '@expo/ui/swift-ui/modifiers';
import { SymbolView } from '@/components/ui/SymbolView';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  SearchForumList,
  SearchThreadList,
  SearchUserList,
} from '@/components/search/SearchResultList';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing, typographyStyles } from '@/theme';
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

  // 结果卡跳转：稳定回调（列表 renderItem 依赖标识，内联写法会让每个 cell 的 memo 失效）
  const handleThreadPress = useCallback((item: SearchThreadResult) => {
    router.push(`/thread/${item.id}`);
  }, [router]);
  const handleForumPress = useCallback((item: SearchForumResult) => {
    router.push(`/forum/${encodeURIComponent(item.forumName)}`);
  }, [router]);
  const handleUserPress = useCallback((item: SearchUserResult) => {
    router.push(`/user/${item.uid}`);
  }, [router]);

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
      {/* 分段 tab 必须是外层 Host 的直接后代才能渲染（动态页同因：SwiftUI Picker
          嵌进 RN 小容器时空白）；内容区经 RNHostView 挂进 SwiftUI VStack。 */}
      <VStack spacing={0} modifiers={[frame({ maxWidth: 10000, maxHeight: 10000 })]}>
        {hasSearched && (
          <Picker
            selection={activeTab}
            onSelectionChange={(v) => handleTabChange(v as SearchTab)}
            modifiers={[pickerStyle('segmented'), padding({ horizontal: Spacing.lg, top: 10, bottom: 6 })]}
          >
            {TABS.map((t) => (
              <SWText key={t.key} modifiers={[tag(t.key)]}>{t.label}</SWText>
            ))}
          </Picker>
        )}
        <RNHostView>
        <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ── 贴子排序（搜索后显示，原生 menu Picker，同 Host 直子规则） ── */}
        {hasSearched && activeTab === 'thread' && (
          <View style={styles.sortHost}>
            <ThemedHost matchContents>
              <Picker
                selection={sortOrder}
                onSelectionChange={handleSortChange as any}
                modifiers={[pickerStyle('menu')]}
              >
                <SWText modifiers={[tag(String(SearchThreadOrder.NEW_FIRST))]}>按时间</SWText>
                <SWText modifiers={[tag(String(SearchThreadOrder.RELEVANT))]}>按相关性</SWText>
              </Picker>
            </ThemedHost>
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
                      style={{ padding: Spacing.xs }}
                    >
                      <Text style={[styles.historyToggleText, { color: colors.textTertiary }]}>
                        {historyExpanded ? '收起' : '全部'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={clearHistory} hitSlop={8} style={{ padding: Spacing.xs }}>
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
            <SearchThreadList
              items={threads}
              colors={colors}
              onPressItem={handleThreadPress}
              onEndReached={loadMoreThreads}
              hasMore={threadHasMore}
              loadingMore={loadingMore}
            />
          ) : activeTab === 'forum' ? (
            <SearchForumList
              items={forums}
              colors={colors}
              onPressItem={handleForumPress}
            />
          ) : (
            <SearchUserList
              items={users}
              colors={colors}
              onPressItem={handleUserPress}
            />
          )}
        </View>
      )}
      </View>
        </RNHostView>
      </VStack>
    </ThemedHost>
  );
}

// ── 样式 ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── 贴子排序 ──
  sortHost: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 2,
  },
  // ── 主体 ──
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: Spacing.md,
  },
  skeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.chip,
    marginTop: Spacing.xs,
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
    gap: Spacing.sm,
  },
  historyToggleText: typographyStyles.footnote,
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
    paddingVertical: Spacing.sm,
    borderRadius: Radius.capsule,
    maxWidth: 200,
  },
  historyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
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
    gap: Spacing.md,
  },
  emptyTitle: typographyStyles.subhead,
});
