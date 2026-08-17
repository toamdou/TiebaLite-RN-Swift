/**
 * SettingsGroup — 基于 @expo/ui 官方 ListItem/FieldGroup 的分组设置行
 *
 * iOS 上 FieldGroup = SwiftUI Form，FieldGroup.Section = 原生 Section，
 * ListItem = 整行可点的原生行（leading 图标 / 标题 / supportingText / trailing 开关或 chevron）。
 * 分隔线、行高、缩进全部由原生渲染，不再手写 RN 布局。
 */

import { FieldGroup, ListItem, Switch } from '@expo/ui';
import { Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { background, frame, shapes } from '@expo/ui/swift-ui/modifiers';
import { useThemeColors } from '@/theme/ThemeContext';

export interface SettingsRowProps {
  /** SF Symbol 名（白色渲染在色块上） */
  icon: string;
  /** 图标块背景色（hex） */
  tint: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** 右侧开关（传值时渲染 Switch 替代 chevron） */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  /** 兼容旧接口；原生 Section 自动处理分隔线，忽略此参数 */
  divider?: boolean;
}

export interface SettingsGroupProps {
  title?: string;
  rows: SettingsRowProps[];
}

/** 色块图标：30×30 圆角色块 + 白色 SF Symbol（SwiftUI Image + background） */
function RowIcon({ icon, tint }: { icon: string; tint: string }) {
  return (
    <SwiftUIImage
      systemName={icon as any}
      size={15}
      color="#FFFFFF"
      modifiers={[
        frame({ width: 30, height: 30 }),
        background(tint, shapes.roundedRectangle({ cornerRadius: 7 })),
      ]}
    />
  );
}

function SettingsRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  switchValue,
  onSwitchChange,
}: SettingsRowProps) {
  const { colors } = useThemeColors();
  const isSwitch = typeof switchValue === 'boolean';

  return (
    <ListItem
      leading={<RowIcon icon={icon} tint={tint} />}
      supportingText={subtitle}
      onPress={isSwitch ? undefined : onPress}
      trailing={
        isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange ?? (() => {})}
          />
        ) : onPress ? (
          <SwiftUIImage systemName="chevron.right" size={13} color={colors.textTertiary} />
        ) : null
      }
    >
      {title}
    </ListItem>
  );
}

export function SettingsGroup({ title, rows }: SettingsGroupProps) {
  return (
    <FieldGroup.Section title={title}>
      {rows.map((row, idx) => (
        <SettingsRow key={`${row.icon}-${idx}`} {...row} />
      ))}
    </FieldGroup.Section>
  );
}
