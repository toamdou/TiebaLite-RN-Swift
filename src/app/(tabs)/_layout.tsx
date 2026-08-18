// ============================================================
// TiebaLite React Native - Native Tabs Layout
//
// Uses expo-router/unstable-native-tabs for platform-native
// tab bar rendering. On iOS 26+ this automatically gets the
// Liquid Glass material via the system UITabBarController.
// iOS native tab bar layout.
//
// Removed: custom JS tab bar, expo-glass-tabs, expo-blur
// dependency for the tab bar, expo-glass-effect for tab bar.
// ============================================================

import {
  DeviceEventEmitter,
} from 'react-native';
import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useThemeColors } from '@/theme/ThemeContext';
import { useNotificationStore } from '@/stores/notificationStore';
import { hapticForScene } from '@/theme/hapticsMap';
import { TAB_BAR_AUTO_HIDE_EVENT, forceShowTabBar } from '@/hooks/useTabBarAutoHide';

const TAB_RESELECT_EVENT = 'tieba:tab-reselect';

// ── Main Tab Layout ──
export default function TabLayout() {
  const { colors, isDark } = useThemeColors();
  const pathname = usePathname();
  const totalUnread = useNotificationStore((s) => s.counts.total);
  // 动态页滚动自动隐藏底栏：由 useTabBarAutoHide 的 onScroll 事件驱动，
  // 完全隐藏到屏幕底部（不用 iOS 26 的圆形悬浮按钮）。
  const [tabBarHidden, setTabBarHidden] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TAB_BAR_AUTO_HIDE_EVENT, (hidden: boolean) => {
      setTabBarHidden(hidden);
    });
    return () => sub.remove();
  }, []);

  // NativeTabs.Trigger exposes a tabPress listener. Emit only when the tapped
  // tab is already focused so a repeated tap refreshes without double-loading
  // during a normal tab switch.
  const handleTabReselect = (tabName: string, tabPath: string) => {
    hapticForScene('press');
    // 切换到任何标签都强制恢复底栏可见（避免带着"隐藏"状态切走）
    forceShowTabBar();
    if (pathname === tabPath || (tabPath === '/' && (pathname === '' || pathname === '/'))) {
      DeviceEventEmitter.emit(TAB_RESELECT_EVENT, tabName);
    }
  };

  // §2.1 NOTE: The user preference to hide the Explore tab (previously
  // stored in AsyncStorage as '@tiebalite:pref_hideExplore') is no longer
  // applied here. Dynamically adding/removing NativeTabs.Trigger at runtime
  // causes a full remount and state loss (per official docs). All tabs must
  // be rendered statically. If hiding Explore is required in the future,
  // consider a config-plugin-level approach or a separate layout.

  return (
    // 使用应用自身的 isDark（而非系统 useColorScheme）驱动 react-navigation
    // ThemeProvider，使 tab 标签/图标配色与应用内容主题一致——应用"强制深色 +
    // 系统浅色"时不再出现 tab 亮色标签配深色内容页的脱节。
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      {/* §2.4: ThemeProvider prevents white background flash and liquid
          glass flicker on iOS 26 dark mode. */}
      <NativeTabs
          // defaultStartTab is intentionally not wired here: NativeTabsProps
          // does not expose initialRouteName in expo-router/unstable-native-tabs.
          // §4.2: 底栏隐藏/显示由 JS 滚动方向驱动（useTabBarAutoHide +
          // 原生 ScrollObserver），显式禁用系统 minimize（避免 iOS 26
          // 收成圆形悬浮按钮）。
          minimizeBehavior="never"
          hidden={tabBarHidden}
          // §4.11: Fix transparent tab bar issues with FlatList/FlashList
          disableTransparentOnScrollEdge
          // §4.12: Liquid-glass / floating tab bar — fully transparent so no
          // solid color shows on the left/right/bottom edges. backgroundColor
          // 'transparent' + blurEffect 'systemDefault' keep UIKit's default
          // material (Liquid Glass on iOS 26); shadowColor 'transparent'
          // removes the hairline separator.
          backgroundColor="transparent"
          // 评估（保持）：expo-router 57 的 NativeTabsBlurEffect 虽支持
          // systemMaterialDark 等暗色变体，但 NativeTabsProps 无全局
          // colorScheme/UIUserInterfaceStyle 开关，未选中 tab 的 icon/label
          // 颜色仍跟随系统外观。若应用强制深色+系统浅色时强行切暗材质，
          // 系统浅色驱动下的黑色未选中项会贴暗玻璃不可见。故保持跟随系统的
          // 'systemDefault'，避免引入比现有问题更严重的可见性缺陷。
          blurEffect="systemDefault"
          shadowColor="transparent"
          // Tint color for selected tab icon + label.
          // §4.14: This is the opaque selection accent (solid `colors.primary`,
          // no alpha channel), NOT a translucent glass fill — so it must stay
          // fully opaque for the selected tab to remain legible. The native
          // Liquid Glass material is driven by backgroundColor/blurEffect
          // above; do not add an alpha-based tint overlay here.
          tintColor={colors.primary}
          // Label styling
          labelStyle={{
            fontSize: 10,
            fontWeight: '600',
          }}
        >
          {/* 关注 (Home / Feed) */}
          <NativeTabs.Trigger
            name="index"
            listeners={{
              tabPress: () => handleTabReselect('index', '/'),
            }}
          >
            <NativeTabs.Trigger.Icon
              sf={{ default: 'house', selected: 'house.fill' }}
              md={{ default: 'home', selected: 'home_filled' }}
            />
            <NativeTabs.Trigger.Label>关注</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          {/* 动态 (Explore) — always rendered statically (§2.1) */}
          <NativeTabs.Trigger
            name="explore"
            listeners={{
              tabPress: () => handleTabReselect('explore', '/explore'),
            }}
          >
            <NativeTabs.Trigger.Icon
              sf={{ default: 'safari', selected: 'safari.fill' }}
              md={{ default: 'explore', selected: 'explore' }}
            />
            <NativeTabs.Trigger.Label>动态</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          {/* 消息 (Notifications) */}
          <NativeTabs.Trigger
            name="notifications"
            listeners={{
              tabPress: () => handleTabReselect('notifications', '/notifications'),
            }}
          >
            <NativeTabs.Trigger.Icon
              sf={{ default: 'bell', selected: 'bell.fill' }}
              md={{ default: 'notifications', selected: 'notifications' }}
            />
            <NativeTabs.Trigger.Label>消息</NativeTabs.Trigger.Label>
            {/* §4.1: Notification badge showing unread count */}
            {totalUnread > 0 && (
              <NativeTabs.Trigger.Badge>
                {totalUnread > 99 ? '99+' : String(totalUnread)}
              </NativeTabs.Trigger.Badge>
            )}
          </NativeTabs.Trigger>

          {/* 我的 (Profile) */}
          <NativeTabs.Trigger
            name="profile"
            listeners={{
              tabPress: () => handleTabReselect('profile', '/profile'),
            }}
          >
            <NativeTabs.Trigger.Icon
              sf={{ default: 'person', selected: 'person.fill' }}
              md={{ default: 'person', selected: 'person' }}
            />
            <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}

