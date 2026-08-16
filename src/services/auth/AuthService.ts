// ============================================================
// AuthService - Auth persistence (aligned with Kotlin AccountUtil)
//
// Kotlin flow:
//   WebView login → CookieManager.getCookie(url) → parse BDUSS/STOKEN
//   → fetchAccountFlow(bduss, sToken, cookie) → Room DB (SQLite)
//
// Expo flow:
//   WebView login → JS extraction → SecureStore (凭据) + SQLite (元数据)
//
// BDUSS/STOKEN/COOKIE 只进 SecureStore；SQLite 仅保存账号元数据。
// ============================================================

import { Account } from '@/types';
import {
  saveAccountSync,
  restoreAccountSync,
  deleteAccountSync,
  getAccountListSync,
  loadAccountCredentials,
} from '@/services/storage/AuthSQLiteStorage';
import { setAuthCredentials } from '@/services/api/interceptors';
import { clearNativeCookies, syncNativeCookies } from '@/services/cookies/CookieService';
import {
  clearBackgroundSnapshot,
  resetBackgroundForums,
  syncBackgroundSnapshot,
} from '@/services/nativeBackground';

export type LoginUserInfo = {
  uid: string;
  name: string;
  nameShow: string;
  portrait: string;
  tbs: string;
  /** BDUSS session token */
  bduss: string;
  /** STOKEN security token */
  sToken: string;
  /** Raw cookie string */
  cookie: string;
  /** ZID / BAIDUID */
  zid: string;
};

/**
 * 登录 (对齐 Kotlin AccountUtil.fetchAccountFlow → DatabaseUtil.upsertAccountByUid)
 *
 * 登录成功后:
 * 1. 构建 Account 对象
 * 2. 同步写入 SQLite kv-store（对齐 Room DB）
 * 3. 立即激活鉴权状态（对齐 Kotlin switchAccount → global state）
 */
export async function login(user: LoginUserInfo): Promise<Account> {
  if (!user.bduss) {
    throw new Error('缺少 BDUSS，无法完成登录');
  }
  const account: Account = {
    id: 0,
    uid: user.uid,
    name: user.name,
    nameShow: user.nameShow || user.name,
    portrait: user.portrait,
    bduss: user.bduss,
    sToken: user.sToken,
    tbs: user.tbs,
    cookie: user.cookie || `BDUSS=${user.bduss}; Path=/; Max-Age=315360000; Domain=.baidu.com; Httponly`,
    uuid: user.uid,
    zid: user.zid,
  };

  // 凭据写 SecureStore，元数据写 SQLite
  saveAccountSync(account);

  // 立即激活运行时鉴权状态
  setAuthCredentials(user.bduss, user.sToken);

  // 同步写入 iOS 原生 Cookie 存储（Foundation + WKWebView）
  await syncNativeCookies(account.bduss, account.sToken, account.cookie);
  resetBackgroundForums();
  syncBackgroundSnapshot();

  return account;
}

/**
 * 登出 (对齐 Kotlin AccountUtil.exit)
 * 如果仍有其他账号，自动切换到列表中的第一个账号。
 */
export async function logout(): Promise<Account | null> {
  // 从 SQLite 读取当前 uid 然后删除
  const account = restoreAccountSync();
  if (account) {
    deleteAccountSync(account.uid);
  }
  // 清除原生 Cookie 存储（对齐 Kotlin AccountUtil.exit → removeAllCookies）
  const cleared = await clearNativeCookies();
  if (!cleared) {
    throw new Error('清除原生 Cookie 失败，请重试');
  }

  // 凭据按账号隔离在 SecureStore 中；逐个加载，选择仍有 BDUSS 的账号。
  const remaining = getAccountListSync();
  let next: Account | null = null;
  for (const meta of remaining) {
    const credentials = await loadAccountCredentials(meta.uid);
    if (credentials.bduss) {
      next = { ...meta, ...credentials };
      break;
    }
  }
  if (next) {
    saveAccountSync(next);
    setAuthCredentials(next.bduss, next.sToken);
    await syncNativeCookies(next.bduss, next.sToken, next.cookie);
    resetBackgroundForums();
    syncBackgroundSnapshot();
  } else {
    clearBackgroundSnapshot();
  }
  return next;
}

/**
 * 冷启动恢复 (对齐 Kotlin AccountUtil.init)
 *
 * 同步从 SQLite 读取活跃账号，无 async gap。
 * 对齐 Kotlin:
 *   val loginUser = context.getSharedPreferences("accountData", ...).getInt("now", -1)
 *   getAccountInfo(loginUser)
 */
export async function restoreAccount(): Promise<Account | null> {
  return restoreAccountSync();
}
