// ============================================================
// TiebaLite React Native - Empty State View
// Native SwiftUI ContentUnavailableView with optional action.
// ============================================================

import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ContentUnavailableView } from '@expo/ui/swift-ui';

import { Spacing } from '@/theme';
import { ThemedHost } from './ThemedHost';
import { Button } from './Button';

// ---------- EmptyState Props ----------
export interface EmptyStateProps {
  /** SF Symbol name for the placeholder icon */
  icon?: string;
  /** Icon tint color (kept for API compatibility) */
  iconColor?: string;
  /** Main title text */
  title: string;
  /** Descriptive subtitle text */
  description?: string;
  /** @deprecated Use `description` instead */
  subtitle?: string;
  /** Action button label (shows button if provided) */
  actionLabel?: string;
  /** Action button callback */
  onAction?: () => void;
  /** Declarative route for action button (replaces onAction for navigation) */
  actionHref?: string;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
}

// ---------- EmptyState Component ----------
export function EmptyState({
  icon = 'tray',
  title,
  description,
  subtitle,
  actionLabel,
  onAction,
  actionHref,
  style,
  accessibilityLabel,
}: EmptyStateProps) {
  const subtext = description ?? subtitle;

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="text"
      accessibilityLabel={
        accessibilityLabel ??
        `空状态：${title}${subtext ? `，${subtext}` : ''}`
      }
    >
      <ThemedHost matchContents>
        <ContentUnavailableView
          title={title}
          description={subtext}
          systemImage={icon as any}
        />
      </ThemedHost>

      {actionLabel && (onAction || actionHref) ? (
        <View style={styles.actionContainer}>
          <Button
            title={actionLabel}
            onPress={onAction}
            href={actionHref}
            variant="filled"
            size="medium"
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
  actionContainer: {
    marginTop: Spacing.lg,
  },
});

export default EmptyState;
