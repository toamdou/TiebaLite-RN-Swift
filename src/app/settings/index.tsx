/**
 * Settings Page (设置) — 官方 @expo/ui FieldGroup 原生 Form 实现
 *
 * FieldGroup（iOS = SwiftUI Form，iOS 26 液态玻璃分组材质）+ ListItem
 * （原生行：leading 色块图标 / 标题 / 副标题 / trailing 开关或 chevron），
 * 分隔线、行高、分组全部由原生渲染。全局背景白色。
 */

import { useCallback } from 'react';
import { FieldGroup, ListItem, Switch } from '@expo/ui';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { RowIcon } from '@/components/ui/RowIcon';

/** 行前色块图标：见 @/components/ui/RowIcon（Profile/Settings 统一） */
export default function SettingsPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const hapticFeedback = usePreferencesStore((s) => s.preferences.hapticFeedback);

  const navigateTo = useCallback((route: string) => {
    hapticForScene('press');
    router.push(route as any);
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* FieldGroup = SwiftUI Form：必须经 ThemedHost（Host 桥）嵌入 RN 树，
          否则 Form 不撑开高度导致列表消失 */}
      <ThemedHost style={{ flex: 1 }}>
        <FieldGroup>
        {/* ── 外观 ── */}
        <FieldGroup.Section title="外观">
          <ListItem
            leading={<RowIcon icon="textformat.size" tint="#AF52DE" />}
            supportingText="深浅色外观、导航栏样式"
            onPress={() => navigateTo('/settings/theme')}
          >
            显示设置
          </ListItem>
        </FieldGroup.Section>

        {/* ── 通用 ── */}
        <FieldGroup.Section title="通用">
          <ListItem
            leading={<RowIcon icon="iphone.radiowaves.left.and.right" tint="#8E8E93" />}
            supportingText="点击、长按、成功/失败等操作反馈"
            trailing={
              <Switch
                value={hapticFeedback}
                onValueChange={(v) => {
                  setPreference('hapticFeedback', v);
                  if (v) hapticForScene('toggle');
                }}
              />
            }
          >
            震动反馈
          </ListItem>
        </FieldGroup.Section>

        {/* ── 使用习惯 ── */}
        <FieldGroup.Section title="使用习惯">
          <ListItem
            leading={<RowIcon icon="slider.horizontal.3" tint="#8E8E93" />}
            supportingText="首页、浏览、贴子、内容等偏好"
            onPress={() => navigateTo('/settings/habit')}
          >
            使用习惯
          </ListItem>
        </FieldGroup.Section>

        {/* ── 账号 ── */}
        <FieldGroup.Section title="账号">
          <ListItem
            leading={<RowIcon icon="person.circle" tint="#4477E0" />}
            supportingText="登录账号、退出登录"
            onPress={() => navigateTo('/settings/account')}
          >
            账号管理
          </ListItem>
          <ListItem
            leading={<RowIcon icon="hand.raised" tint="#FF9500" />}
            supportingText="屏蔽词、屏蔽用户、云端黑名单"
            onPress={() => navigateTo('/settings/block')}
          >
            屏蔽设置
          </ListItem>
        </FieldGroup.Section>

        {/* ── 功能 ── */}
        <FieldGroup.Section title="功能">
          <ListItem
            leading={<RowIcon icon="checkmark.circle" tint="#34C759" />}
            supportingText="自动签到关注的贴吧"
            onPress={() => navigateTo('/settings/oksign')}
          >
            一键签到
          </ListItem>
          <ListItem
            leading={<RowIcon icon="ellipsis.circle" tint="#8E8E93" />}
            supportingText="数据管理、外部链接、系统设置"
            onPress={() => navigateTo('/settings/more')}
          >
            更多设置
          </ListItem>
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
});
