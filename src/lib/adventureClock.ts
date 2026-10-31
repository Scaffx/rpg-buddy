import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';

// The anchor belongs to the in-memory RPC response. Rehydrated or fabricated
// snapshots have no trustworthy elapsed time and remain at server_now.
const anchors = new WeakMap<AdventureSnapshot, number>();

export function anchorAdventureClock(snapshot: AdventureSnapshot): AdventureSnapshot {
  anchors.set(snapshot, performance.now());
  return snapshot;
}

export function hasAdventureClockAnchor(snapshot: AdventureSnapshot | undefined): boolean {
  return Boolean(snapshot && anchors.has(snapshot));
}

export function adventureServerTime(snapshot: AdventureSnapshot | undefined): number {
  if (!snapshot) return 0;
  const serverNow = Date.parse(snapshot.server_now);
  const anchor = anchors.get(snapshot);
  return serverNow + (anchor === undefined ? 0 : Math.max(0, performance.now() - anchor));
}
