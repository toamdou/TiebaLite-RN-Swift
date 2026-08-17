/**
 * TintedIconRow — iOS 设置风格导航行（纯 SwiftUI 实现）
 *
 * 全部使用 @expo/ui/swift-ui 组件（HStack/Image/Text/VStack/Spacer/Divider），
 * 由原生 Section/Form 直接渲染，文字与图标背景天然对齐原生列表。
 * 图标为彩色圆角方块 + 白色 SF Symbol。
 * 行间分隔线：SwiftUI Divider 在 VStack 中渲染为横线，置于行下方并
 * 从图标右侧缩进（对齐 iOS 系统设置的分隔线位置）。
 */

import { Divider, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  font,
  foregroundStyle,
  frame,
  onTapGesture,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useThemeColors } from '@/theme/ThemeContext';
import { Spacing } from '@/theme';
import { hapticForScene } from '@/theme/hapticsMap';

export interface TintedIconRowProps {
  /** SF Symbol 名（白色渲染在色块上） */
  icon: string;
  /** 图标块背景色（hex） */
  tint: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** 是否在行下画分隔线（列表最后一行传 false） */
  divider?: boolean;
}

/** 分隔线起点：图标 30 + gap 12 + 行水平边距 16（对齐 iOS 设置） */
const DIVIDER_LEADING = Spacing.lg + 30 + Spacing.md;

export function TintedIconRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  divider = true,
}: TintedIconRowProps) {
  const { colors } = useThemeColors();

  const row = (
    <HStack spacing={Spacing.md} modifiers={[padding({ leading: Spacing.lg, trailing: Spacing.lg, top: 10, bottom: 10 })]}>
      {/* 彩色圆角图标块：frame 撑出 30×30，background 画圆角色块 */}
      <Image
        systemName={icon as any}
        size={16}
        color="#FFFFFF"
        modifiers={[
          frame({ width: 30, height: 30 }),
          background(tint, shapes.roundedRectangle({ cornerRadius: 7 })),
        ]}
      />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 17 }), foregroundStyle(colors.text)]}>{title}</Text>
        {subtitle ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(colors.textSecondary)]}>{subtitle}</Text>
        ) : null}
      </VStack>
      <Spacer />
      {onPress ? (
        <Image systemName="chevron.right" size={13} color={colors.textTertiary} />
      ) : null}
    </HStack>
  );

  const content = (
    <>
      {onPress ? (
        <HStack spacing={0} modifiers={[onTapGesture(() => { hapticForScene('press'); onPress(); })]}>
          {row}
        </HStack>
      ) : (
        row
      )}
      {divider ? (
        <HStack modifiers={[padding({ leading: DIVIDER_LEADING })]}>
          <Divider />
        </HStack>
      ) : null}
    </>
  );

  return <VStack spacing={0}>{content}</VStack>;
}
