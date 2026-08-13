/**
 * Bawu Team Page (吧务团队) — shows the forum management team.
 *
 * Data: getBawuInfo(forumId) → { bawuTeamList: [{ roleName, roleInfo: [...] }] }
 * (proto: BawuTeam.bawu_team_list → BawuRoleDes { role_name, role_info: BawuRoleInfoPub[] })
 *
 * iOS 26 design: grouped role sections, SF Symbols, level badges,
 * haptic row feedback, staggered entrance. Rows navigate to the user page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticForScene } from '@/theme/hapticsMap';

import { SymbolView } from '@/components/ui/SymbolView';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';
import { typographyStyles } from '@/theme/typography';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { getBawuInfo } from '@/services/api/endpoints';
import { getLevelColor } from '@/utils';
import { parseForumUser, flattenGroupRows, type GroupedRow, type FlattenedForumUser } from '@/utils/forumUsers';

// ────────────────────────────────────────────────────────────
// Types & parsing (tolerates snake_case proto / camelCase normalized fields)
// ────────────────────────────────────────────────────────────

type BawuUser = FlattenedForumUser;

interface BawuRole {
  roleName: string;
  users: BawuUser[];
}

function parseBawuTeams(data: any): BawuRole[] {
  const rawList: any[] =
    data?.bawuTeamList ??
    data?.bawu_team_list ??
    data?.bawu_team_info?.bawu_team_list ??
    data?.bawuTeamInfo?.bawuTeamList ??
    [];
  return rawList
    .map((r) => {
      const roleName = String(r?.role_name ?? r?.roleName ?? '');
      const usersRaw: any[] = r?.role_info ?? r?.roleInfo ?? [];
      return { roleName, users: usersRaw.map((u) => parseForumUser(u, roleName)) };
    })
    .filter((r) => r.roleName || r.users.length > 0);
}

type Row = GroupedRow<BawuUser>;

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function BawuTeamPage() {
  const { name, forumId } = useLocalSearchParams<{ name: string; forumId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();

  const [teams, setTeams] = useState<BawuRole[]>([]);
  const [totalNum, setTotalNum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!forumId) return;
    try {
      const data = await getBawuInfo(forumId);
      const teamInfo = data?.bawu_team_info ?? data?.bawuTeamInfo ?? data;
      setTeams(parseBawuTeams(data));
      setTotalNum(Number(teamInfo?.total_num ?? teamInfo?.totalNum ?? 0));
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [forumId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; state updates happen after the async boundary.
    if (forumId) load();
  }, [forumId, load]);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    await load();
    hapticForScene('toggle');
  }, [load]);

  const handleUserPress = useCallback(
    (user: BawuUser) => {
      if (!user.userId) return;
      hapticForScene('press');
      router.push({ pathname: '/user/[uid]', params: { uid: user.userId } });
    },
    [router],
  );

  // Flatten roles → header + user rows for FlashList
  const rows = useMemo<Row[]>(
    () =>
      flattenGroupRows(
        teams.map((team) => ({
          title: team.roleName || '吧务',
          count: team.users.length,
          items: team.users,
        })),
        (user) => user.userId,
      ),
    [teams],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.roleHeader}>
            <View style={styles.roleHeaderLeft}>
              <View style={[styles.roleDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.roleName, { color: colors.text }]}>{item.title}</Text>
            </View>
            <View style={[styles.roleCountChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.roleCountText, { color: colors.textTertiary }]}>{item.count}人</Text>
            </View>
          </View>
        );
      }

      if (item.kind !== 'item') return null;
      const user = item.item;
      const displayName = user.nameShow || user.userName || '匿名用户';
      return (
        <Pressable
          style={({ pressed }) => [
            styles.userRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.divider,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            },
          ]}
          onPress={() => handleUserPress(user)}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          <Avatar source={user.portrait || undefined} initials={displayName.charAt(0)} size={46} />
          <View style={styles.userTextCol}>
            <View style={styles.userNameRow}>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              {user.userLevel > 0 && (
                <View style={[styles.levelBadge, { backgroundColor: getLevelColor(user.userLevel) }]}>
                  <Text style={styles.levelBadgeText}>Lv.{user.userLevel}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.userSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {user.roleName}
              {user.levelName ? ` · ${user.levelName}` : ''}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.textDisabled} />
        </Pressable>
      );
    },
    [colors, handleUserPress],
  );

  const groupBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(120,120,128,0.08)';

  const bawuKeyExtractor = useCallback((item: Row) => item.key, []);
  const bawuItemType = useCallback((item: Row) => item.kind, []);
  const listHeader = useCallback(
    () =>
      rows.length > 0 ? (
        <View style={[styles.summaryCard, { backgroundColor: groupBg }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary + '1F' }]}>
            <SymbolView name="shield.lefthalf.filled" size={20} tintColor={colors.primary} />
          </View>
          <View style={styles.summaryTextCol}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>
              {name}吧管理团队
            </Text>
            <Text style={[styles.summarySubtitle, { color: colors.textTertiary }]}>
              共 {totalNum > 0 ? totalNum : rows.filter((r) => r.kind === 'item').length} 名吧务成员
            </Text>
          </View>
        </View>
      ) : null,
    [rows, groupBg, colors, name, totalNum],
  );
  const listEmpty = useCallback(
    () =>
      !loading ? (
        <EmptyState
          icon={'person.2' as any}
          title="暂无吧务信息"
          description="这个吧还没有公开管理团队"
        />
      ) : null,
    [loading],
  );

  // ── Loading ──
  if (loading && rows.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '吧务团队' }} />
        <SkeletonList count={6} variant="row" />
      </View>
    );
  }

  // ── Error ──
  if (error && rows.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '吧务团队' }} />
        <ErrorState title="加载失败" message={error} onRetry={handleRefresh} retryLabel="重试" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '吧务团队' }} />
      <FlashList
        data={rows}
        keyExtractor={bawuKeyExtractor}
        renderItem={renderItem}
        getItemType={bawuItemType}
        estimatedItemSize={70}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        drawDistance={250}
        maxItemsInRecyclePool={24}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { ...typographyStyles.footnote },
  listContent: { paddingTop: Spacing.md },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: Radius.card,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextCol: { flex: 1 },
  summaryTitle: { ...typographyStyles.calloutBold },
  summarySubtitle: { ...typographyStyles.caption1, marginTop: 2 },

  // Role section header
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.xxl,
  },
  roleHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleDot: { width: 4, height: 14, borderRadius: 2 },
  roleName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  roleCountChip: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.chip },
  roleCountText: { ...typographyStyles.caption2Bold },

  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: Radius.card,
    borderWidth: 0.5,
  },
  userTextCol: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { ...typographyStyles.calloutBold, flexShrink: 1 },
  levelBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: Radius.chip },
  levelBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  userSubtitle: { ...typographyStyles.caption1, marginTop: 2 },
});
