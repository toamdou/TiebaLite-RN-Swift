// ============================================================
// TiebaLite React Native - Theme Context (固定浅色/深色，跟随系统)
//
// 主题选择系统已移除：界面固定使用 iOS 浅色（白底黑字）或深色
// （黑底白字），由系统外观自动切换（useColorScheme）。
// ============================================================

import React, {
  createContext,
  useContext,
  useMemo,
} from 'react';
import { useColorScheme } from 'react-native';

import type { SemanticColors } from './colors';
import { getThemeColors } from './colors';

// ---------- Types ----------

interface ThemeColorsValue {
  colors: SemanticColors;
  isDark: boolean;
  themeName: 'tieba';
  translucentAlpha: number;
}

const ThemeColorsContext = createContext<ThemeColorsValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemIsDark = useColorScheme() === 'dark';

  const colors = useMemo<SemanticColors>(
    () => getThemeColors(systemIsDark),
    [systemIsDark],
  );

  const colorsValue = useMemo<ThemeColorsValue>(
    () => ({
      colors,
      isDark: systemIsDark,
      themeName: 'tieba',
      translucentAlpha: 0.85,
    }),
    [colors, systemIsDark],
  );

  return (
    <ThemeColorsContext.Provider value={colorsValue}>
      {children}
    </ThemeColorsContext.Provider>
  );
}

export function useThemeColors(): ThemeColorsValue {
  const ctx = useContext(ThemeColorsContext);
  if (!ctx) throw new Error('useThemeColors must be used within ThemeProvider');
  return ctx;
}

export function useThemeContext(): ThemeColorsValue {
  return useThemeColors();
}

/** @deprecated Use useThemeColors() */
export const useAppTheme = useThemeContext;

export default ThemeColorsContext;
