import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';
import { AdventureScene } from '@/components/adventure/AdventureScene';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => reducedMotion.value,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const start = Date.parse('2026-10-29T12:00:00Z');
const at = (ms: number) => new Date(start + ms).toISOString();
const enemies = [
  { slot: 0, id: 'wolf', name: 'Lobo', icon: null, boss_id: null, max_hp: 100, hp: 91, max_mp: 20, mp: 20, resistances: {} },
  { slot: 1, id: 'boar', name: 'Javali', icon: null, boss_id: null, max_hp: 10, hp: 0, max_mp: 10, mp: 10, resistances: {} },
  { slot: 2, id: 'mage', name: 'Mago', icon: null, boss_id: null, max_hp: 80, hp: 70, max_mp: 20, mp: 20, resistances: {} },
];
const hits = [
  { target_slot: 0, damage: 9, raw_damage: 10, damage_multiplier: .9 },
  { target_slot: 1, damage: 10, raw_damage: 14, damage_multiplier: .72 },
  { target_slot: 2, damage: 10, raw_damage: 10, damage_multiplier: 1 },
];
const area = {
  at: at(200), actor: 'hero', actor_slot: null, target_slot: 0, target_slots: [0, 1, 2], hits,
  kind: 'skill', damage: 29, raw_damage: 34, damage_multiplier: 1, hero_hp: 100, hero_mp: 22,
  enemy_hp: 91, enemy_mp: 20, enemies_hp: [91, 0, 70], enemies_mp: [20, 10, 20],
  skill_id: 'm_fogo_var', skill_name: 'Meteoro', effect: 'fire', mp_cost: 8,
};
const enemyEvent = (ms: number, slot: number, hp: number) => ({
  at: at(ms), actor: 'enemy', actor_slot: slot, target_slot: null, kind: 'attack', damage: 4,
  hero_hp: hp, hero_mp: 22, enemy_hp: 91, enemy_mp: 20,
  enemies_hp: [91, 0, 70], enemies_mp: [20, 10, 20],
  skill_id: null, skill_name: null, effect: 'physical',
});
const battle = {
  id: 'area-battle', stage: 3, attempt: 0, kind: 'normal', status: 'fighting', replay: false,
  biome: 'forest', started_at: at(0), ends_at: at(5000), hero_power: 50, hero_class: 'mago', enemy_power: 30,
  hero_max_hp: 100, hero_hp: 88, hero_max_mp: 30, hero_mp: 22,
  enemy_max_hp: 100, enemy_hp: 91, enemy_max_mp: 20, enemy_mp: 20,
  enemy_name: 'Lobo', enemy_icon: null, boss_id: null, engine_version: 'v4_horde', enemies,
  events: [area, enemyEvent(300, 0, 96), enemyEvent(400, 2, 92), enemyEvent(500, 1, 88)],
};
const payload = {
  stage: 3, mode: 'progressing', advance_pending: false, next_at: at(5000), server_now: at(0),
  last_result: null, encounters: [], boss: { stage: 10, id: 'boss', name: 'Chefe', icon: null },
  boss_wins_credited: 0, gold_today: 0, loot_today: 0, reward_day: '2026-10-29',
  battle, last_battle: null,
  catchup: { battles: 0, from_stage: null, to_stage: null, wins: 0, defeats: 0, retreats: 0, gold: 0, items: [], defeated: false, pending: false },
  limits: { interval_minutes: .25, reward_interval_minutes: 30, offline_hours: 24, gold_per_day: 120, items_per_day: 2 },
};
const parse = (candidate: object = payload) => parseAdventureSnapshot(candidate as Json).battle!;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function render(serverMs: number, candidate: object = payload, paused = false) {
  if (!container) { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); }
  const frame = projectAdventureSceneFrame(parse(candidate), start + serverMs, 'fighting');
  act(() => root!.render(<AdventureScene stage={3} biome="floresta" heroClass="mago" heroName="Herói" enemyName="Lobo" isBoss={false} frame={frame} paused={paused} />));
  return { page: container, frame };
}
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = null; container = null; reducedMotion.value = false; });

describe('Mago em área no evento confirmado', () => {
  it('propaga um cast, MP uma vez, três impactos e dano específico inclusive no slot morto', () => {
    const { page, frame } = render(250);
    expect(frame.actions).toHaveLength(1);
    expect(frame.actions?.[0].hits?.map(hit => hit.damage)).toEqual([9, 10, 10]);
    expect(frame.heroMp).toBe(22);
    expect(page.querySelector('[aria-label="Mana de Herói: 22 de 30 MP"]')).not.toBeNull();
    expect(page.querySelector('[data-actor="hero"] .adventure-resource-mp .adventure-resource-numbers')?.textContent).toBe('22/30');
    expect(page.querySelector('[data-enemy-slot="0"] .adventure-resource-mp .adventure-resource-numbers')?.textContent).toBe('20/20');
    expect(page.querySelectorAll('.adventure-horde-resources .adventure-resource-mp .adventure-resource-unit')).toHaveLength(4);
    expect(page.querySelectorAll('[data-area-skill="m_fogo_var"]')).toHaveLength(1);
    expect(page.querySelectorAll('.vfx-mago-area__caster')).toHaveLength(1);
    expect([...page.querySelectorAll('[data-area-target-slot]')].map(node => node.getAttribute('data-area-target-slot'))).toEqual(['0', '1', '2']);
    expect(page.querySelector('[data-enemy-slot="1"]')?.getAttribute('data-dead')).toBe('true');
    expect(page.querySelector('[data-enemy-slot="0"] [aria-label="9 de dano neste alvo"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-slot="1"] [aria-label="10 de dano neste alvo"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-slot="2"] [aria-label="10 de dano neste alvo"]')).not.toBeNull();
    expect(page.querySelectorAll('.adventure-action-strip')).toHaveLength(1);
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('−8 MP');
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('3 alvos');
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('29 de dano');
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('Antes dos efeitos: 34 de dano');
  });

  it('mantém os quatro movimentos e ataques inimigos sobrepostos ao cast', () => {
    const surviving = { ...battle, enemies: enemies.map((enemy, slot) => slot === 1 ? { ...enemy, hp: 5, max_hp: 15 } : enemy),
      events: battle.events.map(event => ({ ...event, enemies_hp: [91, 5, 70] })) };
    const { page } = render(650, { ...payload, battle: surviving });
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(4);
    expect(page.querySelector('[data-actor="hero"] .adventure-horde-action.adventure-cast')).not.toBeNull();
    const actionIndexBySlot = [1, 3, 2];
    for (const slot of [0, 1, 2]) {
      expect(page.querySelector(`[data-enemy-slot="${slot}"] .adventure-horde-action`)).not.toBeNull();
      expect(page.querySelector(`[data-horde-action-id="area-battle-${actionIndexBySlot[slot]}"][data-actor-slot="${slot}"]`)).not.toBeNull();
    }
    expect(page.querySelectorAll('[data-hit-target="hero"]')).toHaveLength(3);
    expect(page.querySelectorAll('[data-area-target-slot]')).toHaveLength(3);
  });

  it('não exibe evento futuro nem repete VFX ao pausar ou receber evento tarde', () => {
    const { page } = render(100);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    render(650, payload, true);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    render(700);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    render(1800);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
  });

  it('consome ações vistas em movimento reduzido e não reexibe uma chegada atrasada', () => {
    reducedMotion.value = true;
    const { page } = render(650);
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    reducedMotion.value = false;
    render(700);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    render(1500);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
    act(() => root!.unmount()); root = createRoot(container!);
    render(2000);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(0);
  });

  it('desenha Nova Gélida e Tornado com impactos locais sem multiplicar cast', () => {
    for (const skillId of ['m_gelo_var', 'm_raio_var']) {
      const cast = { ...area, skill_id: skillId, skill_name: skillId === 'm_gelo_var' ? 'Nova Gélida' : 'Tornado' };
      const { page } = render(250, { ...payload, battle: { ...battle, events: [cast] } });
      expect(page.querySelectorAll(`[data-area-skill="${skillId}"] .vfx-mago-area__caster`)).toHaveLength(1);
      expect(page.querySelectorAll(`[data-area-skill="${skillId}"] .vfx-mago-area__impact`)).toHaveLength(3);
    }
  });

  it('limita a cena a dois impactos quando só dois alvos estão vivos', () => {
    const twoTargets = { ...area, target_slots: [0, 2], hits: [hits[0], hits[2]], damage: 19,
      enemies_hp: [91, 0, 70] };
    const { page } = render(250, { ...payload, battle: { ...battle, events: [twoTargets] } });
    expect([...page.querySelectorAll('[data-area-target-slot]')].map(node => node.getAttribute('data-area-target-slot'))).toEqual(['0', '2']);
    expect(page.querySelector('[data-enemy-slot="1"] [aria-label$="de dano neste alvo"]')).toBeNull();
  });

  it('usa apenas o pet congelado da batalha ao lado do herói', () => {
    const pet = { companion_id: 'pet-1', companion_type: 'dog', name: 'Pingo',
      bonus: { stat: 'atk', pct: .1 }, sustain: null,
      base_stats: { atk: 1, def: 1, hp: 1, mp: 1 }, effective_stats: { atk: 2, def: 1, hp: 1, mp: 1 } };
    const { page, frame } = render(250, { ...payload, battle: { ...battle, pet } });
    expect(frame.pet?.companion_id).toBe('pet-1');
    const companion = page.querySelector('[data-actor="hero"] .adventure-pet-companion[data-pet-type="dog"]');
    expect(companion).not.toBeNull();
    expect(companion?.parentElement?.classList.contains('adventure-horde-hero-visual')).toBe(true);
    expect(companion?.previousElementSibling?.classList.contains('adventure-sprite-track')).toBe(true);
    render(650, { ...payload, battle: { ...battle, pet } });
    expect(page.querySelector('[data-actor="hero"] .adventure-pet-companion')).toBe(companion);
    render(250, { ...payload, battle: { ...battle, pet: null } });
    expect(page.querySelector('.adventure-pet-companion')).toBeNull();
    const legacyBattle = { ...battle, engine_version: 'v3', enemies: undefined, pet,
      events: [{ ...area, target_slots: undefined, hits: undefined, actor_slot: undefined,
        target_slot: undefined, enemies_hp: undefined, enemies_mp: undefined }] };
    render(250, { ...payload, battle: legacyBattle });
    expect(page.querySelector('.adventure-fighter-hero .adventure-pet-companion[data-pet-type="dog"]')).not.toBeNull();
  });

  it('rejeita slots/hits malformados e preserva v4 antigo sem arrays', () => {
    const invalid = (patch: object) => () => parse({ ...payload, battle: { ...battle, events: [{ ...area, ...patch }] } });
    expect(invalid({ target_slots: [0, 0, 2] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ target_slots: [0, 2] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ target_slots: [0, 1, 3] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hits: [...hits.slice(0, 2), { ...hits[2], damage: 11 }] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hits: [...hits.slice(0, 2), { ...hits[2], target_slot: 1 }] })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ target_slot: 2 })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hits: null })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hero_hp: 101 })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hero_mp: 31 })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ at: at(6000) })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(invalid({ hits: [{ ...hits[0], damage: 101 }, hits[1], hits[2]], damage: 121 })).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
    expect(parse({ ...payload, battle: { ...battle, events: [{ ...area, target_slots: undefined, hits: undefined }] } }).events[0].hits).toBeUndefined();
    expect(parse({ ...payload, battle: { ...battle, events: [{ ...area,
      target_slots: [0, 2], hits: [hits[0], hits[2]], damage: 19 }] } }).events[0].target_slots).toEqual([0, 2]);
  });

  it('aceita suporte vazio e chefe de slot único sem criar impacto em outro alvo', () => {
    const support = { ...area, target_slot: null, target_slots: [], hits: [], damage: 0, kind: 'skill', skill_id: 'm_estouro', skill_name: 'Estouro', enemy_hp: 100, enemies_hp: [100, 10, 80] };
    expect(parse({ ...payload, battle: { ...battle, events: [support] } }).events[0].hits).toEqual([]);
    const debuff = { ...support, target_slot: 1, target_slots: [1], hits: [{ target_slot: 1, damage: 0, raw_damage: 0, damage_multiplier: 1 }],
      skill_type: 'debuff', effect_note: 'vulnerable' };
    expect(parse({ ...payload, battle: { ...battle, events: [debuff] } }).events[0].target_slots).toEqual([1]);
    const boss = { ...enemies[0], id: 'boss', boss_id: 'boss', hp: 91 };
    const bossBattle = { ...battle, kind: 'boss', boss_id: 'boss', enemies: [boss], events: [{ ...area,
      target_slot: 0, target_slots: [0], hits: [hits[0]], damage: 9, enemy_hp: 91, enemies_hp: [91], enemies_mp: [20] }] };
    const { page } = render(250, { ...payload, battle: bossBattle });
    expect(page.querySelectorAll('[data-area-target-slot]')).toHaveLength(1);
    expect(page.querySelector('[data-horde-action-id="area-battle-0"][data-target-slot="0"]')).not.toBeNull();
  });
});
