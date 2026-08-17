/**
 * PreferenceToggleRow — SwiftUI Toggle bound directly to the preferences store.
 *
 * 直接置于 Form/Section 内（不经 ThemedHost matchContents 包裹）：
 * 包裹会让 Toggle 按内容宽度收缩导致整行居中；原生 Section 行默认左对齐并填满。
 */

import { Toggle, Text } from '@expo/ui/swift-ui';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { AppPreferences } from '@/types';

export interface PreferenceToggleRowProps {
  preferenceKey: keyof AppPreferences;
  label?: string;
  systemImage?: string;
  description?: string;
}

export function PreferenceToggleRow({
  preferenceKey,
  label,
  systemImage,
  description,
}: PreferenceToggleRowProps) {
  const value = usePreferencesStore((s) => s.preferences[preferenceKey]);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  return (
    <Toggle
      label={label}
      systemImage={systemImage as any}
      isOn={Boolean(value)}
      onIsOnChange={(next) => {
        hapticForScene('toggle');
        setPreference(preferenceKey, next as never);
      }}
    >
      {description ? <Text>{description}</Text> : null}
    </Toggle>
  );
}
