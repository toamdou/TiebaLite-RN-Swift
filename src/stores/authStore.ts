// ============================================================
// authStore - Minimal Zustand auth state
//
// Single login path matching Kotlin AccountUtil flow:
//   WebView login → extract user info → save → switch account
//
// 持久化策略（与 Kotlin Room DB 对齐，但凭据不再明文落 SQLite）：
//   - BDUSS/STOKEN/COOKIE → SecureStore（AuthSecureStorage）
//   - UID/TBS/ZID/账号列表/活跃 ID → unifiedDb（单一 SQLite 库）
//   - 冷启动先 await hydrateSecureCredentials() 再恢复账号
//   - 登录/切换成功后重启通知轮询，登出/过期时停止
// ============================================================

import { create } from 'zustand';
import { Account } from '@/types';
import * as AuthService from '@/services/auth/AuthService';
import type { LoginUserInfo } from '@/services/auth/AuthService';
import { setAuthCredentials, clearAuthCredentials } from '@/services/api/interceptors';
import {
  restoreAccountSync,
  saveAccountSync,
  loadAccountCredentials,
} from '@/services/storage/AuthSQLiteStorage';
import {
  getCachedAccountProfile,
  saveAccountProfile,
  clearAccountProfile,
} from '@/services/auth/accountCache';
import { hydrateSecureCredentials } from '@/services/storage/AuthSecureStorage';
import {
  cancelNativeBackgroundSync,
  clearNotificationBaseline,
  ensureBackgroundSync,
  startNotificationPoller,
  stopNotificationPoller,
} from '@/services/NotificationPoller';
import { invalidateFollowedForumsCache } from '@/services/forumFollowed';
import { getTiebaAuthCookies } from '@/services/cookies/CookieService';
import { profile as fetchProfile } from '@/services/api/endpoints';
import {
  clearBackgroundSnapshot,
  resetBackgroundForums,
  syncBackgroundSnapshot,
} from '@/services/nativeBackground';

export interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  account: Account | null;
  error: string | null;

  login(user: LoginUserInfo): Promise<void>;
  logout(): Promise<void>;
  checkAuth(): Promise<void>;
  switchAccount(account: Account): Promise<void>;
}

async function refreshAccountProfile(account: Account): Promise<Account> {
  try {
    const userProfile = await fetchProfile(account.uid);
    const user = userProfile.user;
    const next: Account = {
      ...account,
      nameShow: user.nameShow || account.nameShow,
      portrait: user.portrait || account.portrait,
      levelId: user.levelId,
      levelName: user.levelName,
      intro: user.intro || account.intro,
      fansNum: user.fansNum ?? account.fansNum,
      concernNum: user.concernNum ?? account.concernNum,
      postNum: user.postNum ?? account.postNum,
    };
    saveAccountSync(next);
    await saveAccountProfile(next);
    return next;
  } catch {
    return account;
  }
}

/** Kick off the login-state dependent screens after auth changes. */
async function refreshPostLoginStores(): Promise<void> {
  try {
    const { useForumStore } = await import('./forumStore');
    void useForumStore.getState().loadFollowedForums();
  } catch {}
  try {
    const { useNotificationStore } = await import('./notificationStore');
    void useNotificationStore.getState().loadNotificationCounts();
  } catch {}
}

/**
 * 用后台拉取的 profile 回填 account，但仅当回填仍属于当前活跃账号时生效。
 * 快速切换账号时，晚到的旧账号响应不得覆盖刚切到的新账号（否则通知基线/凭据错位）。
 */
function applyRefreshedProfile(account: Account, refreshed: Account): void {
  const current = useAuthStore.getState().account;
  if (current?.uid && current.uid === account.uid && current.uid === refreshed.uid) {
    useAuthStore.setState({ account: refreshed });
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  isLoading: false,
  account: null,
  error: null,

  login: async (user) => {
    set({ isLoading: true, error: null });
    try {
      const account = await AuthService.login(user);
      // AuthService.login() 内部已调 setAuthCredentials() 并同步原生 Cookie
      set({ isLoggedIn: true, isLoading: false, account, error: null });
      void saveAccountProfile(account);
      void refreshAccountProfile(account).then((refreshed) => {
        applyRefreshedProfile(account, refreshed);
      });
      invalidateFollowedForumsCache();
      void refreshPostLoginStores();
      stopNotificationPoller();
      startNotificationPoller();
      // 重新登录需恢复原生后台通知同步（登出时被 cancelNativeBackgroundSync 取消）
      ensureBackgroundSync();
    } catch (e: any) {
      set({ isLoading: false, error: e?.message ?? 'Login failed' });
      throw e;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    const previousUid = useAuthStore.getState().account?.uid;
    try {
      const next = await AuthService.logout();
      if (next) {
        setAuthCredentials(next.bduss, next.sToken);
        set({ isLoggedIn: true, isLoading: false, account: next, error: null });
        stopNotificationPoller();
        startNotificationPoller();
      } else {
        clearAuthCredentials();
        stopNotificationPoller();
        cancelNativeBackgroundSync();
        void clearAccountProfile();
        invalidateFollowedForumsCache();
        if (previousUid) {
          await clearNotificationBaseline(previousUid);
        }
        set({ isLoggedIn: false, isLoading: false, account: null, error: null });
      }
    } catch (e: any) {
      // AuthService.logout 已先删除账号；即使原生 Cookie 清除校验失败，
      // 也按登出处理并停止轮询，避免残留已删除账号的登录态。
      stopNotificationPoller();
      clearAuthCredentials();
      clearBackgroundSnapshot();
      cancelNativeBackgroundSync();
      void clearAccountProfile();
      invalidateFollowedForumsCache();
      if (previousUid) {
        await clearNotificationBaseline(previousUid);
      }
      set({
        isLoggedIn: false,
        isLoading: false,
        account: null,
        error: e?.message ?? 'Logout failed',
      });
    }
  },

  /**
   * 冷启动鉴权检查。
   *
   * SecureStore/SQLite 中的凭据是权威来源；原生 Cookie 只在本地完全没有
   * 凭据时作为恢复来源，不反向覆盖已保存账号。
   */
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const cached = await getCachedAccountProfile();
      if (cached?.uid) {
        set({ account: cached, error: null });
      }
      await hydrateSecureCredentials();
      const account = restoreAccountSync();

      if (account?.uid) {
        const hasLocalCredentials = !!(account.bduss || account.sToken || account.cookie);
        let restored = account;

        if (!hasLocalCredentials) {
          // 旧版本或 SecureStore 丢失时，仅在本地无凭据时尝试原生 Cookie 恢复。
          const cookies = await getTiebaAuthCookies();
          if (cookies.bduss) {
            restored = { ...account, bduss: cookies.bduss, sToken: cookies.stoken };
            saveAccountSync(restored);
          }
        }

        if (restored.bduss) {
          setAuthCredentials(restored.bduss, restored.sToken);
          resetBackgroundForums();
          syncBackgroundSnapshot();
          void saveAccountProfile(restored);
          void refreshAccountProfile(restored).then((refreshed) => {
            applyRefreshedProfile(restored, refreshed);
          });
          void refreshPostLoginStores();
          set({
            isLoggedIn: true,
            isLoading: false,
            account: restored,
            error: null,
          });
        } else {
          clearAuthCredentials();
          clearBackgroundSnapshot();
          cancelNativeBackgroundSync();
          void clearAccountProfile();
          set({
            isLoggedIn: false,
            isLoading: false,
            account: null,
            error: '登录信息缺失，请重新登录',
          });
        }
      } else {
        clearAuthCredentials();
        clearBackgroundSnapshot();
        cancelNativeBackgroundSync();
        void clearAccountProfile();
        invalidateFollowedForumsCache();
        set({
          isLoggedIn: false,
          isLoading: false,
          account: null,
          error: null,
        });
      }
    } catch (e: any) {
      clearBackgroundSnapshot();
      cancelNativeBackgroundSync();
      void clearAccountProfile();
      set({ isLoggedIn: false, isLoading: false, account: null, error: e?.message ?? 'Check auth failed' });
    }
  },

  switchAccount: async (account: Account) => {
    set({ isLoading: true });
    try {
      await hydrateSecureCredentials();
      const credentials = await loadAccountCredentials(account.uid);
      const bduss = account.bduss || credentials.bduss;
      const sToken = account.sToken || credentials.stoken;
      if (!bduss) {
        throw new Error('该账号缺少登录凭据，请重新登录');
      }
      const switched = await AuthService.login({
        uid: account.uid,
        name: account.name,
        nameShow: account.nameShow,
        portrait: account.portrait,
        tbs: account.tbs,
        bduss,
        sToken,
        cookie: account.cookie || credentials.cookie,
        zid: account.zid,
      });
      set({
        isLoggedIn: true,
        isLoading: false,
        account: { ...switched, bduss, sToken },
        error: null,
      });
      void saveAccountProfile({ ...switched, bduss, sToken });
      void refreshAccountProfile({ ...switched, bduss, sToken }).then((refreshed) => {
        applyRefreshedProfile({ ...switched, bduss, sToken }, refreshed);
      });
      invalidateFollowedForumsCache();
      void refreshPostLoginStores();
      stopNotificationPoller();
      startNotificationPoller();
      // 切换账号后同样需要恢复原生后台通知同步
      ensureBackgroundSync();
    } catch (e: any) {
      set({ isLoading: false, error: e?.message ?? 'Switch account failed' });
    }
  },
}));
