// ============================================================
// blockFilterSync — shared in-memory cache for blocked words/users.
//
// PostContent and thread lists subscribe to one snapshot instead of
// every row calling BlockManager/unified storage independently.
// ============================================================

import type { BlockedWord, BlockedUser } from '@/types';
import { BlockManager } from './BlockManager';
import { subscribeBlockEvents } from './blockEvents';

export interface BlockFilterSnapshot {
  loaded: boolean;
  blockedWords: BlockedWord[];
  blockedUsers: BlockedUser[];
}

let snapshot: BlockFilterSnapshot = {
  loaded: false,
  blockedWords: [],
  blockedUsers: [],
};
let refreshPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getBlockFilterSnapshot(): BlockFilterSnapshot {
  return snapshot;
}

export function subscribeBlockFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reload the shared cache at most once per event burst. */
export async function refreshBlockFilter(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const [words, users] = await Promise.all([
      BlockManager.getBlockedWordsSnapshot(),
      BlockManager.getBlockedUsers(),
    ]);
    snapshot = { loaded: true, blockedWords: words, blockedUsers: users };
    emit();
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// One global listener for every write made through BlockManager.
subscribeBlockEvents(() => {
  refreshBlockFilter();
});
