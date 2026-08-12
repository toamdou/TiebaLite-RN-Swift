import { useCallback, useState } from 'react';
import { Form, Section, Toggle, Button, Text, TextField, Picker } from '@expo/ui/swift-ui';
import { pickerStyle, tag, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { hapticImpact, hapticNotify, hapticSelection, ImpactFeedbackStyle, NotificationFeedbackType } from '@/utils/haptics';
import { useThemeActions } from '@/theme/ThemeContext';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { usePreferencesStore } from '@/stores/preferencesStore';

const PRESET_COLORS = [
  '#4477E0', '#007AFF', '#34C759', '#FF9500',
  '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55',
  '#FF9A9E', '#C51100', '#512DA8', '#30B0C7',
  '#00C7BE', '#32ADE6', '#A2845E', '#8E8E93',
];

export default function CustomSettingsPage() {
  const hydrated = usePreferencesStore((s) => s.hasHydrated);
  if (!hydrated) return null;
  return <CustomSettingsForm />;
}

function CustomSettingsForm() {
  const { setCustomPrimaryColor, setTheme } = useThemeActions();
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const [hexInput, setHexInput] = useState(preferences.customPrimaryColor);

  const handleColorSelect = useCallback((color: string) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setHexInput(color);
    setCustomPrimaryColor(color);
  }, [setCustomPrimaryColor]);

  const handleHexChange = useCallback((text: string) => {
    const val = text.startsWith('#') ? text : `#${text}`;
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setCustomPrimaryColor(val);
    }
  }, [setCustomPrimaryColor]);

  const handleApply = useCallback(() => {
    hapticNotify(NotificationFeedbackType.Success);
    setTheme('custom');
  }, [setTheme]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="自定义颜色">
          <TextField
            placeholder="输入十六进制颜色 (如 4477E0)"
            onTextChange={handleHexChange}
            maxLength={7}
          />
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
            当前颜色: {hexInput}
          </Text>
        </Section>

        <Section title="预设颜色">
          <Picker
            selection={hexInput}
            onSelectionChange={handleColorSelect as any}
            modifiers={[pickerStyle('inline')]}
          >
            {PRESET_COLORS.map((color) => (
              <Text key={color} modifiers={[tag(color)]}>{color}</Text>
            ))}
          </Picker>
        </Section>

        <Section title="工具栏选项">
          <Toggle
            label="工具栏使用主色调"
            systemImage="paintpalette.fill"
            isOn={preferences.toolbarPrimaryColor}
            onIsOnChange={(v) => { hapticSelection(); setPreference('toolbarPrimaryColor', v); }}
          />
          {preferences.toolbarPrimaryColor && (
            <Toggle
              label="状态栏深色字体"
              systemImage="textformat"
              isOn={preferences.statusBarFontDark}
              onIsOnChange={(v) => { hapticSelection(); setPreference('statusBarFontDark', v); }}
            />
          )}
        </Section>

        <Section>
          <Button
            label="应用自定义主题"
            systemImage="paintbrush.pointed.fill"
            onPress={handleApply}
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}
