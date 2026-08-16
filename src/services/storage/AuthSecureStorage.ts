// ============================================================
// AuthSecureStorage - SecureStore-backed credentials
//
// BDUSS/STOKEN/COOKIE are sensitive login credentials and must
// never be written to the unified SQLite database in plaintext. This
// module keeps them in iOS Keychain via expo-secure-store while
// exposing a synchronous in-memory cache so existing sync getters
// (getBdussSync etc.) keep their signatures.
//
// Credentials are stored per account under:
//   tiebalite.account.<uid>.bduss|stoken|cookie
// plus active-session keys (tiebalite.active.*) so switching
// accounts can restore the correct credential set.
// ============================================================

import * as SecureStore from 'expo-secure-store';
import {
  ensureUnifiedStorageReady,
  kvGetSync,
  kvRemoveSync,
  kvSetSync,
} from './unifiedDb';

// ------------------------------------------------------------
// Keys
// ------------------------------------------------------------

const ACTIVE_KEYS = {
  BDUSS: 'tiebalite.active.bduss',
  STOKEN: 'tiebalite.active.stoken',
  COOKIE: 'tiebalite.active.cookie',
} as const;

/** Keep credentials readable by native background tasks after first unlock. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const SQLITE_KEYS = {
  CURRENT_META: '@tiebalite:current_meta',
  LEGACY_BDUSS: '@tiebalite:bduss',
  LEGACY_STOKEN: '@tiebalite:stoken',
  LEGACY_COOKIE: '@tiebalite:cookie',
  LEGACY_UID: '@tiebalite:uid',
  LEGACY_TBS: '@tiebalite:tbs',
  LEGACY_ZID: '@tiebalite:zid',
  ACTIVE_ID: '@tiebalite:active_id',
  ACCOUNT_LIST: '@tiebalite:account_list',
  ACCOUNT_PREFIX: '@tiebalite:account:',
} as const;

/** Plaintext keys removed after the one-time migration. */
export const LEGACY_PLAINTEXT_KEYS = [
  SQLITE_KEYS.LEGACY_BDUSS,
  SQLITE_KEYS.LEGACY_STOKEN,
  SQLITE_KEYS.LEGACY_COOKIE,
] as const;

/** Combined UID/TBS/ZID key still stored in SQLite (metadata only). */
export const CURRENT_META_KEY = SQLITE_KEYS.CURRENT_META;

function accountCredentialKey(uid: string, field: 'bduss' | 'stoken' | 'cookie'): string {
  return `tiebalite.account.${uid}.${field}`;
}

export interface AccountCredentials {
  bduss: string;
  stoken: string;
  cookie: string;
}

export interface CurrentMeta {
  uid: string;
  tbs: string;
  zid: string;
}

// ------------------------------------------------------------
// In-memory sync caches
// ------------------------------------------------------------

let memory: AccountCredentials = { bduss: '', stoken: '', cookie: '' };
let meta: CurrentMeta = { uid: '', tbs: '', zid: '' };
let metaLoaded = false;
let hydratePromise: Promise<void> | null = null;
let hydrated = false;

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function loadMetaFromSqlite(): CurrentMeta {
  try {
    const rawMeta = kvGetSync(SQLITE_KEYS.CURRENT_META);
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as Partial<CurrentMeta>;
      meta = {
        uid: typeof parsed.uid === 'string' ? parsed.uid : '',
        tbs: typeof parsed.tbs === 'string' ? parsed.tbs : '',
        zid: typeof parsed.zid === 'string' ? parsed.zid : '',
      };
      metaLoaded = true;
      return meta;
    }
  } catch {}

  // Legacy single-field keys (pre-combined-meta builds).
  const legacyUid = kvGetSync(SQLITE_KEYS.LEGACY_UID) ?? '';
  const legacyTbs = kvGetSync(SQLITE_KEYS.LEGACY_TBS) ?? '';
  const legacyZid = kvGetSync(SQLITE_KEYS.LEGACY_ZID) ?? '';
  if (legacyUid || legacyTbs || legacyZid) {
    meta = { uid: legacyUid, tbs: legacyTbs, zid: legacyZid };
    persistMeta(meta);
    for (const key of [SQLITE_KEYS.LEGACY_UID, SQLITE_KEYS.LEGACY_TBS, SQLITE_KEYS.LEGACY_ZID]) {
      kvRemoveSync(key);
    }
  }
  metaLoaded = true;
  return meta;
}

function ensureMetaLoaded(): CurrentMeta {
  if (!metaLoaded) loadMetaFromSqlite();
  return meta;
}

function persistMeta(next: CurrentMeta): void {
  meta = next;
  try {
    kvSetSync(SQLITE_KEYS.CURRENT_META, JSON.stringify(next));
  } catch (error) {
    console.warn('[AuthSecureStorage] Failed to persist current meta:', sanitizeError(error));
  }
}

// ------------------------------------------------------------
// Credential sync getters / setters
// ------------------------------------------------------------

export function getBdussCached(): string {
  return memory.bduss;
}

export function getStokenCached(): string {
  return memory.stoken;
}

export function getCookieCached(): string {
  return memory.cookie;
}

export function setBdussCached(value: string): void {
  memory.bduss = value ?? '';
  void SecureStore.setItemAsync(ACTIVE_KEYS.BDUSS, memory.bduss, SECURE_STORE_OPTIONS).catch((error) => {
    console.warn('[AuthSecureStorage] Failed to persist BDUSS:', sanitizeError(error));
  });
}

export function setStokenCached(value: string): void {
  memory.stoken = value ?? '';
  void SecureStore.setItemAsync(ACTIVE_KEYS.STOKEN, memory.stoken, SECURE_STORE_OPTIONS).catch((error) => {
    console.warn('[AuthSecureStorage] Failed to persist STOKEN:', sanitizeError(error));
  });
}

export function setCookieCached(value: string): void {
  memory.cookie = value ?? '';
  void SecureStore.setItemAsync(ACTIVE_KEYS.COOKIE, memory.cookie, SECURE_STORE_OPTIONS).catch((error) => {
    console.warn('[AuthSecureStorage] Failed to persist cookie:', sanitizeError(error));
  });
}

// ------------------------------------------------------------
// Metadata sync getters / setters (UID/TBS/ZID stay in SQLite)
// ------------------------------------------------------------

export function getUidCached(): string {
  return ensureMetaLoaded().uid;
}

export function getTbsCached(): string {
  return ensureMetaLoaded().tbs;
}

export function getZidCached(): string {
  return ensureMetaLoaded().zid;
}

export function setUidCached(uid: string): void {
  persistMeta({ ...ensureMetaLoaded(), uid: uid ?? '' });
}

export function setTbsCached(tbs: string): void {
  persistMeta({ ...ensureMetaLoaded(), tbs: tbs ?? '' });
}

export function setZidCached(zid: string): void {
  persistMeta({ ...ensureMetaLoaded(), zid: zid ?? '' });
}

export function setCurrentMetaCached(next: CurrentMeta): void {
  persistMeta({
    uid: next.uid ?? '',
    tbs: next.tbs ?? '',
    zid: next.zid ?? '',
  });
}

export function clearMetaCache(): void {
  meta = { uid: '', tbs: '', zid: '' };
  metaLoaded = true;
  kvRemoveSync(SQLITE_KEYS.CURRENT_META);
  for (const key of [SQLITE_KEYS.LEGACY_UID, SQLITE_KEYS.LEGACY_TBS, SQLITE_KEYS.LEGACY_ZID]) {
    kvRemoveSync(key);
  }
}

// ------------------------------------------------------------
// Async per-account credential persistence
// ------------------------------------------------------------

export async function loadAccountCredentials(uid: string): Promise<AccountCredentials> {
  if (!uid) return { bduss: '', stoken: '', cookie: '' };
  const [bduss, stoken, cookie] = await Promise.all([
    SecureStore.getItemAsync(accountCredentialKey(uid, 'bduss')),
    SecureStore.getItemAsync(accountCredentialKey(uid, 'stoken')),
    SecureStore.getItemAsync(accountCredentialKey(uid, 'cookie')),
  ]);
  return {
    bduss: bduss ?? '',
    stoken: stoken ?? '',
    cookie: cookie ?? '',
  };
}

/** Persist credentials for an account, then mirror them into the active cache. */
export async function persistAccountCredentials(
  uid: string,
  credentials: AccountCredentials,
): Promise<void> {
  if (!uid) return;
  const bduss = credentials.bduss ?? '';
  const stoken = credentials.stoken ?? '';
  const cookie = credentials.cookie ?? '';

  memory = { bduss, stoken, cookie };

  await Promise.all([
    SecureStore.setItemAsync(accountCredentialKey(uid, 'bduss'), bduss, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(accountCredentialKey(uid, 'stoken'), stoken, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(accountCredentialKey(uid, 'cookie'), cookie, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(ACTIVE_KEYS.BDUSS, bduss, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(ACTIVE_KEYS.STOKEN, stoken, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(ACTIVE_KEYS.COOKIE, cookie, SECURE_STORE_OPTIONS),
  ]);
}

export async function deleteAccountCredentials(uid: string): Promise<void> {
  if (!uid) return;
  await Promise.all([
    SecureStore.deleteItemAsync(accountCredentialKey(uid, 'bduss')),
    SecureStore.deleteItemAsync(accountCredentialKey(uid, 'stoken')),
    SecureStore.deleteItemAsync(accountCredentialKey(uid, 'cookie')),
  ]);
}

export async function clearSecureCredentials(): Promise<void> {
  memory = { bduss: '', stoken: '', cookie: '' };
  await Promise.all([
    SecureStore.deleteItemAsync(ACTIVE_KEYS.BDUSS),
    SecureStore.deleteItemAsync(ACTIVE_KEYS.STOKEN),
    SecureStore.deleteItemAsync(ACTIVE_KEYS.COOKIE),
  ]);
}

// ------------------------------------------------------------
// Redaction helpers for SQLite account metadata
// ------------------------------------------------------------

function redactAccount(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  delete copy.bduss;
  delete copy.sToken;
  delete copy.cookie;
  return copy;
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readRawAccount(uid: string): Record<string, unknown> | null {
  return parseJson<Record<string, unknown>>(kvGetSync(`${SQLITE_KEYS.ACCOUNT_PREFIX}${uid}`));
}

function readRawAccountList(): Record<string, unknown>[] {
  const parsed = parseJson<Record<string, unknown>[]>(kvGetSync(SQLITE_KEYS.ACCOUNT_LIST));
  return Array.isArray(parsed) ? parsed : [];
}

function writeRedactedAccountList(list: Record<string, unknown>[]): void {
  kvSetSync(SQLITE_KEYS.ACCOUNT_LIST, JSON.stringify(list.map(redactAccount)));
}

// ------------------------------------------------------------
// Hydration / one-time migration
// ------------------------------------------------------------

function getStringField(account: Record<string, unknown> | null, field: string): string {
  const value = account?.[field];
  return typeof value === 'string' ? value : '';
}

/**
 * Load SecureStore credentials into memory and migrate legacy plaintext
 * SQLite keys / embedded account-JSON credentials once.
 *
 * Safe to call repeatedly: after the first successful run it becomes a
 * cheap no-op (new credentials are kept in memory by the sync setters).
 */
export async function hydrateSecureCredentials(): Promise<void> {
  await ensureUnifiedStorageReady();
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  const run = (async () => {
    const activeId = kvGetSync(SQLITE_KEYS.ACTIVE_ID) ?? '';
    const activeAccount = activeId ? readRawAccount(activeId) : null;
    const legacyUid = kvGetSync(SQLITE_KEYS.LEGACY_UID) ?? '';
    const legacyTbs = kvGetSync(SQLITE_KEYS.LEGACY_TBS) ?? '';
    const legacyZid = kvGetSync(SQLITE_KEYS.LEGACY_ZID) ?? '';

    let bduss = await SecureStore.getItemAsync(ACTIVE_KEYS.BDUSS).catch(() => null);
    let stoken = await SecureStore.getItemAsync(ACTIVE_KEYS.STOKEN).catch(() => null);
    let cookie = await SecureStore.getItemAsync(ACTIVE_KEYS.COOKIE).catch(() => null);

    // Legacy plaintext kv-store keys (one-time migration).
    const legacyBduss = kvGetSync(SQLITE_KEYS.LEGACY_BDUSS) ?? '';
    const legacyStoken = kvGetSync(SQLITE_KEYS.LEGACY_STOKEN) ?? '';
    const legacyCookie = kvGetSync(SQLITE_KEYS.LEGACY_COOKIE) ?? '';
    if (!bduss && legacyBduss) bduss = legacyBduss;
    if (!stoken && legacyStoken) stoken = legacyStoken;
    if (!cookie && legacyCookie) cookie = legacyCookie;

    // Old account JSONs embedded credentials too; migrate them as well.
    if (!bduss) bduss = getStringField(activeAccount, 'bduss') || null;
    if (!stoken) stoken = getStringField(activeAccount, 'sToken') || null;
    if (!cookie) cookie = getStringField(activeAccount, 'cookie') || null;

    // Migrate every account in the list into per-account SecureStore keys.
    const rawList = readRawAccountList();
    for (const raw of rawList) {
      const uid = getStringField(raw, 'uid');
      if (!uid) continue;
      const existing = await loadAccountCredentials(uid);
      const jsonBduss = getStringField(raw, 'bduss');
      const jsonStoken = getStringField(raw, 'sToken');
      const jsonCookie = getStringField(raw, 'cookie');
      if (!existing.bduss && jsonBduss) {
        await SecureStore.setItemAsync(
          accountCredentialKey(uid, 'bduss'),
          jsonBduss,
          SECURE_STORE_OPTIONS,
        );
      }
      if (!existing.stoken && jsonStoken) {
        await SecureStore.setItemAsync(
          accountCredentialKey(uid, 'stoken'),
          jsonStoken,
          SECURE_STORE_OPTIONS,
        );
      }
      if (!existing.cookie && jsonCookie) {
        await SecureStore.setItemAsync(
          accountCredentialKey(uid, 'cookie'),
          jsonCookie,
          SECURE_STORE_OPTIONS,
        );
      }
    }

    // Persist the migrated active values.
    const migrated: AccountCredentials = {
      bduss: bduss ?? '',
      stoken: stoken ?? '',
      cookie: cookie ?? '',
    };
    if (activeId) {
      await Promise.all([
        SecureStore.setItemAsync(
          accountCredentialKey(activeId, 'bduss'),
          migrated.bduss,
          SECURE_STORE_OPTIONS,
        ),
        SecureStore.setItemAsync(
          accountCredentialKey(activeId, 'stoken'),
          migrated.stoken,
          SECURE_STORE_OPTIONS,
        ),
        SecureStore.setItemAsync(
          accountCredentialKey(activeId, 'cookie'),
          migrated.cookie,
          SECURE_STORE_OPTIONS,
        ),
        SecureStore.setItemAsync(ACTIVE_KEYS.BDUSS, migrated.bduss, SECURE_STORE_OPTIONS),
        SecureStore.setItemAsync(ACTIVE_KEYS.STOKEN, migrated.stoken, SECURE_STORE_OPTIONS),
        SecureStore.setItemAsync(ACTIVE_KEYS.COOKIE, migrated.cookie, SECURE_STORE_OPTIONS),
      ]);
    }

    // Delete legacy plaintext keys.
    for (const key of LEGACY_PLAINTEXT_KEYS) {
      kvRemoveSync(key);
    }
    for (const key of [SQLITE_KEYS.LEGACY_UID, SQLITE_KEYS.LEGACY_TBS, SQLITE_KEYS.LEGACY_ZID]) {
      kvRemoveSync(key);
    }
    if (legacyUid || legacyTbs || legacyZid) {
      persistMeta({ uid: legacyUid, tbs: legacyTbs, zid: legacyZid });
    }

    // Strip credentials from all SQLite account metadata.
    if (activeId) {
      const redacted = redactAccount(activeAccount);
      kvSetSync(`${SQLITE_KEYS.ACCOUNT_PREFIX}${activeId}`, JSON.stringify(redacted));
    }
    for (const raw of rawList) {
      const uid = getStringField(raw, 'uid');
      if (!uid) continue;
      const existingRaw = readRawAccount(uid);
      if (existingRaw) {
        kvSetSync(`${SQLITE_KEYS.ACCOUNT_PREFIX}${uid}`, JSON.stringify(redactAccount(existingRaw)));
      }
    }
    writeRedactedAccountList(rawList);

    memory = migrated;
    loadMetaFromSqlite();
  })();

  hydratePromise = run;
  try {
    await run;
    hydrated = true;
  } finally {
    if (hydratePromise === run) hydratePromise = null;
  }
}
