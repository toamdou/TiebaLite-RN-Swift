import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Form, Section, Toggle, Text, Slider } from '@expo/ui/swift-ui';
import { hapticForScene } from '@/theme/hapticsMap';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { usePreferencesStore } from '@/stores/preferencesStore';

const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.05;

export default function DisplaySettingsPage() {
  const hydrated = usePreferencesStore((s) => s.hasHydrated);
  // 未水合时返回轻量占位，避免整页白屏闪烁
  if (!hydrated) return <DisplayHydratedPlaceholder />;
  return <DisplaySettingsForm />;
}

/** 偏好水合完成前的轻量加载占位 */
function DisplayHydratedPlaceholder() {
  return (
    <ThemedHost style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#2563EB" />
    </ThemedHost>
  );
}

function DisplaySettingsForm() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const [fontScale, setFontScaleState] = useState(preferences.fontScale);

  const handleFontScaleChange = useCallback((value: number) => {
    setFontScaleState(value);
  }, []);

  const handleFontScaleCommit = useCallback((isEditing: boolean) => {
    if (!isEditing) {
      setPreference('fontScale', fontScale);
    }
  }, [fontScale, setPreference]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="显示">
          <Slider
            label={<Text>阅读字号 {fontScale.toFixed(2)}×</Text>}
            value={fontScale}
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            onValueChange={handleFontScaleChange}
            onEditingChanged={handleFontScaleCommit}
          />
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

        <Section
          title="外观"
          footer={<Text>界面颜色跟随系统外观：浅色模式为白底黑字，深色模式为黑底白字。</Text>}
        >
          <Text>浅色模式 / 深色模式</Text>
        </Section>
      </Form>
    </ThemedHost>
  );
}
