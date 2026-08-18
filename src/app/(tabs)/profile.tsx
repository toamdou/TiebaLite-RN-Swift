/**
 * Profile Tab (我的) — 官方 @expo/ui FieldGroup 原生 Form 实现
 *
 * iOS 上 FieldGroup = SwiftUI Form（iOS 26 液态玻璃分组材质），
 * ListItem = 原生行（leading 色块图标 / 标题 / 副标题 / trailing 开关或 chevron）。
 * 用户卡片为 RN 布局（头像+统计），叠在淡色渐变上让液态玻璃有可模糊内容。
 * 全局背景白色（theme/colors.ts 浅色 background 已改 #FFFFFF）。
 */

import { useCallback, useEffect, useState } from 'react';
import { FieldGroup, ListItem } from '@expo/ui';
import {
  DeviceEventEmitter,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { hapticForScene } from '@/theme/hapticsMap';
import { Avatar } from '@/components/ui/Avatar';
import { GlassView } from '@/components/ui/GlassView';
import { SymbolView } from '@/components/ui/SymbolView';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { RowIcon } from '@/components/ui/RowIcon';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing } from '@/theme';
import { typographyStyles } from '@/theme/typography';
import { useAuthStore } from '@/stores/authStore';
import { useSignStore } from '@/stores/signStore';
import { profile as fetchProfile } from '@/services/api/endpoints';
import { formatCount } from '@/utils';
import type { UserProfile } from '@/types';

const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

/** 行前色块图标：见 @/components/ui/RowIcon（Profile/Settings 统一） */
export default function ProfileScreen() {
  const { colors } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const account = useAuthStore((s) => s.account);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const startSign = useSignStore((s) => s.startSign);
  const isSigning = useSignStore((s) => s.isSigning);
  const currentUid = account?.uid;

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const insets = useSafeAreaInsets();

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn || !currentUid) return;
    try {
      const result = await fetchProfile(currentUid);
      setUserProfile(result);
    } catch {
      // 失败降级：保留 account 缓存字段展示
    }
  }, [isLoggedIn, currentUid]);

  useEffect(() => {
    // 挂载时拉一次个人资料（跨端数据源，setState 发生在 await 之后）
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time data load
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'profile') loadProfile();
    });
    return () => sub.remove();
  }, [loadProfile]);

  const handleSign = useCallback(() => {
    hapticForScene('action-success');
    startSign();
  }, [startSign]);

  const navigateTo = useCallback((route: string) => {
    hapticForScene('press');
    router.push(route as any);
  }, [router]);

  // ── 加载中 ──
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SkeletonList variant="row" count={8} style={styles.profileSkeleton} />
      </View>
    );
  }

  const stats = userProfile?.statue;
  const concernForums = stats?.concernForumsNum ?? account?.concernNum ?? 0;
  const fansCount = userProfile?.user?.fansNum ?? account?.fansNum ?? 0;
  const postsCount = stats?.postsNum ?? account?.postNum ?? 0;

  // ── 用户卡片（纯 RN 布局，直接置于 GlassView RN 容器内，无需 RNHostView 桥） ──
  const userCard = (
    <Pressable
      onPress={
        isLoggedIn && account?.uid
          ? () => navigateTo(`/user/${account.uid}`)
          : undefined
      }
      // 未登录时 onPress 置空：仅由下方「登录百度账号」按钮触发跳转，
      // 避免点卡片与点按钮同时 push /login 弹出两个登录窗口。
      disabled={!isLoggedIn}
      style={styles.userCardPressable}
        accessibilityRole="button"
        accessibilityLabel={isLoggedIn ? '个人主页' : '登录'}
      >
        {isLoggedIn ? (
          <>
            <Avatar
              source={account?.portrait || undefined}
              initials={(account?.nameShow || account?.name || '吧')?.charAt(0)}
              size={76}
            />
            <RNText style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {account?.nameShow || account?.name || '贴吧用户'}
            </RNText>
            {userProfile?.user.levelName || account?.levelName ? (
              <RNText style={[styles.userLevel, { color: colors.primary }]}>
                {userProfile?.user.levelName || account?.levelName}
              </RNText>
            ) : null}
            {userProfile?.user?.intro ? (
              <RNText style={[styles.userIntro, { color: colors.textSecondary }]} numberOfLines={2}>
                {userProfile.user.intro}
              </RNText>
            ) : null}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <RNText style={[styles.statValue, { color: colors.text }]}>{formatCount(concernForums)}</RNText>
                <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>关注</RNText>
              </View>
              <View style={styles.statItem}>
                <RNText style={[styles.statValue, { color: colors.text }]}>{formatCount(fansCount)}</RNText>
                <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>粉丝</RNText>
              </View>
              <View style={styles.statItem}>
                <RNText style={[styles.statValue, { color: colors.text }]}>{formatCount(postsCount)}</RNText>
                <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>帖子</RNText>
              </View>
            </View>
          </>
        ) : (
          <>
            <RNText style={[styles.userTitle, { color: colors.text }]}>你还未登录</RNText>
            <RNText style={[styles.userSubtitle, { color: colors.textSecondary }]}>
              登录后查看个人信息、签到、收藏
            </RNText>
            <View style={styles.loginButtonWrap}>
              <Pressable
                onPress={() => navigateTo('/login')}
                accessibilityRole="button"
                accessibilityLabel="登录百度账号"
                style={({ pressed }) => [styles.loginButton, { opacity: pressed ? 0.8 : 1 }]}
              >
                <GlassView borderRadius={Radius.input}>
                  <View style={styles.loginButtonInner}>
                    <SymbolView name="person.crop.circle.badge.checkmark" size={16} weight="semibold" tintColor={colors.primary} />
                    <RNText style={[styles.loginButtonText, { color: colors.primary }]}>登录百度账号</RNText>
                  </View>
                </GlassView>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部液态玻璃用户卡片：玻璃叠在淡蓝渐变上才有可模糊内容（纯白底磨砂玻璃不可见） */}
      <View style={[styles.heroWrap, { paddingTop: insets.top + Spacing.md }]}>
        <GlassView borderRadius={Radius.card} glassEffectStyle="regular">
          <LinearGradient
            colors={['rgba(37,99,235,0.10)', 'rgba(37,99,235,0.03)', 'rgba(37,99,235,0.10)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {userCard}
        </GlassView>
      </View>

      {/* FieldGroup = SwiftUI Form：必须经 ThemedHost（Host 桥）嵌入 RN 树，
          否则 Form 不撑开高度导致下方列表全部消失 */}
      <ThemedHost style={{ flex: 1 }}>
        <FieldGroup>
          {/* ── 账号组：签到 / 登录入口 ── */}
          <FieldGroup.Section>
            {isLoggedIn ? (
              <ListItem
                leading={<RowIcon icon={isSigning ? 'checkmark.circle.fill' : 'checkmark.circle'} tint="#34C759" />}
                onPress={handleSign}
              >
                {isSigning ? '签到中...' : '一键签到'}
              </ListItem>
            ) : null}
          </FieldGroup.Section>

          {/* ── 我的内容 ── */}
          <FieldGroup.Section title="我的内容">
            {isLoggedIn ? (
              <>
                <ListItem leading={<RowIcon icon="person" tint="#5856D6" />} onPress={() => navigateTo(`/user/${account?.uid}`)}>个人主页</ListItem>
                <ListItem leading={<RowIcon icon="doc.text" tint="#FF9500" />} onPress={() => navigateTo(`/user/${account?.uid}/posts`)}>我的帖子</ListItem>
                <ListItem leading={<RowIcon icon="square.grid.2x2" tint="#34C759" />} onPress={() => navigateTo(`/user/${account?.uid}/forums`)}>关注的吧</ListItem>
              </>
            ) : null}
            <ListItem leading={<RowIcon icon="clock" tint="#FF9500" />} onPress={() => navigateTo('/history')}>浏览历史</ListItem>
            <ListItem leading={<RowIcon icon="bookmark" tint="#FF3B30" />} onPress={() => navigateTo('/threadstore')}>我的收藏</ListItem>
          </FieldGroup.Section>

          {/* ── 设置 ── */}
          <FieldGroup.Section title="设置">
            <ListItem leading={<RowIcon icon="gearshape" tint="#8E8E93" />} onPress={() => navigateTo('/settings')}>设置</ListItem>
            {isLoggedIn && (
              <ListItem leading={<RowIcon icon="person.crop.circle" tint="#4477E0" />} onPress={() => navigateTo('/settings/account')}>账号管理</ListItem>
            )}
            <ListItem leading={<RowIcon icon="info.circle" tint="#5AC8FA" />} onPress={() => navigateTo('/settings/about')}>关于 TiebaLite</ListItem>
          </FieldGroup.Section>
        </FieldGroup>
      </ThemedHost>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSkeleton: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 24,
    alignSelf: 'stretch',
  },
  heroWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  userCardPressable: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  userName: {
    ...typographyStyles.title2,
    textAlign: 'center',
  },
  userLevel: {
    ...typographyStyles.footnoteBold,
    textAlign: 'center',
  },
  userIntro: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  userTitle: {
    ...typographyStyles.title3,
    textAlign: 'center',
  },
  userSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  loginButtonWrap: {
    marginTop: Spacing.sm,
  },
  loginButton: {
    borderRadius: Radius.input,
  },
  loginButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  loginButtonText: {
    ...typographyStyles.calloutBold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: Spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  statLabel: {
    ...typographyStyles.caption1,
  },
});
