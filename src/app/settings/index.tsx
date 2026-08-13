/**
 * Settings Page (设置) — SwiftUI Form native implementation.
 */

import { useCallback } from 'react';
import {
  Form, Section, Toggle, Button, Text, Label,
} from '@expo/ui/swift-ui';
import {
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { useThemeColors, useThemeActions } from '@/theme/ThemeContext';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ThemedHost } from '@/components/ui/ThemedHost';

// §设计系统：导航行图标着色映射——图标色收进单个常量，
// 每行按 systemImage 取色，避免散落硬编码色值。
const NAV_ICON_TINTS: Record<string, string> = {
  paintpalette: '#AF52DE',
  'paintbrush.pointed': '#FF2D55',
  'slider.horizontal.3': '#8E8E93',
  'person.circle': '#4477E0',
  'hand.raised': '#FF9500',
  number: '#FF9500',
  'checkmark.circle': '#34C759',
  'ellipsis.circle': '#8E8E93',
  flask: '#FF9500',
};

export default function SettingsPage() {
  const router = useRouter();
  const { isDark } = useThemeColors();
  const { followSystemDarkMode } = useThemeColors();
  const { setDarkMode, setFollowSystemDarkMode } = useThemeActions();
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const hapticFeedback = usePreferencesStore((s) => s.preferences.hapticFeedback);

  const handleFollowSystem = useCallback((follow: boolean) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setFollowSystemDarkMode(follow);
  }, [setFollowSystemDarkMode]);

  const handleHapticFeedback = useCallback((enabled: boolean) => {
    setPreference('hapticFeedback', enabled);
    if (enabled) {
      hapticImpact(ImpactFeedbackStyle.Light);
    }
  }, [setPreference]);

  const handleDarkMode = useCallback((enabled: boolean) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setDarkMode(enabled);
  }, [setDarkMode]);

  const navigateTo = useCallback((route: string) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    router.push(route as any);
  }, [router]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="外观">
          <Toggle
            label="跟随系统深色模式"
            isOn={followSystemDarkMode}
            onIsOnChange={handleFollowSystem}
          />
          <Toggle
            label="深色模式"
            isOn={isDark}
            onIsOnChange={handleDarkMode}
          />
          <Button onPress={() => navigateTo('/settings/theme')}>
            <Label title="主题设置" systemImage="paintpalette" modifiers={[foregroundStyle(NAV_ICON_TINTS.paintpalette)]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/custom')}>
            <Label title="自定义主题" systemImage="paintbrush.pointed" modifiers={[foregroundStyle(NAV_ICON_TINTS['paintbrush.pointed'])]} />
          </Button>
        </Section>

        <Section title="通用">
          <Toggle
            isOn={hapticFeedback}
            onIsOnChange={handleHapticFeedback}
          >
            <Text>震动反馈</Text>
            <Text>点击、长按、成功/失败等操作反馈</Text>
          </Toggle>
        </Section>

        {/* 首页/浏览/贴子/内容 的偏好开关已收敛到「使用习惯」页（habit.tsx），
            设置首页只保留入口行，避免两处重复 Toggle */}
        <Section
          title="使用习惯"
          footer="首页、浏览、贴子、内容等偏好开关统一在「使用习惯」页管理"
        >
          <Button onPress={() => navigateTo('/settings/habit')}>
            <Label title="使用习惯" systemImage="slider.horizontal.3" modifiers={[foregroundStyle(NAV_ICON_TINTS['slider.horizontal.3'])]} />
          </Button>
        </Section>

        <Section title="账号">
          <Button onPress={() => navigateTo('/settings/account')}>
            <Label title="账号管理" systemImage="person.circle" modifiers={[foregroundStyle(NAV_ICON_TINTS['person.circle'])]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/block')}>
            <Label title="屏蔽设置" systemImage="hand.raised" modifiers={[foregroundStyle(NAV_ICON_TINTS['hand.raised'])]} />
          </Button>
        </Section>

        <Section title="功能">
          <Button onPress={() => navigateTo('/topic/list')}>
            <Label title="话题列表" systemImage="number" modifiers={[foregroundStyle(NAV_ICON_TINTS.number)]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/oksign')}>
            <Label title="一键签到" systemImage="checkmark.circle" modifiers={[foregroundStyle(NAV_ICON_TINTS['checkmark.circle'])]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/more')}>
            <Label title="更多设置" systemImage="ellipsis.circle" modifiers={[foregroundStyle(NAV_ICON_TINTS['ellipsis.circle'])]} />
          </Button>
          {/* 实验功能固定入口（原「连点 7 次」隐藏入口已移除） */}
          <Button onPress={() => navigateTo('/settings/experimental')}>
            <Label title="实验功能" systemImage="flask" modifiers={[foregroundStyle(NAV_ICON_TINTS.flask)]} />
          </Button>
        </Section>
      </Form>
    </ThemedHost>
  );
}
