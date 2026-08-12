// ============================================================
// TiebaLite React Native - Error State View
// Native SwiftUI ContentUnavailableView with retry action.
// ============================================================

import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ContentUnavailableView } from '@expo/ui/swift-ui';

import { Spacing } from '@/theme';
import { Button } from './Button';

// ---------- ErrorState Props ----------
export interface ErrorStateProps {
  /** Main error title */
  title?: string;
  /** Detailed error message */
  message?: string;
  /** Error icon name (SF Symbol) */
  icon?: string;
  /** Called when retry is pressed */
  onRetry?: () => void;
  /** Retry button label */
  retryLabel?: string;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
}

// ---------- ErrorState Component ----------
export function ErrorState({
  title = '出错了',
  message,
  icon = 'exclamationmark.triangle',
  onRetry,
  retryLabel = '重试',
  style,
  accessibilityLabel,
}: ErrorStateProps) {
  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="text"
      accessibilityLabel={
        accessibilityLabel ??
        `错误：${title}${message ? `，${message}` : ''}`
      }
    >
      <ContentUnavailableView
        title={title}
        description={message}
        systemImage={icon as any}
      />

      {onRetry ? (
        <View style={styles.retryContainer}>
          <Button
            title={retryLabel}
            onPress={onRetry}
            variant="tinted"
            size="medium"
            icon="arrow.clockwise"
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.hero,
    paddingHorizontal: Spacing.lg,
  },
  retryContainer: {
    marginTop: Spacing.lg,
  },
});

export default ErrorState;
