/**
 * TiebaLite React Native - Utility Functions
 */

import { StyleSheet } from 'react-native';

/** Flatten a style array/object for expo-router Slot compatibility. */
export function flattenStyle(style: any): any {
  return StyleSheet.flatten(style) || {};
}

/** Extract plain text from PostContent segments or a plain string. */
export function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const segment of content) {
    if (!segment || typeof segment !== 'object') continue;
    if (segment.type === 'at') text += `@${segment.text ?? ''}`;
    else if (segment.type === 'link' || segment.type === 'topic' || segment.type === 'emoticon') {
      text += segment.text ?? '';
    } else if (segment.type === 'text' || segment.type === 'emoji') {
      text += segment.text ?? '';
    }
  }
  return text;
}

// ---------- Time Utilities ----------

/**
 * Format relative time string (Chinese)
 * e.g., "刚刚", "3分钟前", "2小时前", "昨天 14:30", "3天前", "2024-01-15"
 */
export function relativeTime(timestamp: number): string {
  if (!timestamp || timestamp < 946684800000) return '';
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const then = new Date(timestamp);
  const nowDate = new Date(now);
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfYesterday = startOfToday - day;
  const startOfThenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();

  if (startOfThenDay === startOfYesterday) {
    const hh = String(then.getHours()).padStart(2, '0');
    const mm = String(then.getMinutes()).padStart(2, '0');
    return `昨天 ${hh}:${mm}`;
  }
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;

  const y = then.getFullYear();
  const m = String(then.getMonth() + 1).padStart(2, '0');
  const d = String(then.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- Level Color Utilities ----------

/**
 * Apply greifyColor desaturation (mirrors Kotlin ColorUtils.greifyColor(color, 0.2f))
 * Reduces HSV saturation by `sat` and value by `sat/3`.
 */
function greifyColor(hex: string, sat: number): string {
  // Parse hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // RGB → HSV
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  let s = max === 0 ? 0 : d / max;
  let v = max;
  // Apply greify: reduce saturation and value
  s = Math.max(0, s - sat);
  v = Math.max(0, v - sat / 3);
  // HSV → RGB
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let rr = 0, gg = 0, bb = 0;
  switch (i % 6) {
    case 0: rr = v; gg = t; bb = p; break;
    case 1: rr = q; gg = v; bb = p; break;
    case 2: rr = p; gg = v; bb = t; break;
    case 3: rr = p; gg = q; bb = v; break;
    case 4: rr = t; gg = p; bb = v; break;
    case 5: rr = v; gg = p; bb = q; break;
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

/**
 * Get badge color by user level (matches Kotlin Util.getIconColorByLevel + greifyColor)
 * Lv 1-3: teal, Lv 4-9: blue, Lv 10-15: orange, Lv 16+: gold
 * Kotlin applies greifyColor(color, 0.2f) to reduce saturation.
 */
export function getLevelColor(level: number): string {
  let baseColor: string;
  if (level >= 16) baseColor = '#FF9C19';
  else if (level >= 10) baseColor = '#FFA126';
  else if (level >= 4) baseColor = '#3AA7E9';
  else if (level >= 1) baseColor = '#2FBEAB';
  else baseColor = '#B7BCB6';
  return greifyColor(baseColor, 0.2);
}

// ---------- Number Formatting ----------

/**
 * Normalize a remote media URL to HTTPS.
 *
 * 贴吧 API 下发的头像/图片 URL 常为 `http://`，而 App 的 ATS 配置禁止全部
 * 明文 HTTP（app.json 的例外域名 NSExceptionAllowsInsecureHTTPLoads 均为
 * false），http URL 会被 iOS 直接拦截导致图片/头像全部加载失败。百度静态
 * CDN 全部支持 TLS，统一改写为 https。本地 file:///ph:// 原样返回。
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('file://') || url.startsWith('ph://') || url.startsWith('data:')) return url;
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Convert tieba portrait ID to full avatar URL.
 * Mirrors Kotlin: StringUtil.getAvatarUrl()
 * Portrait IDs like "tb.1.xxx" need prefix "https://himg.bdimg.com/sys/portrait/item/"
 * ⚠️ 域名必须用 himg.bdimg.com：tb.himg.baidu.com 在当前网络环境返回 HTTP 000
 * （连不上），实测 himg.bdimg.com 正常返回 200。
 */
export function getAvatarUrl(portrait?: string | null): string {
  if (!portrait) return '';
  if (portrait.startsWith('http://') || portrait.startsWith('https://')) return sanitizeUrl(portrait);
  // 本地 URI（头像上传后即时预览等）：直接透传，避免被拼成图床坏 URL。
  if (portrait.startsWith('file://') || portrait.startsWith('ph://')) return portrait;
  // Baidu portrait CDN serves HTTPS; always use it so the app stays on the
  // TLS surface（ATS 禁止明文 HTTP，http 输入统一升级为 https）。
  return `https://himg.bdimg.com/sys/portrait/item/${portrait}`;
}

/**
 * Format large numbers (e.g., 12345 -> "1.2万")
 * 防御：字段缺失/非数字（undefined/null/NaN）时返回空串，避免
 * undefined.toString() 抛 TypeError 被 ErrorBoundary 兜成整页"出错了"。
 */
export function formatCount(count: number): string {
  const c = Number(count);
  if (!Number.isFinite(c)) return '';
  if (c >= 100000000) {
    return `${(c / 100000000).toFixed(1)}亿`;
  }
  if (c >= 10000) {
    return `${(c / 10000).toFixed(1)}万`;
  }
  if (c >= 1000) {
    return `${(c / 1000).toFixed(1)}k`;
  }
  return c.toString();
}

// ---------- Validation ----------

/**
 * Domains that are considered valid tieba domains.
 * Mirrors Kotlin: isTiebaDomain() — tieba.baidu.com, wapp.baidu.com, tiebac.baidu.com
 */
const TIEBA_DOMAINS = ['tieba.baidu.com', 'wapp.baidu.com', 'tiebac.baidu.com'];

/**
 * Check if URL host is a tieba domain (Kotlin: isTiebaDomain)
 */
export function isTiebaDomain(host: string | null): boolean {
  if (!host) return false;
  return TIEBA_DOMAINS.some((d) => d === host.toLowerCase());
}

/**
 * Check if string is a valid tieba thread URL.
 * Mirrors Kotlin: isThreadUrl() + parseLink()
 */
export function isThreadUrl(url: string): boolean {
  try {
    const u = new URL(url);

    // tblite://thread/123456
    if (u.protocol === 'tblite:' && u.hostname === 'thread') return true;

    // com.baidu.tieba://unidispatch/pb?tid=xxx
    if (u.protocol === 'com.baidu.tieba:' && u.hostname === 'unidispatch' && u.pathname === '/pb') {
      return !!u.searchParams.get('tid');
    }

    // Web URLs: /p/xxx on any tieba domain
    if (isTiebaDomain(u.hostname) && u.pathname.startsWith('/p/')) return true;

    // /f or /mo/q/m with kz param
    if (isTiebaDomain(u.hostname) && (u.pathname === '/f' || u.pathname === '/mo/q/m')) {
      return !!u.searchParams.get('kz');
    }
  } catch {
    // Regex fallback for edge cases
    if (url.match(/^tblite:\/\/thread\/\d+/)) return true;
    if (url.match(/^com\.baidu\.tieba:\/\/unidispatch\/pb/)) return true;
  }

  return false;
}

/**
 * Check if string is a valid tieba forum URL.
 * Mirrors Kotlin: isForumUrl() + parseLink()
 */
export function isForumUrl(url: string): boolean {
  try {
    const u = new URL(url);

    // tblite://forum/forumName
    if (u.protocol === 'tblite:' && u.hostname === 'forum') return true;

    // com.baidu.tieba://unidispatch/frs?kw=xxx
    if (u.protocol === 'com.baidu.tieba:' && u.hostname === 'unidispatch' && u.pathname === '/frs') {
      return !!u.searchParams.get('kw');
    }

    // Web URLs: /f or /mo/q/m with kw or word param
    if (isTiebaDomain(u.hostname) && (u.pathname === '/f' || u.pathname === '/mo/q/m')) {
      return !!(u.searchParams.get('kw') || u.searchParams.get('word'));
    }
  } catch {
    // Regex fallback
    if (url.match(/^tblite:\/\/forum\/.+/)) return true;
    if (url.match(/^com\.baidu\.tieba:\/\/unidispatch\/frs/)) return true;
  }

  return false;
}

/**
 * Extract thread ID from URL.
 * Mirrors Kotlin: parseLink() with /p/, kz param, and com.baidu.tieba://pb
 */
export function extractThreadId(url: string): string | null {
  // tblite://thread/123456
  const m1 = url.match(/tblite:\/\/thread\/(\d+)/);
  if (m1) return m1[1];

  try {
    const u = new URL(url);

    // com.baidu.tieba://unidispatch/pb?tid=123456
    if (u.protocol === 'com.baidu.tieba:' && u.hostname === 'unidispatch') {
      const tid = u.searchParams.get('tid');
      if (tid) return tid;
    }

    // Web /p/xxx on tieba domain
    if (isTiebaDomain(u.hostname) && u.pathname.startsWith('/p/')) {
      return u.pathname.replace('/p/', '').split('?')[0] || null;
    }

    // Web /f or /mo/q/m with kz param (thread ID in forum URL format)
    if (isTiebaDomain(u.hostname) && (u.pathname === '/f' || u.pathname === '/mo/q/m')) {
      const kz = u.searchParams.get('kz');
      if (kz) return kz;
    }
  } catch {}

  return null;
}

/**
 * Extract forum name from URL.
 * Mirrors Kotlin: parseLink() with kw, word params
 */
export function extractForumName(url: string): string | null {
  // tblite://forum/forumName
  const m1 = url.match(/tblite:\/\/forum\/(.+)/);
  if (m1) return decodeURIComponent(m1[1]);

  try {
    const u = new URL(url);

    // com.baidu.tieba://unidispatch/frs?kw=xxx
    if (u.protocol === 'com.baidu.tieba:' && u.hostname === 'unidispatch' && u.pathname === '/frs') {
      return u.searchParams.get('kw') || null;
    }

    // Web /f or /mo/q/m with kw or word param
    if (isTiebaDomain(u.hostname) && (u.pathname === '/f' || u.pathname === '/mo/q/m')) {
      return u.searchParams.get('kw') || u.searchParams.get('word') || null;
    }
  } catch {}

  return null;
}

// ---------- URL Utilities ----------

/**
 * Build tieba web URL for a thread.
 * Always returns clean URLs without tracking parameters (no utm_*, share_*, fr, ie, etc.).
 */
export function buildThreadUrl(threadId: string, postId?: string, seeLz?: boolean): string {
  let url = `https://tieba.baidu.com/p/${threadId}`;
  if (postId) {
    url += `?pid=${postId}`;
    if (seeLz) {
      url += '&see_lz=1';
    }
  }
  return url;
}

/**
 * Build tieba web URL for a forum
 */
export function buildForumUrl(forumName: string): string {
  return `https://tieba.baidu.com/f?kw=${encodeURIComponent(forumName)}`;
}
