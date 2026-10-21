import { useEffect, useRef, useState } from 'react';

type DamageEvent = {
  id: string;
  actor: 'hero' | 'enemy';
  damage?: number | null;
  effectNote?: string | null;
  damageMultiplier?: number | null;
};

export type DamageReaction = { id: string; target: 'hero' | 'enemy'; elapsedMs: number };

// Existing recoil timeline, including wind-up and impact; the server event age selects its phase.
const REACTION_MS = 1120;

/** Each server event is consumed once, including events first seen while motion is disabled. */
export function useDamageReaction(
  action: DamageEvent | null | undefined,
  authorized: boolean,
  still: boolean,
  elapsedMs: number | undefined,
): DamageReaction | null {
  const seenIds = useRef(new Set<string>());
  const [reaction, setReaction] = useState<DamageReaction | null>(null);
  const id = action?.id;
  const actor = action?.actor;
  const damage = action?.damage;
  const effectNote = action?.effectNote;
  const damageMultiplier = action?.damageMultiplier;

  useEffect(() => {
    const fresh = Boolean(id && !seenIds.current.has(id));
    if (fresh) seenIds.current.add(id!);
    const blocked = actor === 'enemy' && (effectNote === 'stunned' || damageMultiplier === 0);
    const confirmedDamage = typeof damage === 'number' && Number.isFinite(damage) && damage > 0;
    // Stopping motion or losing event authority consumes the event and removes the hit.
    const validAge = typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < REACTION_MS;
    if (!id || !authorized || still || blocked || !confirmedDamage || !validAge) {
      setReaction(current => current ? null : current);
      return;
    }
    if (!fresh) return;

    const hit: DamageReaction = { id, target: actor === 'hero' ? 'enemy' : 'hero', elapsedMs: elapsedMs! };
    setReaction(hit);
  }, [id, actor, damage, effectNote, damageMultiplier, authorized, still, elapsedMs]);

  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => {
      setReaction(current => current?.id === reaction.id ? null : current);
    }, REACTION_MS - reaction.elapsedMs);
    return () => clearTimeout(timer);
  }, [reaction]);

  // The current frame remains the authority even before the effect runs on a changed snapshot.
  if (!reaction || reaction.id !== id || !authorized || still ||
      typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= REACTION_MS ||
      reaction.target !== (actor === 'hero' ? 'enemy' : 'hero') ||
      (actor === 'enemy' && (effectNote === 'stunned' || damageMultiplier === 0)) ||
      typeof damage !== 'number' || !Number.isFinite(damage) || damage <= 0) return null;
  return reaction;
}
