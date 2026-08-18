// ============================================================
// TiebaLite React Native - RowIcon
// 列表行前色块图标：RN 圆角色块 + 白色 Symbol（ListItem leading 用）。
// 抽取自 Profile / Settings 列表行两份相同的实现，统一共享。
// ============================================================

import { View } from 'react-native';

import { SymbolView } from './SymbolView';

interface RowIconProps {
  /** SF Symbol 名称 */
  icon: string;
  /** 色块背景色 */
  tint: string;
  /** Symbol 尺寸（默认 15） */
  size?: number;
}

const ROW_ICON_BADGE = {
  width: 30,
  height: 30,
  borderRadius: 7,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export function RowIcon({ icon, tint, size = 15 }: RowIconProps) {
  return (
    <View style={[ROW_ICON_BADGE, { backgroundColor: tint }]}>
      <SymbolView name={icon} size={size} weight="semibold" tintColor="#FFFFFF" />
    </View>
  );
}
