import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

const NativeGradientBlurView = requireNativeViewManager(
  'TiebaNative',
  'TiebaGradientBlurView',
);

interface GradientBlurViewProps {
  /** Blur intensity (0-100) */
  intensity?: number;
  /** Blur tint */
  tint?: 'light' | 'dark' | 'default' | 'systemMaterial' | 'systemMaterialLight' | 'systemMaterialDark' | 'systemChromeMaterial' | 'systemChromeMaterialLight' | 'systemChromeMaterialDark';
  /** Height of the gradient fade zone at the top (pt) */
  fadeHeight?: number;
  /** Container style */
  style?: StyleProp<ViewStyle>;
  /** Children rendered on top of the blur */
  children?: React.ReactNode;
}

export function GradientBlurView({
  intensity = 60,
  tint = 'systemMaterialLight',
  fadeHeight = 24,
  style,
  children,
}: GradientBlurViewProps) {
  return (
    <NativeGradientBlurView
      style={style}
      intensity={intensity}
      tint={tint}
      fadeHeight={fadeHeight}
    >
      {children}
    </NativeGradientBlurView>
  );
}

export default GradientBlurView;
