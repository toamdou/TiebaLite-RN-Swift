// ============================================================
// linkOpener — Unified link-opening utility respecting the
// user's "in-app browser" preference.
//
// - in-app:  expo-web-browser (SFSafariViewController on iOS)
// - external: Linking.openURL (system Safari)
// ============================================================

import { Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  getPreferences,
  savePreferences,
} from '@/services/storage/PreferencesStorage';

/**
 * Open a URL based on the user's `useBuiltInBrowser` preference.
 *
 * @param url - The URL to open.
 * @param forceInApp - Override preference to force in-app browser.
 */
export async function openLink(
  url: string,
  forceInApp?: boolean,
): Promise<void> {
  try {
    const prefs = await getPreferences();
    const useInApp = forceInApp ?? (prefs.useBuiltInBrowser ?? true);

    if (useInApp) {
      await WebBrowser.openBrowserAsync(url, {
        controlsColor: '#208AEF',
        dismissButtonStyle: 'done',
        presentationStyle:
          WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
        enableBarCollapsing: true,
        readerMode: false,
      });
    } else {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('无法打开链接', url);
      }
    }
  } catch {
    // Fallback to Linking
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('无法打开链接', url);
    }
  }
}

/**
 * Set the in-app browser preference.
 */
export async function setUseBuiltInBrowser(value: boolean): Promise<void> {
  await savePreferences({ useBuiltInBrowser: value });
}
