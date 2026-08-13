import { requireNativeViewManager } from 'expo-modules-core';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

const NativeGlassSurface = requireNativeViewManager(
  'TiebaNative',
  'TiebaGlassSurfaceView',
);

export interface GlassSurfaceProps {
  /**
   * 系统材质（默认 "regular"）。
   * "regular" | "clear"（最接近液态玻璃透明）| "dark" | "light"，或系统材质全名
   * 如 "systemThinMaterial"、"systemMaterialDark"。
   */
  material?: string;
  /**
   * 材质着色（UIVisualEffectView 无直接 tint，原生用覆盖半透明色层实现）。
   * 建议传 alpha ≤ 0.15 的颜色，如 'rgba(255,255,255,0.1)'。
   */
  tintColor?: string;
  /** squircle 连续曲率圆角（默认 20） */
  cornerRadius?: number;
  /** hairline 描边色（缺省不画） */
  borderColor?: string;
  /** 顶部高光（默认 true；深色模式原生自动减弱） */
  highlight?: boolean;
  /** 容器样式（宽高/布局；圆角请走 cornerRadius prop） */
  style?: StyleProp<ViewStyle>;
  /** 可选按压回调（导航下浮条等可点场景） */
  onPress?: () => void;
  /** 内容层（原生盖在玻璃材质之上） */
  children?: ReactNode;
}

/**
 * 原生玻璃容器：UIVisualEffectView 系统材质 + squircle 圆角 + hairline 描边 +
 * 可选顶部高光。用于导航下玻璃、浮条、分组标题。哑视图，不接页面。
 */
export function GlassSurface({
  material,
  tintColor,
  cornerRadius = 20,
  borderColor,
  highlight,
  style,
  onPress,
  children,
}: GlassSurfaceProps) {
  return (
    <NativeGlassSurface
      style={style}
      material={material}
      tintColor={tintColor}
      cornerRadius={cornerRadius}
      borderColor={borderColor}
      highlight={highlight}
      onPress={onPress}
    >
      {children}
    </NativeGlassSurface>
  );
}

export default GlassSurface;
