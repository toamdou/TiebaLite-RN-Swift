/**
 * TiebaLite — iOS 26 Liquid Glass Effect
 *
 * Single native implementation via expo-glass-effect (UIVisualEffectView).
 * The package itself falls back to a regular View on unsupported platforms,
 * so no second blur library or JS fallback path is needed.
 *
 * glassEffectStyle="clear" → native iOS 26 liquid glass (transparent)
 * glassEffectStyle="regular" → native iOS 26 liquid glass (frosted)
 *
 * 降级策略（§4 RN 层 / §5 无障碍红线）：
 * - reduceTransparency 开启，或 useGlassBudget 判定实时玻璃超预算时降级
 *   （任一触发即降级，并行判断）。
 * - fallback="static"（默认）：静态玻璃模拟 = 半透明底色 + 顶部高光渐变
 *   + 细描边（glassTokens），视觉接近且零高斯开销。
 * - fallback="solid"：现有纯色降级（不透明确认框用）。
 */
import React from 'react';
import { View, StyleSheet, useColorScheme, type ViewProps } from 'react-native';
import { GlassView as ExpoGlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGlassBudget } from '@/hooks/useGlassBudget';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Shadows } from '@/theme/spacing';
import { glassTokens } from '@/theme/glass';

// ── Types ──

export type GlassTheme = 'light' | 'dark' | 'auto';

/** iOS 26 glass effect style (maps to expo-glass-effect) */
export type GlassEffectStyle = 'clear' | 'regular';

/** 降级渲染模式：'static' = 静态玻璃模拟；'solid' = 纯色降级 */
export type GlassFallback = 'static' | 'solid';

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
  /**
   * 降级渲染模式（默认 'static'）。reduceTransparency 开启或
   * 实时玻璃超预算时生效；'solid' 保留原纯色降级语义。
   */
  fallback?: GlassFallback;
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

// ── staticGlass 模拟（降级） ──

/**
 * 静态玻璃模拟：半透明底色 + 顶部高光渐变 + 细描边，圆角照常。
 * 性能规则：渐变静态渲染一次，不逐帧动画；不叠加 Shadows.glass 之外阴影。
 */
function StaticGlassFallback({
  resolvedTheme,
  borderRadius,
  tintColor,
  children,
  style,
  ...props
}: {
  resolvedTheme: 'light' | 'dark';
  borderRadius?: number;
  tintColor?: string;
  children?: React.ReactNode;
  style?: GlassProps['style'];
} & Omit<ViewProps, 'style'>) {
  const tint = tintColor ?? glassTokens.tint[resolvedTheme];
  const highlight = glassTokens.highlight[resolvedTheme];
  const borderColor = glassTokens.border[resolvedTheme];
  const borderWidth = glassTokens.border.width;

  return (
    <View
      style={[
        borderRadius ? { borderRadius, overflow: 'hidden' as const } : undefined,
        style,
      ]}
      {...props}
    >
      {/* 半透明底色（staticGlass 用 tint 令牌，弱化纯色断档） */}
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: tint }]}
        pointerEvents="none"
      />
      {/* 顶部高光渐变，静态渲染一次 */}
      <LinearGradient
        colors={highlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* 细描边（仅带圆角的玻璃面，避免覆盖 GlassNavigationBar 自带边框） */}
      {borderRadius != null && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius,
              borderWidth,
              borderColor,
            },
          ]}
          pointerEvents="none"
        />
      )}
      {children}
    </View>
  );
}

// ── GlassView ──

export function GlassView({
  theme = 'auto',
  borderRadius,
  tintColor,
  glassEffectStyle: effectStyle = 'regular',
  isInteractive = false,
  fallback = 'static',
  children,
  style,
  ...props
}: GlassProps) {
  // §5.12 — Respect "Reduce Transparency" accessibility setting
  const { reduceTransparency } = useReducedMotion();
  // 性能规则 2 — 实时玻璃预算：超预算同样降级（任一触发即降级）
  const { shouldUseStaticGlass } = useGlassBudget();
  const { colors } = useThemeColors();
  const colorScheme = useColorScheme();
  // Resolve 'auto' against the system color scheme.
  const resolvedTheme: 'light' | 'dark' =
    theme === 'auto' ? (colorScheme === 'dark' ? 'dark' : 'light') : theme;

  const needsFallback = reduceTransparency || shouldUseStaticGlass;

  if (needsFallback && fallback === 'solid') {
    // 纯色降级：用语义色（glassSurface / glassSurfaceDark，随主题色板）
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

  if (needsFallback) {
    return (
      <StaticGlassFallback
        resolvedTheme={resolvedTheme}
        borderRadius={borderRadius}
        tintColor={tintColor}
        style={style}
        {...props}
      >
        {children}
      </StaticGlassFallback>
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
