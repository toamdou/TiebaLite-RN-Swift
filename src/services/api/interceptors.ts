// ============================================================
// TiebaLite React Native - Axios Interceptors
// Request interceptors: common headers, common params, signing, auth
// Response interceptor: error handling for tieba-specific error codes
// ============================================================

import type {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import axios from 'axios';

import { buildCommonParams, COMMON_HEADERS } from './config';
import { generateSign } from './sign';
import { buildCookieHeader } from './cookies';
import { clearBackgroundSnapshot } from '@/services/nativeBackground';

// ============================================================
// Cookie / Auth State
// ============================================================

import { getBduss, getStoken, setAuthState, clearAuthState } from './authState';

/**
 * Set authentication credentials for subsequent requests.
 * Called after a successful login.
 */
export function setAuthCredentials(bduss: string, sToken: string): void {
  setAuthState(bduss, sToken);
}

/** Clear stored authentication */
export function clearAuthCredentials(): void {
  clearAuthState();
}

export { getBduss, getStoken };

// ============================================================
// Request Interceptors
// ============================================================

/**
 * Adds common HTTP headers (User-Agent, Accept-Language, etc.)
 * to every outgoing request.
 */
export function addCommonHeadersInterceptor(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  for (const [key, value] of Object.entries(COMMON_HEADERS)) {
    if (!config.headers[key]) {
      config.headers.set(key, value);
    }
  }
  return config;
}

/**
 * Adds standard client parameters. For GET/HEAD: query string. For POST with form body: body.
 * Mirrors Kotlin CommonParamInterceptor which also puts params into FormBody for POST.
 *
 * NOTE: This interceptor should run BEFORE signing so the sign covers these params.
 */
export function addCommonParamsInterceptor(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const commonParams = buildCommonParams();

  // POST/PUT/PATCH with form-encoded body → merge into body (Kotlin CommonParamInterceptor)
  const isFormPost =
    config.method?.toUpperCase() === 'POST' &&
    (!config.headers?.['Content-Type'] ||
     String(config.headers['Content-Type']).includes('x-www-form-urlencoded'));

  if (isFormPost && config.data && typeof config.data === 'object' && !(config.data instanceof URLSearchParams) && !(config.data instanceof FormData)) {
    // Merge common params into form body (existing body params take precedence)
    config.data = { ...commonParams, ...config.data };
    // Also keep on query for the sign calc — but sign interceptor will detect body
    (config as any).__hasFormBody = true;
  } else {
    // GET or non-form POST → merge into query string
    if (config.params) {
      config.params = { ...commonParams, ...config.params };
    } else {
      config.params = { ...commonParams };
    }
  }
  return config;
}

/** Helper: extract plain key-value records from an object or URLSearchParams */
function extractParams(
  source: Record<string, unknown> | URLSearchParams | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!source) return result;
  if (source instanceof URLSearchParams) {
    source.forEach((v, k) => { result[k] = v; });
  } else {
    for (const [k, v] of Object.entries(source)) {
      if (v !== undefined && v !== null) result[k] = String(v);
    }
  }
  return result;
}

/**
 * Signs the request. For POST form-body requests, sign over the body fields.
 * For GET / other, sign over query params.
 * Mirrors Kotlin SortAndSignInterceptor which checks FormBody vs query.
 */
export function addSignInterceptor(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const hasFormBody = (config as any).__hasFormBody;

  if (hasFormBody && config.data && typeof config.data === 'object') {
    // POST form body signing (Kotlin: body is FormBody)
    const bodyParams = extractParams(config.data as Record<string, unknown>);
    const signObj = generateSign(bodyParams);
    config.data = { ...(config.data as object), ...signObj };
  } else {
    // Query string signing (Kotlin: url.queryParameter)
    if (!config.params) config.params = {};
    const queryParams = extractParams(config.params);
    const signObj = generateSign(queryParams);
    config.params = { ...config.params, ...signObj };
  }
  return config;
}

/**
 * Serializes the form body from object to URL-encoded string.
 * MUST run AFTER addCommonParamsInterceptor and addSignInterceptor
 * so those interceptors see config.data as a mutable object.
 *
 * Without this interceptor, apiPost would pre-serialize the body to a string,
 * preventing common params and sign from being merged into the POST body.
 */
export function serializeFormBodyInterceptor(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const method = config.method?.toUpperCase();
  if (
    (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
    config.data &&
    typeof config.data === 'object' &&
    !(config.data instanceof FormData) &&
    !(config.data instanceof URLSearchParams)
  ) {
    const ct = String(config.headers?.['Content-Type'] ?? '');
    if (ct.includes('x-www-form-urlencoded')) {
      config.data = new URLSearchParams(
        Object.entries(config.data as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
    }
  }
  return config;
}

/**
 * Adds BDUSS/STOKEN cookies to authenticated requests.
 * Runs after auth credentials have been set via setAuthCredentials().
 */
export function addAuthInterceptor(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const cookieHeader = buildCookieHeader();
  if (cookieHeader) {
    config.headers.set('Cookie', cookieHeader);
  }
  return config;
}

// ============================================================
// Response Interceptor
// ============================================================

/**
 * Tieba API error codes that should trigger specific handling.
 */
export enum TiebaErrorCode {
  /** User not logged in / session expired */
  NOT_LOGIN = 1,
  /** Need verification code */
  NEED_VERIFY = 2,
  /** Post/topic deleted */
  DELETED = 3,
  /** Permission denied / user blocked */
  PERMISSION_DENIED = 4,
  /** Content filtered / blocked */
  CONTENT_FILTERED = 5,
  /** Rate limited */
  RATE_LIMITED = 3250002,
  /** Operation too frequent */
  TOO_FREQUENT = 1101011,
}

/**
 * Custom error class for Tieba API errors.
 */
export class TiebaApiError extends Error {
  code: number;
  errorCode: number;
  rawData: unknown;

  constructor(message: string, code: number, errorCode: number, rawData?: unknown) {
    super(message);
    this.name = 'TiebaApiError';
    this.code = code;
    this.errorCode = errorCode;
    this.rawData = rawData;
  }

  get isAuthError(): boolean {
    return this.code === TiebaErrorCode.NOT_LOGIN;
  }

  get isRateLimited(): boolean {
    return this.errorCode === TiebaErrorCode.RATE_LIMITED ||
           this.errorCode === TiebaErrorCode.TOO_FREQUENT;
  }

  get isDeleted(): boolean {
    return this.code === TiebaErrorCode.DELETED;
  }
}

/**
 * Unified Tieba error detection for axios JSON responses and protobuf
 * decoded payloads. Returns null when the payload is a success.
 */
export function getTiebaError(data: unknown): TiebaApiError | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, any>;
  const protoError = obj.error && typeof obj.error === 'object' ? obj.error : null;
  const protoErrorCode = protoError?.error_code ?? protoError?.errorCode;
  const rawErrorCode = obj.error_code ?? obj.errno ?? obj.err_code;
  const errorCode = Number(protoErrorCode ?? rawErrorCode ?? 0);

  if (errorCode !== 0) {
    const protoErrorMsg = protoError?.error_msg ?? protoError?.errorMsg;
    const errorMsg =
      obj.error_msg ??
      (typeof obj.error === 'string' ? obj.error : undefined) ??
      obj.msg ??
      protoErrorMsg;
    return new TiebaApiError(
      errorMsg ?? `API error: ${errorCode}`,
      errorCode,
      errorCode,
      data,
    );
  }

  const rawCode = obj.code;
  if (rawCode !== undefined && rawCode !== null) {
    const code = Number(rawCode);
    if (code !== 0 && code !== 1) {
      return new TiebaApiError(
        obj.message ?? obj.msg ?? `API returned code: ${code}`,
        code,
        code,
        data,
      );
    }
  }

  return null;
}

/**
 * Throw a TiebaApiError for any non-success payload. The axios response
 * interceptor passes `handleAuth = true`; protobuf/fallback helpers keep the
 * original behavior by leaving auth cleanup to the axios layer.
 */
export function assertSuccessPayload(data: unknown, handleAuth = true): void {
  const error = getTiebaError(data);
  if (!error) return;
  if (handleAuth && error.code === TiebaErrorCode.NOT_LOGIN) {
    handleAuthExpired();
  }
  throw error;
}

/**
 * Response interceptor that checks for Tieba-specific error codes
 * inside the response body.
 *
 * The Baidu Tieba API often returns HTTP 200 even for errors,
 * embedding the actual error in a JSON `error_code` or `code` field.
 *
 * 限流/频繁操作（RATE_LIMITED/TOO_FREQUENT）做指数退避重试 1-2 次，
 * 重试时复用原 config（common params + sign 已烘焙进 params/body）。
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function errorInterceptor(response: AxiosResponse): Promise<AxiosResponse> {
  let current = response;
  let attempt = 0;
  for (;;) {
    try {
      assertSuccessPayload(current.data);
      return current;
    } catch (e) {
      if (e instanceof TiebaApiError && e.isRateLimited && attempt < 2) {
        attempt += 1;
        await sleep(500 * Math.pow(2, attempt - 1)); // 500ms → 1000ms
        try {
          current = await axios.request(current.config);
        } catch (networkErr: any) {
          // 重试本身网络失败则抛出原限流错误，避免吞掉语义
          throw e;
        }
        continue;
      }
      throw e;
    }
  }
}

/**
 * Session-expired cleanup without importing the store at module load
 * (avoids a circular dependency with the API layer).
 *
 * 导出供 protoClient 等非 axios 通道调用（proto 请求不经过 axios interceptor）。
 */
export function handleAuthExpired(): void {
  try {
    clearAuthCredentials();
    clearBackgroundSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require avoids API→store circular imports.
    const authStore = require('@/stores/authStore').useAuthStore;
    authStore.setState({ isLoggedIn: false, account: null, error: '登录已过期，请重新登录' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require avoids API→poller circular imports.
    const poller = require('@/services/NotificationPoller');
    poller.stopNotificationPoller?.();
    poller.cancelNativeBackgroundSync?.();
  } catch {
    // Best-effort cleanup; the next user action will prompt for login.
  }
}

/**
 * 验证码降级：将验证码/风控错误转为可读错误，供点赞、签到等写操作在出错时
 * 返回可读信息（不做完整验证码 UI）。
 */
export function describeActionFailure(error: unknown): string {
  if (error instanceof TiebaApiError) {
    if (error.isRateLimited) return '操作过于频繁，请稍后再试';
    if (error.code === TiebaErrorCode.NEED_VERIFY) return '需要验证码，当前设备不支持自动验证，请稍后再试';
    if (error.isDeleted) return '内容已被删除';
    if (error.isAuthError) return '登录已过期，请重新登录';
    return error.message || '操作失败，请稍后再试';
  }
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后再试';
}

/**
 * Global response error handler for network-level errors (no connection, timeout, etc.).
 * Wraps AxiosError with additional context for debugging.
 */
export function networkErrorInterceptor(error: AxiosError): Promise<never> {
  if (
    (error as any)?.code === 'ERR_CANCELED' ||
    (error as any)?.__CANCEL__ === true
  ) {
    return Promise.reject(
      new TiebaApiError('Request cancelled', -1, -1),
    );
  }

  if (error.response) {
    // Server responded with a non-2xx status code
    const status = error.response.status;
    if (status === 403) {
      return Promise.reject(
        new TiebaApiError('Access denied (403). Check BDUSS validity.', 403, 403)
      );
    }
    if (status === 404) {
      return Promise.reject(
        new TiebaApiError('API endpoint not found (404).', 404, 404)
      );
    }
    if (status >= 500) {
      return Promise.reject(
        new TiebaApiError(
          `Tieba server error (${status}). Please try again later.`,
          status,
          0
        )
      );
    }
    return Promise.reject(
      new TiebaApiError(
        `HTTP ${status}: ${error.message}`,
        status,
        0
      )
    );
  }

  if (error.request) {
    // Request was made but no response received (network issue)
    return Promise.reject(
      new TiebaApiError(
        'Network error: Unable to reach Tieba servers. Check your connection.',
        0,
        -1
      )
    );
  }

  // Something happened in setting up the request
  return Promise.reject(
    new TiebaApiError(
      `Request setup error: ${error.message}`,
      -1,
      -1
    )
  );
}
