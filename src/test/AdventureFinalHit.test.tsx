import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot, type AdventureBattle } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';
import { AdventureScene, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => motion.reduced,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = JSON.parse(readFileSync('docs/qa/mage-area/tornado.json', 'utf8')) as Json;
const tornado = parseAdventureSnapshot(fixture).battle!;
const finalEvent = tornado.events.at(-1)!;
const finalAt = Date.parse(finalEvent.at);
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(frame: AdventureSceneFrame, paused = false) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(<AdventureScene stage={1} biome="floresta" heroClass="mago"
    heroName="Mago" enemyName="Lobo da mata" isBoss={false} frame={frame} paused={paused} />));
  return container;
}

function frameAt(battle: AdventureBattle, ageMs: number, status: AdventureSceneFrame['status']) {
  return projectAdventureSceneFrame(battle, finalAt + ageMs, status);
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  motion.reduced = false;
});

describe('confirmed final action in a horde scene', () => {
  it('finishes Tornado at its real age after victory without reviving or reattacking enemies', () => {
    const frame = frameAt(tornado, 800, 'victory');
    expect(frame.action?.skillName).toBe('Tornado');
    expect(frame.actions).toHaveLength(2);
    expect(frame.actionElapsedMs).toBe(800);

    const page = render(frame);
    const effect = page.querySelector(`[data-horde-action-id="${tornado.id}-2"]`);
    expect(effect).not.toBeNull();
    expect((effect as HTMLElement).style.getPropertyValue('--horde-elapsed')).toBe('-800ms');
    expect(page.querySelector('[data-area-skill="m_raio_var"]')).not.toBeNull();
    expect(page.querySelectorAll('[data-area-target-slot]')).toHaveLength(3);
    for (const slot of [0, 1, 2]) expect(page.querySelector(`[data-enemy-slot="${slot}"] [aria-label="34 de dano neste alvo"]`)).not.toBeNull();
    expect(page.querySelector('[data-actor="hero"] .adventure-horde-action')?.getAttribute('style')).toContain('-800ms');
    expect(page.querySelectorAll('[data-dead="true"]')).toHaveLength(3);
    expect(page.querySelectorAll('[data-actor="enemy"] .adventure-horde-action')).toHaveLength(0);
    expect([...page.querySelectorAll('[data-dead="true"] .adventure-sprite-track')].every(node => (node as HTMLElement).style.animation === 'none')).toBe(true);
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('Tornado');
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('102 de dano');
    expect(page.querySelector('.adventure-transition-banner')?.textContent).toBe('Vitória');
    expect(page.querySelector('[aria-label="Mago: 356 de 358 HP"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Mana de Mago: 208 de 216 MP"]')).not.toBeNull();
  });

  it('expires the final effect and readout at 1200 ms without another hit', () => {
    const page = render(frameAt(tornado, 800, 'victory'));
    expect(page.querySelector('[data-horde-action-id]')).not.toBeNull();
    const expired = frameAt(tornado, 1201, 'victory');
    expect(expired.actions).toHaveLength(1); // projector keeps it briefly; Scene owns the shorter visual window.
    render(expired);
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    expect(page.querySelector('.adventure-horde-action')).toBeNull();
    expect(page.querySelector('.adventure-action-strip')).toBeNull();
    expect(page.querySelectorAll('[data-dead="true"]')).toHaveLength(3);
    expect(page.querySelector('.adventure-transition-banner')?.textContent).toBe('Vitória');
  });

  it('does not move an enemy from its earlier attack after the winning hit', () => {
    const frame = frameAt(tornado, 500, 'victory');
    expect(frame.actions).toHaveLength(3);
    const page = render(frame);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(1);
    expect(page.querySelector(`[data-horde-action-id="${tornado.id}-2"]`)).not.toBeNull();
    expect(page.querySelectorAll('[data-actor="enemy"] .adventure-horde-action')).toHaveLength(0);
  });

  it.each(['defeated', 'draw'] as const)('shows only the confirmed enemy final blow on %s', status => {
    const lastEnemy = { ...tornado.events[1], at: finalEvent.at, hero_hp: status === 'defeated' ? 0 : 355 };
    const battle: AdventureBattle = { ...tornado, id: `last-enemy-${status}`, status, events: [tornado.events[0], lastEnemy] };
    const frame = frameAt(battle, 800, status);
    const page = render(frame);
    expect(frame.actions).toHaveLength(1);
    expect(page.querySelector(`[data-horde-action-id="${battle.id}-1"][data-actor="enemy"]`)).not.toBeNull();
    expect(page.querySelectorAll('[data-actor="hero"] .adventure-horde-action')).toHaveLength(0);
    expect(page.querySelector('[data-area-skill]')).toBeNull();
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('Ataque básico de');
    expect(page.querySelector('[data-actor="hero"] [data-hit-target="hero"]')).not.toBeNull();
    expect(page.querySelectorAll('[data-dead="true"]')).toHaveLength(0);
    expect(page.querySelector('[data-actor="hero"] .adventure-defeated') !== null).toBe(status === 'defeated');
    if (status === 'defeated') expect((page.querySelector('[data-actor="hero"] .adventure-sprite-track') as HTMLElement).style.animation).toBe('none');
  });

  it('does not invent a future final action from terminal status', () => {
    const frame = projectAdventureSceneFrame(tornado, finalAt - 1, 'victory');
    const page = render(frame);
    expect(frame.action?.skillName).not.toBe('Tornado');
    expect(page.querySelector('[data-area-skill="m_raio_var"]')).toBeNull();
    expect(page.querySelectorAll('[data-dead="true"]')).toHaveLength(0);
  });

  it('does not replay a terminal action after pause, reduced motion, or transition', () => {
    const frame = frameAt(tornado, 800, 'victory');
    const page = render(frame, true);
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    render(frame);
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();

    const newRoot = { ...tornado, id: 'reduced-terminal' };
    motion.reduced = true;
    render(frameAt(newRoot, 800, 'victory'));
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    motion.reduced = false;
    render(frameAt(newRoot, 800, 'victory'));
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();

    render(frameAt({ ...tornado, id: 'transition-gate' }, 800, 'transition'));
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    expect(page.querySelector('.adventure-action-strip')).toBeNull();
  });
});

describe('confirmed mana potion event', () => {
  function potionPayload() {
    const candidate = JSON.parse(JSON.stringify(fixture)) as { battle: AdventureBattle };
    candidate.battle = { ...tornado, id: 'potion-battle', events: [{
      ...finalEvent, actor: 'hero', kind: 'skill', skill_id: 'consumable.mp', skill_name: 'Poção de Mana',
      skill_type: 'heal', effect: 'arcane', actor_slot: null, target_slot: null,
      target_slots: [], hits: [], damage: 0, raw_damage: 0, healing: 0, mp_cost: 0,
      hero_mp: 208, mp_restored: 20, enemy_hp: 102, enemies_hp: [34, 34, 34],
    }] };
    return candidate;
  }

  it('parses and projects effective MP restoration without invented damage or HP healing', () => {
    const parsed = parseAdventureSnapshot(potionPayload() as unknown as Json).battle!;
    expect(parsed.events[0].mp_restored).toBe(20);
    const frame = frameAt(parsed, 100, 'fighting');
    expect(frame.action?.mpRestored).toBe(20);
    expect(frame.heroMp).toBe(208);
    const page = render(frame);
    const readout = page.querySelector('.adventure-action-strip')?.textContent ?? '';
    expect(readout).toContain('Poção de Mana');
    expect(readout).toContain('+20 MP');
    expect(readout).not.toContain('de dano');
    expect(readout).not.toContain('HP curado');
    expect(readout).not.toContain('−0 MP');
    expect(readout).not.toContain('Cura');
    expect(page.querySelector('.adventure-effect-self-support')).not.toBeNull();
    expect(page.querySelector('.adventure-projectile')).toBeNull();
  });

  it('keeps HP potion snapshots without mp_restored compatible', () => {
    const candidate = potionPayload();
    const event = candidate.battle.events[0];
    event.skill_id = 'consumable.hp';
    event.skill_name = 'Poção de Vida';
    event.healing = 12;
    delete event.mp_restored;
    const parsed = parseAdventureSnapshot(candidate as unknown as Json).battle!;
    const frame = frameAt(parsed, 100, 'fighting');
    expect(frame.action?.mpRestored).toBeUndefined();
    expect(render(frame).querySelector('.adventure-action-strip')?.textContent).toContain('+12 HP curado');
  });

  it.each([0, -1, 1.5, null, '20', 500])('rejects invalid mp_restored %s', value => {
    const candidate = potionPayload() as unknown as { battle: { events: Array<Record<string, Json>> } };
    candidate.battle.events[0].mp_restored = value;
    expect(() => parseAdventureSnapshot(candidate as unknown as Json)).toThrow('AUTO_ADVENTURE_INVALID_RESPONSE');
  });
});
