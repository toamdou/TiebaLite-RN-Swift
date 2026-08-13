// ============================================================
// TiebaLite React Native - Browsing History Page
// Date-grouped sections with segments for threads/forums,
// matching com.huanchengfly.tieba.post.ui.page.HistoryPage
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';

import { Button } from '@/components/ui/Button';
import { Picker, Text as SWText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';
import { relativeTime } from '@/utils';
import { flattenGroupRows, type GroupedRow } from '@/utils/forumUsers';
import type { HistoryItem } from '@/types';
import { getVisitHistory, removeVisit, clearVisitHistory } from '@/services/storage/visitHistory';

const TABS = [
  { label: '贴子记录', value: 'thread' },
  { label: '经过贴吧', value: 'forum' },
];

type HistoryRow = GroupedRow<HistoryItem>;

const HISTORY_MENU_ACTIONS: MenuAction[] = [
  { id: 'delete', title: '删除记录', image: 'trash', attributes: { destructive: true } },
];

const historyKeyExtractor = (row: HistoryRow) => row.key;

const HistoryRowSeparator = () => <View style={styles.historySeparator} />;

const HISTORY_LIST_OVERRIDES = { initialDrawBatchSize: 10 };

export default function HistoryPage() {
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const [activeTab, setActiveTab] = useState(initialTab === 'forum' ? 'forum' : 'thread');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      setHistory(await getVisitHistory(activeTab as 'thread' | 'forum'));
    } catch (e) {
      setHistory([]);
      // 之前只 setHistory([]) 从不 setError，L259 的 if(error) ErrorState 分支是死代码；
      // 补上错误态，让 ErrorState + 重试路径可触发。
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab switch resets list state before loading the new history tab.
    setLoading(true);
    setHistory([]);
    loadHistory();
  }, [loadHistory]);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    hapticForScene('toggle');
  }, [loadHistory]);
  const handleClearAll = useCallback(() => {
    Alert.alert('清空记录', '确定要清空所有浏览记录吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearVisitHistory(activeTab as 'thread' | 'forum');
            setHistory([]);
            hapticForScene('action-success');
          } catch {
            Alert.alert('错误', '清空失败');
          }
        },
      },
    ]);
  }, [activeTab]);
  // Group items by date: 今天 / 昨天 / 更早
  const sections = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const grouped: Record<string, HistoryItem[]> = {
      '今天': [],
      '昨天': [],
      '更早': [],
    };
    history.forEach((item) => {
      const ts = item.timestamp;
      if (ts >= todayStart) {
        grouped['今天'].push(item);
      } else if (ts >= yesterdayStart) {
        grouped['昨天'].push(item);
      } else {
        grouped['更早'].push(item);
      }
    });
    return Object.entries(grouped)
      .filter(([, items]) => items.length > 0)
      .map(([title, data]) => ({ title, data }));
  }, [history]);
  const historyRows = useMemo<HistoryRow[]>(
    () =>
      flattenGroupRows(
        sections.map((section) => ({
          title: section.title,
          items: section.data,
        })),
        (item) => `${item.type}-${item.threadId || item.forumName || ''}-${item.timestamp}`,
        1,
        'history',
      ),
    [sections],
  );

  const handleDeleteItem = useCallback(
    async (item: HistoryItem) => {
      Alert.alert('删除记录', '确定要删除这条浏览记录吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const filtered = await removeVisit(
                (h) =>
                  h.type === item.type &&
                  h.timestamp === item.timestamp &&
                  h.threadId === item.threadId &&
                  h.forumName === item.forumName,
              );
              setHistory(filtered);
              hapticForScene('action-success');
            } catch {
              Alert.alert('错误', '删除失败');
            }
          },
        },
      ]);
    },
    [],
  );

  const renderHistoryItem = useCallback(
    (item: HistoryItem) => {
      const isThread = item.type === 'thread';
      const timeStr = relativeTime(item.timestamp);
      const href = isThread
        ? `/thread/${item.threadId}`
        : `/forum/${encodeURIComponent(item.forumName || '')}`;
      return (
        <View style={[styles.historyRow, { backgroundColor: colors.card }]}>
          <Link href={href as any} push asChild>
            <Pressable
              style={({ pressed }) => [
                styles.historyItem,
                {
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${isThread ? '贴子' : '贴吧'}：${item.title || item.forumName || '未知'}，${timeStr}`}
            >
              <View style={[styles.itemIcon, { backgroundColor: isThread ? colors.primary + '1A' : colors.accent + '1A' }]}>
                <SymbolView
                  name={isThread ? 'doc.text.fill' : 'rectangle.3.group.fill'}
                  size={20}
                  weight="medium"
                  tintColor={isThread ? colors.primary : colors.accent}
                />
              </View>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title || item.forumName || '未知'}
                </Text>
                <Text style={[styles.itemTime, { color: colors.textTertiary }]}>
                  {timeStr}
                </Text>
              </View>
              <SymbolView
                name="chevron.right"
                size={13}
                weight="semibold"
                tintColor={colors.textTertiary}
              />
            </Pressable>
          </Link>
          <MenuView
            style={styles.historyMenu}
            actions={HISTORY_MENU_ACTIONS}
            onPressAction={() => handleDeleteItem(item)}
          >
            <Pressable
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="删除记录"
            >
              <SymbolView name="ellipsis" size={15} weight="bold" tintColor={colors.textTertiary} />
            </Pressable>
          </MenuView>
        </View>
      );
    },
    [colors, handleDeleteItem],
  );

  const renderRow = useCallback(
    ({ item }: { item: HistoryRow }) => {
      if (item.kind === 'header') {
        return (
      <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {item.title}
        </Text>
      </View>
        );
      }
      if (item.kind !== 'item') return null;
      return renderHistoryItem(item.item);
    },
    [colors, renderHistoryItem],
  );
  
  // Loading state
  if (loading) {
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
  // Error state
  if (error) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ErrorState message={error} onRetry={handleRefresh} />
        </View>
      </ThemedHost>
    );
  }

  return (
    <ThemedHost style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tabs Row */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <Picker
          selection={activeTab}
          onSelectionChange={(value: string) => {
            hapticForScene('toggle');
            setActiveTab(value);
          }}
          modifiers={[pickerStyle('segmented')]}
        >
          {TABS.map((t) => (
            <SWText key={t.value} modifiers={[tag(t.value)]}>{t.label}</SWText>
          ))}
        </Picker>
      </View>

      {/* Clear All Button */}
      {history.length > 0 && (
        <View style={styles.clearRow}>
          <Button
            variant="plain"
            title="清除全部"
            icon="trash"
            onPress={handleClearAll}
          />
        </View>
      )}

      <FlashList
        data={historyRows}
        keyExtractor={historyKeyExtractor}
        renderItem={renderRow}
        estimatedItemSize={96}
        getItemType={(row) => row.kind}
        maxItemsInRecyclePool={24}
        decelerationRate="normal"
        drawDistance={250}
        overrideProps={HISTORY_LIST_OVERRIDES}
        ListEmptyComponent={
          <EmptyState
            title="暂无记录"
            description={
              activeTab === 'thread'
                ? '还没有浏览过贴子'
                : '还没有浏览过贴吧'
            }
            icon="clock.arrow.circlepath"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 16 },
          history.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ItemSeparatorComponent={HistoryRowSeparator}
      />
      </View>
    </ThemedHost>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: 12, paddingTop: 12 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabControl: { width: '100%' },
  clearRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  listContent: { paddingHorizontal: 12 },
  emptyList: { flex: 1 },
  // Section Header
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  // Item
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.input,
    paddingRight: 6,
  },
  historyItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  historyMenu: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemTime: { fontSize: 12 },
  historySeparator: { height: Spacing.sm },
});
