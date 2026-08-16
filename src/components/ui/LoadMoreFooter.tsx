/**
 * LoadMoreFooter — footer states for infinite lists.
 *
 * Loading is driven by FlashList's onEndReached (native threshold) rather
 * than a per-frame JS onScroll handler. The footer itself is static, so
 * scrolling never triggers a React state update.
 */

import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

// ────────────────────────────────────────────────────────────
// Footer component
// ────────────────────────────────────────────────────────────

export interface LoadMoreFooterProps {
  hasMore: boolean;
  loading: boolean;
  colors: any;
  onLoadMore: () => void;
  /** Kept for call-site compatibility; not used for per-frame rendering. */
  scrollOffset?: number;
  contentHeight?: number;
  layoutHeight?: number;
}

export function LoadMoreFooter({
  hasMore,
  loading,
  colors,
}: LoadMoreFooterProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.text, { color: colors.textTertiary }]}>加载中...</Text>
      </View>
    );
  }

  if (!hasMore) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noMoreText, { color: colors.textTertiary }]}>
          没有更多了
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.textTertiary }]}>
        上拉加载更多
      </Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  text: { fontSize: 13, fontWeight: '600' },
  noMoreText: { fontSize: 12, fontWeight: '500' },
});

export default LoadMoreFooter;
