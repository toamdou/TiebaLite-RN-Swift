import { useCallback } from 'react';
import { Form, Section, Toggle, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { PreferenceToggleRow } from '@/components/settings/PreferenceToggleRow';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { DEFAULT_SORT_OPTIONS, FORUM_FAB_OPTIONS } from '@/constants/settings';

export default function HabitSettingsPage() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const handleSortChange = useCallback((v: string) => {
    hapticForScene('toggle');
    setPreference('defaultSortType', v);
  }, [setPreference]);

  const handleFabChange = useCallback((v: string) => {
    hapticForScene('toggle');
    setPreference('forumFabFunction', v);
  }, [setPreference]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="首页">
          <PreferenceToggleRow
            preferenceKey="homePageShowHistoryForum"
            label="显示历史吧"
            systemImage="clock.fill"
          />
          <Picker
            label="贴吧布局"
            selection={preferences.homeForumLayout}
            onSelectionChange={(v: string) => { hapticForScene('toggle'); setPreference('homeForumLayout', v as 'single' | 'double'); }}
            modifiers={[pickerStyle('menu')]}
          >
            <Text modifiers={[tag('single')]}>一行一个</Text>
            <Text modifiers={[tag('double')]}>一行两个</Text>
          </Picker>
          <Picker
            label="贴吧排序"
            selection={preferences.homeForumSort}
            onSelectionChange={(v: string) => { hapticForScene('toggle'); setPreference('homeForumSort', v as 'name' | 'level'); }}
            modifiers={[pickerStyle('menu')]}
          >
            <Text modifiers={[tag('name')]}>按吧名</Text>
            <Text modifiers={[tag('level')]}>按等级</Text>
          </Picker>
        </Section>

        <Section title="浏览">
          <PreferenceToggleRow
            preferenceKey="incognitoMode"
            label="无痕模式"
            systemImage="theatermasks.fill"
          />
          <PreferenceToggleRow
            preferenceKey="useBuiltInBrowser"
            label="使用内置浏览器"
            systemImage="safari.fill"
          />
          <PreferenceToggleRow
            preferenceKey="exploreAutoRefresh"
            label="自动刷新动态"
            systemImage="arrow.clockwise"
          />
          <Picker
            label="默认排序方式"
            selection={preferences.defaultSortType}
            onSelectionChange={handleSortChange}
            modifiers={[pickerStyle('menu')]}
          >
            {DEFAULT_SORT_OPTIONS.map((opt) => (
              <Text key={opt.value} modifiers={[tag(opt.value)]}>{opt.label}</Text>
            ))}
          </Picker>
          <Toggle
            label="隐藏媒体内容"
            systemImage="photo.on.rectangle.angled"
            isOn={preferences.hideMedia}
            onIsOnChange={(v) => { hapticForScene('toggle'); setPreference('hideMedia', v); }}
          />
        </Section>

        <Section title="贴子">
          <PreferenceToggleRow
            preferenceKey="forumSingleColumn"
            label="单列布局"
            systemImage="rectangle.grid.1x2.fill"
            description="贴吧信息流使用单列大卡片"
          />
          <PreferenceToggleRow
            preferenceKey="showBothUsername"
            label="显示两个用户名"
            systemImage="person.2.fill"
          />
          <PreferenceToggleRow
            preferenceKey="showShortcutInThread"
            label="贴内显示快捷按钮"
            systemImage="bolt.fill"
          />
          <PreferenceToggleRow
            preferenceKey="hideReply"
            label="隐藏回复框"
            systemImage="bubble.left.fill"
          />
          <Picker
            label="悬浮按钮功能"
            selection={preferences.forumFabFunction}
            onSelectionChange={handleFabChange}
            modifiers={[pickerStyle('menu')]}
          >
            {FORUM_FAB_OPTIONS.map((opt) => (
              <Text key={opt.value} modifiers={[tag(opt.value)]}>{opt.label}</Text>
            ))}
          </Picker>
        </Section>

        <Section title="内容">
          <PreferenceToggleRow
            preferenceKey="hideBlockedContent"
            label="隐藏屏蔽内容"
            systemImage="nosign"
          />
          <PreferenceToggleRow
            preferenceKey="blockVideo"
            label="不显示视频贴"
            systemImage="video.slash.fill"
          />
        </Section>

        <Section title="收藏">
          <Toggle
            label="收藏贴子只看楼主"
            systemImage="person.fill"
            isOn={preferences.collectSeeLz}
            onIsOnChange={(v) => { hapticForScene('toggle'); setPreference('collectSeeLz', v); }}
          />
          <Toggle
            label="收藏贴子倒序查看"
            systemImage="arrow.up.arrow.down"
            isOn={preferences.collectDescSort}
            onIsOnChange={(v) => { hapticForScene('toggle'); setPreference('collectDescSort', v); }}
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}
