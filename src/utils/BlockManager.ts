import type { BlockedWord, BlockedUser } from '@/types';
import { emitBlockEvents } from './blockEvents';
import {
  getAllKeys,
  kvGet,
  kvMultiGet,
  kvMultiRemove,
  kvMultiSet,
  kvRemove,
  kvSet,
} from '@/services/storage/unifiedDb';

const BLOCKED_WORDS_KEY = '@tiebalite:blocked_words';
const BLOCKED_USERS_KEY = '@tiebalite:blocked_users';
const BLOCKED_WORD_PREFIX = '@tiebalite:blocked_word:';
const BLOCKED_USER_PREFIX = '@tiebalite:blocked_user:';

const compiledRegexCache = new Map<string, RegExp>();
const invalidRegexCache = new Set<string>();
let compiledBlockSnapshots = new WeakMap<BlockedWord[], CompiledBlockSnapshot>();

interface CompiledBlockWord {
  keyword: string;
  isRegex: boolean;
  regex: RegExp | null;
}

interface CompiledBlockSnapshot {
  whitelist: CompiledBlockWord[];
  blacklist: CompiledBlockWord[];
}

let blockStorageWriteQueue: Promise<void> = Promise.resolve();

function enqueueBlockStorageWrite(operation: () => Promise<void>): Promise<void> {
  const run = blockStorageWriteQueue.then(operation, operation);
  blockStorageWriteQueue = run.catch(() => {});
  return run.catch(() => {});
}

function blockedWordStorageKey(id: string): string {
  return `${BLOCKED_WORD_PREFIX}${id}`;
}

function blockedUserStorageKey(uid: string): string {
  return `${BLOCKED_USER_PREFIX}${uid}`;
}

function getCompiledRegex(pattern: string): RegExp | null {
  const cached = compiledRegexCache.get(pattern);
  if (cached) return cached;
  if (invalidRegexCache.has(pattern)) return null;
  try {
    const regex = new RegExp(pattern);
    compiledRegexCache.set(pattern, regex);
    return regex;
  } catch {
    invalidRegexCache.add(pattern);
    return null;
  }
}

function clearRegexCaches(): void {
  compiledRegexCache.clear();
  invalidRegexCache.clear();
  compiledBlockSnapshots = new WeakMap();
}

function compileBlockedWords(blockedWords: BlockedWord[]): CompiledBlockSnapshot {
  const whitelist: CompiledBlockWord[] = [];
  const blacklist: CompiledBlockWord[] = [];
  for (const word of blockedWords) {
    const compiled: CompiledBlockWord = word.isRegex
      ? { keyword: word.keyword, isRegex: true, regex: getCompiledRegex(word.keyword) }
      : { keyword: word.keyword, isRegex: false, regex: null };
    if (word.category === 'whitelist') {
      whitelist.push(compiled);
    } else {
      blacklist.push(compiled);
    }
  }
  return { whitelist, blacklist };
}

function getCompiledBlockSnapshot(blockedWords: BlockedWord[]): CompiledBlockSnapshot {
  const cached = compiledBlockSnapshots.get(blockedWords);
  if (cached) return cached;
  const compiled = compileBlockedWords(blockedWords);
  compiledBlockSnapshots.set(blockedWords, compiled);
  return compiled;
}

function matchCompiledBlockWord(content: string, word: CompiledBlockWord): boolean {
  if (word.isRegex) {
    return word.regex !== null && word.regex.test(content);
  }
  return content.includes(word.keyword);
}

function isValidBlockedWord(value: unknown): value is BlockedWord {
  const word = value as BlockedWord | null;
  return (
    word !== null &&
    typeof word === 'object' &&
    typeof word.id === 'string' &&
    typeof word.keyword === 'string'
  );
}

function isValidBlockedUser(value: unknown): value is BlockedUser {
  const user = value as BlockedUser | null;
  return (
    user !== null &&
    typeof user === 'object' &&
    typeof user.id === 'string' &&
    typeof user.uid === 'string'
  );
}

let cachedBlockedWords: BlockedWord[] | null = null;
let cachedBlockedUsers: BlockedUser[] | null = null;
let blockedWordsLoadPromise: Promise<BlockedWord[]> | null = null;
let blockedUsersLoadPromise: Promise<BlockedUser[]> | null = null;

async function readBlockedWordsFromStorage(): Promise<BlockedWord[]> {
  const [legacyJson, allKeys] = await Promise.all([
    kvGet(BLOCKED_WORDS_KEY),
    getAllKeys(),
  ]);
  const perItemKeys = allKeys.filter((key) => key.startsWith(BLOCKED_WORD_PREFIX));
  const entries =
    perItemKeys.length > 0 ? await kvMultiGet(perItemKeys) : [];

  const words: BlockedWord[] = [];
  const seenIds = new Set<string>();
  for (const [, raw] of entries) {
    if (raw == null) continue;
    try {
      const word = JSON.parse(raw) as unknown;
      if (isValidBlockedWord(word) && !seenIds.has(word.id)) {
        seenIds.add(word.id);
        words.push(word);
      }
    } catch {}
  }

  if (legacyJson) {
    try {
      const legacy = JSON.parse(legacyJson) as unknown;
      if (Array.isArray(legacy)) {
        for (const raw of legacy) {
          if (isValidBlockedWord(raw) && !seenIds.has(raw.id)) {
            seenIds.add(raw.id);
            words.push(raw);
          }
        }
      }
    } catch {}

    await enqueueBlockStorageWrite(async () => {
      if (words.length > 0) {
        await kvMultiSet(
          words.map(
            (word) => [blockedWordStorageKey(word.id), JSON.stringify(word)] as [string, string],
          ),
        );
      }
      await kvRemove(BLOCKED_WORDS_KEY);
    });
  }

  return words;
}

async function readBlockedUsersFromStorage(): Promise<BlockedUser[]> {
  const [legacyJson, allKeys] = await Promise.all([
    kvGet(BLOCKED_USERS_KEY),
    getAllKeys(),
  ]);
  const perItemKeys = allKeys.filter((key) => key.startsWith(BLOCKED_USER_PREFIX));
  const entries =
    perItemKeys.length > 0 ? await kvMultiGet(perItemKeys) : [];

  const users: BlockedUser[] = [];
  const seenUids = new Set<string>();
  for (const [, raw] of entries) {
    if (raw == null) continue;
    try {
      const user = JSON.parse(raw) as unknown;
      if (isValidBlockedUser(user) && !seenUids.has(user.uid)) {
        seenUids.add(user.uid);
        users.push(user);
      }
    } catch {}
  }

  if (legacyJson) {
    try {
      const legacy = JSON.parse(legacyJson) as unknown;
      if (Array.isArray(legacy)) {
        for (const raw of legacy) {
          if (isValidBlockedUser(raw) && !seenUids.has(raw.uid)) {
            seenUids.add(raw.uid);
            users.push(raw);
          }
        }
      }
    } catch {}

    await enqueueBlockStorageWrite(async () => {
      if (users.length > 0) {
        await kvMultiSet(
          users.map(
            (user) => [blockedUserStorageKey(user.uid), JSON.stringify(user)] as [string, string],
          ),
        );
      }
      await kvRemove(BLOCKED_USERS_KEY);
    });
  }

  return users;
}

function loadBlockedWords(): Promise<BlockedWord[]> {
  if (cachedBlockedWords) return Promise.resolve(cachedBlockedWords);
  if (!blockedWordsLoadPromise) {
    blockedWordsLoadPromise = (async () => {
      try {
        const words = await readBlockedWordsFromStorage();
        cachedBlockedWords = words;
        compiledBlockSnapshots.set(words, compileBlockedWords(words));
        return words;
      } catch {
        cachedBlockedWords = [];
        compiledBlockSnapshots.set(cachedBlockedWords, compileBlockedWords(cachedBlockedWords));
        return cachedBlockedWords;
      }
    })().finally(() => {
      blockedWordsLoadPromise = null;
    });
  }
  return blockedWordsLoadPromise;
}

function loadBlockedUsers(): Promise<BlockedUser[]> {
  if (cachedBlockedUsers) return Promise.resolve(cachedBlockedUsers);
  if (!blockedUsersLoadPromise) {
    blockedUsersLoadPromise = (async () => {
      try {
        const users = await readBlockedUsersFromStorage();
        cachedBlockedUsers = users;
        return users;
      } catch {
        cachedBlockedUsers = [];
        return cachedBlockedUsers;
      }
    })().finally(() => {
      blockedUsersLoadPromise = null;
    });
  }
  return blockedUsersLoadPromise;
}

async function persistBlockedWord(word: BlockedWord): Promise<void> {
  await enqueueBlockStorageWrite(() =>
    kvSet(blockedWordStorageKey(word.id), JSON.stringify(word)),
  );
}

async function removePersistedBlockedWord(id: string): Promise<void> {
  await enqueueBlockStorageWrite(() => kvRemove(blockedWordStorageKey(id)));
}

async function persistBlockedUser(user: BlockedUser): Promise<void> {
  await enqueueBlockStorageWrite(() =>
    kvSet(blockedUserStorageKey(user.uid), JSON.stringify(user)),
  );
}

async function removePersistedBlockedUser(uid: string): Promise<void> {
  await enqueueBlockStorageWrite(() => kvRemove(blockedUserStorageKey(uid)));
}

export const BlockManager = {
  async getBlockedWords(): Promise<BlockedWord[]> {
    return [...(await loadBlockedWords())];
  },

  /** Internal cached snapshot used by blockFilterSync so compiled lists stay reusable. */
  async getBlockedWordsSnapshot(): Promise<BlockedWord[]> {
    return loadBlockedWords();
  },

  async addBlockedWord(word: BlockedWord): Promise<void> {
    const next = [...(await loadBlockedWords()), word];
    cachedBlockedWords = next;
    await persistBlockedWord(word);
    clearRegexCaches();
    compiledBlockSnapshots.set(next, compileBlockedWords(next));
    emitBlockEvents();
  },

  async removeBlockedWord(id: string): Promise<void> {
    const words = await loadBlockedWords();
    const next = words.filter((w) => w.id !== id);
    if (next.length === words.length) return;
    cachedBlockedWords = next;
    await removePersistedBlockedWord(id);
    clearRegexCaches();
    compiledBlockSnapshots.set(next, compileBlockedWords(next));
    emitBlockEvents();
  },

  async getBlockedUsers(): Promise<BlockedUser[]> {
    return [...(await loadBlockedUsers())];
  },

  async addBlockedUser(user: BlockedUser): Promise<void> {
    const users = await loadBlockedUsers();
    if (users.some((u) => u.uid === user.uid)) return;
    const next = [...users, user];
    cachedBlockedUsers = next;
    await persistBlockedUser(user);
    emitBlockEvents();
  },

  async removeBlockedUser(uid: string): Promise<void> {
    const users = await loadBlockedUsers();
    const next = users.filter((u) => u.uid !== uid);
    if (next.length === users.length) return;
    cachedBlockedUsers = next;
    await removePersistedBlockedUser(uid);
    emitBlockEvents();
  },

  async clearAllBlocked(): Promise<void> {
    await Promise.all([loadBlockedWords(), loadBlockedUsers()]);
    cachedBlockedWords = null;
    cachedBlockedUsers = null;
    clearRegexCaches();
    await enqueueBlockStorageWrite(async () => {
      const allKeys = await getAllKeys();
      const keys = allKeys.filter(
        (key) =>
          key === BLOCKED_WORDS_KEY ||
          key === BLOCKED_USERS_KEY ||
          key.startsWith(BLOCKED_WORD_PREFIX) ||
          key.startsWith(BLOCKED_USER_PREFIX),
      );
      if (keys.length > 0) {
        await kvMultiRemove(keys);
      }
    });
    emitBlockEvents();
  },

  shouldBlockContent(content: string, blockedWords: BlockedWord[]): boolean {
    const snapshot = getCompiledBlockSnapshot(blockedWords);
    if (snapshot.whitelist.some((word) => matchCompiledBlockWord(content, word))) {
      return false;
    }
    return snapshot.blacklist.some((word) => matchCompiledBlockWord(content, word));
  },

  shouldBlockUser(userId: string, userName: string | null, blockedUsers: BlockedUser[]): boolean {
    return blockedUsers.some(
      (u) => u.uid === userId || (userName && u.username === userName),
    );
  },

  matchKeyword(content: string, word: BlockedWord): boolean {
    if (word.isRegex) {
      const regex = getCompiledRegex(word.keyword);
      return regex !== null && regex.test(content);
    }
    return content.includes(word.keyword);
  },
};
