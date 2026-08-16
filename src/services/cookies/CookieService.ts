// CookieService — iOS 原生 Cookie 读取/写入/清除，对齐 Kotlin CookieManager。
// 原生模块不可用时读取静默降级；登录/切换会主动写入 BDUSS/STOKEN，
// 登出会校验清除结果，避免“只清不写”或清除失败被吞掉。

import { getBdussSync, getStokenSync } from '@/services/storage/AuthSQLiteStorage';

const TIEBA_COOKIE_URL = 'https://tieba.baidu.com/';

let cookieManager: any = null;
let cookieManagerChecked = false;

function getCookieManager(): any {
  if (!cookieManagerChecked) {
    cookieManagerChecked = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module is lazy-loaded so Expo Go still falls back without crashing.
      cookieManager = require('@preeternal/react-native-cookie-manager').default;
    } catch {
      cookieManager = null;
    }
  }
  return cookieManager;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** 把已登录账号的 Cookie 同步到 iOS Foundation 与 WKWebView 两个存储。 */
export async function setNativeCookies(
  bduss: string,
  stoken: string,
  cookie?: string,
): Promise<void> {
  const manager = getCookieManager();
  if (!manager) return;

  const entries = new Map<string, string>();
  if (bduss) entries.set('BDUSS', bduss);
  if (stoken) entries.set('STOKEN', stoken);
  if (cookie) {
    for (const part of cookie.split(';')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim().toUpperCase();
      const value = part.slice(eq + 1).trim();
      if (name && value && !entries.has(name)) {
        entries.set(name, value);
      }
    }
  }

  for (const [name, value] of entries) {
    const httpOnly = name === 'BDUSS' || name === 'STOKEN';
    const cookieSpec = {
      name,
      value,
      domain: '.baidu.com',
      path: '/',
      secure: true,
      httpOnly,
      maxAge: 315360000,
    };
    // iOS 有 Foundation（URLSession）与默认 WKWebView 两套 Cookie 存储，
    // 登录后必须都写入，WebView 与 API 请求才能共享会话。
    await manager.set(TIEBA_COOKIE_URL, cookieSpec, false);
    await manager.set(TIEBA_COOKIE_URL, cookieSpec, true);
  }
}

/** 与 setNativeCookies 同义的便捷命名。 */
export async function syncNativeCookies(
  bduss: string,
  stoken: string,
  cookie?: string,
): Promise<void> {
  return setNativeCookies(bduss, stoken, cookie);
}

function normalizeCookies(
  cookies: Record<string, { name?: string; value?: string }> | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookies) return result;
  for (const [name, cookie] of Object.entries(cookies)) {
    if (cookie && typeof cookie.value === 'string') {
      result[name.toUpperCase()] = cookie.value;
    }
  }
  return result;
}

/**
 * 读取指定 URL 下的 iOS 原生 Cookie。
 * 同时读取 Foundation 与 WKWebView 两个存储，保证 WebView 登录后的 HttpOnly Cookie 可见。
 */
export async function getNativeCookies(
  url: string = TIEBA_COOKIE_URL,
): Promise<Record<string, string>> {
  const manager = getCookieManager();
  if (!manager) return {};

  const merged: Record<string, string> = {};
  try {
    Object.assign(merged, normalizeCookies(await manager.get(url, false)));
  } catch {}

  try {
    Object.assign(merged, normalizeCookies(await manager.get(url, true)));
  } catch {}

  return merged;
}

export async function getTiebaAuthCookies(): Promise<{ bduss: string; stoken: string }> {
  const cookies = await getNativeCookies(TIEBA_COOKIE_URL);
  return {
    bduss: cookies.BDUSS || getBdussSync(),
    stoken: cookies.STOKEN || getStokenSync(),
  };
}

/**
 * 清除 iOS 原生 Cookie 存储，对齐 Kotlin AccountUtil.exit() 的
 * CookieManager.removeAllCookies()。同时清理 Foundation 与默认
 * WKWebView 存储。返回 false 表示清除失败，供登出流程校验。
 */
export async function clearNativeCookies(): Promise<boolean> {
  const manager = getCookieManager();
  if (!manager) return true; // 当前构建没有原生模块时无可清理项
  try {
    const result = await manager.clearAllStores();
    return result !== false;
  } catch (error) {
    console.warn('[CookieService] clearNativeCookies failed:', sanitizeError(error));
    return false;
  }
}
