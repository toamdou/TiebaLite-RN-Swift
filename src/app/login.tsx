/**
 * WebView-based Login Page (aligned with Kotlin LoginPage.kt + AccountUtil.fetchAccountFlow)
 *
 * Flow:
 * 1. WebView loads wappass.baidu.com passport
 * 2. User logs in within WebView
 * 3. Redirect to tieba.baidu.com detected
 * 4. 🔑 Native module reads BDUSS/STOKEN from iOS cookie storage
 *    — mirrors Kotlin's CookieManager.getInstance().getCookie(url) → parseCookie()
 * 5. RN 端调用登录/用户信息 API（loginFlow, initNickNameFlow, getUserInfoFlow）
 *    — mirrors Kotlin's fetchAccountFlow(bduss, sToken, cookie)
 * 6. Complete Account stored in SQLite + native Cookie store (bduss, sToken, cookie, zid all populated)
 * 7. setAuthCredentials() called → all subsequent API requests carry BDUSS/STOKEN
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import { useAppTheme } from '@/theme/ThemeContext';
import { Radius, Spacing, typographyStyles } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { getNativeCookies } from '@/services/cookies/CookieService';
import { setAuthCredentials } from '@/services/api/interceptors';
import { apiGet, apiPost } from '@/services/api/client';

/** Baidu passport → redirects to tieba after successful login */
const LOGIN_URL =
  'https://wappass.baidu.com/passport?login&u=https%3A%2F%2Ftieba.baidu.com%2Findex%2Ftbwise%2Fmine';

/** 登录 WebView 只允许在这些域名内导航/收消息。 */
const LOGIN_TRUSTED_HOSTS = [
  'tieba.baidu.com',
  'tiebac.baidu.com',
  'passport.baidu.com',
  'wappass.baidu.com',
  'wapp.baidu.com',
  'static.tieba.baidu.com',
  'tb1.bdstatic.com',
];

function isTrustedLoginUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return LOGIN_TRUSTED_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/** Maximum wait time for login */
const TIMEOUT_MS = 60000;

// ============================================================
// Native Account Fetcher (IPA / dev-client path)
//
// 对齐 Kotlin AccountUtil.fetchAccountFlow():
//   1. loginFlow(bduss, sToken)       → /c/s/u?cmd=newuserinfo → uid, name, portrait, tbs
//   2. initNickNameFlow(bduss, sToken) → /c/s/initnickname     → nameShow
//   3. getUserInfoFlow(uid)           → /c/s/u?cmd=newuserinfo&uid=xxx → full profile
//
// 所有 API 调用走 RN 端 axios，BDUSS/STOKEN 由 interceptor 自动添加。
// 只保留 dev-client / IPA 的原生 Cookie 提取路径，不再提供 WebView JS 注入降级。
// ============================================================

interface NativeAccountData {
  uid: string;
  name: string;
  nameShow: string;
  portrait: string;
  tbs: string;
}

async function fetchAccountNative(): Promise<NativeAccountData> {
  // Step 1: loginFlow — 获取用户基本信息（对齐 Kotlin TiebaApi.loginFlow）
  const userRes = await apiGet<{ code: number; data: { user?: { uid?: string; id?: string; name?: string; name_show?: string; portrait?: string }; tbs?: string } }>(
    '/c/s/u',
    { cmd: 'newuserinfo' },
  );
  const userData = userRes.data?.data;
  const user = userData?.user || userData || {};
  const uid = String((user as any).uid || (user as any).id || '');
  const name = (user as any).name || '';
  const portrait = (user as any).portrait || '';
  const tbs = userData?.tbs || '';

  // Step 2: initNickNameFlow — 获取展示昵称（对齐 Kotlin AccountApi.initNickNameFlow）
  let nameShow = (user as any).name_show || name;
  if (tbs) {
    try {
      const nicknameRes = await apiPost<{ code: number; data: { name_show?: string } }>(
        '/c/s/initnickname',
        { tbs },
      );
      if (nicknameRes.data?.code === 0 && nicknameRes.data?.data?.name_show) {
        nameShow = nicknameRes.data.data.name_show;
      }
    } catch {
      // initNickNameFlow is non-critical; use name_show from step 1
    }
  }

  return { uid, name, nameShow, portrait, tbs };
}

type LoadingState = 'loading' | 'extracting' | 'success' | 'error' | null;

export default function LoginPage() {
  const { colors } = useAppTheme();
  const { login } = useAuthStore();

  const webViewRef = useRef<WebView>(null);
  const loginProcessedRef = useRef(false);
  // 用 ref 记录 loadingState，避免 handleNavigationStateChange 闭包在
  // loadingState 变化时被反复重建（进而导致 onNavigationStateChange 重绑定 / overlay 闪烁）。
  const loadingStateRef = useRef<LoadingState>('loading');

  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);

  const updateLoadingState = useCallback((next: LoadingState) => {
    loadingStateRef.current = next;
    setLoadingState(next);
  }, []);

  // ---------- Auto-dismiss after success ----------
  useEffect(() => {
    if (loadingState === 'success') {
      const timer = setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/profile');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loadingState]);

  // ---------- Login timeout ----------
  useEffect(() => {
    if (loadingStateRef.current !== 'loading' && loadingStateRef.current !== null) return;
    const timeout = setTimeout(() => {
      if (!loginProcessedRef.current) {
        updateLoadingState('error');
        setError('登录超时，请在页面中完成百度账号登录后重试');
        hapticForScene('action-fail');
      }
    }, TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loadingState, updateLoadingState]);

  // ---------- Show WebView after short delay ----------
  useEffect(() => {
    const timer = setTimeout(() => setShowWebView(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // ---------- Handle WebView navigation (detects redirect to tieba = login complete) ----------
  //
  // 对齐 Kotlin LoginWebViewClient.shouldOverrideUrlLoading():
  //   检测到贴吧重定向 → CookieManager.getCookie(url) → parse BDUSS/STOKEN
  //   → fetchAccountFlow(bduss, sToken, cookie)
  // 只保留 IPA / dev-client 原生 Cookie 读取路径，RN 端调 API（完全对齐 Kotlin）。
  const handleNavigationStateChange = useCallback(
    async (navState: WebViewNavigation) => {
      const url = navState.url;

      // Detect redirect to tieba after successful Baidu passport login
      if (
        !loginProcessedRef.current &&
        (url.startsWith('https://tieba.baidu.com/index/tbwise/') ||
         url.startsWith('https://tiebac.baidu.com/index/tbwise/'))
      ) {
        loginProcessedRef.current = true;
        updateLoadingState('extracting');
        hapticForScene('press');

        // Wait for native cookie sync (sharedCookiesEnabled → NSHTTPCookieStorage)
        // Kotlin: cookies are already available when shouldOverrideUrlLoading fires
        await new Promise((r) => setTimeout(r, 1500));

        // 原生 Cookie 提取（对齐 Kotlin CookieManager.getCookie）
        // dev-client / IPA 编译后生效
        const nativeCookies = await getNativeCookies('https://tieba.baidu.com');
        const nativeBduss = nativeCookies.BDUSS || '';
        const nativeStoken = nativeCookies.STOKEN || '';

        if (nativeBduss) {
          try {
            // 设置凭据使后续 API 调用携带 BDUSS/STOKEN
            // （对齐 Kotlin: interceptor 自动注入 CommonParam + Cookie header）
            setAuthCredentials(nativeBduss, nativeStoken);

            // 调用 RN 端 API 获取账号信息（对齐 Kotlin fetchAccountFlow）
            const accountData = await fetchAccountNative();

            const cookieStr = Object.entries(nativeCookies)
              .map(([k, v]) => `${k}=${v}`)
              .join('; ');
            const nativeZid =
              nativeCookies.BAIDUZID ||
              nativeCookies.ZID ||
              nativeCookies.BAIDUID ||
              '';
            await login({
              uid: accountData.uid,
              name: accountData.name,
              nameShow: accountData.nameShow,
              portrait: accountData.portrait,
              tbs: accountData.tbs,
              bduss: nativeBduss,
              sToken: nativeStoken,
              cookie: cookieStr,
              zid: nativeZid,
            });

            hapticForScene('action-success');
            updateLoadingState('success');
            return;
          } catch (e: any) {
            updateLoadingState('error');
            setError(
              e?.message
                ? `登录信息提取失败：${e.message}`
                : '登录信息提取失败，请重试。',
            );
            hapticForScene('action-fail');
            loginProcessedRef.current = false;
          }
        } else {
          updateLoadingState('error');
          setError(
            '无法读取登录凭据（BDUSS）。\n\n' +
            '请在开发构建中登录，或确认系统 Cookie 已写入。',
          );
          hapticForScene('action-fail');
          loginProcessedRef.current = false;
        }
      } else if (loadingStateRef.current === 'loading' && url.includes('passport.baidu.com')) {
        // Baidu passport loaded — hide loading spinner
        updateLoadingState(null);
      }
    },
    [login, updateLoadingState],
  );

  // ---------- Hide loading spinner when WebView first loads ----------
  const handleLoadEnd = useCallback(() => {
    if (loadingStateRef.current === 'loading') {
      updateLoadingState(null);
    }
  }, [updateLoadingState]);

  // ---------- WebView error ----------
  const handleWebViewError = useCallback(() => {
    if (!loginProcessedRef.current) {
      updateLoadingState('error');
      setError('页面加载失败，请检查网络连接后重试');
    }
  }, [updateLoadingState]);

  // ---------- Help ----------
  const handleHelp = useCallback(() => {
    Alert.alert(
      '登录帮助',
      '1. 在页面中输入你的百度账号和密码\n' +
        '2. 如需验证，请按页面提示完成\n' +
        '3. 登录成功后会自动跳转至贴吧\n' +
        '4. 应用将自动获取用户信息\n\n' +
        '如自动获取失败，可能是百度安全策略所致。\n' +
        '建议重新尝试或检查网络连接。',
      [{ text: '知道了', style: 'cancel' }],
    );
  }, []);

  // ---------- Retry ----------
  const handleRetry = useCallback(() => {
    loginProcessedRef.current = false;
    updateLoadingState('loading');
    setError(null);
    webViewRef.current?.reload();
  }, [updateLoadingState]);

  // ---------- Close ----------
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.windowBackground }}>
      <Stack.Screen
        options={{
          title: '登录百度账号',
          headerTransparent: true,
          headerBlurEffect: 'systemMaterial' as const,
          headerShadowVisible: false,
          headerTintColor: colors.text,
          // 关闭通道只保留 formSheet 抓条（_layout.tsx 已设 sheetGrabberVisible: true
          // + headerBackVisible: false），不再自绘 xmark，避免双关闭入口。
          headerRight: () => (
            <Pressable
              onPress={handleHelp}
              style={({ pressed }) => [
                styles.headerIconBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel="登录帮助"
              accessibilityRole="button"
            >
              <SymbolView
                name="questionmark.circle"
                size={22}
                weight="medium"
                tintColor={colors.primary}
              />
            </Pressable>
          ),
        }}
      />

      {/* Loading Overlay — 普通 scrim 半透明遮罩 + 原生加载指示器，
          不再用全屏玻璃盖住正在加载的 WebView 内容 */}
      {loadingState === 'loading' && (
        <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.textOnPrimary }]}>
            正在加载登录页面...
          </Text>
        </View>
      )}

      {/* Extracting Overlay */}
      {loadingState === 'extracting' && (
        <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.textOnPrimary }]}>
            正在获取用户信息...
          </Text>
        </View>
      )}

      {/* Success Overlay */}
      {loadingState === 'success' && (
        <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
          <View style={styles.successIconContainer}>
            <View style={[styles.successIcon, { backgroundColor: colors.success }]}>
              <SymbolView name="checkmark" size={32} tintColor="#FFF" weight="bold" />
            </View>
          </View>
          <Text style={styles.successText}>登录成功</Text>
        </View>
      )}

      {/* Error State */}
      {loadingState === 'error' && (
        <View style={[styles.errorContainer, { backgroundColor: colors.scrim }]}>
          <SymbolView name="exclamationmark.triangle.fill" size={48} tintColor={colors.danger} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {error || '登录失败'}
          </Text>
          <Text style={[styles.errorHint, { color: colors.textSecondary }]}>
            请确认页面中已成功登录百度账号
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.retryText, { color: colors.textOnPrimary }]}>重新加载</Text>
          </Pressable>
          <Pressable
            onPress={handleClose}
            style={[styles.retryButton, { backgroundColor: colors.surfaceSecondary, marginTop: Spacing.md }]}
          >
            <Text style={[styles.retryText, { color: colors.text }]}>返回</Text>
          </Pressable>
        </View>
      )}

      {/* WebView */}
      {showWebView && (
        <WebView
          ref={webViewRef}
          source={{ uri: LOGIN_URL }}
          style={{
            flex: 1,
            opacity:
              loadingState === 'loading' ||
              loadingState === 'extracting' ||
              loadingState === 'success'
                ? 0
                : 1,
          }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={(request) => isTrustedLoginUrl(request.url)}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={false}
        />
      )}

      {/* Security Notice */}
      <View
        style={[
          styles.securityNotice,
          { backgroundColor: colors.card, borderTopColor: colors.divider },
        ]}
      >
        <SymbolView name="lock.shield.fill" size={14} tintColor={colors.textSecondary} />
        <Text style={[styles.securityText, { color: colors.textSecondary }]}>
          登录凭据仅保存在本机安全存储（Keychain）与 Cookie 存储中，仅用于请求百度接口。
        </Text>
      </View>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  headerIconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  statusText: {
    ...typographyStyles.subhead,
    marginTop: Spacing.xs,
  },
  successIconContainer: {
    marginBottom: Spacing.sm,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    // backgroundColor 走 colors.success（组件内动态注入，iOS systemGreen 语义色）
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    ...typographyStyles.number,
    color: '#FFF',
  },
  errorContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  } as any,
  errorText: {
    ...typographyStyles.headline,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 14,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: Spacing.md,
    borderRadius: Radius.input,
  },
  retryText: {
    color: '#FFF',
    ...typographyStyles.calloutBold,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  securityText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
