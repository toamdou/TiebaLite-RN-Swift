/**
 * Unified visit history (threads + forums), backed by the shared SQLite
 * database. Legacy AsyncStorage payloads are migrated once and removed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureUnifiedStorageReady, getDbAsync } from '@/services/storage/unifiedDb';
import { getPreferences } from '@/services/storage/PreferencesStorage';
import type { HistoryItem } from '@/types';

const UNIFIED_KEY = '@tiebalite:visit_history_v1';
const LEGACY_THREAD_KEY = '@tiebalite:history_thread';
const LEGACY_FORUM_KEY = '@tiebalite:history_forum';
const LEGACY_RECENT_FORUM_KEY = '@tiebalite:forum_history';
const MAX_ITEMS = 200;

export interface ForumHistoryItem {
  forumName: string;
  forumId: string;
  avatar?: string;
  visitedAt: number;
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

function normalizeItem(value: unknown): HistoryItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type === 'forum' ? 'forum' : 'thread';
  const rawId = raw.id ?? raw.threadId ?? raw.forumName;
  if (rawId === null || rawId === undefined || rawId === '') return null;
  const id = String(rawId);
  const timestamp = Number(raw.timestamp ?? Date.now());
  return {
    id,
    type,
    threadId:
      raw.threadId != null
        ? String(raw.threadId)
        : type === 'thread'
          ? id
          : undefined,
    forumId: raw.forumId != null ? String(raw.forumId) : undefined,
    forumName: raw.forumName != null ? String(raw.forumName) : undefined,
    avatar: raw.avatar != null ? String(raw.avatar) : undefined,
    title: raw.title != null ? String(raw.title) : undefined,
    authorName: raw.authorName != null ? String(raw.authorName) : undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

function parseLegacyArray(json: string | null): HistoryItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeItem(item))
      .filter((item): item is HistoryItem => item !== null);
  } catch {
    return [];
  }
}

function dedupe(items: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  const result: HistoryItem[] = [];
  for (const item of items) {
    const key = `${item.type}-${item.threadId ?? item.forumName ?? item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sortByTime(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

function rowToItem(row: VisitHistoryRow): HistoryItem {
  const id =
    row.type === 'forum'
      ? row.forum_id || row.forum_name || String(row.id)
      : row.thread_id || String(row.id);
  return {
    id,
    type: row.type,
    threadId: row.thread_id || undefined,
    forumId: row.forum_id || undefined,
    forumName: row.forum_name || undefined,
    avatar: row.avatar || undefined,
    title: row.title || undefined,
    authorName: row.author_name || undefined,
    timestamp: row.timestamp,
  };
}

async function hasLegacyAsyncStorageKeys(): Promise<boolean> {
  const keys = await AsyncStorage.getAllKeys();
  return [
    UNIFIED_KEY,
    LEGACY_THREAD_KEY,
    LEGACY_FORUM_KEY,
    LEGACY_RECENT_FORUM_KEY,
  ].some((key) => keys.includes(key));
}

async function migrateLegacy(): Promise<HistoryItem[]> {
  const keys = await AsyncStorage.getAllKeys();
  const readKeys = [
    UNIFIED_KEY,
    LEGACY_THREAD_KEY,
    LEGACY_FORUM_KEY,
    LEGACY_RECENT_FORUM_KEY,
  ].filter((key) => keys.includes(key));
  const pairs = readKeys.length > 0 ? await AsyncStorage.multiGet(readKeys) : [];

  const merged: HistoryItem[] = [];
  for (const [key, value] of pairs) {
    if (key === LEGACY_RECENT_FORUM_KEY) {
      if (!value) continue;
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item?.forumName) continue;
            merged.push({
              id: String(item.forumId ?? item.forumName),
              type: 'forum',
              forumId: String(item.forumId ?? ''),
              forumName: String(item.forumName),
              avatar: item.avatar ?? '',
              timestamp: Number(item.visitedAt ?? Date.now()),
            });
          }
        }
      } catch {}
    } else {
      merged.push(...parseLegacyArray(value));
    }
  }

  const deduped = dedupe(sortByTime(merged));
  const db = await getDbAsync();
  await db.withTransactionAsync(async () => {
    for (const item of deduped) {
      await db.runAsync(
        `INSERT INTO visit_history (
          type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.type,
        item.threadId ?? '',
        item.forumId ?? '',
        item.forumName ?? '',
        item.avatar ?? '',
        item.title ?? '',
        item.authorName ?? '',
        item.timestamp,
      );
    }
  });

  if (readKeys.length > 0) {
    await AsyncStorage.multiRemove(readKeys);
  }
  return deduped;
}

async function ensureMigrated(): Promise<void> {
  await ensureUnifiedStorageReady();
  const db = await getDbAsync();
  const count = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM visit_history',
  ))?.count ?? 0;
  if (count === 0 && (await hasLegacyAsyncStorageKeys())) {
    await migrateLegacy();
  }
}

async function readAllEntries(): Promise<HistoryItem[]> {
  await ensureMigrated();
  const db = await getDbAsync();
  const rows = await db.getAllAsync<VisitHistoryRow>(
    `SELECT id, type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
     FROM visit_history ORDER BY timestamp DESC, id DESC`,
  );
  return dedupe(rows.map(rowToItem));
}

export async function getVisitHistory(
  type?: 'thread' | 'forum',
): Promise<HistoryItem[]> {
  const all = await readAllEntries();
  return type ? all.filter((item) => item.type === type) : all;
}

async function addVisit(item: HistoryItem): Promise<void> {
  try {
    const prefs = await getPreferences();
    if (prefs.incognitoMode) return;
    await ensureMigrated();

    const db = await getDbAsync();
    const threadId = item.type === 'thread' ? item.threadId ?? item.id : '';
    const forumId = item.forumId ?? '';
    const forumName = item.forumName ?? '';

    await db.withTransactionAsync(async () => {
      if (item.type === 'thread') {
        await db.runAsync(
          'DELETE FROM visit_history WHERE type = ? AND thread_id = ?',
          'thread',
          threadId,
        );
      } else {
        await db.runAsync(
          'DELETE FROM visit_history WHERE type = ? AND forum_name = ?',
          'forum',
          forumName,
        );
      }

      await db.runAsync(
        `INSERT INTO visit_history (
          type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.type,
        threadId,
        forumId,
        forumName,
        item.avatar ?? '',
        item.title ?? '',
        item.authorName ?? '',
        item.timestamp,
      );

      await db.runAsync(
        `DELETE FROM visit_history WHERE id NOT IN (
          SELECT id FROM visit_history ORDER BY timestamp DESC, id DESC LIMIT ?
        )`,
        MAX_ITEMS,
      );
    });
  } catch {}
}

export async function recordThreadVisit(item: HistoryItem): Promise<void> {
  await addVisit({ ...item, type: 'thread' });
}

export async function recordForumVisit(item: HistoryItem): Promise<void> {
  await addVisit({ ...item, type: 'forum' });
}

export async function removeVisit(
  predicate: (item: HistoryItem) => boolean,
): Promise<HistoryItem[]> {
  await ensureMigrated();
  const db = await getDbAsync();
  const rows = await db.getAllAsync<VisitHistoryRow>(
    `SELECT id, type, thread_id, forum_id, forum_name, avatar, title, author_name, timestamp
     FROM visit_history ORDER BY timestamp DESC, id DESC`,
  );
  const items = rows.map(rowToItem);
  const idsToRemove = rows
    .filter((_row, index) => predicate(items[index]))
    .map((row) => row.id);

  if (idsToRemove.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const id of idsToRemove) {
        await db.runAsync('DELETE FROM visit_history WHERE id = ?', id);
      }
    });
  }

  return readAllEntries();
}

export async function clearVisitHistory(type?: 'thread' | 'forum'): Promise<void> {
  await ensureMigrated();
  const db = await getDbAsync();
  if (type) {
    await db.runAsync('DELETE FROM visit_history WHERE type = ?', type);
  } else {
    await db.runAsync('DELETE FROM visit_history');
  }
}

export function toForumHistoryItem(item: HistoryItem): ForumHistoryItem | null {
  if (item.type !== 'forum' || !item.forumName) return null;
  return {
    forumName: item.forumName,
    forumId: item.forumId ?? '',
    avatar: item.avatar ?? '',
    visitedAt: item.timestamp,
  };
}
