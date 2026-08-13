import { useCallback } from 'react';
import { Form, Section, Toggle, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { hapticForScene } from '@/theme/hapticsMap';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePreferenceForm } from '@/hooks/usePreferenceForm';
import { PreferenceToggleRow } from '@/components/settings/PreferenceToggleRow';
import { DEFAULT_SORT_OPTIONS, FORUM_FAB_OPTIONS } from '@/constants/settings';

export default function ExperimentalFeaturesPage() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const { makeToggle } = usePreferenceForm();

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
        <Section title="浏览">
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
            onIsOnChange={makeToggle('hideMedia')}
          />
        </Section>

        <Section title="吧内">
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

        <Section title="收藏">
          <Toggle
            label="收藏贴子只看楼主"
            systemImage="person.fill"
            isOn={preferences.collectSeeLz}
            onIsOnChange={makeToggle('collectSeeLz')}
          />
          <Toggle
            label="收藏贴子倒序查看"
            systemImage="arrow.up.arrow.down"
            isOn={preferences.collectDescSort}
            onIsOnChange={makeToggle('collectDescSort')}
          />
        </Section>

        {/* 从习惯页移入的「暂不生效」偏好：保留偏好但明确标注未生效 */}
        <Section
          title="内容（暂不生效）"
          footer="以下开关仅保存偏好，当前版本尚未生效"
        >
          <PreferenceToggleRow
            preferenceKey="showFollowedOnly"
            label="只显示关注"
            systemImage="star.fill"
            description="当前暂不生效，仅保存偏好"
          />
          <PreferenceToggleRow
            preferenceKey="forumSingleColumn"
            label="贴吧单列布局"
            systemImage="rectangle.fill"
            description="当前暂不生效，仅保存偏好"
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}
