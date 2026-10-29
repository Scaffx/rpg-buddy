import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Json } from '@/integrations/supabase/types';
import { parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';
import { AdventureScene } from '@/components/adventure/AdventureScene';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fixtureNames = ['meteor', 'nova', 'tornado', 'single', 'two-survivors', 'boss', 'horde', 'control'] as const;

function fixture(name: typeof fixtureNames[number]) {
  const raw = JSON.parse(readFileSync(`docs/qa/mage-area/${name}.json`, 'utf8')) as Json;
  return parseAdventureSnapshot(raw);
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
function renderEvent(name: typeof fixtureNames[number], eventIndex: number, elapsedMs = 0) {
  const battle = fixture(name).battle!;
  const frame = projectAdventureSceneFrame(battle, Date.parse(battle.events[eventIndex].at) + elapsedMs, 'fighting');
  container ??= document.createElement('div');
  if (!container.isConnected) document.body.appendChild(container);
  root ??= createRoot(container);
  act(() => root!.render(<AdventureScene stage={battle.stage} biome="floresta" heroClass="mago"
    heroName="Herói" enemyName={battle.enemy_name} isBoss={battle.kind === 'boss'} frame={frame} paused={false} />));
  return container;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('PG17 mage area fixtures through the actual snapshot consumer', () => {
  it.each(fixtureNames)('%s: reveals only confirmed event HP, MP, hits and targets', name => {
    const snapshot = fixture(name);
    const battle = snapshot.battle;
    expect(battle?.engine_version).toBe('v4_horde');
    expect(battle?.enemies?.length).toBe(battle?.kind === 'boss' ? 1 : 3);
    if (!battle?.enemies) throw new Error('Fixture has no v4 battle');

    const before = projectAdventureSceneFrame(battle, Date.parse(battle.events[0].at) - 1, 'fighting');
    expect(before.action).toBeNull();
    expect(before.heroHp).toBe(battle.hero_max_hp);
    expect(before.heroMp).toBe(battle.hero_max_mp);
    expect(before.enemies?.map(enemy => enemy.hp)).toEqual(battle.enemies.map(enemy => enemy.max_hp));

    for (const [index, event] of battle.events.entries()) {
      const frame = projectAdventureSceneFrame(battle, Date.parse(event.at), 'fighting');
      expect(frame.action?.id).toBe(`${battle.id}-${index}`);
      expect(frame.heroHp).toBe(event.hero_hp);
      expect(frame.heroMp).toBe(event.hero_mp);
      expect(frame.enemies?.map(enemy => enemy.hp)).toEqual(event.enemies_hp);
      expect(frame.enemies?.map(enemy => enemy.mp)).toEqual(event.enemies_mp);
      if (event.actor === 'hero' && event.target_slots) {
        expect(frame.action?.targetSlots).toEqual(event.target_slots);
        expect(frame.action?.hits?.map(hit => hit.target_slot)).toEqual(event.target_slots);
        expect(frame.action?.hits?.reduce((sum, hit) => sum + hit.damage, 0)).toBe(event.damage);
      }
    }
  });

  it('keeps the documented alias encounter identical and distinguishes AoE, two survivors, singular and control', () => {
    const meteor = fixture('meteor').battle!;
    expect(fixture('horde').battle?.id).toBe(meteor.id);
    expect(fixture('two-survivors').battle?.id).toBe(meteor.id);
    expect(meteor.events[2].target_slots).toEqual([0, 1, 2]);
    expect(meteor.events[4].target_slots).toEqual([1, 2]);
    expect(fixture('nova').battle?.events[2].skill_id).toBe('m_gelo_var');
    expect(fixture('tornado').battle?.events[2].skill_id).toBe('m_raio_var');
    expect(fixture('single').battle?.events[2].target_slots).toEqual([0]);
    expect(fixture('boss').battle?.enemies).toHaveLength(1);
    const control = fixture('control').battle!.events.find(event => event.skill_id === 'test_control')!;
    expect(control.skill_type).toBe('cc');
    expect(control.hits).toEqual([{ target_slot: 0, damage: 0, raw_damage: 0, damage_multiplier: 1 }]);
  });

  it('renders actual Meteor and two-survivor Nova as one cast with per-target damage', () => {
    const meteor = renderEvent('meteor', 2);
    expect(meteor.querySelectorAll('[data-area-skill="m_fogo_var"] .vfx-mago-area__caster')).toHaveLength(1);
    expect([...meteor.querySelectorAll('[data-area-target-slot]')].map(node => node.getAttribute('data-area-target-slot'))).toEqual(['0', '1', '2']);
    for (const [slot, damage] of [[0, 34], [1, 6], [2, 6]])
      expect(meteor.querySelector(`[data-enemy-slot="${slot}"] [aria-label="${damage} de dano neste alvo"]`)).not.toBeNull();

    const nova = renderEvent('two-survivors', 4);
    expect(nova.querySelectorAll('[data-area-skill="m_gelo_var"] .vfx-mago-area__caster')).toHaveLength(1);
    expect([...nova.querySelectorAll('[data-area-target-slot]')].map(node => node.getAttribute('data-area-target-slot'))).toEqual(['1', '2']);
    expect(nova.querySelector('[data-enemy-slot="0"]')?.getAttribute('data-dead')).toBe('true');
    expect(nova.querySelector('[data-enemy-slot="0"] [aria-label$="de dano neste alvo"]')).toBeNull();
  });

  it('renders the actual zero-damage control target without a damage number', () => {
    const control = renderEvent('control', 2);
    expect(control.querySelector('[data-horde-action-id]')).not.toBeNull();
    expect(control.querySelector('[data-enemy-slot="0"] [aria-label="0 de dano neste alvo"]')).toBeNull();
  });

  it('preserves the confirmed event age when a still-active AoE scene remounts', () => {
    const battle = fixture('meteor').battle!;
    const selector = `[data-horde-action-id="${battle.id}-2"]`;
    const page = renderEvent('meteor', 2, 600);
    expect((page.querySelector(selector) as HTMLElement)?.style.getPropertyValue('--horde-elapsed')).toBe('-600ms');
    act(() => root!.unmount());
    root = createRoot(container!);
    renderEvent('meteor', 2, 600);
    expect((page.querySelector(selector) as HTMLElement)?.style.getPropertyValue('--horde-elapsed')).toBe('-600ms');
  });

});
