/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
// ============================================================
// TiebaLite React Native - Lightweight Toast Notification
// Auto-dismissing, non-intrusive popup messages
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import { SymbolView } from '@/components/ui/SymbolView';
import { GlassView } from '@/components/ui/GlassView';
import { useReducedMotion } from '@/hooks/useReducedMotion';

import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Shadows, Spacing, typographyStyles, PRESS_ENTER } from '@/theme';
import type { SemanticColors } from '@/theme/colors';

// ---------- Toast Types ----------
export type ToastType = 'info' | 'success' | 'warning' | 'error';

// ---------- Toast Options ----------
export interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number; // ms, default 3000
  icon?: string; // SF Symbol name override
}

// ---------- Toast Ref (imperative API) ----------
export interface ToastRef {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

// ---------- Type Config Helper ----------
interface TypeConfig {
  color: string;
  icon: string;
  label: string;
}

// 颜色走语义令牌：success/warning/error/tint，深浅色自适应
function getTypeConfig(type: ToastType, colors: SemanticColors): TypeConfig {
  switch (type) {
    case 'success':
      return { color: colors.success, icon: 'checkmark.circle.fill', label: '成功' };
    case 'warning':
      return { color: colors.warning, icon: 'exclamationmark.triangle.fill', label: '警告' };
    case 'error':
      return { color: colors.error, icon: 'xmark.circle.fill', label: '错误' };
    case 'info':
    default:
      return { color: colors.tint, icon: 'info.circle.fill', label: '信息' };
  }
}

// ---------- Toast Component ----------
export const Toast = forwardRef<ToastRef>(function Toast(_props, ref) {
  const { colors } = useThemeColors();
  const { reduceMotion } = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ToastOptions>({ title: '' });

  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearHideTimer();
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = withTiming(0, { duration: 100 });
      hideTimerRef.current = setTimeout(() => setVisible(false), 120);
    } else {
      translateY.value = withTiming(-80, { duration: 150, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) });
      hideTimerRef.current = setTimeout(() => setVisible(false), 170);
    }
  }, [reduceMotion, opacity, translateY, clearHideTimer]);

  const show = useCallback((opts: ToastOptions) => {
    clearHideTimer();
    setOptions(opts);
    setVisible(true);

    // Cancel any in-flight animation (interruptibility)
    cancelAnimation(translateY);
    cancelAnimation(opacity);

    if (reduceMotion) {
      // 仅 opacity 淡入，无位移
      translateY.value = 0;
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(0, PRESS_ENTER);
      opacity.value = withTiming(1, { duration: 200 });
    }

    const duration = opts.duration ?? 3000;
    hideTimerRef.current = setTimeout(() => {
      hide();
    }, duration);
  }, [reduceMotion, hide, clearHideTimer, opacity, translateY]);

  useEffect(
    () => () => clearHideTimer(),
    [clearHideTimer],
  );

  useImperativeHandle(ref, () => ({ show, hide }), [show, hide]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const typeConfig = getTypeConfig(options.type ?? 'info', colors);

  const accessibilityProps = {
    accessibilityRole: 'alert' as const,
    accessibilityLiveRegion: 'polite' as const,
    accessibilityLabel: `${typeConfig.label}: ${options.title}${options.message ? `. ${options.message}` : ''}`,
  };

  const content = (
    <>
      <View style={styles.iconContainer}>
        <SymbolView
          name={(options.icon ?? typeConfig.icon) as any}
          size={20}
          weight="medium"
          tintColor={typeConfig.color}
        />
      </View>
      <View style={styles.textContainer}>
        <Text
          style={[typographyStyles.subheadBold, { color: colors.text }]}
          numberOfLines={1}
        >
          {options.title}
        </Text>
        {options.message ? (
          <Text
            style={[typographyStyles.footnote, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={2}
          >
            {options.message}
          </Text>
        ) : null}
      </View>
    </>
  );

  // §5.2 — iOS 26 liquid glass capsule. GlassView owns the platform fallback,
  // so there is no separate non-glass render branch. 玻璃不带实底色，让
  // 模糊透出；阴影走 Shadows.floating 令牌。
  return (
    <Animated.View style={animatedStyle} {...accessibilityProps}>
      <GlassView
        glassEffectStyle="regular"
        isInteractive={false}
        borderRadius={Radius.input}
        style={styles.container}
      >
        {content}
      </GlassView>
    </Animated.View>
  );
});

// ---------- Toast Context for app-wide usage ----------
interface ToastContextValue {
  toast: React.RefObject<ToastRef | null>;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toastRef = React.useRef<ToastRef>(null!);

  return (
    <ToastContext.Provider value={{ toast: toastRef }}>
      {children}
      <Toast ref={toastRef} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return {
    show: (options: ToastOptions) => ctx.toast.current?.show(options),
    hide: () => ctx.toast.current?.hide(),
  };
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.input,
    // 统一阴影令牌：floating（悬浮浮层）
    ...Shadows.floating,
    zIndex: 9999,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
});

export default Toast;
