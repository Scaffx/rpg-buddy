export type ShortRestPersistentState = {
  minutes: number;
  secondsLeft: number;
  isRunning: boolean;
  endAtMs: number | null;
  needsApply: boolean;
  updatedAtMs: number;
};

export function getShortRestStorageKey(userId: string): string {
  return `short_rest_${userId}`;
}

export function readShortRestState(userId?: string | null): ShortRestPersistentState | null {
  if (!userId) return null;

  const raw = localStorage.getItem(getShortRestStorageKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ShortRestPersistentState>;
    return {
      minutes: Number(parsed.minutes ?? 15),
      secondsLeft: Math.max(0, Number(parsed.secondsLeft ?? 15 * 60)),
      isRunning: Boolean(parsed.isRunning),
      endAtMs: parsed.endAtMs == null ? null : Number(parsed.endAtMs),
      needsApply: Boolean(parsed.needsApply),
      updatedAtMs: Number(parsed.updatedAtMs ?? Date.now()),
    };
  } catch {
    return null;
  }
}

export function writeShortRestState(userId: string, state: ShortRestPersistentState): void {
  localStorage.setItem(getShortRestStorageKey(userId), JSON.stringify(state));
}

export function getRemainingSeconds(state: Pick<ShortRestPersistentState, 'isRunning' | 'endAtMs' | 'secondsLeft'>): number {
  if (!state.isRunning || !state.endAtMs) {
    return Math.max(0, state.secondsLeft);
  }

  return Math.max(0, Math.ceil((state.endAtMs - Date.now()) / 1000));
}

export function formatSeconds(seconds: number): string {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
