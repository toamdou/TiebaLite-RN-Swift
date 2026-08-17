// ============================================================
// TiebaLite RN — Search API Client
//
// Mirrors Kotlin HYBRID_TIEBA_API for search endpoints:
//   GET https://c.tieba.baidu.com/mo/q/search/forum
//   GET https://c.tieba.baidu.com/mo/q/search/thread
//   GET https://c.tieba.baidu.com/mo/q/search/user
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

/** 生成一个 24 位随机 hex 的 BAIDUID（对齐百度 UA 格式，含 :FG=1 分段后缀） */
function generateBaiduId(): string {
  const hex = Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `${hex}:FG=1`;
}

/**
 * 搜索接口依赖 BAIDUID cookie，缺失时服务端直接返回空结果。
 * 优先用服务端 Set-Cookie 下发的真实 BAIDUID；从未收到过时
 * 生成一个随机 ID 并持久化，保证首次搜索也能拿到结果。
 */
function getBaiduId(): string {
  let id = kvGetSync(BAIDUID_KEY) ?? '';
  if (!id) {
    id = generateBaiduId();
    kvSetSync(BAIDUID_KEY, id);
  }
  return id;
}

// -----------------------------------------------------------
// Search Axios client
// -----------------------------------------------------------
// ⚠️ 必须用 c.tieba.baidu.com：tieba.baidu.com 的 /mo/q/search/* 会 301
// 重定向到 http:// 明文地址，axios 跟随后被 iOS ATS 拦截导致请求失败
// （表现为搜索无结果）。c.tieba.baidu.com 直接返回 JSON，不走重定向。

export const searchClient: AxiosInstance = axiosCreate({
  baseURL: 'https://c.tieba.baidu.com/',
  // 与其他 API 一致：正常网络下搜索请求 <1s 完成，超时仅作坏网兜底。
  // 之前请求挂起 30s 是手动 Host 头导致（已移除），不是超时过短。
  timeout: DEFAULT_TIMEOUT,
  withCredentials: false,
});

// Request interceptor: set all required headers
searchClient.interceptors.request.use((config) => {
  const keyword = (config.params?.word as string) ?? '';
  const encodedKeyword = encodeURIComponent(keyword);
  const timestamp = Date.now();
  if (__DEV__) console.log('[search] request:', config.baseURL, config.url, 'signal=', config.signal != null);

  // User-Agent (mirrors Kotlin: tieba/12.35.1.0 skin/default)
  config.headers.set('User-Agent', 'tieba/12.35.1.0 skin/default');
  // ⚠️ 不能手动设置 Host 头：iOS NSURLSession 禁止自定义 Host（会忽略甚至
  // 导致连接挂起直到超时）。Host 由 URLSession 按请求 URL 自动生成。
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
    if (__DEV__) {
      const body = response.data as any;
      const list = body?.data?.post_list ?? body?.data?.exactMatch ?? body?.data?.fuzzy_match;
      console.log('[search] OK status=', response.status, 'url=', response.config.url, 'listLen=', Array.isArray(list) ? list.length : (list ? 'object' : 'none'));
    }
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
  (error) => {
    if (__DEV__) {
      const isCancel = error?.code === 'ERR_CANCELED' || error?.message?.includes('canceled');
      console.warn('[search] ERR url=', error?.config?.url, 'code=', error?.code, 'canceled=', isCancel, 'msg=', error?.message, 'status=', error?.response?.status);
    }
    return Promise.reject(error);
  },
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
