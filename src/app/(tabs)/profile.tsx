/**
 * Profile Tab (我的) — SwiftUI 原生实现
 *
 * 使用 @expo/ui/swift-ui 的 Form + Section + Label + Button
 * 获得与 iOS 系统设置/通讯录一致的分组列表体验：
 * - 用户卡片区域：VStack + 头像 + 统计
 * - 功能菜单：Form + Section + Label(systemImage) 彩色图标
 * - 登录按钮：buttonStyle('glassProminent') 液态玻璃
 * - 签到：Button + buttonStyle('bordered')
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Form, Section, Button, Text, Label, VStack,
  RNHostView,
} from '@expo/ui/swift-ui';
import {
  foregroundStyle, buttonStyle, buttonBorderShape, frame,
} from '@expo/ui/swift-ui/modifiers';
import {
  DeviceEventEmitter,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { hapticImpact, hapticNotify, ImpactFeedbackStyle, NotificationFeedbackType } from '@/utils/haptics';
import { Avatar } from '@/components/ui/Avatar';
import { Button as UIButton } from '@/components/ui/Button';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/theme/ThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { useSignStore } from '@/stores/signStore';
import { profile as fetchProfile } from '@/services/api/endpoints';
import { formatCount } from '@/utils';
import type { UserProfile } from '@/types';

const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

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

  const loadProfile = useCallback(() => {
    if (isLoggedIn && currentUid) {
      fetchProfile(currentUid).then(setUserProfile).catch(() => {});
    }
  }, [isLoggedIn, currentUid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_RESELECT_EVENT, (tabName: string) => {
      if (tabName === 'profile') loadProfile();
    });
    return () => sub.remove();
  }, [loadProfile]);

  const handleSign = useCallback(() => {
    hapticNotify(NotificationFeedbackType.Success);
    startSign();
  }, [startSign]);

  const navigateTo = useCallback((route: string) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    router.push(route as any);
  }, [router]);

  const openServiceCenter = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync('https://tieba.baidu.com/mo/').catch(() => {});
  }, []);

  // ── 加载中 ──
  if (isLoading) {
    return (
      <ThemedHost style={{ flex: 1 }}>
        <SkeletonList variant="row" count={8} style={styles.profileSkeleton} />
      </ThemedHost>
    );
  }

  const stats = userProfile?.statue;

  return (
    <ThemedHost style={{ flex: 1 }}>
      <VStack spacing={0} modifiers={[frame({ maxWidth: 9999 })]}>
        <RNHostView matchContents>
          <View style={[styles.userCard, { backgroundColor: colors.card }]}>
            <Pressable
              onPress={() => {
                if (isLoggedIn && account?.uid) {
                  navigateTo(`/user/${account.uid}`);
                } else {
                  navigateTo('/login');
                }
              }}
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
                      <RNText style={[styles.statValue, { color: colors.text }]}>
                        {formatCount(stats?.concernForumsNum ?? 0)}
                      </RNText>
                      <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>关注</RNText>
                    </View>
                    <View style={styles.statItem}>
                      <RNText style={[styles.statValue, { color: colors.text }]}>
                        {formatCount(userProfile?.user?.fansNum ?? 0)}
                      </RNText>
                      <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>粉丝</RNText>
                    </View>
                    <View style={styles.statItem}>
                      <RNText style={[styles.statValue, { color: colors.text }]}>
                        {formatCount(stats?.postsNum ?? 0)}
                      </RNText>
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
                  <UIButton
                    variant="glass"
                    title="登录百度账号"
                    icon="person.crop.circle.badge.checkmark"
                    onPress={() => navigateTo('/login')}
                    style={styles.loginButton}
                  />
                </>
              )}
            </Pressable>
          </View>
        </RNHostView>

        <Form>
        {/* ── 签到（已登录） ── */}
        {isLoggedIn && (
          <Section>
            <Button
              onPress={handleSign}
              modifiers={[buttonStyle('bordered'), buttonBorderShape('roundedRectangle', 10)]}
            >
              <Label
                title={isSigning ? '签到中...' : '一键签到'}
                systemImage={isSigning ? 'checkmark.circle.fill' : 'checkmark.circle'}
                color="#34C759"
              />
            </Button>
          </Section>
        )}

        {/* ── 我的内容 ── */}
        {/* §3.4 verified: No deprecated 'color' prop on Label; using foregroundStyle() modifier on parent Button instead */}
        <Section title="我的内容">
          {isLoggedIn ? (
            <>
              <Button onPress={() => navigateTo(`/user/${account?.uid}`)} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                <Label title="个人主页" systemImage="person" color="#5856D6" />
              </Button>
              <Button onPress={() => navigateTo(`/user/${account?.uid}/posts`)} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                <Label title="我的帖子" systemImage="doc.text" color="#FF9500" />
              </Button>
              <Button onPress={() => navigateTo(`/user/${account?.uid}/forums`)} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                <Label title="关注的吧" systemImage="square.grid.2x2" color="#34C759" />
              </Button>
            </>
          ) : null}
          <Button onPress={() => navigateTo('/history')} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            <Label title="浏览历史" systemImage="clock" color="#FF9500" />
          </Button>
          <Button onPress={() => navigateTo('/threadstore')} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            <Label title="我的收藏" systemImage="bookmark" color="#FF3B30" />
          </Button>
        </Section>

        {/* ── 设置 ── */}
        <Section title="设置">
          <Button onPress={openServiceCenter} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            <Label title="服务中心" systemImage="questionmark.circle" color="#4477E0" />
          </Button>
          <Button onPress={() => navigateTo('/settings')} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            <Label title="设置" systemImage="gearshape" color="#8E8E93" />
          </Button>
          {isLoggedIn && (
            <Button onPress={() => navigateTo('/settings/account')} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
              <Label title="账号管理" systemImage="person.crop.circle" color="#4477E0" />
            </Button>
          )}
          <Button onPress={() => navigateTo('/settings/about')} modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            <Label title="关于 TiebaLite" systemImage="info.circle" color="#5AC8FA" />
          </Button>
        </Section>
        </Form>
      </VStack>
    </ThemedHost>
  );
}

const styles = StyleSheet.create({
  profileSkeleton: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  userCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  userCardPressable: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 8,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  userLevel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  userIntro: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  userTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  userSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
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
    fontSize: 12,
  },
});
