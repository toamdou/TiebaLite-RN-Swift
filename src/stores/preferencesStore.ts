/**
 * Zustand-powered preferences store.
 *
 * This is the single persistence layer for AppPreferences. Legacy
 * `@tiebalite:*` keys are migrated once on startup and removed on reset.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import type { AppPreferences } from '@/types';
import { DEFAULT_PREFERENCES } from '@/constants/preferences';
import {
  kvGet,
  kvMultiGet,
  kvMultiRemove,
  kvMultiSet,
  kvRemove,
} from '@/services/storage/unifiedDb';

export const PREFERENCES_STORAGE_KEY = 'tiebalite_preferences';

export const LEGACY_PREFERENCE_KEYS = [
  '@tiebalite:theme',
  '@tiebalite:darkMode',
  '@tiebalite:followSystemDarkMode',
  '@tiebalite:customPrimaryColor',
  '@tiebalite:translucentAlpha',
  '@tiebalite:lightTheme',
  '@tiebalite:darkTheme',
  '@tiebalite:pref_hideExplore',
] as const;

/**
 * 主题选择系统已移除：界面固定浅色/深色并跟随系统外观。
 * 旧的 @tiebalite:* 主题键不再迁移，仅在此清理残留存储。
 */
export async function migrateLegacyPreferences(): Promise<void> {
  await AsyncStorage.multiRemove([...LEGACY_PREFERENCE_KEYS]);
}

export type AppPreferenceKey = keyof AppPreferences;

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as AppPreferenceKey[];
const PREFERENCE_KEY_PREFIX = `${PREFERENCES_STORAGE_KEY}:`;

type PersistedPreferencesState = { preferences: AppPreferences };

let lastPersistedPreferences: AppPreferences | null = null;
let storageWriteQueue: Promise<void> = Promise.resolve();

function preferenceStorageKey(key: AppPreferenceKey): string {
  return `${PREFERENCE_KEY_PREFIX}${key}`;
}

function preferenceStorageKeys(): string[] {
  return PREFERENCE_KEYS.map(preferenceStorageKey);
}

function parseStoredPreferenceValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function enqueueStorageWrite(operation: () => Promise<void>): Promise<void> {
  const run = storageWriteQueue.then(operation, operation);
  storageWriteQueue = run.catch(() => {});
  return run.catch(() => {});
}

async function removePreferencesStorage(): Promise<void> {
  await enqueueStorageWrite(async () => {
    await kvMultiRemove([PREFERENCES_STORAGE_KEY, ...preferenceStorageKeys()]);
    lastPersistedPreferences = null;
  });
}

const preferencesPersistStorage: PersistStorage<PersistedPreferencesState, Promise<void>> = {
  async getItem() {
    const [legacyValue, entries] = await Promise.all([
      kvGet(PREFERENCES_STORAGE_KEY),
      kvMultiGet(preferenceStorageKeys()),
    ]);

    const merged: Partial<AppPreferences> = {};
    let hasPerKeyValues = false;
    for (const [key, value] of entries) {
      if (value == null) continue;
      hasPerKeyValues = true;
      const preferenceKey = key.slice(PREFERENCE_KEY_PREFIX.length) as AppPreferenceKey;
      if (PREFERENCE_KEYS.includes(preferenceKey)) {
        (merged as Record<string, unknown>)[preferenceKey] = parseStoredPreferenceValue(value);
      }
    }

    if (legacyValue) {
      try {
        const parsed = JSON.parse(legacyValue) as
          | { preferences?: Partial<AppPreferences> }
          | Partial<AppPreferences>
          | null;
        const stored =
          parsed && typeof parsed === 'object' && 'preferences' in parsed
            ? parsed.preferences
            : parsed ?? {};
        for (const key of PREFERENCE_KEYS) {
          const value = (stored as Record<string, unknown>)[key];
          if (value !== undefined && (merged as Record<string, unknown>)[key] === undefined) {
            (merged as Record<string, unknown>)[key] = value;
          }
        }
      } catch {}

      const legacyKeysToWrite = PREFERENCE_KEYS.filter(
        (key) => (merged as Record<string, unknown>)[key] !== undefined,
      );
      await enqueueStorageWrite(async () => {
        if (legacyKeysToWrite.length > 0) {
          await kvMultiSet(
            legacyKeysToWrite.map(
              (key) => [preferenceStorageKey(key), JSON.stringify(merged[key])] as [string, string],
            ),
          );
        }
        await kvRemove(PREFERENCES_STORAGE_KEY);
      });
      lastPersistedPreferences = { ...DEFAULT_PREFERENCES, ...merged };
      return { state: { preferences: lastPersistedPreferences } };
    }

    if (hasPerKeyValues) {
      lastPersistedPreferences = { ...DEFAULT_PREFERENCES, ...merged };
      return { state: { preferences: lastPersistedPreferences } };
    }

    lastPersistedPreferences = null;
    return null;
  },

  async setItem(_name, value) {
    const incoming = value.state?.preferences;
    if (!incoming) return;
    const next: AppPreferences = { ...DEFAULT_PREFERENCES, ...incoming };
    await enqueueStorageWrite(async () => {
      const previous = lastPersistedPreferences ?? { ...DEFAULT_PREFERENCES };
      const changed: [string, string][] = [];
      for (const key of PREFERENCE_KEYS) {
        if (next[key] !== previous[key]) {
          changed.push([preferenceStorageKey(key), JSON.stringify(next[key])]);
        }
      }
      if (changed.length > 0) {
        await kvMultiSet(changed);
      }
      lastPersistedPreferences = next;
    });
  },

  async removeItem() {
    await removePreferencesStorage();
  },
};

interface PreferencesState {
  preferences: AppPreferences;
  hasHydrated: boolean;
  setPreference: <K extends AppPreferenceKey>(key: K, value: AppPreferences[K]) => void;
  setPreferences: (prefs: Partial<AppPreferences>) => void;
  setHasHydrated: () => void;
  resetPreferences: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      preferences: { ...DEFAULT_PREFERENCES },
      hasHydrated: false,
      setPreference: (key, value) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        })),
      setPreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),
      setHasHydrated: () => set({ hasHydrated: true }),
      resetPreferences: async () => {
        await removePreferencesStorage();
        await kvMultiRemove([...LEGACY_PREFERENCE_KEYS]);
        set({ preferences: { ...DEFAULT_PREFERENCES } });
      },
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: preferencesPersistStorage,
      partialize: (state) => ({ preferences: state.preferences }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated();
      },
    },
  ),
);
