import { useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { Form, Section, Toggle, Text, Picker, ProgressView } from '@expo/ui/swift-ui';
import { progressViewStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { hapticForScene } from '@/theme/hapticsMap';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useThemeColors } from '@/theme/ThemeContext';

/** 阅读字号档位（乘数，作用于帖子正文字号） */
const FONT_SCALE_OPTIONS: { label: string; value: string }[] = [
  { label: '小', value: '0.9' },
  { label: '标准', value: '1' },
  { label: '大', value: '1.15' },
  { label: '特大', value: '1.3' },
];

export default function DisplaySettingsPage() {
  const hydrated = usePreferencesStore((s) => s.hasHydrated);
  // 未水合时返回轻量占位，避免整页白屏闪烁
  if (!hydrated) return <DisplayHydratedPlaceholder />;
  return <DisplaySettingsForm />;
}

/** 偏好水合完成前的轻量加载占位 */
function DisplayHydratedPlaceholder() {
  const { colors } = useThemeColors();
  return (
    <ThemedHost style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ProgressView modifiers={[progressViewStyle('circular'), tint(colors.primary)]} />
    </ThemedHost>
  );
}

function DisplaySettingsForm() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const systemIsDark = useColorScheme() === 'dark';

  const handleFollowSystemChange = useCallback((v: boolean) => {
    hapticForScene('toggle');
    setPreference('followSystemDarkMode', v);
    // 关闭"跟随系统"时，立即以当前系统外观作为手动模式的初值，
    // 避免用户一关掉跟随就白屏/黑屏跳变。
    if (!v) {
      setPreference('darkMode', systemIsDark);
    }
  }, [setPreference, systemIsDark]);

  // 常驻「深色模式」开关：跟随系统时显示当前系统外观（系统变深即同步为开）；
  // 手动开启则退出跟随系统，进入手动模式。
  const effectiveDark = preferences.followSystemDarkMode
    ? systemIsDark
    : preferences.darkMode;

  const handleDarkModeChange = useCallback((v: boolean) => {
    hapticForScene('toggle');
    setPreference('darkMode', v);
    if (preferences.followSystemDarkMode) {
      setPreference('followSystemDarkMode', false);
    }
  }, [preferences.followSystemDarkMode, setPreference]);

  const handleFontScaleChange = useCallback((v: string | number | null) => {
    hapticForScene('toggle');
    const scale = parseFloat(String(v));
    if (!Number.isNaN(scale)) setPreference('fontScale', scale);
  }, [setPreference]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section
          title="外观"
          footer={<Text>「深色模式」在跟随系统时随系统自动同步；手动切换后即退出跟随。</Text>}
        >
          <Toggle
            label="深色模式"
            systemImage="moon.fill"
            isOn={effectiveDark}
            onIsOnChange={handleDarkModeChange}
          >
            <Text>黑底白字；系统变深色时自动跟随开启</Text>
          </Toggle>
          <Toggle
            label="跟随系统外观"
            systemImage="iphone"
            isOn={preferences.followSystemDarkMode}
            onIsOnChange={handleFollowSystemChange}
          >
            <Text>界面颜色自动跟随系统浅色 / 深色设置</Text>
          </Toggle>
        </Section>

        <Section
          title="阅读字号"
          footer={<Text>调整帖子正文与回复的字号，即时生效。</Text>}
        >
          <Picker
            label="正文字号"
            systemImage="textformat.size"
            selection={String(preferences.fontScale)}
            onSelectionChange={handleFontScaleChange}
          >
            {FONT_SCALE_OPTIONS.map((opt) => (
              <Text key={opt.value} modifiers={[tag(opt.value)]}>
                {opt.label}
              </Text>
            ))}
          </Picker>
        </Section>

        <Section title="工具栏选项">
          {/* 该开关实际只影响导航栏前景（标题/返回箭头）与状态栏样式，
              不改变工具栏背景色，故文案按实际作用命名以避免误导 */}
          <Toggle
            label="导航栏使用主色调"
            systemImage="paintpalette.fill"
            isOn={preferences.toolbarPrimaryColor}
            onIsOnChange={(v) => { hapticForScene('toggle'); setPreference('toolbarPrimaryColor', v); }}
          >
            <Text>将导航栏标题与图标着色为主色调，并联动状态栏样式</Text>
          </Toggle>
          {preferences.toolbarPrimaryColor && (
            <Toggle
              label="状态栏深色字体"
              systemImage="textformat"
              isOn={preferences.statusBarFontDark}
              onIsOnChange={(v) => { hapticForScene('toggle'); setPreference('statusBarFontDark', v); }}
            />
          )}
        </Section>
      </Form>
    </ThemedHost>
  );
}
