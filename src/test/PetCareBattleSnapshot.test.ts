import { describe, expect, it } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';

const pet = {
  companion_id: 'pet-1', companion_type: 'mini_kraken', name: 'Kraken',
  bonus: { stat: 'hp', pct: 0.1 }, sustain: { kind: 'regen_hp', pct: 0.05 },
  base_stats: { atk: 20, def: 10, hp: 100, mp: 30 },
  effective_stats: { atk: 20, def: 10, hp: 105, mp: 30 },
};
const care = {
  participation: 0.5, care_as_of: '2026-10-29T10:00:00Z',
  effective_bonus: { stat: 'hp', pct: 0.05 },
  effective_sustain: { kind: 'regen_hp', pct: 0.025 },
};
const battle = {
  id: 'fight-1', stage: 1, attempt: 0, kind: 'normal', status: 'won', replay: false,
  biome: 'forest', started_at: '2026-10-29T10:00:00Z', ends_at: '2026-10-29T10:00:15Z',
  hero_power: 40, hero_class: 'novato', enemy_power: 10, hero_max_hp: 105,
  enemy_max_hp: 30, hero_hp: 90, enemy_hp: 0, enemy_name: 'Lobo', enemy_icon: null,
  boss_id: null, events: [], pet: { ...pet, ...care },
};
const snapshot = {
  stage: 1, mode: 'progressing', advance_pending: false,
  next_at: '2026-10-29T10:15:00Z', server_now: '2026-10-29T10:00:15Z',
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss-1', name: 'Boss', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-29',
  battle, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0,
    retreats: 0, gold: 0, items: [], defeated: false, pending: false },
  limits: { interval_minutes: 15, reward_interval_minutes: 30, offline_hours: 24,
    gold_per_day: 120, items_per_day: 2 },
};
const parsePet = (value: unknown) => parseAdventureSnapshot({ ...snapshot,
  battle: { ...battle, pet: value },
} as Json).battle?.pet;

describe('frozen pet care in the adventure payload', () => {
  it.each([
    [0.5, 0.05, 0.025], [0.75, 0.075, 0.0375], [1, 0.1, 0.05],
    [0.625, 0.0625, 0.03125], [0, 0, 0],
  ])('retains participation %s and server effective values', (participation, bonusPct, sustainPct) => {
    const parsed = parsePet({ ...pet, ...care, participation,
      effective_bonus: { stat: 'hp', pct: bonusPct },
      effective_sustain: { kind: 'regen_hp', pct: sustainPct },
    });
    expect(parsed?.participation).toBe(participation);
    expect(parsed?.care_as_of).toBe(care.care_as_of);
    expect(parsed?.effective_bonus?.pct).toBe(bonusPct);
    expect(parsed?.effective_sustain?.pct).toBe(sustainPct);
    expect(parsed?.bonus.pct).toBe(0.1);
  });

  it('preserves a confirmed legacy pet without inventing care fields', () => {
    expect(parsePet(pet)).toEqual(pet);
    expect(parsePet({ ...pet, sustain: null, ...care, effective_sustain: null })?.effective_sustain).toBeNull();
  });

  it.each([
    { ...care, effective_bonus: undefined },
    { ...care, participation: null },
    { ...care, participation: 1.1 },
    { ...care, care_as_of: 'tomorrow' },
    { ...care, effective_bonus: { stat: 'atk', pct: 0.05 } },
    { ...care, effective_bonus: { stat: 'hp', pct: 0.11 } },
    { ...care, effective_sustain: null },
    { ...care, effective_sustain: { kind: 'regen_mp', pct: 0.025 } },
    { ...care, effective_sustain: { kind: 'regen_hp', pct: -0.01 } },
  ])('rejects malformed new care fields instead of showing nominal values', (broken) => {
    expect(() => parsePet({ ...pet, ...broken })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });
});
