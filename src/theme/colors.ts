// ============================================================
// TiebaLite React Native - Fixed Light/Dark Palettes
//
// 主题选择系统已移除：界面固定浅色（白底黑字）或深色（黑底白字），
// 由系统外观自动切换。此处仅保留两套完整语义色板。
// ============================================================

// ---------- Semantic Color Tokens ----------
export interface SemanticColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;

  background: string;
  windowBackground: string;
  surface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;

  /** Glass surface color (for reduceTransparency fallback) */
  glassSurface: string;
  /** Glass surface in dark mode */
  glassSurfaceDark: string;

  card: string;
  floorCard: string;
  cardElevated: string;

  toolbar: string;
  toolbarSurface: string;
  onToolbarSurface: string;
  navBar: string;
  navBarSurface: string;
  onNavBarSurface: string;
  tabBar: string;
  tabBarBorder: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textOnPrimary: string;
  textLink: string;

  chip: string;
  onChip: string;
  chipSelected: string;
  switchTrack: string;
  switchTrackActive: string;
  switchThumb: string;

  divider: string;
  separator: string;
  border: string;

  unselected: string;
  placeholder: string;
  disabled: string;

  success: string;
  warning: string;
  error: string;
  info: string;

  // ---------- iOS 系统级语义别名 ----------
  /** iOS label（同 text） */
  label: string;
  /** iOS secondaryLabel（同 textSecondary） */
  secondaryLabel: string;
  /** iOS tertiaryLabel（同 textTertiary） */
  tertiaryLabel: string;
  /** iOS opaqueSeparator（不透明分隔线） */
  opaqueSeparator: string;
  /** iOS systemBackground */
  systemBackground: string;
  /** iOS secondarySystemBackground */
  secondarySystemBackground: string;
  /** iOS tertiarySystemBackground */
  tertiarySystemBackground: string;
  /** 全局主题色（tint / accent 别名） */
  tint: string;
  /** 危险色（同 error） */
  danger: string;
  /** 链接色（同 textLink） */
  link: string;

  shadow: string;
  indicator: string;
  overlay: string;
  scrim: string;

  isNight: boolean;
}

// ---------- Light Palette (iOS System, 白底黑字) ----------
// 产品要求：字体/图标只用黑白色 → primary 及联动色统一黑色
const LIGHT: SemanticColors = {
  primary: '#000000',
  primaryLight: 'rgba(0,0,0,0.08)',
  primaryDark: '#000000',
  accent: '#000000',

  // 全局纯白背景
  background: '#FFFFFF',
  windowBackground: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F2F2F7',
  surfaceTertiary: '#E5E5EA',

  glassSurface: '#F2F2F7',
  glassSurfaceDark: '#1C1C1E',

  card: '#FFFFFF',
  floorCard: '#FFFFFF',
  cardElevated: '#FFFFFF',

  // 导航/工具栏：白底（产品要求全局白底）
  toolbar: '#FFFFFF',
  toolbarSurface: '#FFFFFF',
  onToolbarSurface: '#000000',
  navBar: '#FFFFFF',
  navBarSurface: '#FFFFFF',
  onNavBarSurface: '#000000',
  tabBar: 'rgba(249,249,249,0.94)',
  tabBarBorder: 'rgba(60,60,67,0.12)',

  // iOS label 层级（黑字）
  text: '#000000',
  textSecondary: 'rgba(60,60,67,0.6)',
  textTertiary: 'rgba(60,60,67,0.3)',
  textDisabled: 'rgba(60,60,67,0.2)',
  textOnPrimary: '#FFFFFF',
  textLink: '#000000',

  chip: 'rgba(0,0,0,0.08)',
  onChip: '#000000',
  chipSelected: '#000000',
  switchTrack: 'rgba(120,120,128,0.16)',
  switchTrackActive: '#34C759',
  switchThumb: '#FFFFFF',

  divider: 'rgba(60,60,67,0.12)',
  separator: 'rgba(60,60,67,0.12)',
  border: 'rgba(60,60,67,0.12)',

  unselected: 'rgba(60,60,67,0.3)',
  placeholder: 'rgba(60,60,67,0.3)',
  disabled: 'rgba(60,60,67,0.12)',

  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#000000',

  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  opaqueSeparator: 'rgba(60,60,67,0.29)',
  systemBackground: '#FFFFFF',
  secondarySystemBackground: '#F2F2F7',
  tertiarySystemBackground: '#FFFFFF',
  tint: '#000000',
  danger: '#FF3B30',
  link: '#000000',

  shadow: '#000000',
  indicator: '#000000',
  overlay: 'rgba(0,0,0,0.4)',
  scrim: 'rgba(0,0,0,0.3)',

  isNight: false,
};

// ---------- Dark Palette (iOS System, 黑底白字) ----------
// 产品要求：字体/图标只用黑白色 → primary 及联动色统一白色
const DARK: SemanticColors = {
  primary: '#FFFFFF',
  primaryLight: 'rgba(255,255,255,0.14)',
  primaryDark: '#FFFFFF',
  accent: '#FFFFFF',

  // 纯黑 OLED
  background: '#000000',
  windowBackground: '#000000',
  surface: '#1C1C1E',
  surfaceSecondary: '#1C1C1E',
  surfaceTertiary: '#2C2C2E',

  glassSurface: '#1C1C1E',
  glassSurfaceDark: '#1C1C1E',

  card: '#1C1C1E',
  floorCard: '#1C1C1E',
  cardElevated: '#2C2C2E',

  // 导航/工具栏
  toolbar: '#000000',
  toolbarSurface: '#1C1C1E',
  onToolbarSurface: '#FFFFFF',
  navBar: '#000000',
  navBarSurface: '#1C1C1E',
  onNavBarSurface: '#FFFFFF',
  tabBar: 'rgba(22,22,22,0.94)',
  tabBarBorder: 'rgba(84,84,88,0.65)',

  // iOS dark label 层级（白字）
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.6)',
  textTertiary: 'rgba(235,235,245,0.3)',
  textDisabled: 'rgba(235,235,245,0.2)',
  textOnPrimary: '#000000',
  textLink: '#FFFFFF',

  chip: 'rgba(255,255,255,0.14)',
  onChip: '#FFFFFF',
  chipSelected: '#FFFFFF',
  switchTrack: 'rgba(120,120,128,0.32)',
  switchTrackActive: '#30D158',
  switchThumb: '#FFFFFF',

  divider: 'rgba(84,84,88,0.65)',
  separator: 'rgba(84,84,88,0.65)',
  border: 'rgba(84,84,88,0.65)',

  unselected: 'rgba(235,235,245,0.3)',
  placeholder: 'rgba(235,235,245,0.3)',
  disabled: 'rgba(84,84,88,0.65)',

  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  info: '#FFFFFF',

  label: '#FFFFFF',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  opaqueSeparator: 'rgba(84,84,88,0.65)',
  systemBackground: '#000000',
  secondarySystemBackground: '#1C1C1E',
  tertiarySystemBackground: '#2C2C2E',
  tint: '#FFFFFF',
  danger: '#FF453A',
  link: '#FFFFFF',

  shadow: '#000000',
  indicator: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(0,0,0,0.5)',

  isNight: true,
};

// ---------- Public API ----------
export function getThemeColors(isDark: boolean = false): SemanticColors {
  return isDark ? DARK : LIGHT;
}
