// ============================================================
// TiebaLite React Native - Split Theme Context (Performance)
//
// Theme state is persisted through the Zustand preferences store;
// this context only splits color consumers from action consumers to
// avoid unnecessary re-renders.
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { useColorScheme } from 'react-native';

import type { ThemeColors, ThemeName } from '@/types';
import { getThemeColors, toLegacyThemeColors } from './colors';
import type { SemanticColors } from './colors';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { LIGHT_THEME_OPTIONS, DARK_THEME_OPTIONS } from '@/constants/app';

// ---------- Types ----------

interface ThemeColorsValue {
  colors: SemanticColors;
  themeColors: ThemeColors;
  isDark: boolean;
  lightThemeName: ThemeName;
  darkThemeName: ThemeName;
  themeName: ThemeName;
  followSystemDarkMode: boolean;
  darkMode: boolean;
  translucentAlpha: number;
}

interface ThemeActionsValue {
  setTheme: (name: ThemeName) => void;
  setLightTheme: (name: ThemeName) => void;
  setDarkTheme: (name: ThemeName) => void;
  setDarkMode: (enabled: boolean) => void;
  setFollowSystemDarkMode: (follow: boolean) => void;
  setCustomPrimaryColor: (color: string) => void;
  setTranslucentAlpha: (alpha: number) => void;
  /** @deprecated Use setFollowSystemDarkMode */
  setFollowSystem: (follow: boolean) => void;
}

const ThemeColorsContext = createContext<ThemeColorsValue | null>(null);
const ThemeActionsContext = createContext<ThemeActionsValue | null>(null);

const LIGHT_THEME_NAMES = new Set<ThemeName>(LIGHT_THEME_OPTIONS.map((t) => t.key));
const DARK_THEME_NAMES = new Set<ThemeName>(DARK_THEME_OPTIONS.map((t) => t.key));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const systemIsDark = systemColorScheme === 'dark';

  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const lightThemeName: ThemeName = LIGHT_THEME_NAMES.has(preferences.lightTheme)
    ? preferences.lightTheme
    : 'tieba';
  const darkThemeName: ThemeName = DARK_THEME_NAMES.has(preferences.darkTheme)
    ? preferences.darkTheme
    : 'dark';
  const darkMode = preferences.darkMode;
  const followSystemDarkMode = preferences.followSystemDarkMode;
  const customPrimaryColor = preferences.customPrimaryColor;
  const translucentAlpha = preferences.translucentAlpha;

  const isDark = followSystemDarkMode ? systemIsDark : darkMode;
  const effectiveTheme: ThemeName = isDark ? darkThemeName : lightThemeName;

  const colors = useMemo<SemanticColors>(
    () => getThemeColors(effectiveTheme, customPrimaryColor, isDark),
    [effectiveTheme, customPrimaryColor, isDark],
  );

  const themeColors = useMemo<ThemeColors>(
    () => toLegacyThemeColors(colors, effectiveTheme),
    [colors, effectiveTheme],
  );

  const setLightTheme = useCallback(
    (name: ThemeName) => setPreference('lightTheme', name),
    [setPreference],
  );
  const setDarkTheme = useCallback(
    (name: ThemeName) => setPreference('darkTheme', name),
    [setPreference],
  );
  const setTheme = useCallback(
    (name: ThemeName) => {
      setPreference('lightTheme', name);
      setPreference('darkTheme', name);
    },
    [setPreference],
  );
  const setDarkMode = useCallback(
    (enabled: boolean) => setPreference('darkMode', enabled),
    [setPreference],
  );
  const setFollowSystemDarkMode = useCallback(
    (follow: boolean) => setPreference('followSystemDarkMode', follow),
    [setPreference],
  );
  const setCustomPrimaryColor = useCallback(
    (color: string) => setPreference('customPrimaryColor', color),
    [setPreference],
  );
  const setTranslucentAlpha = useCallback(
    (alpha: number) => setPreference('translucentAlpha', alpha),
    [setPreference],
  );
  const setFollowSystem = setFollowSystemDarkMode;

  const colorsValue = useMemo<ThemeColorsValue>(
    () => ({
      colors,
      themeColors,
      isDark,
      lightThemeName,
      darkThemeName,
      themeName: effectiveTheme,
      followSystemDarkMode,
      darkMode,
      translucentAlpha,
    }),
    [colors, themeColors, isDark, lightThemeName, darkThemeName, effectiveTheme, followSystemDarkMode, darkMode, translucentAlpha],
  );

  const actionsValue = useMemo<ThemeActionsValue>(
    () => ({
      setTheme,
      setLightTheme,
      setDarkTheme,
      setDarkMode,
      setFollowSystemDarkMode,
      setCustomPrimaryColor,
      setTranslucentAlpha,
      setFollowSystem,
    }),
    [setTheme, setLightTheme, setDarkTheme, setDarkMode, setFollowSystemDarkMode, setCustomPrimaryColor, setTranslucentAlpha, setFollowSystem],
  );

  return (
    <ThemeColorsContext.Provider value={colorsValue}>
      <ThemeActionsContext.Provider value={actionsValue}>
        {children}
      </ThemeActionsContext.Provider>
    </ThemeColorsContext.Provider>
  );
}

export function useThemeColors(): ThemeColorsValue {
  const ctx = useContext(ThemeColorsContext);
  if (!ctx) throw new Error('useThemeColors must be used within ThemeProvider');
  return ctx;
}

export function useThemeActions(): ThemeActionsValue {
  const ctx = useContext(ThemeActionsContext);
  if (!ctx) throw new Error('useThemeActions must be used within ThemeProvider');
  return ctx;
}

export function useThemeContext(): ThemeColorsValue & ThemeActionsValue {
  const colors = useThemeColors();
  const actions = useThemeActions();
  return useMemo(() => ({ ...colors, ...actions }), [colors, actions]);
}

/** @deprecated Use useThemeColors() for UI components, useThemeActions() for controls */
export const useAppTheme = useThemeContext;

export default ThemeColorsContext;
