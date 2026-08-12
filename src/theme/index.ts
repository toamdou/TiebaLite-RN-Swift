// ============================================================
// TiebaLite React Native - Theme System Barrel Export
// ============================================================

// Colors
export {
  getThemeColors,
  toLegacyThemeColors,
  translucentPalette,
} from './colors';
export type { SemanticColors } from './colors';

// Typography
export {
  Typography,
  typographyStyles,
  typographyStyles as TypographyStyles,
} from './typography';
export type { TypographyStyle } from './typography';

// Spacing
export {
  Spacing,
  Radius,
  Shadows,
  IconSize,
} from './spacing';
export type { SpacingKey } from './spacing';

// Springs
export * from './springs';

// Theme Context
export { ThemeProvider, useThemeContext, useAppTheme } from './ThemeContext';
export { default as ThemeContext } from './ThemeContext';
