/**
 * Unified search history repository backed by the shared SQLite database.
 *
 * Legacy AsyncStorage payloads are read once during migration and then
 * removed. All subsequent reads/writes are row-level SQLite operations in
 * the same `tiebalite.db` used by preferences/account metadata/history.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureUnifiedStorageReady, getDbAsync } from '@/services/storage/unifiedDb';

export interface SearchHistoryItem {
  keyword: string;
  timestamp: number;
  /** Present only for forum-scoped history. */
  forumId?: string;
}

const UNIFIED_KEY = '@tiebalite:search_history_v1';
const LEGACY_GLOBAL_KEY = '@tiebalite:search_history';
const LEGACY_FORUM_PREFIX = '@tiebalite:forumSearchHistory:';

const DEFAULT_LIMIT = 20;

interface SearchHistoryRow {
  forum_id: string;
  keyword: string;
  timestamp: number;
}

function normalizeItem(value: any, forumId?: string): SearchHistoryItem | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const keyword = value.trim();
    return keyword ? { keyword, timestamp: Date.now(), forumId } : null;
  }
  if (typeof value === 'object') {
    const keyword = String(value.keyword ?? value.text ?? value.word ?? '').trim();
    if (!keyword) return null;
    const ts = Number(value.timestamp ?? value.time ?? Date.now());
    return {
      keyword,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      forumId: forumId ?? value.forumId,
    };
  }
  return null;
}

function parseLegacyArray(json: string | null, forumId?: string): SearchHistoryItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .map((value) => normalizeItem(value, forumId))
      .filter((item): item is SearchHistoryItem => item !== null);
    return items.map((item, index) => ({
      ...item,
      timestamp: item.timestamp || Date.now() - index,
    }));
  } catch {
    return [];
  }
}

function dedupeCaseInsensitive(items: SearchHistoryItem[]): SearchHistoryItem[] {
  const seen = new Set<string>();
  const result: SearchHistoryItem[] = [];
  for (const item of items) {
    const key = `${(item.forumId ?? '')}:${item.keyword.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sortByTime(items: SearchHistoryItem[]): SearchHistoryItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

function scoped(items: SearchHistoryItem[], forumId?: string): SearchHistoryItem[] {
  return items.filter((item) => (item.forumId ?? '') === (forumId ?? ''));
}

function rowToItem(row: SearchHistoryRow): SearchHistoryItem {
  return {
    keyword: row.keyword,
    timestamp: row.timestamp,
    forumId: row.forum_id || undefined,
  };
}

async function readAllEntries(): Promise<SearchHistoryItem[]> {
  await ensureUnifiedStorageReady();
  const db = await getDbAsync();
  const rows = await db.getAllAsync<SearchHistoryRow>(
    'SELECT forum_id, keyword, timestamp FROM search_history ORDER BY timestamp DESC, id DESC',
  );
  return dedupeCaseInsensitive(rows.map(rowToItem));
}

async function hasLegacyAsyncStorageKeys(): Promise<boolean> {
  const keys = await AsyncStorage.getAllKeys();
  return (
    keys.includes(UNIFIED_KEY) ||
    keys.includes(LEGACY_GLOBAL_KEY) ||
    keys.some((key) => key.startsWith(LEGACY_FORUM_PREFIX))
  );
}

async function migrateLegacy(): Promise<SearchHistoryItem[]> {
  const keys = await AsyncStorage.getAllKeys();
  const forumKeys = keys.filter((key) => key.startsWith(LEGACY_FORUM_PREFIX));
  const readKeys = [UNIFIED_KEY, LEGACY_GLOBAL_KEY, ...forumKeys].filter((key) =>
    keys.includes(key),
  );
  const pairs = readKeys.length > 0 ? await AsyncStorage.multiGet(readKeys) : [];

  const items: SearchHistoryItem[] = [];
  for (const [key, value] of pairs) {
    if (key === UNIFIED_KEY || key === LEGACY_GLOBAL_KEY) {
      items.push(...parseLegacyArray(value));
    } else if (key.startsWith(LEGACY_FORUM_PREFIX)) {
      items.push(...parseLegacyArray(value, key.slice(LEGACY_FORUM_PREFIX.length)));
    }
  }

  const merged = sortByTime(dedupeCaseInsensitive(items));
  const db = await getDbAsync();
  await db.withTransactionAsync(async () => {
    for (const item of merged) {
      await db.runAsync(
        'INSERT INTO search_history (forum_id, keyword, timestamp) VALUES (?, ?, ?)',
        item.forumId ?? '',
        item.keyword,
        item.timestamp,
      );
    }
  });

  if (readKeys.length > 0) {
    await AsyncStorage.multiRemove(readKeys);
  }
  return merged;
}

async function ensureMigrated(): Promise<void> {
  await ensureUnifiedStorageReady();
  const db = await getDbAsync();
  const count = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM search_history',
  ))?.count ?? 0;
  if (count === 0 && (await hasLegacyAsyncStorageKeys())) {
    await migrateLegacy();
  }
}

export async function loadSearchHistory(
  forumId?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SearchHistoryItem[]> {
  await ensureMigrated();
  return scoped(await readAllEntries(), forumId).slice(0, limit);
}

export async function appendSearchHistory(
  keyword: string,
  forumId?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SearchHistoryItem[]> {
  await ensureMigrated();
  const trimmed = keyword.trim();
  if (!trimmed) return scoped(await readAllEntries(), forumId).slice(0, limit);

  const scope = forumId ?? '';
  const db = await getDbAsync();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM search_history WHERE forum_id = ? AND lower(keyword) = lower(?)',
      scope,
      trimmed,
    );
    await db.runAsync(
      'INSERT INTO search_history (forum_id, keyword, timestamp) VALUES (?, ?, ?)',
      scope,
      trimmed,
      Date.now(),
    );
    await db.runAsync(
      `DELETE FROM search_history WHERE forum_id = ? AND id NOT IN (
        SELECT id FROM search_history WHERE forum_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?
      )`,
      scope,
      scope,
      limit,
    );
  });
  return scoped(await readAllEntries(), forumId).slice(0, limit);
}

export async function removeSearchHistory(
  keyword: string,
  forumId?: string,
): Promise<SearchHistoryItem[]> {
  await ensureMigrated();
  const db = await getDbAsync();
  await db.runAsync(
    'DELETE FROM search_history WHERE forum_id = ? AND lower(keyword) = lower(?)',
    forumId ?? '',
    keyword.trim(),
  );
  return sortByTime(scoped(await readAllEntries(), forumId));
}

export async function clearSearchHistory(forumId?: string): Promise<void> {
  await ensureMigrated();
  await (await getDbAsync()).runAsync(
    'DELETE FROM search_history WHERE forum_id = ?',
    forumId ?? '',
  );
}
