// ============================================================
// AuthSQLiteStorage — SQLite account metadata + sync credential facade
//
// Kotlin 用 Room (SQLite) 持久化 Account，但 Expo 端凭据是敏感的：
//   - BDUSS/STOKEN/COOKIE → SecureStore（AuthSecureStorage）
//   - UID/TBS/ZID/账号列表/活跃 ID → unifiedDb（单一 SQLite 库）
//
// 同步 getter（getBdussSync/getStokenSync/getCookieSync 等）保留原有
// 签名，内部读取 AuthSecureStorage 的内存缓存；写入时先更新内存，
// 再异步写 SecureStore。冷启动后请先 await hydrateSecureCredentials()。
// ============================================================

import {
  kvBatchSync,
  kvGetSync,
  kvRemoveSync,
  kvSetSync,
} from './unifiedDb';
import { Account } from '@/types';
import {
  getBdussCached,
  getStokenCached,
  getCookieCached,
  getUidCached,
  getTbsCached,
  getZidCached,
  setBdussCached,
  setStokenCached,
  setCookieCached,
  setUidCached,
  setTbsCached,
  setZidCached,
  setCurrentMetaCached,
  CURRENT_META_KEY,
  clearMetaCache,
  clearSecureCredentials,
  deleteAccountCredentials,
  persistAccountCredentials,
  LEGACY_PLAINTEXT_KEYS,
} from './AuthSecureStorage';
import type { AccountCredentials } from './AuthSecureStorage';

export {
  hydrateSecureCredentials,
  loadAccountCredentials,
  clearSecureCredentials,
} from './AuthSecureStorage';

// ---------- 存储 key 前缀（对齐 Kotlin accountData SharedPreferences） ----------
const PREFIX = '@tiebalite:';

const KEYS = {
  /** 当前活跃账号 ID（对齐 Kotlin accountData.now） */
  ACTIVE_ID: `${PREFIX}active_id`,
  /** 账号列表 (JSON array，不含凭据) */
  ACCOUNT_LIST: `${PREFIX}account_list`,
  /** 旧版单字段明文 key，仅用于清理 */
  BDUSS: `${PREFIX}bduss`,
  STOKEN: `${PREFIX}stoken`,
  UID: `${PREFIX}uid`,
  TBS: `${PREFIX}tbs`,
  ZID: `${PREFIX}zid`,
  COOKIE: `${PREFIX}cookie`,
} as const;

/** 按 uid 生成账号存储 key */
function accountKey(uid: string): string {
  return `${PREFIX}account:${uid}`;
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** SQLite 中只保存账号元数据，凭据字段一律清空。 */
function redactAccount(account: Account): Account {
  return {
    ...account,
    bduss: '',
    sToken: '',
    cookie: '',
  };
}

function getRawAccount(uid: string): Account | null {
  return parseJson<Account>(kvGetSync(accountKey(uid)));
}

function getRawAccountList(): Account[] {
  const list = parseJson<Account[]>(kvGetSync(KEYS.ACCOUNT_LIST));
  return Array.isArray(list) ? list : [];
}

/** 只有活跃账号能从内存缓存回填凭据；列表中的其他账号保持元数据。 */
function fillActiveCredentials(account: Account | null): Account | null {
  if (!account) return null;
  return {
    ...account,
    bduss: getBdussCached(),
    sToken: getStokenCached(),
    cookie: getCookieCached(),
  };
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Execute a group of kv-store writes as a single synchronous batch. Sync
 * calls cannot interleave on the JS thread, so this acts as a single-writer
 * queue; if any write throws, all values touched by the batch are restored
 * from the snapshot taken before the first write.
 */
function writeKvBatch(writes: { key: string; value: string | null }[]): void {
  kvBatchSync(writes);
}

// ============================================================
// 同步单字段访问（签名保留，读 SecureStore 内存缓存）
// ============================================================

export function getBdussSync(): string {
  return getBdussCached();
}

export function getStokenSync(): string {
  return getStokenCached();
}

export function getUidSync(): string {
  return getUidCached();
}

export function getTbsSync(): string {
  return getTbsCached();
}

export function getZidSync(): string {
  return getZidCached();
}

export function getCookieSync(): string {
  return getCookieCached();
}

export function setBdussSync(bduss: string): void {
  setBdussCached(bduss ?? '');
}

export function setStokenSync(stoken: string): void {
  setStokenCached(stoken ?? '');
}

export function setCookieSync(cookie: string): void {
  setCookieCached(cookie ?? '');
}

export function setUidSync(uid: string): void {
  setUidCached(uid ?? '');
}

export function setZidSync(zid: string): void {
  setZidCached(zid ?? '');
}

/** 写入当前账号 tbs；若提供 uid 或存在活跃账号，同时更新其元数据。 */
export function setTbsSync(tbs: string, uid?: string): void {
  setTbsCached(tbs ?? '');
  const targetUid =
    uid ||
    getUidCached() ||
    kvGetSync(KEYS.ACTIVE_ID) ||
    '';
  if (!targetUid) return;

  const raw = getRawAccount(targetUid);
  if (raw) {
    const updated = { ...raw, tbs: tbs ?? '' };
    const list = getRawAccountList().map((a) =>
      a.uid === targetUid ? updated : a,
    );
    writeKvBatch([
      { key: accountKey(targetUid), value: JSON.stringify(updated) },
      { key: KEYS.ACCOUNT_LIST, value: JSON.stringify(list) },
    ]);
  }
}

// ============================================================
// 账号持久化（凭据 → SecureStore，元数据 → SQLite）
// ============================================================

export function saveAccountSync(account: Account): void {
  if (!account.uid) {
    throw new Error('Cannot save account without uid');
  }

  const credentials: AccountCredentials = {
    bduss: account.bduss ?? '',
    stoken: account.sToken ?? '',
    cookie: account.cookie ?? '',
  };

  // 先更新内存缓存，再异步写 SecureStore（错误已接住，不产生未处理 Promise）。
  setBdussCached(credentials.bduss);
  setStokenCached(credentials.stoken);
  setCookieCached(credentials.cookie);
  void persistAccountCredentials(account.uid, credentials).catch((error) => {
    console.warn('[AuthSQLiteStorage] Failed to persist credentials:', sanitizeError(error));
  });

  const nextMeta = {
    uid: account.uid,
    tbs: account.tbs ?? '',
    zid: account.zid ?? '',
  };

  // SQLite 只写元数据，合并为：账号 JSON + 活跃 ID + 账号列表。
  const metadata = redactAccount(account);
  const list = getRawAccountList().filter((a) => a.uid !== account.uid);
  list.push(metadata);
  writeKvBatch([
    { key: accountKey(account.uid), value: JSON.stringify(metadata) },
    { key: KEYS.ACTIVE_ID, value: account.uid },
    { key: KEYS.ACCOUNT_LIST, value: JSON.stringify(list) },
    { key: CURRENT_META_KEY, value: JSON.stringify(nextMeta) },
  ]);
  setCurrentMetaCached(nextMeta);
}

export function getActiveAccountSync(): Account | null {
  const activeId = kvGetSync(KEYS.ACTIVE_ID);
  if (!activeId) return null;
  return fillActiveCredentials(getRawAccount(activeId));
}

export function getAccountListSync(): Account[] {
  return getRawAccountList();
}

/** 按 bduss 查找账号：仅活跃账号内存中有凭据，因此只匹配活跃账号。 */
export function getAccountByBdussSync(bduss: string): Account | null {
  if (!bduss || bduss !== getBdussCached()) return null;
  return getActiveAccountSync();
}

/** 按 uid 查找账号：活跃账号回填内存凭据，其他账号返回元数据。 */
export function getAccountByUidSync(uid: string): Account | null {
  const raw = getRawAccount(uid);
  if (!raw) return null;
  if (uid === getUidCached()) return fillActiveCredentials(raw);
  return raw;
}

/**
 * 删除账号。必须先记录 activeId 再删 JSON/列表，否则“删除的是当前账号”
 * 的判断会因 JSON 已消失而永远为 false。
 */
export function deleteAccountSync(uid: string): void {
  const activeId = kvGetSync(KEYS.ACTIVE_ID) ?? '';

  kvRemoveSync(accountKey(uid));
  const list = getRawAccountList().filter((a) => a.uid !== uid);
  kvSetSync(KEYS.ACCOUNT_LIST, JSON.stringify(list));

  void deleteAccountCredentials(uid).catch((error) => {
    console.warn('[AuthSQLiteStorage] Failed to delete account credentials:', sanitizeError(error));
  });

  if (activeId === uid) {
    clearAllAuthSync();
  }
}

export function clearAllAuthSync(): void {
  kvRemoveSync(KEYS.ACTIVE_ID);
  for (const key of LEGACY_PLAINTEXT_KEYS) {
    kvRemoveSync(key);
  }
  kvRemoveSync(KEYS.UID);
  kvRemoveSync(KEYS.TBS);
  kvRemoveSync(KEYS.ZID);
  clearMetaCache();
  void clearSecureCredentials().catch((error) => {
    console.warn('[AuthSQLiteStorage] Failed to clear secure credentials:', sanitizeError(error));
  });
}

// ============================================================
// 冷启动恢复（对齐 Kotlin AccountUtil.init）
// ============================================================

/** 同步恢复当前活跃账号；调用前请先 await hydrateSecureCredentials()。 */
export function restoreAccountSync(): Account | null {
  return getActiveAccountSync();
}
