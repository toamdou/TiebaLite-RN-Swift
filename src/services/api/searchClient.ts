// ============================================================
// TiebaLite RN — Search API Client
//
// Mirrors Kotlin HYBRID_TIEBA_API for search endpoints:
//   GET https://tieba.baidu.com/mo/q/search/forum
//   GET https://tieba.baidu.com/mo/q/search/thread
//   GET https://tieba.baidu.com/mo/q/search/user
//
// Critical: BAIDUID cookie is required by tieba.baidu.com.
// Without it the server returns empty results or errors.
//
// Kotlin's CookieInterceptor captures BAIDUID from Set-Cookie headers
// and AddWebCookieInterceptor sends it on subsequent requests.
// We replicate this with persistent storage.
// ============================================================

import { create as axiosCreate } from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { kvGetSync, kvSetSync } from '@/services/storage/unifiedDb';
import { DEFAULT_TIMEOUT } from './config';
import { buildCookieHeader } from './cookies';

// -----------------------------------------------------------
// BAIDUID persistence (mirrors Kotlin ClientUtils.baiduId)
// -----------------------------------------------------------

const BAIDUID_KEY = '@tiebalite:baiduid';

/** 仅当服务端曾返回过真 BAIDUID 时才返回，否则返回空（对齐 Kotlin：首次请求不带 BAIDUID） */
function getBaiduId(): string {
  return kvGetSync(BAIDUID_KEY) ?? '';
}

// -----------------------------------------------------------
// Search Axios client — mirrors Kotlin HYBRID_TIEBA_API
// -----------------------------------------------------------

export const searchClient: AxiosInstance = axiosCreate({
  baseURL: 'https://tieba.baidu.com/',
  timeout: DEFAULT_TIMEOUT,
  withCredentials: false,
});

// Request interceptor: set all required headers
searchClient.interceptors.request.use((config) => {
  const keyword = (config.params?.word as string) ?? '';
  const encodedKeyword = encodeURIComponent(keyword);
  const timestamp = Date.now();

  // User-Agent (mirrors Kotlin: tieba/12.35.1.0 skin/default)
  config.headers.set('User-Agent', 'tieba/12.35.1.0 skin/default');
  config.headers.set('Host', 'tieba.baidu.com');
  config.headers.set('Pragma', 'no-cache');
  config.headers.set('Cache-Control', 'no-cache');
  config.headers.set('Accept', 'application/json, text/plain, */*');
  config.headers.set('Accept-Language', 'zh-CN,zh;q=0.9');
  config.headers.set('X-Requested-With', 'com.baidu.tieba');
  config.headers.set('Sec-Fetch-Site', 'same-origin');
  config.headers.set('Sec-Fetch-Mode', 'cors');
  config.headers.set('Sec-Fetch-Dest', 'empty');

  // Referer (mirrors Kotlin AppHybridTiebaApi)
  config.headers.set(
    'Referer',
    `https://tieba.baidu.com/mo/q/hybrid/search?keyword=${encodedKeyword}&_webview_time=${timestamp}`,
  );

  // Cookie (mirrors Kotlin HYBRID_TIEBA_API permanent cookie + AddWebCookieInterceptor)
  const cookie = buildCookieHeader({ includeSearch: true, baiduId: getBaiduId() });
  if (cookie) {
    config.headers.set('Cookie', cookie);
  }

  return config;
});

// Response interceptor: capture BAIDUID from Set-Cookie if server sends a new one
searchClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const c of cookies) {
        if (typeof c === 'string') {
          const match = c.match(/BAIDUID=([^;]+)/i);
          if (match) {
            kvSetSync(BAIDUID_KEY, match[1]);
          }
        }
      }
    }
    return response;
  },
  (error) => Promise.reject(error),
);

// -----------------------------------------------------------
// Convenience helper
// -----------------------------------------------------------

export async function apiSearchGet<T = unknown>(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return searchClient.get<T>(url, { params, signal });
}
