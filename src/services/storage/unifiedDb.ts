// ============================================================
// Unified storage facade
//
// One SQLite database for all non-sensitive app state:
//   - kv table: preferences, account metadata, block lists,
//     live activity id, notification baselines, BAIDUID, etc.
//   - search_history / visit_history tables
// Credentials (BDUSS/STOKEN/COOKIE) stay exclusively in Keychain via
// expo-secure-store and are never written to this database.
//
// All SQLite access uses the async expo-sqlite API. Synchronous kv
// helpers are backed by an in-memory cache so existing auth/interceptor
// hot paths never touch SQLite synchronously; writes are queued and
// persisted asynchronously.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import KVStorage from 'expo-sqlite/kv-store';
import {
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

const DB_NAME = 'tiebalite.db';
const MIGRATION_KEY = '@tiebalite:unified_migration_v1';

let dbPromise: Promise<SQLiteDatabase> | null = null;
let asyncMigrationPromise: Promise<void> | null = null;

// Synchronous kv facade is a memory cache; SQLite writes are queued.
const kvCache = new Map<string, string>();
const kvPendingKeys = new Set<string>();
let kvCacheLoaded = false;
let kvWriteQueue: Promise<void> = Promise.resolve();

interface SearchHistoryRow {
  forum_id: string;
  keyword: string;
  timestamp: number;
}

interface VisitHistoryRow {
  id: number;
  type: 'thread' | 'forum';
  thread_id: string;
  forum_id: string;
  forum_name: string;
  avatar: string;
  title: string;
  author_name: string;
  timestamp: number;
}

function isLegacyAsyncStorageKey(key: string): boolean {
  return (
    key.startsWith('@tiebalite:') ||
    key.startsWith('tiebalite_') ||
    key === 'tiebalite_preferences' ||
    key.startsWith('tiebalite_preferences:') ||
    key.startsWith('tiebalite_last_notif_counts_')
  );
}

function enqueueKvWrite(operation: () => Promise<void>): Promise<void> {
  const run = kvWriteQueue.then(operation, operation);
  kvWriteQueue = run.catch(() => {});
  return run.catch(() => {});
}

function markPendingKeys(keys: Iterable<string>): void {
  for (const key of keys) kvPendingKeys.add(key);
}

async function createSchemaAsync(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forum_id TEXT NOT NULL DEFAULT '',
      keyword TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_history_scope_time
      ON search_history(forum_id, timestamp DESC, id DESC);
    CREATE TABLE IF NOT EXISTS visit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      thread_id TEXT NOT NULL DEFAULT '',
      forum_id TEXT NOT NULL DEFAULT '',
      forum_name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visit_history_type_time
      ON visit_history(type, timestamp DESC, id DESC);
  `);
}

async function migrateLegacyKvStoreAsync(database: SQLiteDatabase): Promise<void> {
  try {
    const marker = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      MIGRATION_KEY,
    );
    if (marker) return;

    const keys = await KVStorage.getAllKeys();
    if (keys.length > 0) {
      await database.withTransactionAsync(async () => {
        for (const key of keys) {
          const existing = await database.getFirstAsync<{ value: string }>(
            'SELECT value FROM kv WHERE key = ?',
            key,
          );
          if (existing) continue;
          const value = await KVStorage.getItem(key);
          if (value == null) continue;
          await database.runAsync(
            'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
            key,
            value,
          );
        }
      });
    }
    await database.runAsync(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      MIGRATION_KEY,
      JSON.stringify({ migratedAt: Date.now() }),
    );
    try {
      await KVStorage.clear();
    } catch {}
  } catch (error) {
    console.warn('[UnifiedDb] Legacy kv-store migration failed:', error);
  }
}

async function migrateLegacySqliteTablesAsync(
  database: SQLiteDatabase,
): Promise<void> {
  try {
    const searchCount =
      (await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM search_history',
      ))?.count ?? 0;
    if (searchCount === 0) {
      try {
        const legacy = await openDatabaseAsync('tiebalite_search_history.db');
        const rows = await legacy.getAllAsync<SearchHistoryRow>(
          'SELECT forum_id, keyword, timestamp FROM search_history ORDER BY timestamp DESC, id DESC',
        );
        if (rows.length > 0) {
          await database.withTransactionAsync(async () => {
            for (const row of rows) {
              await database.runAsync(
                'INSERT INTO search_history (forum_id, keyword, timestamp) VALUES (?, ?, ?)',
                row.forum_id,
                row.keyword,
                row.timestamp,
              );
            }
          });
        }
        await legacy.closeAsync();
        try {
          await deleteDatabaseAsync('tiebalite_search_history.db');
        } catch {}
      } catch {}
    }

    const visitCount =
      (await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM visit_history',
      ))?.count ?? 0;
    if (visitCount === 0) {
      try {
        const legacy = await openDatabaseAsync('tiebalite_visit_history.db');
        const rows = await legacy.getAllAsync<VisitHistoryRow>(
          `SELECT id, type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
           FROM visit_history ORDER BY timestamp DESC, id DESC`,
        );
        if (rows.length > 0) {
          await database.withTransactionAsync(async () => {
            for (const row of rows) {
              await database.runAsync(
                `INSERT INTO visit_history (
                  type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                row.type,
                row.thread_id,
                row.forum_id,
                row.forum_name,
                row.avatar,
                row.title,
                row.author_name,
                row.timestamp,
              );
            }
          });
        }
        await legacy.closeAsync();
        try {
          await deleteDatabaseAsync('tiebalite_visit_history.db');
        } catch {}
      } catch {}
    }
  } catch (error) {
    console.warn('[UnifiedDb] Legacy SQLite migration failed:', error);
  }
}

async function loadKvCacheAsync(database: SQLiteDatabase): Promise<void> {
  if (kvCacheLoaded) return;
  const rows = await database.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM kv',
  );
  for (const row of rows) {
    // Writes performed before the first async open must not be overwritten
    // by a stale row read from disk.
    if (kvPendingKeys.has(row.key)) continue;
    kvCache.set(row.key, row.value);
  }
  kvCacheLoaded = true;
}

export async function getDbAsync(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await openDatabaseAsync(DB_NAME);
      await createSchemaAsync(database);
      await migrateLegacyKvStoreAsync(database);
      await migrateLegacySqliteTablesAsync(database);
      await loadKvCacheAsync(database);
      return database;
    })();
  }
  return dbPromise;
}

// ------------------------------------------------------------
// Sync kv API (memory-cache backed; never blocks on SQLite)
// ------------------------------------------------------------

export function kvGetSync(key: string): string | null {
  if (!kvCacheLoaded) {
    void getDbAsync().catch(() => {});
  }
  return kvCache.has(key) ? (kvCache.get(key) as string) : null;
}

export function kvSetSync(key: string, value: string): void {
  kvCache.set(key, value);
  markPendingKeys([key]);
  void enqueueKvWrite(async () => {
    const db = await getDbAsync();
    await db.runAsync(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      key,
      value,
    );
  });
}

export function kvRemoveSync(key: string): void {
  kvCache.delete(key);
  markPendingKeys([key]);
  void enqueueKvWrite(async () => {
    const db = await getDbAsync();
    await db.runAsync('DELETE FROM kv WHERE key = ?', key);
  });
}

export function kvBatchSync(
  writes: { key: string; value: string | null }[],
): void {
  for (const write of writes) {
    if (write.value === null) {
      kvCache.delete(write.key);
    } else {
      kvCache.set(write.key, write.value);
    }
  }
  markPendingKeys(writes.map((write) => write.key));
  void enqueueKvWrite(async () => {
    const db = await getDbAsync();
    await db.withTransactionAsync(async () => {
      for (const write of writes) {
        if (write.value === null) {
          await db.runAsync('DELETE FROM kv WHERE key = ?', write.key);
        } else {
          await db.runAsync(
            'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
            write.key,
            write.value,
          );
        }
      }
    });
  });
}

export function getAllKeysSync(prefix?: string): string[] {
  if (!kvCacheLoaded) {
    void getDbAsync().catch(() => {});
  }
  const keys = [...kvCache.keys()].filter(
    (key) => !prefix || key.startsWith(prefix),
  );
  return keys.sort();
}

export function clearAllKvSync(prefix?: string): void {
  const keys = [...kvCache.keys()].filter(
    (key) => !prefix || key.startsWith(prefix),
  );
  for (const key of keys) kvCache.delete(key);
  markPendingKeys(keys);
  void enqueueKvWrite(async () => {
    const db = await getDbAsync();
    if (prefix) {
      await db.runAsync('DELETE FROM kv WHERE key LIKE ?', `${prefix}%`);
    } else {
      await db.execAsync('DELETE FROM kv');
    }
  });
}

// ------------------------------------------------------------
// Async migration + async kv API
// ------------------------------------------------------------

async function migrateLegacyAsyncStorageOnce(): Promise<void> {
  if (asyncMigrationPromise) return asyncMigrationPromise;
  asyncMigrationPromise = (async () => {
    try {
      const database = await getDbAsync();
      const keys = await AsyncStorage.getAllKeys();
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        if (value == null) continue;
        const existing = await database.getFirstAsync<{ value: string }>(
          'SELECT value FROM kv WHERE key = ?',
          key,
        );
        if (existing) continue;
        await database.runAsync(
          'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
          key,
          value,
        );
        if (!kvCache.has(key)) {
          kvCache.set(key, value);
          kvPendingKeys.add(key);
        }
      }
    } catch (error) {
      console.warn('[UnifiedDb] AsyncStorage migration failed:', error);
    }
  })();
  try {
    await asyncMigrationPromise;
  } finally {
    asyncMigrationPromise = null;
  }
}

export async function ensureUnifiedStorageReady(): Promise<void> {
  await getDbAsync();
  await migrateLegacyAsyncStorageOnce();
}

export async function kvGet(key: string): Promise<string | null> {
  await ensureUnifiedStorageReady();
  return kvGetSync(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await ensureUnifiedStorageReady();
  kvSetSync(key, value);
}

export async function kvRemove(key: string): Promise<void> {
  await ensureUnifiedStorageReady();
  kvRemoveSync(key);
}

export async function kvMultiGet(
  keys: string[],
): Promise<[string, string | null][]> {
  await ensureUnifiedStorageReady();
  return keys.map((key) => [key, kvGetSync(key)]);
}

export async function kvMultiSet(
  entries: [string, string][],
): Promise<void> {
  await ensureUnifiedStorageReady();
  kvBatchSync(entries.map(([key, value]) => ({ key, value })));
}

export async function kvMultiRemove(keys: string[]): Promise<void> {
  await ensureUnifiedStorageReady();
  kvBatchSync(keys.map((key) => ({ key, value: null })));
}

export async function getAllKeys(prefix?: string): Promise<string[]> {
  await ensureUnifiedStorageReady();
  return getAllKeysSync(prefix);
}

// ------------------------------------------------------------
// Clear helpers
// ------------------------------------------------------------

export async function clearLegacyStorage(): Promise<void> {
  try {
    await KVStorage.clear();
  } catch {
    // Legacy kv-store may not exist on every build.
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const removable = keys.filter(isLegacyAsyncStorageKey);
    if (removable.length > 0) {
      await AsyncStorage.multiRemove(removable);
    }
  } catch {
    // Best-effort cleanup.
  }
}

export async function clearAllUnifiedStorage(): Promise<void> {
  await kvWriteQueue.catch(() => {});
  const database = await getDbAsync();
  await database.execAsync(
    'DELETE FROM kv; DELETE FROM search_history; DELETE FROM visit_history;',
  );
  kvCache.clear();
  kvPendingKeys.clear();
  await clearLegacyStorage();
}
