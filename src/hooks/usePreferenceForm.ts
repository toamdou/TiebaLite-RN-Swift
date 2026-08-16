/**
 * Shared settings form helpers over the Zustand preferences store.
 */

import { useCallback } from 'react';
import { hapticForScene } from '@/theme/hapticsMap';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { AppPreferences } from '@/types';

export function usePreferenceForm() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const setPreferences = usePreferencesStore((s) => s.setPreferences);

  const makeToggle = useCallback(
    <K extends keyof AppPreferences>(key: K) =>
      (newValue: AppPreferences[K]) => {
        hapticForScene('toggle');
        setPreference(key, newValue);
      },
    [setPreference],
  );

  return { preferences, setPreference, setPreferences, makeToggle };
}
