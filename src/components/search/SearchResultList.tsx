/**
 * Shared search result lists for global search and in-forum search.
 *
 * The list wrappers keep the FlashList tuning (drawDistance, recycle pool,
 * keyboard behavior) and empty/footer states consistent across search flows.
 */

import { useCallback } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SymbolView } from '@/components/ui/SymbolView';
import {
  SearchForumCard,
  SearchPostCard,
  SearchThreadCard,
  SearchUserCard,
} from '@/components/search/SearchResultCard';
import type {
  SearchForumResult,
  SearchPostResult,
  SearchThreadResult,
  SearchUserResult,
} from '@/types';

const threadKeyExtractor = (item: SearchThreadResult, index: number) => `${item.id}-${index}`;
const forumKeyExtractor = (item: SearchForumResult) => item.forumId;
const userKeyExtractor = (item: SearchUserResult) => item.uid;
const postKeyExtractor = (item: SearchPostResult, index: number) => item.id || String(index);

export function SearchThreadList({
  items,
  colors,
  onPressItem,
  onEndReached,
  hasMore,
  loadingMore,
}: {
  items: SearchThreadResult[];
  colors: any;
  onPressItem: (item: SearchThreadResult) => void;
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const renderItem = useCallback(
    ({ item }: { item: SearchThreadResult }) => (
      <SearchThreadCard
        item={item}
        colors={colors}
        onPress={() => onPressItem(item)}
      />
    ),
    [colors, onPressItem],
  );
  const listFooter = useCallback(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>加载更多...</Text>
        </View>
      ) : !hasMore && items.length > 0 ? (
        <View style={styles.footerLoader}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>没有更多了</Text>
        </View>
      ) : null,
    [loadingMore, hasMore, items.length, colors.primary, colors.textTertiary],
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <SymbolView name="doc.text.magnifyingglass" size={36} tintColor={colors.textDisabled} />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>未找到相关贴子</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={threadKeyExtractor}
      contentContainerStyle={{ paddingBottom: 100 }}
      drawDistance={250}
      maxItemsInRecyclePool={24}
      removeClippedSubviews={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      ListFooterComponent={listFooter}
      renderItem={renderItem}
    />
  );
}

export function SearchForumList({
  items,
  colors,
  onPressItem,
}: {
  items: SearchForumResult[];
  colors: any;
  onPressItem: (item: SearchForumResult) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: SearchForumResult }) => (
      <SearchForumCard
        item={item}
        colors={colors}
        onPress={() => onPressItem(item)}
      />
    ),
    [colors, onPressItem],
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <SymbolView name="square.grid.2x2" size={36} tintColor={colors.textDisabled} />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>未找到相关贴吧</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={forumKeyExtractor}
      contentContainerStyle={{ paddingBottom: 100 }}
      drawDistance={250}
      maxItemsInRecyclePool={24}
      removeClippedSubviews={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={renderItem}
    />
  );
}

export function SearchUserList({
  items,
  colors,
  onPressItem,
}: {
  items: SearchUserResult[];
  colors: any;
  onPressItem: (item: SearchUserResult) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: SearchUserResult }) => (
      <SearchUserCard
        item={item}
        colors={colors}
        onPress={() => onPressItem(item)}
      />
    ),
    [colors, onPressItem],
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <SymbolView name="person.crop.circle" size={36} tintColor={colors.textDisabled} />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>未找到相关用户</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={userKeyExtractor}
      contentContainerStyle={{ paddingBottom: 100 }}
      drawDistance={250}
      maxItemsInRecyclePool={24}
      removeClippedSubviews={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={renderItem}
    />
  );
}

export function SearchPostList({
  items,
  colors,
  onPressItem,
  onEndReached,
  hasMore,
  loadingMore,
  refreshing,
  onRefresh,
  contentContainerStyle,
}: {
  items: SearchPostResult[];
  colors: any;
  onPressItem: (item: SearchPostResult) => void;
  onEndReached: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const renderItem = useCallback(
    ({ item }: { item: SearchPostResult }) => (
      <SearchPostCard
        item={item}
        colors={colors}
        onPress={() => onPressItem(item)}
      />
    ),
    [colors, onPressItem],
  );
  const listFooter = useCallback(
    () =>
      loadingMore ? (
        <View style={styles.postFooter}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !hasMore && items.length > 0 ? (
        <Text style={[styles.noMore, { color: colors.textDisabled }]}>没有更多了</Text>
      ) : null,
    [loadingMore, hasMore, items.length, colors.primary, colors.textDisabled],
  );

  return (
    <FlashList
      data={items}
      keyExtractor={postKeyExtractor}
      decelerationRate="normal"
      keyboardDismissMode="on-drag"
      removeClippedSubviews={false}
      renderItem={renderItem}
      drawDistance={250}
      maxItemsInRecyclePool={24}
      contentContainerStyle={contentContainerStyle}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      ListFooterComponent={listFooter}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    fontSize: 13,
  },
  postFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  noMore: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
  },
});
