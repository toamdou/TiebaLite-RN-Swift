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
  foregroundStyle, buttonStyle, buttonBorderShape, frame, refreshable,
} from '@expo/ui/swift-ui/modifiers';
import {
  DeviceEventEmitter,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // 个人资料拉取状态：与全局 auth isLoading（冷启动鉴权）相互独立。
  // 失败时降级为本地缓存账号字段，不整页报错。
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn || !currentUid) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const result = await fetchProfile(currentUid);
      setUserProfile(result);
    } catch {
      // 失败降级：保留 account 缓存字段展示，仅提示刷新失败
      setProfileError('个人资料刷新失败，下拉可重试');
    } finally {
      setProfileLoading(false);
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
  // 失败降级：拉取失败时回退到本地 account 缓存字段，避免统计区显示全 0
  const concernForums = stats?.concernForumsNum ?? account?.concernNum ?? 0;
  const fansCount = userProfile?.user?.fansNum ?? account?.fansNum ?? 0;
  const postsCount = stats?.postsNum ?? account?.postNum ?? 0;

  return (
    <ThemedHost style={{ flex: 1 }}>
      <VStack spacing={0} modifiers={[frame({ maxWidth: 9999 })]}>
        <RNHostView matchContents>
          <View style={[styles.userCard, { backgroundColor: colors.card, paddingTop: insets.top + 18 }]}>
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
                  {profileLoading && !userProfile ? (
                    <View style={styles.profileSkeleton}>
                      <SkeletonList variant="row" count={2} />
                    </View>
                  ) : (
                    <>
                      {profileError && !userProfile ? (
                        <Pressable
                          onPress={() => void loadProfile()}
                          accessibilityRole="button"
                          accessibilityLabel="重试刷新个人资料"
                        >
                          <RNText style={[styles.userErrorText, { color: colors.textSecondary }]}>
                            个人资料加载失败 · 点按重试
                          </RNText>
                        </Pressable>
                      ) : null}
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
                            {formatCount(concernForums)}
                          </RNText>
                          <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>关注</RNText>
                        </View>
                        <View style={styles.statItem}>
                          <RNText style={[styles.statValue, { color: colors.text }]}>
                            {formatCount(fansCount)}
                          </RNText>
                          <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>粉丝</RNText>
                        </View>
                        <View style={styles.statItem}>
                          <RNText style={[styles.statValue, { color: colors.text }]}>
                            {formatCount(postsCount)}
                          </RNText>
                          <RNText style={[styles.statLabel, { color: colors.textSecondary }]}>帖子</RNText>
                        </View>
                      </View>
                    </>
                  )}
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

        <Form modifiers={[refreshable(() => loadProfile())]}>
        {/* ── 签到（已登录） ── */}
        {isLoggedIn && (
          <Section>
            <Button
              onPress={handleSign}
              modifiers={[
                buttonStyle('bordered'),
                buttonBorderShape('roundedRectangle', 10),
                // §3.4: Label 的 color prop 已废弃（iOS 26 图标不着色），
                // 改由父 Button 的 foregroundStyle 驱动图标着色
                foregroundStyle('#34C759'),
              ]}
            >
              <Label
                title={isSigning ? '签到中...' : '一键签到'}
                systemImage={isSigning ? 'checkmark.circle.fill' : 'checkmark.circle'}
              />
            </Button>
          </Section>
        )}

        {/* ── 我的内容 ── */}
        {/* §3.4 verified: No deprecated 'color' prop on Label; icon tint driven by parent Button foregroundStyle instead */}
        <Section title="我的内容">
          {isLoggedIn ? (
            <>
              <Button onPress={() => navigateTo(`/user/${account?.uid}`)} modifiers={[foregroundStyle('#5856D6')]}>
                <Label title="个人主页" systemImage="person" />
              </Button>
              <Button onPress={() => navigateTo(`/user/${account?.uid}/posts`)} modifiers={[foregroundStyle('#FF9500')]}>
                <Label title="我的帖子" systemImage="doc.text" />
              </Button>
              <Button onPress={() => navigateTo(`/user/${account?.uid}/forums`)} modifiers={[foregroundStyle('#34C759')]}>
                <Label title="关注的吧" systemImage="square.grid.2x2" />
              </Button>
            </>
          ) : null}
          <Button onPress={() => navigateTo('/history')} modifiers={[foregroundStyle('#FF9500')]}>
            <Label title="浏览历史" systemImage="clock" />
          </Button>
          <Button onPress={() => navigateTo('/threadstore')} modifiers={[foregroundStyle('#FF3B30')]}>
            <Label title="我的收藏" systemImage="bookmark" />
          </Button>
        </Section>

        {/* ── 设置 ── */}
        <Section title="设置">
          <Button onPress={openServiceCenter} modifiers={[foregroundStyle('#4477E0')]}>
            <Label title="服务中心" systemImage="questionmark.circle" />
          </Button>
          <Button onPress={() => navigateTo('/settings')} modifiers={[foregroundStyle('#8E8E93')]}>
            <Label title="设置" systemImage="gearshape" />
          </Button>
          {isLoggedIn && (
            <Button onPress={() => navigateTo('/settings/account')} modifiers={[foregroundStyle('#4477E0')]}>
              <Label title="账号管理" systemImage="person.crop.circle" />
            </Button>
          )}
          <Button onPress={() => navigateTo('/settings/about')} modifiers={[foregroundStyle('#5AC8FA')]}>
            <Label title="关于 TiebaLite" systemImage="info.circle" />
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
    alignSelf: 'stretch',
  },
  userErrorText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
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
