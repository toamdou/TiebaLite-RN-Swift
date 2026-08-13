/**
 * PreferenceToggleRow — SwiftUI Toggle bound directly to the preferences store.
 */

import { Toggle, Text } from '@expo/ui/swift-ui';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ThemedHost } from '@/components/ui/ThemedHost';
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
    <ThemedHost matchContents>
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
    </ThemedHost>
  );
}
