import React, { useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, Appearance } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { enableFreeze } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import { Image } from 'expo-image';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ThemeProvider, useThemeColors } from '@/theme/ThemeContext';
import { getThemeColors } from '@/theme/colors';

import { useAuthStore } from '@/stores/authStore';
import { migrateLegacyPreferences } from '@/stores/preferencesStore';
import { getUserInfo } from '@/services/api/endpoints';
import { TiebaApiError, clearAuthCredentials } from '@/services/api/interceptors';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useClipboardDetector } from '@/hooks/useClipboardDetector';
import { showClipboardLinkDialog } from '@/components/ClipboardLinkDialog';
import {
  cancelNativeBackgroundSync,
  setupNotifications,
  stopNotificationPoller,
} from '@/services/NotificationPoller';
import { onMemoryWarning } from '../../modules/tieba-system/src';
import { ensureAutoSignScheduled } from '@/services/sign/BackgroundSignService';
import { clearAccountProfile, saveAccountProfile } from '@/services/auth/accountCache';
import { saveAccountSync } from '@/services/storage/AuthSQLiteStorage';
import { invalidateFollowedForumsCache } from '@/services/forumFollowed';
import { recoverStaleSignLiveActivities } from '@/services/liveActivity';
import { ensureUnifiedStorageReady } from '@/services/storage/unifiedDb';
import { getClientId } from '@/services/api/config';
import { extractThreadId, extractForumName } from '@/utils';

// SDK 57 性能优化：非活动屏幕冻结渲染
enableFreeze(true);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    if (data?.type === 'sign_progress') {
      return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
  },
  // Docs §setNotificationHandler: handler must respond within 3s or the
  // notification is discarded — surface failures instead of failing silently.
  handleError: (notificationId, error) => {
    console.warn(`[Notifications] Failed to handle notification ${notificationId}:`, error);
  },
});

// expo-system-ui: 在组件树之外设置根视图背景色（避免启动白屏闪烁）。
// 主题选择系统已移除：启动背景色只由系统外观决定（浅色白 / 深色黑）。
function resolveStartupBackgroundColor(): string {
  const systemIsDark = Appearance.getColorScheme() === 'dark';
  return getThemeColors(systemIsDark).background;
}
SystemUI.setBackgroundColorAsync(resolveStartupBackgroundColor()).catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15 * 1000, gcTime: 30 * 1000 }, mutations: { retry: 0 } },
});

// Global error boundary — catches render errors in the app tree and shows a
// fallback UI with a retry button instead of a hard crash. Retry remounts the
// subtree via a changing key so stale render state cannot survive.

// ErrorBoundary 是 class 组件，无法直接使用 useThemeColors Hook；
// 兜底 UI 作为独立函数组件渲染，在 ThemeProvider 内读取 colors.text，
// 保证深色模式下"出错了/重试"文字可见。
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useThemeColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 16, color: colors.text }}>出错了</Text>
      <Pressable onPress={onRetry}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>重试</Text>
      </Pressable>
    </View>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; attempt: number }
> {
  state = { hasError: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log a sanitized summary only; never include raw render output or
    // component stacks that could embed user content.
    const summary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn('[ErrorBoundary] render error:', summary);
    console.warn('[ErrorBoundary] componentStack length:', errorInfo.componentStack?.length ?? 0);
  }
  handleRetry = () => {
    this.setState((state) => ({ hasError: false, attempt: state.attempt + 1 }));
  };
  render() {
    if (this.state.hasError) {
      // ErrorFallback 是函数组件，可在 ThemeProvider 内读取 useThemeColors，
      // 保证深色模式下兜底文字（colors.text）可见。
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return (
      <View key={this.state.attempt} style={{ flex: 1 }}>
        {this.props.children}
      </View>
    );
  }
}

type ScreenDef = { name: string; title: string };

const SCREENS: readonly ScreenDef[] = [
  { name: 'forum/[name]',          title: '' },
  { name: 'forum/[name]/detail',   title: '吧详情' },
  { name: 'forum/[name]/bawu',     title: '吧务团队' },
  { name: 'forum/[name]/members',  title: '吧成员' },
  { name: 'forum/[name]/rules',    title: '吧规' },
  { name: 'forum/[name]/search',   title: '吧内搜索' },
  { name: 'thread/[id]',           title: '' },
  { name: 'thread/[id]/subposts',  title: '楼中楼' },
  { name: 'copy',                  title: '复制' },
  { name: 'search/index',          title: '搜索' },
  { name: 'user/[uid]',            title: '' },
  { name: 'user/[uid]/posts',      title: '用户帖子' },
  { name: 'user/[uid]/forums',     title: '关注的吧' },
  { name: 'history',               title: '浏览记录' },
  { name: 'threadstore',           title: '我的收藏' },
  { name: 'webview',               title: '' },
  { name: 'topic/[id]',            title: '话题' },
  { name: 'topic/list',            title: '热门话题' },
  { name: 'settings/index',        title: '设置' },
  { name: 'settings/theme',        title: '显示' },
  { name: 'settings/account',      title: '账号管理' },
  { name: 'settings/block',        title: '屏蔽设置' },
  { name: 'settings/habit',        title: '使用习惯' },
  { name: 'settings/oksign',       title: '一键签到设置' },
  { name: 'settings/more',         title: '更多设置' },
  { name: 'settings/about',        title: '关于' },
];

function RootLayoutInner() {
  const { colors, isDark } = useThemeColors();
  // 版本标记：确认 app 实际加载的 bundle 是否最新（reload 后应能看到）
  if (__DEV__) console.log('[tiebalite] bundle-version=2026-08-15-sortfix-23');
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const router = useRouter();
  const toolbarPrimaryColor = useAppPreference('toolbarPrimaryColor', false);
  const statusBarFontDark = useAppPreference('statusBarFontDark', false);
  // headerTint 需随主题明暗自适应：深色模式下导航栏是深色液态玻璃，
  // 勾选"工具栏使用主色调"时若再按 statusBarFontDark 取黑色字会黑字贴深底
  // 不可见，故深色一律用浅色（onNavBarSurface），浅色才尊重 statusBarFontDark。
  const headerTint = toolbarPrimaryColor
    ? (isDark
        ? colors.onNavBarSurface
        : (statusBarFontDark ? '#000' : '#FFF'))
    : colors.text;

  // 主题变化时同步原生根视图背景色（expo-system-ui runtime API）
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const screenOpts = useMemo(() => ({
    gestureEnabled: true,
    headerTintColor: headerTint,
    headerBackButtonDisplayMode: 'minimal' as const,
    // react-native-screens 的 BlurEffectTypes 提供 *_Dark / *_Light 显式变体。
    // 应用"强制深色 + 系统浅色"（或反之）时 'systemMaterial' 跟随系统外观，
    // 会使导航栏玻璃明暗与 headerTint 文字取色（isDark 决定）脱节。
    // 按 isDark 显式切换暗/亮材质，保证深色下浅字贴暗玻璃、浅色下黑字贴亮玻璃。
    headerBlurEffect: isDark ? ('systemMaterialDark' as const) : ('systemMaterialLight' as const),
    headerShadowVisible: false,
    headerStyle: { backgroundColor: 'transparent' },
    // SDK 57 / react-native-screens iOS 26: expo-router defaults every edge
    // of `scrollEdgeEffects` to 'automatic', which duplicates the always-on
    // `headerBlurEffect: 'systemMaterial'` (Liquid Glass material) and emits
    // "[RNScreens] Using both blurEffect and scrollEdgeEffects simultaneously
    // may cause overlapping effects." Per the official docs we keep only the
    // header blur and explicitly opt out of the automatic scroll-edge effect.
    scrollEdgeEffects: {
      top: 'hidden' as const,
      bottom: 'hidden' as const,
      left: 'hidden' as const,
      right: 'hidden' as const,
    },
    contentStyle: { backgroundColor: colors.background },
    freezeOnBlur: true,
  }), [headerTint, colors.background, isDark]);

  useEffect(() => {
    async function init() {
      // Splash 不再由 JS 手动隐藏：expo-splash-screen 原生层在 RN 首帧
      // 挂载（RCTContentDidAppearNotification）时自动淡出，storage/auth
      // 初始化在这里后台继续跑，UI 侧用各页已有的 isLoading 加载态兜底，
      // 让"点击图标 → 看到主页"尽可能快。
      try {
        await ensureUnifiedStorageReady();
        getClientId();
        await Promise.all([migrateLegacyPreferences(), checkAuth()]);
        void ensureAutoSignScheduled().catch(() => {});
      } catch {}
      const state = useAuthStore.getState();
      if (state.isLoggedIn) {
        try {
          const info = await getUserInfo();
          const current = useAuthStore.getState().account;
          if (current && info?.id != null) {
            const next = {
              ...current,
              nameShow: info.nameShow || current.nameShow,
              portrait: info.portrait || current.portrait,
              levelId: info.levelId,
              levelName: info.levelName,
              intro: info.intro || current.intro,
              fansNum: info.fansNum ?? current.fansNum,
              concernNum: info.concernNum ?? current.concernNum,
              postNum: info.postNum ?? current.postNum,
            };
            saveAccountSync(next);
            void saveAccountProfile(next);
            useAuthStore.setState({ account: next });
          }
        } catch (e: any) {
          if (e instanceof TiebaApiError && e.isAuthError) {
            clearAuthCredentials();
            stopNotificationPoller();
            cancelNativeBackgroundSync();
            void clearAccountProfile();
            invalidateFollowedForumsCache();
            useAuthStore.setState({ isLoggedIn: false, account: null, error: '登录已过期，请重新登录' });
          }
        }
      }
    }
    init();
  }, [checkAuth]);

  const handleDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    const m = url.match(/tiebalite:\/\/notifications\/(\d+)/) || url.match(/tblite:\/\/notifications\/(\d+)/);
    if (m) { router.push({ pathname: '/(tabs)/notifications', params: { initialTab: parseInt(m[1], 10) } }); return; }
    const tid = extractThreadId(url); if (tid) { router.push(`/thread/${tid}`); return; }
    const fn = extractForumName(url); if (fn) { router.push(`/forum/${encodeURIComponent(fn)}`); }
  }, [router]);

  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink).catch(() => {});
    const s1 = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    (async () => {
      const r = await Notifications.getLastNotificationResponseAsync();
      if (r?.notification.request.content.data?.url) handleDeepLink(r.notification.request.content.data.url as string);
      Notifications.clearLastNotificationResponseAsync();
    })();
    const s2 = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.content.data?.url) handleDeepLink(r.notification.request.content.data.url as string);
    });
    return () => { s1.remove(); s2.remove(); };
  }, [handleDeepLink]);

  const { detectedLink, clearDetectedLink } = useClipboardDetector();
  useEffect(() => { if (detectedLink) showClipboardLinkDialog(detectedLink, clearDetectedLink); }, [detectedLink, clearDetectedLink]);
  useEffect(() => {
    // Requests notification permission and starts the foreground poller
    // when notifications are allowed.
    setupNotifications();
    recoverStaleSignLiveActivities();
    return () => stopNotificationPoller();
  }, []);

  // 全局内存警告（iOS）：expo-image 没有内存缓存上限，系统发出低内存
  // 告警时主动清空内存缓存，把解码的原图占用的内存还给系统，避免被
  // watchdog 强杀。卸载时清理监听。
  useEffect(() => {
    const sub = onMemoryWarning(() => {
      Image.clearMemoryCache().catch(() => {});
    });
    return () => sub?.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* toolbarPrimaryColor=true 时深色模式一律浅字（白字贴深色导航栏），
          浅色模式才尊重 statusBarFontDark 偏好——与 headerTint 的取色同源。 */}
      <StatusBar style={toolbarPrimaryColor ? (isDark ? 'light' : (statusBarFontDark ? 'dark' : 'light')) : isDark ? 'light' : 'dark'} />
      <Stack screenOptions={screenOpts}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="login" options={{ title: '登录', presentation: 'formSheet' as const, headerBackVisible: false, sheetGrabberVisible: true,
          // 登录 sheet 双 detent：初始 0.65（约 2/3 屏，露出背景看到系统缩放
          // 效果，又不至于太小难输入），可上拖到全屏 1.0。
          // ⚠️ sheetAllowedDetents 数组必须是数字比例（0-1），不能用
          // ['medium','large'] 字符串数组——RNScreens 的排序检查按字典序
          // 比较字符串（'m'>'l'），会抛
          // "[RNScreens] The detent array is not sorted in ascending order!"。
          sheetAllowedDetents: [0.65, 1] as any,
          sheetInitialDetentIndex: 0,
          contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen
          name="forum/[name]"
          options={{
            title: '',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
          dangerouslySingular={(segment) => segment}
        />
        <Stack.Screen
          name="thread/[id]"
          options={{
            title: '',
            gestureEnabled: true,
          }}
        />
        {/* 楼中楼 — 全屏 push 页面 */}
        <Stack.Screen
          name="thread/[id]/subposts"
          options={{
            title: '楼中楼',
            gestureEnabled: true,
          }}
          dangerouslySingular={(segment) => segment}
        />
        {SCREENS.filter((s) => !['forum/[name]', 'thread/[id]', 'thread/[id]/subposts'].includes(s.name)).map((s) => (
          <Stack.Screen key={s.name} name={s.name} options={{ title: s.title }} />
        ))}
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaContext.md §Optimization: initialMetrics skips the async
          bridge delay on first render. Provider never remounts here. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ErrorBoundary>
              <RootLayoutInner />
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
