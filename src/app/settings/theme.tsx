import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Form, Section, Toggle, Button, Text, Picker, Slider } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { useRouter } from 'expo-router';
import { useThemeColors, useThemeActions } from '@/theme/ThemeContext';
import type { ThemeName } from '@/types';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { LIGHT_THEME_OPTIONS, DARK_THEME_OPTIONS } from '@/constants/app';

const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.05;

export default function ThemeSelectionPage() {
  const hydrated = usePreferencesStore((s) => s.hasHydrated);
  // 未水合时返回轻量占位，避免整页白屏闪烁
  if (!hydrated) return <ThemeHydratedPlaceholder />;
  return <ThemeSelectionForm />;
}

/** 偏好水合完成前的轻量加载占位 */
function ThemeHydratedPlaceholder() {
  const { colors } = useThemeColors();
  return (
    <ThemedHost style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </ThemedHost>
  );
}

function ThemeSelectionForm() {
  const router = useRouter();
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const [fontScale, setFontScaleState] = useState(preferences.fontScale);
  const {
    lightThemeName,
    darkThemeName,
    followSystemDarkMode,
    isDark,
  } = useThemeColors();
  const {
    setLightTheme,
    setDarkTheme,
    setDarkMode,
    setFollowSystemDarkMode,
  } = useThemeActions();

  const handleFontScaleChange = useCallback((value: number) => {
    setFontScaleState(value);
  }, []);

  const handleFontScaleCommit = useCallback((isEditing: boolean) => {
    if (!isEditing) {
      setPreference('fontScale', fontScale);
    }
  }, [fontScale, setPreference]);

  const handleFollowSystem = useCallback((follow: boolean) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setFollowSystemDarkMode(follow);
  }, [setFollowSystemDarkMode]);

  const handleDarkMode = useCallback((enabled: boolean) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setDarkMode(enabled);
  }, [setDarkMode]);

  const handleLightTheme = useCallback((key: string) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setLightTheme(key as ThemeName);
  }, [setLightTheme]);

  const handleDarkTheme = useCallback((key: string) => {
    hapticImpact(ImpactFeedbackStyle.Light);
    setDarkTheme(key as ThemeName);
  }, [setDarkTheme]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="显示">
          <Slider
            label={`阅读字号 ${fontScale.toFixed(2)}×`}
            value={fontScale}
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            onValueChange={handleFontScaleChange}
            onEditingChanged={handleFontScaleCommit}
          />
        </Section>

        <Section title="显示模式">
          <Toggle
            label="跟随系统"
            systemImage="circle.lefthalf.filled"
            isOn={followSystemDarkMode}
            onIsOnChange={handleFollowSystem}
          />
          <Toggle
            label="深色模式"
            systemImage="moon.fill"
            isOn={isDark}
            onIsOnChange={handleDarkMode}
          />
        </Section>

        <Section title="浅色主题">
          <Picker
            label="主题"
            selection={lightThemeName}
            onSelectionChange={handleLightTheme as any}
            modifiers={[pickerStyle('inline')]}
          >
            {LIGHT_THEME_OPTIONS.map((t) => (
              <Text key={t.key} modifiers={[tag(t.key)]}>{t.label}</Text>
            ))}
          </Picker>
        </Section>

        <Section title="暗色主题">
          <Picker
            label="主题"
            selection={darkThemeName}
            onSelectionChange={handleDarkTheme as any}
            modifiers={[pickerStyle('inline')]}
          >
            {DARK_THEME_OPTIONS.map((t) => (
              <Text key={t.key} modifiers={[tag(t.key)]}>{t.label}</Text>
            ))}
          </Picker>
        </Section>

        <Section title="高级">
          <Button
            label="自定义主题"
            systemImage="paintbrush.fill"
            onPress={() => router.push('/settings/custom')}
          />
        </Section>
      </Form>
    </ThemedHost>
  );
}
