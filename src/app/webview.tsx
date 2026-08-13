/**
 * Built-in Browser Page (内置浏览器)
 * WebView-based browser for opening tieba.baidu.com links in-app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { SymbolView } from '@/components/ui/SymbolView';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Menu, Button as SWButton } from '@expo/ui/swift-ui';
import { labelStyle, buttonStyle } from '@expo/ui/swift-ui/modifiers';
import { ThemedHost } from '@/components/ui/ThemedHost';

import { useAppTheme } from '@/theme/ThemeContext';

/** 内置浏览器只允许内嵌加载贴吧相关可信域名。 */
const TRUSTED_HOSTS = [
  'tieba.baidu.com',
  'tiebac.baidu.com',
  'static.tieba.baidu.com',
  'tb1.bdstatic.com',
  'tb.himg.baidu.com',
  'passport.baidu.com',
  'wappass.baidu.com',
  'wapp.baidu.com',
];

function isTrustedWebUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return TRUSTED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export default function WebViewPage() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  const webViewRef = useRef<WebView>(null);
  const externalOpenedRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState(title || '');
  const initialUrl = isTrustedWebUrl(url || 'https://tieba.baidu.com')
    ? (url || 'https://tieba.baidu.com')
    : '';
  const [currentUrl, setCurrentUrl] = useState(initialUrl);

  const handleGoBack = useCallback(() => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    } else {
      router.back();
    }
  }, [canGoBack, router]);

  const handleGoForward = useCallback(() => {
    webViewRef.current?.goForward();
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: currentUrl,
        title: pageTitle,
      });
    } catch {}
  }, [currentUrl, pageTitle]);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(currentUrl);
    } catch {}
  }, [currentUrl]);

  const handleOpenBrowser = useCallback(async () => {
    try {
      await WebBrowser.openBrowserAsync(currentUrl);
    } catch {}
  }, [currentUrl]);

  const openExternal = useCallback((targetUrl: string) => {
    if (externalOpenedRef.current) return;
    externalOpenedRef.current = true;
    WebBrowser.openBrowserAsync(targetUrl).catch(() => {});
  }, []);

  const handleShouldStartLoad = useCallback((request: ShouldStartLoadRequest): boolean => {
    if (isTrustedWebUrl(request.url)) return true;
    // 外部链接交给系统浏览器，禁止在应用 WebView 内继续加载。
    openExternal(request.url);
    return false;
  }, [openExternal]);

  useEffect(() => {
    if (url && !isTrustedWebUrl(url)) {
      openExternal(url);
      router.dismissTo('/');
    }
  }, [url, router, openExternal]);

  const handleRefresh = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  const handleClose = useCallback(() => {
    router.dismissTo('/');
  }, [router]);

  const handleNavigationStateChange = useCallback(
    (navState: any) => {
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      setCurrentUrl(navState.url);
      if (navState.title) setPageTitle(navState.title);
    },
    [],
  );

  // 退出清理：页面卸载时释放 WebView 引用，让系统回收 WKWebView 进程/内存。
  useEffect(() => {
    return () => {
      webViewRef.current = null;
    };
  }, []);

  // 渲染进程崩溃时恢复并保持加载态（避免黑屏 + 假 loading 结束）
  const handleContentProcessDidTerminate = useCallback(() => {
    setLoading(true);
    webViewRef.current?.reload();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.windowBackground }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Toolbar */}
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: colors.toolbar,
            paddingTop: insets.top,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={styles.toolbarRow}>
          {/* Close */}
          <Pressable onPress={handleClose} style={styles.toolBtn}>
            <SymbolView name="xmark" size={22} tintColor={colors.text} />
          </Pressable>

          {/* Back/Forward */}
          <Pressable
            onPress={handleGoBack}
            style={[styles.toolBtn, !canGoBack && { opacity: 0.3 }]}
            disabled={!canGoBack && !loading}
          >
            <SymbolView name="chevron.left" size={22} tintColor={colors.text} />
          </Pressable>

          <Pressable
            onPress={handleGoForward}
            style={[styles.toolBtn, !canGoForward && { opacity: 0.3 }]}
            disabled={!canGoForward}
          >
            <SymbolView name="chevron.right" size={22} tintColor={colors.text} />
          </Pressable>

          <Pressable onPress={handleRefresh} style={styles.toolBtn}>
            <SymbolView name="arrow.clockwise" size={20} tintColor={colors.text} />
          </Pressable>

          {/* Title */}
          <View style={styles.titleContainer}>
            {loading && <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />}
            <Text style={[styles.toolbarTitle, { color: colors.text }]} numberOfLines={1}>
              {pageTitle || '加载中…'}
            </Text>
          </View>

          {/* Share / Copy / Open in Safari — 收进一个菜单，给标题留空间 */}
          <ThemedHost matchContents>
            <Menu
              label=""
              systemImage="ellipsis"
              modifiers={[labelStyle('iconOnly'), buttonStyle('plain')]}
            >
              <SWButton
                label="分享链接"
                systemImage="square.and.arrow.up"
                onPress={handleShare}
              />
              <SWButton
                label="复制链接"
                systemImage="doc.on.doc"
                onPress={handleCopy}
              />
              <SWButton
                label="在 Safari 中打开"
                systemImage="safari"
                onPress={handleOpenBrowser}
              />
            </Menu>
          </ThemedHost>
        </View>
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: initialUrl || 'https://tieba.baidu.com' }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onContentProcessDidTerminate={handleContentProcessDidTerminate}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        sharedCookiesEnabled={isTrustedWebUrl(currentUrl)}
      />

      {/* 加载中骨架：覆盖在 WebView 上，避免白屏等待感（仅加载期间） */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <SkeletonList variant="card" count={4} style={styles.loadingSkeleton} />
          <View style={styles.loadingHint}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingHintText, { color: colors.textSecondary }]}>
              正在加载页面…
            </Text>
          </View>
        </View>
      )}

      {/* Loading Bar */}
      {loading && (
        <View style={[styles.loadingBar, { backgroundColor: colors.primary }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 8,
    gap: 4,
  },
  toolBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  loader: {
    marginRight: 4,
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingSkeleton: { flex: 1 },
  loadingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadingHintText: {
    fontSize: 13,
  },
  loadingBar: {
    height: 2,
  },
});
