import { Form, Section, Toggle } from '@expo/ui/swift-ui';
import { PreferenceToggleRow } from '@/components/settings/PreferenceToggleRow';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';

export default function HabitSettingsPage() {
  // 卡片风格：开 = 经典 Hero 玻璃卡（备选）；关 = 推特圆角卡片（默认）。立即生效。
  const feedCardStyle = usePreferencesStore((s) => s.preferences.feedCardStyle);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="首页">
          <PreferenceToggleRow
            preferenceKey="homePageShowHistoryForum"
            label="显示历史吧"
            systemImage="clock.fill"
          />
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
          <Toggle
            label="经典卡片风格"
            systemImage="rectangle.fill.on.rectangle.fill"
            isOn={feedCardStyle === 'hero'}
            onIsOnChange={(next) => {
              hapticForScene('toggle');
              setPreference('feedCardStyle', next ? 'hero' : 'twitter');
            }}
          >
            开启后动态与吧内帖子使用经典 Hero 玻璃卡片；关闭恢复推特风格圆角卡片（立即生效）
          </Toggle>
        </Section>

        <Section title="贴子">
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
        </Section>

        <Section title="内容">
          <PreferenceToggleRow
            preferenceKey="hideBlockedContent"
            label="隐藏屏蔽内容"
            systemImage="nosign"
          />
          <PreferenceToggleRow
            preferenceKey="blockVideo"
            label="屏蔽视频"
            systemImage="video.slash.fill"
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}
