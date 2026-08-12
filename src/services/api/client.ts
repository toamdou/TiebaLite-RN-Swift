// ============================================================
// TiebaLite React Native - Axios Client Instances
// Creates and configures axios instances for each base URL.
// Each instance has its own interceptor chain.
// ============================================================

import { create as axiosCreate } from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

import {
  C_TIEBA,
  TIEBAC,
  TIEBA_WEB,
  DEFAULT_TIMEOUT,
  UPLOAD_TIMEOUT,
} from './config';

import {
  addCommonHeadersInterceptor,
  addCommonParamsInterceptor,
  addSignInterceptor,
  addAuthInterceptor,
  serializeFormBodyInterceptor,
  errorInterceptor,
  networkErrorInterceptor,
} from './interceptors';

export type { AxiosInstance, AxiosResponse };

/**
 * Active request signal used by page-level list hooks. The hook sets this
 * before invoking its fetcher so existing endpoint call sites get real
 * AbortSignal cancellation without requiring every page to pass signal
 * explicitly. Explicit per-request signals take precedence.
 */
let activeRequestSignal: AbortSignal | null = null;

export function setActiveRequestSignal(signal: AbortSignal | null): AbortSignal | null {
  const previous = activeRequestSignal;
  activeRequestSignal = signal;
  return previous;
}

export function getActiveRequestSignal(): AbortSignal | null {
  return activeRequestSignal;
}

// ============================================================
// Core API Client (c.tieba.baidu.com)
// Main client for most Tieba operations: forums, threads, posts, search, etc.
// Interceptors run in registration order:
//   1. Common headers (User-Agent, Accept-Language)
//   2. Common params (_client_id, _client_version, timestamp, etc.)
//   3. Auth cookies (BDUSS / STOKEN)
//   4. Sign (MD5-signed query params)
//   5. Serialize form body to URL-encoded string (after sign merged into object)
//   6. Response: check tieba error codes
//   7. Response-error: handle network errors
// ============================================================

export const tiebaClient: AxiosInstance = axiosCreate({
  baseURL: C_TIEBA,
  timeout: DEFAULT_TIMEOUT,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

// Request interceptors (run in registration order)
tiebaClient.interceptors.request.use(addCommonHeadersInterceptor);
tiebaClient.interceptors.request.use(addCommonParamsInterceptor);
tiebaClient.interceptors.request.use(addAuthInterceptor);
tiebaClient.interceptors.request.use(addSignInterceptor);
// Serialize form body AFTER signing so interceptors see config.data as an object
tiebaClient.interceptors.request.use(serializeFormBodyInterceptor);

// Response interceptors
tiebaClient.interceptors.response.use(errorInterceptor, networkErrorInterceptor);

// ============================================================
// Hybrid API Client (tiebac.baidu.com)
// Used for hybrid endpoints (v12.35 style) like personalized feeds.
// ============================================================

export const tiebacClient: AxiosInstance = axiosCreate({
  baseURL: TIEBAC,
  timeout: DEFAULT_TIMEOUT,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

tiebacClient.interceptors.request.use(addCommonHeadersInterceptor);
tiebacClient.interceptors.request.use(addCommonParamsInterceptor);
tiebacClient.interceptors.request.use(addAuthInterceptor);
tiebacClient.interceptors.request.use(addSignInterceptor);
tiebacClient.interceptors.request.use(serializeFormBodyInterceptor);

tiebacClient.interceptors.response.use(errorInterceptor, networkErrorInterceptor);

// ============================================================
// Web API Client (tieba.baidu.com)
// Used for fetching HTML pages or web-based info.
// Does NOT include signing or common params.
// ============================================================

export const tiebaWebClient: AxiosInstance = axiosCreate({
  baseURL: TIEBA_WEB,
  timeout: DEFAULT_TIMEOUT,
  withCredentials: false,
});

tiebaWebClient.interceptors.request.use(addCommonHeadersInterceptor);
tiebaWebClient.interceptors.request.use(addAuthInterceptor);

tiebaWebClient.interceptors.response.use(errorInterceptor, networkErrorInterceptor);

// ============================================================
// Upload API Client
// Extended timeout for file uploads (avatar, image, etc.).
// Does NOT include signing or common params.
// ============================================================

export const uploadClient: AxiosInstance = axiosCreate({
  baseURL: C_TIEBA,
  timeout: UPLOAD_TIMEOUT,
  withCredentials: false,
});

uploadClient.interceptors.request.use(addCommonHeadersInterceptor);
uploadClient.interceptors.request.use(addAuthInterceptor);

uploadClient.interceptors.response.use(errorInterceptor, networkErrorInterceptor);

// ============================================================
// Convenience request helpers
// ============================================================

/**
 * Perform a GET request on the main Tieba API client.
 */
export async function apiGet<T = unknown>(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return tiebaClient.get<T>(url, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
  });
}

/**
 * Perform a POST request on the main Tieba API client.
 * Body is passed as an object — interceptors merge common params + sign into it,
 * then the serializeFormBodyInterceptor converts to URL-encoded string.
 */
export async function apiPost<T = unknown>(
  url: string,
  data?: Record<string, string | number | boolean | undefined>,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return tiebaClient.post<T>(url, data ?? {}, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

/**
 * Perform a GET request on the Tiebac (hybrid) client.
 */
export async function apiGetHybrid<T = unknown>(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return tiebacClient.get<T>(url, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
  });
}

/**
 * Perform a POST request on the Tiebac (hybrid) client.
 */
export async function apiPostHybrid<T = unknown>(
  url: string,
  data?: Record<string, string | number | boolean | undefined>,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return tiebacClient.post<T>(url, data ?? {}, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

/**
 * Perform a GET request on the Tieba Web client (tieba.baidu.com).
 * Used for search endpoints (/mo/q/search/forum, /mo/q/search/thread, etc.)
 * which match Kotlin's HYBRID_TIEBA_API / WEB_TIEBA_API behavior:
 *   - No common params in query (NO_COMMON_PARAMS)
 *   - No signing
 *   - Only common headers + auth cookie
 */
export async function apiGetWeb<T = unknown>(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return tiebaWebClient.get<T>(url, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
  });
}

/**
 * Perform a POST multipart/form-data upload request.
 */
export async function apiUpload<T = unknown>(
  url: string,
  formData: FormData,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return uploadClient.post<T>(url, formData, {
    params,
    signal: signal ?? getActiveRequestSignal() ?? undefined,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}
