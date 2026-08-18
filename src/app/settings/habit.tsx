import { useCallback } from 'react';
import { Form, Section, Toggle, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { DEFAULT_SORT_OPTIONS, FORUM_FAB_OPTIONS } from '@/constants/settings';

/**
 * 使用习惯 — 全部行直接嵌在 Form/Section 下（SwiftUI 原生行）。
 * ⚠️ 不要用逐行 ThemedHost 包裹 Toggle：Host 行会被 Form 整体居中，
 * 导致整页设置项水平居中（踩过）。逐行须保持与 theme.tsx 相同的写法。
 */
export default function HabitSettingsPage() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const handlePrefChange = useCallback((key: keyof typeof preferences, v: boolean) => {
    hapticForScene('toggle');
    setPreference(key, v);
  }, [setPreference]);

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
          <Toggle
            label="显示历史吧"
            systemImage="clock.fill"
            isOn={preferences.homePageShowHistoryForum}
            onIsOnChange={(v) => handlePrefChange('homePageShowHistoryForum', v)}
          />
        </Section>

        <Section title="浏览">
          <Toggle
            label="无痕模式"
            systemImage="theatermasks.fill"
            isOn={preferences.incognitoMode}
            onIsOnChange={(v) => handlePrefChange('incognitoMode', v)}
          />
          <Toggle
            label="使用内置浏览器"
            systemImage="safari.fill"
            isOn={preferences.useBuiltInBrowser}
            onIsOnChange={(v) => handlePrefChange('useBuiltInBrowser', v)}
          />
          <Toggle
            label="自动刷新动态"
            systemImage="arrow.clockwise"
            isOn={preferences.exploreAutoRefresh}
            onIsOnChange={(v) => handlePrefChange('exploreAutoRefresh', v)}
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
            onIsOnChange={(v) => handlePrefChange('hideMedia', v)}
          />
        </Section>

        <Section title="贴子">
          <Toggle
            label="显示两个用户名"
            systemImage="person.2.fill"
            isOn={preferences.showBothUsername}
            onIsOnChange={(v) => handlePrefChange('showBothUsername', v)}
          />
          <Toggle
            label="贴内显示快捷按钮"
            systemImage="bolt.fill"
            isOn={preferences.showShortcutInThread}
            onIsOnChange={(v) => handlePrefChange('showShortcutInThread', v)}
          />
          <Toggle
            label="隐藏回复框"
            systemImage="bubble.left.fill"
            isOn={preferences.hideReply}
            onIsOnChange={(v) => handlePrefChange('hideReply', v)}
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
          <Toggle
            label="隐藏屏蔽内容"
            systemImage="nosign"
            isOn={preferences.hideBlockedContent}
            onIsOnChange={(v) => handlePrefChange('hideBlockedContent', v)}
          />
          <Toggle
            label="不显示视频贴"
            systemImage="video.slash.fill"
            isOn={preferences.blockVideo}
            onIsOnChange={(v) => handlePrefChange('blockVideo', v)}
          />
        </Section>

        <Section title="收藏">
          <Toggle
            label="收藏贴子只看楼主"
            systemImage="person.fill"
            isOn={preferences.collectSeeLz}
            onIsOnChange={(v) => handlePrefChange('collectSeeLz', v)}
          />
          <Toggle
            label="收藏贴子倒序查看"
            systemImage="arrow.up.arrow.down"
            isOn={preferences.collectDescSort}
            onIsOnChange={(v) => handlePrefChange('collectDescSort', v)}
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}