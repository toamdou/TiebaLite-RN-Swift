// ============================================================
// haptics - Global haptic feedback utility (震动反馈)
//
// Every haptic call in the app should go through these wrappers
// so the "震动反馈" toggle in Settings (AppPreferences.hapticFeedback,
// default: true) can globally enable/disable ALL haptic feedback.
//
// Design:
// - Async wrappers read the preference (cached in memory) and no-op
//   when disabled.
// - A lightweight module-level cache avoids an AsyncStorage read on
//   every haptic call; the settings toggle updates it immediately via
//   setHapticEnabled().
// - All native calls are best-effort (try/catch) — unsupported
//   devices/emulators may reject.
// ============================================================

import * as Haptics from 'expo-haptics';
import { usePreferencesStore } from '@/stores/preferencesStore';

// Re-export the enum types so migrated callers no longer need to
// import 'expo-haptics' directly (they reference ImpactFeedbackStyle /
// NotificationFeedbackType through this utility).
export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

/** Kept for call-site compatibility; the store is the source of truth. */
export function setHapticEnabled(enabled: boolean): void {
  usePreferencesStore.getState().setPreference('hapticFeedback', enabled);
}

export function isHapticEnabledSync(): boolean {
  const state = usePreferencesStore.getState();
  return state.hasHydrated ? state.preferences.hapticFeedback : true;
}

/**
 * Impact feedback (Light / Medium / Heavy / Rigid / Soft).
 * No-ops when the global haptic toggle is disabled.
 *
 * @param style Impact style; defaults to Light (UI element taps).
 */
export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  if (!isHapticEnabledSync()) return;
  try {
    await Haptics.impactAsync(style);
  } catch {
    // Best-effort: haptics are optional, never crash the UI.
  }
}

/**
 * Notification feedback (Success / Warning / Error) for task outcomes.
 * No-ops when the global haptic toggle is disabled.
 */
export async function hapticNotify(
  type: Haptics.NotificationFeedbackType,
): Promise<void> {
  if (!isHapticEnabledSync()) return;
  try {
    await Haptics.notificationAsync(type);
  } catch {
    // Best-effort.
  }
}

/**
 * Selection-change feedback for pickers, segmented controls and other
 * "selection changed" moments. No-ops when the global haptic toggle is
 * disabled.
 */
export async function hapticSelection(): Promise<void> {
  if (!isHapticEnabledSync()) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // Best-effort.
  }
}
