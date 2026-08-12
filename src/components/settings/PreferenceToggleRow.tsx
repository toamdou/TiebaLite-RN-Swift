/**
 * PreferenceToggleRow — SwiftUI Toggle bound directly to the preferences store.
 */

import { Toggle, Text } from '@expo/ui/swift-ui';
import { hapticSelection } from '@/utils/haptics';
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
        hapticSelection();
        setPreference(preferenceKey, next as never);
      }}
    >
      {description ? <Text>{description}</Text> : null}
    </Toggle>
  );
}
