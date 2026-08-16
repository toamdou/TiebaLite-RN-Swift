/**
 * TiebaLite React Native - App Constants
 * Migrated from com.huanchengfly.tieba.post.Consts
 */

// 3 seconds between each forum sign

import type { ThemeName } from '@/types'; export const APP_NAME = '贴吧 Lite';
export const APP_VERSION = '1.0.0';

// Auto sign
export const AUTO_SIGN_MIN_INTERVAL_MS = 3000;

/** Single source of truth for selectable theme names and their labels. */
export const THEME_OPTIONS: { key: ThemeName; label: string; mode: 'light' | 'dark' }[] = [
  { key: 'tieba', label: '贴吧蓝', mode: 'light' },
  { key: 'blue', label: '系统蓝', mode: 'light' },
  { key: 'black', label: '经典黑', mode: 'light' },
  { key: 'pink', label: '粉色', mode: 'light' },
  { key: 'red', label: '红色', mode: 'light' },
  { key: 'purple', label: '紫色', mode: 'light' },
  { key: 'translucent', label: '毛玻璃', mode: 'light' },
  { key: 'custom', label: '自定义', mode: 'light' },
  { key: 'dark', label: '暗夜', mode: 'dark' },
  { key: 'blue_dark', label: '暗夜蓝', mode: 'dark' },
  { key: 'grey_dark', label: '暗夜灰', mode: 'dark' },
  { key: 'amoled_dark', label: '纯黑', mode: 'dark' },
];

export const LIGHT_THEME_OPTIONS = THEME_OPTIONS.filter((t) => t.mode === 'light');
export const DARK_THEME_OPTIONS = THEME_OPTIONS.filter((t) => t.mode === 'dark');
