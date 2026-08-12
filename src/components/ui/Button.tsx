// ============================================================
// TiebaLite React Native - Native Button
// Wraps SwiftUI Button via @expo/ui with iOS-style variants.
// ============================================================

import { useCallback } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  Button as NativeButton,
  Image as NativeImage,
  Text as NativeText,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint as accessibilityHintModifier,
  accessibilityLabel as accessibilityLabelModifier,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';

import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { useThemeColors } from '@/theme/ThemeContext';
import { IconSize } from '@/theme';

// ---------- Button Variant ----------
export type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'destructive' | 'glass';

// ---------- Button Size ----------
export type ButtonSize = 'small' | 'medium' | 'large';

// ---------- Button Props ----------
export interface ButtonProps {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Button label text */
  title: string;
  /** SF Symbol name for leading icon */
  icon?: string;
  /** SF Symbol name for trailing icon */
  trailingIcon?: string;
  /** Declarative route — calls router.push on press */
  href?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom text style (only color is forwarded to the native tint) */
  textStyle?: StyleProp<TextStyle>;
  /** Enable haptic feedback on press (iOS only) */
  haptic?: boolean;
  /** Whether button should expand to fill width */
  fullWidth?: boolean;
  /** Accessibility label override */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Press callback */
  onPress?: () => void;
  /** Test identifier */
  testID?: string;
}

const VARIANT_BUTTON_STYLE: Record<ButtonVariant, 'borderedProminent' | 'bordered' | 'plain' | 'glass'> = {
  filled: 'borderedProminent',
  tinted: 'bordered',
  plain: 'plain',
  destructive: 'borderedProminent',
  glass: 'glass',
};

const SIZE_CONTROL: Record<ButtonSize, 'small' | 'regular' | 'large'> = {
  small: 'small',
  medium: 'regular',
  large: 'large',
};

function getIconSize(size: ButtonSize): number {
  return size === 'small' ? IconSize.sm : IconSize.md;
}

// ---------- Base Button Component ----------
export function Button({
  variant = 'filled',
  size = 'medium',
  title,
  icon,
  trailingIcon,
  href,
  disabled = false,
  style,
  textStyle,
  haptic = true,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
}: ButtonProps) {
  const { colors } = useThemeColors();

  const handlePress = useCallback(() => {
    if (haptic && !disabled) {
      hapticImpact(
        variant === 'destructive'
          ? ImpactFeedbackStyle.Medium
          : ImpactFeedbackStyle.Light,
      );
    }
    onPress?.();
    if (href) {
      router.push(href as any);
    }
  }, [haptic, disabled, variant, onPress, href]);

  const a11yLabel = accessibilityLabel ?? title;
  const a11yHint = accessibilityHint ?? (icon ? `Button with icon: ${title}` : undefined);

  const flattenedStyle = StyleSheet.flatten(style);
  const flattenedTextStyle = StyleSheet.flatten(textStyle);
  const shouldFill =
    fullWidth ||
    flattenedStyle?.flex === 1 ||
    flattenedStyle?.flexGrow === 1 ||
    flattenedStyle?.width === '100%';

  const buttonTint =
    flattenedTextStyle?.color ?? (variant === 'destructive' ? undefined : colors.primary);

  const resolvedButtonStyle =
    VARIANT_BUTTON_STYLE[variant];

  const modifiers = [
    buttonStyle(resolvedButtonStyle),
    controlSize(SIZE_CONTROL[size]),
    disabledModifier(disabled),
    ...(buttonTint ? [tint(buttonTint)] : []),
    ...(shouldFill ? [frame({ maxWidth: 9999 })] : []),
    ...(a11yLabel ? [accessibilityLabelModifier(a11yLabel)] : []),
    ...(a11yHint ? [accessibilityHintModifier(a11yHint)] : []),
  ];

  const buttonChildren = [
    ...(icon ? [<NativeImage key="leading" systemName={icon as any} size={getIconSize(size)} />] : []),
    <NativeText key="title">{title}</NativeText>,
    ...(trailingIcon ? [<NativeImage key="trailing" systemName={trailingIcon as any} size={getIconSize(size)} />] : []),
  ];

  return (
    <View
      style={[
        styles.wrapper,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {trailingIcon ? (
        <NativeButton
          onPress={handlePress}
          role={variant === 'destructive' ? 'destructive' : undefined}
          testID={testID}
          modifiers={modifiers}
        >
          {buttonChildren}
        </NativeButton>
      ) : (
        <NativeButton
          label={title}
          systemImage={icon as any}
          onPress={handlePress}
          role={variant === 'destructive' ? 'destructive' : undefined}
          testID={testID}
          modifiers={modifiers}
        />
      )}
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});

export default Button;
