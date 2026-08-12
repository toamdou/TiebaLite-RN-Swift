/**
 * TiebaLite — iOS 26 Liquid Glass Effect
 *
 * Single native implementation via expo-glass-effect (UIVisualEffectView).
 * The package itself falls back to a regular View on unsupported platforms,
 * so no second blur library or JS fallback path is needed.
 *
 * glassEffectStyle="clear" → native iOS 26 liquid glass (transparent)
 * glassEffectStyle="regular" → native iOS 26 liquid glass (frosted)
 */
import React from 'react';
import { View, StyleSheet, useColorScheme, type ViewProps } from 'react-native';
import { GlassView as ExpoGlassView } from 'expo-glass-effect';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useThemeColors } from '@/theme/ThemeContext';
import { Shadows } from '@/theme/spacing';

// ── Types ──

export type GlassTheme = 'light' | 'dark' | 'auto';

/** iOS 26 glass effect style (maps to expo-glass-effect) */
export type GlassEffectStyle = 'clear' | 'regular';

export interface GlassProps extends ViewProps {
  /** Light/dark theme for glass colorScheme */
  theme?: GlassTheme;
  /** Border radius */
  borderRadius?: number;
  /** Tint color overlay */
  tintColor?: string;
  /** iOS 26 glass effect style (default: 'regular') */
  glassEffectStyle?: GlassEffectStyle;
  /** Whether the glass should be interactive (iOS 26 only) */
  isInteractive?: boolean;
  children?: React.ReactNode;
}

// ── Animated glass style helper (§4.7) ──

/**
 * Returns a glassEffectStyle config object for animated glass show/hide.
 * Usage: `<GlassView glassEffectStyle={animatedGlassStyle(isVisible)} />`
 *
 * This is the official way to animate glass appearance instead of opacity
 * (setting opacity to 0 on GlassView breaks rendering — see expo docs).
 */
export function animatedGlassStyle(visible: boolean, durationSec = 0.4) {
  return {
    style: visible ? ('clear' as const) : ('none' as const),
    animate: true,
    animationDuration: durationSec,
  };
}

// ── GlassView ──

export function GlassView({
  theme = 'auto',
  borderRadius,
  tintColor,
  glassEffectStyle: effectStyle = 'regular',
  isInteractive = false,
  children,
  style,
  ...props
}: GlassProps) {
  // §5.12 — Respect "Reduce Transparency" accessibility setting
  const { reduceTransparency } = useReducedMotion();
  const { colors } = useThemeColors();
  const colorScheme = useColorScheme();
  // Resolve 'auto' against the system color scheme.
  const resolvedTheme: 'light' | 'dark' =
    theme === 'auto' ? (colorScheme === 'dark' ? 'dark' : 'light') : theme;
  if (reduceTransparency) {
    // 降级用语义色（glassSurface / glassSurfaceDark，随主题色板）
    const solidBg = resolvedTheme === 'dark' ? colors.glassSurfaceDark : colors.glassSurface;
    return (
      <View
        style={[
          borderRadius ? { borderRadius, overflow: 'hidden' as const } : undefined,
          { backgroundColor: solidBg },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <ExpoGlassView
      glassEffectStyle={effectStyle}
      isInteractive={isInteractive}
      tintColor={tintColor}
      colorScheme={theme === 'auto' ? 'auto' : theme}
      style={[
        borderRadius ? { borderRadius, overflow: 'hidden' as const } : undefined,
        style,
      ]}
      {...(props as any)}
    >
      {children}
    </ExpoGlassView>
  );
}

// ── GlassCard ──

export interface GlassCardProps extends GlassProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

const PADDING_MAP = { none: 0, small: 8, medium: 16, large: 24 };

export function GlassCard({
  theme = 'auto',
  borderRadius = Radius.card,
  padding = 'medium',
  header,
  footer,
  children,
  style,
  ...props
}: GlassCardProps) {
  const pad = PADDING_MAP[padding];

  return (
    <GlassView
      theme={theme}
      borderRadius={borderRadius}
      // 归一 Shadows.glass：玻璃自带折射深度，不叠加硬阴影
      style={[Shadows.glass as any, style]}
      {...props}
    >
      {header && <View style={{ padding: pad, paddingBottom: 0 }}>{header}</View>}
      <View style={{ padding: header ? 0 : pad }}>{children}</View>
      {footer && <View style={{ padding: pad, paddingTop: 0 }}>{footer}</View>}
    </GlassView>
  );
}

// ── GlassNavigationBar ──

export function GlassNavigationBar({
  theme = 'auto',
  children,
  style,
  ...props
}: GlassProps) {
  const { colors } = useThemeColors();

  return (
    <GlassView
      theme={theme}
      style={[
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          // 分隔线走语义色（separator，深浅色自适应）
          borderTopColor: colors.separator,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </GlassView>
  );
}

export default GlassView;
