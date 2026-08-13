// ============================================================
// Hot Topic List Page - 热门话题排行
// Displays hot topic rankings from the topicList API.

import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Link, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/SymbolView';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Shadows, Spacing, typographyStyles } from '@/theme';
import { HOT_RANK_COLORS } from '@/app/(tabs)/explore';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { topicListOptions } from '@/services/api/queryOptions';
import { useQuery } from '@tanstack/react-query';
import { formatCount } from '@/utils';
import type { HotTopicListItem, TopicInfo } from '@/types';

function mapToHotTopic(topic: TopicInfo, index: number): HotTopicListItem {
  return {
    ...topic,
    rank: index + 1,
  };
}

export default function HotTopicListPage() {
  const { colors } = useThemeColors();
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery(topicListOptions);
  const topics: HotTopicListItem[] = (data ?? []).map(mapToHotTopic);
  const loading = isLoading && topics.length === 0;
  const refreshing = isFetching && topics.length > 0;
  const errorMessage = error instanceof Error ? error.message : '加载失败';

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const renderTopic = useCallback(
    ({ item }: { item: HotTopicListItem }) => {
      const rank = item.rank ?? 0;
      const isTop3 = rank <= 3;
      const rankColor = isTop3 ? HOT_RANK_COLORS[rank - 1] : colors.textDisabled;
      return (
        <Link href={{ pathname: '/topic/[id]', params: { id: item.topicId, name: item.topicName } }} push asChild>
          <Pressable
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {/* Rank */}
            <View style={styles.rankContainer}>
              {item.rank && item.rank <= 3 ? (
                <View style={[styles.rankBadge, isTop3 && styles.rankBadgeTop3, { backgroundColor: rankColor }]}>
                  <Text style={styles.rankBadgeText}>{item.rank}</Text>
                </View>
              ) : (
                <Text style={[styles.rankText, { color: colors.textDisabled }]}>
                  {item.rank ?? '-'}
                </Text>
              )}
            </View>
            {/* Image */}
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={[styles.topicImage, isTop3 && styles.topicImageTop3, { backgroundColor: colors.surfaceSecondary }]}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  styles.topicImagePlaceholder,
                  isTop3 && styles.topicImageTop3,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <SymbolView
                  name="number"
                  size={isTop3 ? 32 : 24}
                  tintColor={colors.textDisabled}
                />
              </View>
            )}
            {/* Info */}
            <View style={styles.topicInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.topicName, { color: colors.text }]} numberOfLines={1}>
                  #{item.topicName}#
                </Text>
                {item.isHot && (
                  <View style={[styles.tag, { backgroundColor: '#FF3B30' }]}>
                    <Text style={[styles.tagText, { color: colors.textOnPrimary }]}>热</Text>
                  </View>
                )}
                {item.isNew && (
                  <View style={[styles.tag, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.tagText, { color: colors.textOnPrimary }]}>新</Text>
                  </View>
                )}
              </View>
              {item.topicDesc ? (
                <Text
                  style={[styles.topicDesc, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.topicDesc}
                </Text>
              ) : null}
              <Text style={[styles.discussNum, { color: colors.textDisabled }]}>
                {formatCount(item.discussNum)} 讨论
              </Text>
            </View>
            {/* Chevron */}
            <SymbolView
              name="chevron.right"
              size={14}
              tintColor={colors.textTertiary}
            />
          </Pressable>
        </Link>
      );
    },
    [colors],
  );

  const topicKeyExtractor = useCallback((item: HotTopicListItem) => item.topicId, []);
  const itemSeparator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: colors.divider }]} />,
    [colors.divider],
  );
  const listEmpty = useCallback(
    () => <EmptyState title="暂无话题" description="当前没有热门话题" icon="number" />,
    [],
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "热门话题" }} />
        <View style={styles.skeletonWrap}>
          <SkeletonList variant="card" count={8} />
        </View>
      </View>
    );
  }

  if (isError && topics.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "热门话题" }} />
        <ErrorState message={errorMessage} onRetry={handleRefresh} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "热门话题" }} />
      <FlashList
        data={topics}
        keyExtractor={topicKeyExtractor}
        decelerationRate="normal"
        renderItem={renderTopic}
        estimatedItemSize={128}
        drawDistance={250}
        maxItemsInRecyclePool={24}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={itemSeparator}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  listContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.card,
    gap: Spacing.md,
    ...Shadows.card,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rankText: typographyStyles.headline,
  topicImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.chip,
    // backgroundColor 走 colors.surfaceSecondary（组件内动态注入，暗色不亮块）
  },
  topicImageTop3: {
    width: 84,
    height: 84,
    borderRadius: Radius.input,
  },
  topicImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor 走 colors.surfaceSecondary（组件内动态注入，暗色不亮块）
  },
  rankBadgeTop3: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  topicInfo: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicName: typographyStyles.subheadBold,
  tag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagText: {
    // color 走 colors.textOnPrimary（组件内动态注入：红/主色底都适配）
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  topicDesc: typographyStyles.footnote,
  discussNum: typographyStyles.caption1,
  separator: {
    height: 1,
  },
});
