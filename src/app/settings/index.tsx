/**
 * Settings Page (设置) — SwiftUI Form native implementation.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Form, Section, Toggle, Button, Text, Label,
} from '@expo/ui/swift-ui';
import {
  font, foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { useThemeColors, useThemeActions } from '@/theme/ThemeContext';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { PreferenceToggleRow } from '@/components/settings/PreferenceToggleRow';
import { ThemedHost } from '@/components/ui/ThemedHost';

export default function SettingsPage() {
  const router = useRouter();
  const { isDark } = useThemeColors();
  const { followSystemDarkMode } = useThemeColors();
  const { setDarkMode, setFollowSystemDarkMode } = useThemeActions();
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const hapticFeedback = usePreferencesStore((s) => s.preferences.hapticFeedback);

  const [experimentalHint, setExperimentalHint] = useState('');
  const experimentalTaps = useRef(0);

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

  const handleExperimentalPress = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Light);
    experimentalTaps.current += 1;
    if (experimentalTaps.current >= 7) {
      experimentalTaps.current = 0;
      setExperimentalHint('');
      router.push('/settings/experimental' as any);
    } else {
      setExperimentalHint(`再点击 ${7 - experimentalTaps.current} 次进入实验功能`);
    }
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
            <Label title="主题设置" systemImage="paintpalette" modifiers={[foregroundStyle('#AF52DE')]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/custom')}>
            <Label title="自定义主题" systemImage="paintbrush.pointed" modifiers={[foregroundStyle('#FF2D55')]} />
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

        <Section title="首页">
          <PreferenceToggleRow
            preferenceKey="homePageShowHistoryForum"
            label="显示历史吧"
          />
        </Section>

        <Section title="浏览">
          <PreferenceToggleRow preferenceKey="incognitoMode" label="无痕模式" />
          <PreferenceToggleRow preferenceKey="useBuiltInBrowser" label="使用内置浏览器" />
          <PreferenceToggleRow preferenceKey="exploreAutoRefresh" label="自动刷新动态" />
          <Button onPress={() => navigateTo('/settings/habit')}>
            <Label title="使用习惯" systemImage="slider.horizontal.3" modifiers={[foregroundStyle('#8E8E93')]} />
          </Button>
        </Section>

        <Section title="贴子">
          <PreferenceToggleRow preferenceKey="showBothUsername" label="显示两个用户名" />
          <PreferenceToggleRow preferenceKey="showShortcutInThread" label="贴内显示快捷按钮" />
          <PreferenceToggleRow preferenceKey="hideReply" label="隐藏回复框" />
        </Section>

        <Section title="内容">
          <PreferenceToggleRow preferenceKey="hideBlockedContent" label="隐藏屏蔽内容" />
          <PreferenceToggleRow
            preferenceKey="showFollowedOnly"
            label="只显示关注"
            description="当前暂不生效，仅保存偏好"
          />
          <PreferenceToggleRow preferenceKey="blockVideo" label="屏蔽视频" />
          <PreferenceToggleRow
            preferenceKey="forumSingleColumn"
            label="贴吧单列布局"
            description="当前暂不生效，仅保存偏好"
          />
        </Section>

        <Section title="账号">
          <Button onPress={() => navigateTo('/settings/account')}>
            <Label title="账号管理" systemImage="person.circle" modifiers={[foregroundStyle('#4477E0')]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/block')}>
            <Label title="屏蔽设置" systemImage="hand.raised" modifiers={[foregroundStyle('#FF9500')]} />
          </Button>
        </Section>

        <Section title="功能">
          <Button onPress={() => navigateTo('/topic/list')}>
            <Label title="话题列表" systemImage="number" modifiers={[foregroundStyle('#FF9500')]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/oksign')}>
            <Label title="一键签到" systemImage="checkmark.circle" modifiers={[foregroundStyle('#34C759')]} />
          </Button>
          <Button onPress={() => navigateTo('/settings/more')}>
            <Label title="更多设置" systemImage="ellipsis.circle" modifiers={[foregroundStyle('#8E8E93')]} />
          </Button>
          <Button onPress={handleExperimentalPress}>
            <Label title="实验功能" systemImage="flask" modifiers={[foregroundStyle('#FF9500')]} />
          </Button>
          {experimentalHint ? (
            <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
              {experimentalHint}
            </Text>
          ) : null}
        </Section>
      </Form>
    </ThemedHost>
  );
}
