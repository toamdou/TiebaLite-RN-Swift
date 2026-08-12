// Minimal event bus used by BlockManager writes and the shared
// block-filter cache so list rows don't each poll unified storage.
export type BlockEventsListener = () => void;

const listeners = new Set<BlockEventsListener>();

export function subscribeBlockEvents(listener: BlockEventsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitBlockEvents(): void {
  for (const listener of listeners) listener();
}
