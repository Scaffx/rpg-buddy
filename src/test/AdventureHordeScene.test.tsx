import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdventureScene, HordeConsumedActions, type AdventureSceneFrame, type AdventureSceneTimedAction } from '@/components/adventure/AdventureScene';
import type { HordeEnemy } from '@/lib/adventureHordeContract';
import type { AdventureBattle } from '@/lib/autoAdventurePayload';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';
import type { AdventureBiome, AdventureHeroClass } from '@/lib/adventureVisuals';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => motionPreference.reduced,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const enemies: HordeEnemy[] = [0, 1, 2].map(slot => ({
  slot, id: `creature-${slot}`, name: `Criatura ${slot + 1}`, icon: null, boss_id: null,
  max_hp: 40 + slot * 10, hp: 40 + slot * 10, max_mp: 12, mp: 12 - slot,
  resistances: {},
}));

const heroHit: AdventureSceneTimedAction = {
  id: 'battle-1-event-0', actor: 'hero', targetSlot: 2, kind: 'skill', skillName: 'Fogo',
  damage: 7, effect: 'fire', elapsedMs: 800,
};
const enemyHit0: AdventureSceneTimedAction = {
  id: 'battle-1-event-1', actor: 'enemy', actorSlot: 0, targetSlot: null,
  kind: 'attack', damage: 3, elapsedMs: 700,
};
const enemyHit1: AdventureSceneTimedAction = {
  id: 'battle-1-event-2', actor: 'enemy', actorSlot: 1, targetSlot: null,
  kind: 'skill', skillName: 'Rajada', damage: 4, elapsedMs: 500,
};

function render(frame: AdventureSceneFrame, paused = false, biome: AdventureBiome = 'floresta', isBoss = false, heroClass: AdventureHeroClass = 'mago') {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(<AdventureScene stage={3} biome={biome} heroClass={heroClass} heroName="Heroína"
    enemyName="Criatura 1" isBoss={isBoss} frame={frame} paused={paused} />));
  return container;
}

function baseFrame(): AdventureSceneFrame {
  return { status: 'fighting', heroHp: 32, heroMaxHp: 50, heroMp: 15, heroMaxMp: 20,
    enemies, action: heroHit, actions: [heroHit], animateAction: true, actionElapsedMs: heroHit.elapsedMs };
}

// jsdom exposes the matched CSS declarations but does not expand var() in computed positions.
function resolvedCssValue(element: Element, property: string): string {
  const style = getComputedStyle(element);
  let value = style.getPropertyValue(property).trim();
  for (let depth = 0; depth < 5 && value.includes('var('); depth++) {
    value = value.replace(/var\((--[\w-]+)\)/g, (_match, variable: string) => style.getPropertyValue(variable).trim());
  }
  return value;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  motionPreference.reduced = false;
});

describe('AdventureScene horda v4', () => {
  it('shows exactly three identified creatures with their own confirmed HP/MP and five realm support', () => {
    for (const biome of ['floresta', 'deserto', 'aquatico', 'gelo', 'vulcanico'] as const) {
      const frame = baseFrame();
      frame.enemies = enemies.map(enemy => enemy.slot === 1 ? { ...enemy, hp: 9, mp: 4 } : enemy);
      const page = render(frame, false, biome);
      expect(page.querySelectorAll('[data-enemy-slot]')).toHaveLength(3);
      expect(page.querySelector('[data-enemy-slot="1"]')?.getAttribute('data-enemy-id')).toBe('creature-1');
      expect(page.querySelector('[data-enemy-slot="1"] [aria-label="Criatura 2: 9 de 50 HP"]')).not.toBeNull();
      expect(page.querySelector('[data-enemy-slot="1"] [aria-label="Mana de Criatura 2: 4 de 12 MP"]')).not.toBeNull();
      expect(page.querySelector('[aria-label="Heroína: 32 de 50 HP"]')).not.toBeNull();
      expect(page.querySelector('.adventure-horde')).not.toBeNull();
      expect(page.querySelector(`.adventure-biome-${biome}`)).not.toBeNull();
    }
  });

  it('places all four resource readouts over actors on one lateral ground plane', () => {
    const page = render(baseFrame());
    expect(page.querySelectorAll('.adventure-horde-fighters .adventure-horde-actor')).toHaveLength(4);
    expect(page.querySelector('.adventure-horde-card')).toBeNull();
    expect(page.querySelectorAll('.adventure-horde > .adventure-scenery')).toHaveLength(1);
    for (const actor of page.querySelectorAll('.adventure-horde-actor')) {
      expect(actor.querySelector('.adventure-horde-resources')).not.toBeNull();
      expect(actor.querySelector('.adventure-sprite-track')).not.toBeNull();
    }
    const css = readFileSync('src/components/adventure/adventureScene.css', 'utf8');
    expect(css).toMatch(/\.adventure-horde-fighters\s*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    expect(css).not.toMatch(/\.adventure-horde-card\s*\{/);
    expect(css).toMatch(/@media \(max-width:600px\)\s*\{[\s\S]*?\.adventure-horde-fighters\s*\{[^}]*inset:28% 1% 7%/);
  });

  it('routes overlapping actions and damage to the two attackers, hero and exact target slot', () => {
    const frame = { ...baseFrame(), action: enemyHit1, actions: [heroHit, enemyHit0, enemyHit1] };
    const page = render(frame);
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(3);
    expect(page.querySelectorAll('.adventure-horde-hero [data-hit-target="hero"]')).toHaveLength(2);
    expect(page.querySelector('[data-enemy-slot="2"] [data-hit-id="battle-1-event-0"]')).not.toBeNull();
    expect(page.querySelector('[data-enemy-slot="0"] [data-hit-target]')).toBeNull();
    expect(page.querySelector('[data-enemy-slot="1"] [data-hit-target]')).toBeNull();
    expect(page.querySelector('[data-enemy-slot="0"] .adventure-horde-action')).not.toBeNull();
    expect(page.querySelector('[data-enemy-slot="1"] .adventure-horde-action')).not.toBeNull();
    expect(page.querySelector('.adventure-horde-hero .adventure-horde-action')).not.toBeNull();
  });

  it('routes cleric light and judgement to each confirmed slot, and self healing to the hero in horde and boss', () => {
    const styleElements = ['src/components/adventure/adventureScene.css', 'src/components/adventure/skills/clerico.css']
      .map(path => {
        const style = document.createElement('style');
        style.textContent = readFileSync(path, 'utf8');
        document.head.appendChild(style);
        return style;
      });
    try {
      for (const skillId of ['n_luz', 'n_sag_var'] as const) {
        for (const slot of [0, 1, 2] as const) {
          const action = { ...heroHit, id: `cleric-${skillId}-${slot}`, skillId, targetSlot: slot };
          const page = render({ ...baseFrame(), action, actions: [action] }, false, 'floresta', false, 'clerico');
          const event = page.querySelector(`[data-horde-action-id="${action.id}"]`)!;
          const effect = event.querySelector(`[data-skill-id="${skillId}"]`)!;
          const target = effect.querySelector('.vfx-clerico__target')!;
          expect(event.getAttribute('data-target-slot')).toBe(String(slot));
          expect(resolvedCssValue(effect, '--skill-source-x')).toBe('13%');
          expect(resolvedCssValue(target, 'left')).toBe(['38%', '63%', '87%'][slot]);
          if (skillId === 'n_luz') {
            expect(resolvedCssValue(effect.querySelector('.vfx-clerico__source')!, 'left')).toBe('13%');
            expect(resolvedCssValue(effect.querySelector('.vfx-clerico__light-route')!, 'left')).toBe('13%');
          }
        }
      }

      for (const boss of [false, true]) {
        const action = { ...heroHit, id: `cleric-heal-${boss}`, skillId: 'n_cura', targetSlot: null,
          damage: 0, healing: 6, skillType: 'heal' as const };
        const activeEnemies = boss ? [{ ...enemies[0], boss_id: '00000000-0000-0000-0000-000000000001' }] : enemies;
        const page = render({ ...baseFrame(), enemies: activeEnemies, action, actions: [action] }, false, 'floresta', boss, 'clerico');
        const effect = page.querySelector(`[data-horde-action-id="${action.id}"] [data-skill-id="n_cura"]`)!;
        expect(effect.getAttribute('data-target')).toBe('self');
        expect(resolvedCssValue(effect.querySelector('.vfx-clerico__heal')!, 'left')).toBe(boss ? '25%' : '13%');
      }

      const legacyAction = { ...heroHit, id: 'cleric-legacy', skillId: 'n_luz', targetSlot: 0 };
      const legacy = render({ ...baseFrame(), enemies: undefined, action: legacyAction, actions: undefined }, false, 'floresta', false, 'clerico');
      const legacyEffect = legacy.querySelector('.vfx-clerico')!;
      expect(legacy.querySelector('.adventure-horde')).toBeNull();
      expect(resolvedCssValue(legacyEffect.querySelector('.vfx-clerico__source')!, 'left')).toBe('25%');
      expect(resolvedCssValue(legacyEffect.querySelector('.vfx-clerico__target')!, 'left')).toBe('75%');
    } finally {
      styleElements.forEach(style => style.remove());
    }
  });

  it('uses only supplied HP to mark a death and does not infer a kill from an action', () => {
    const page = render(baseFrame());
    expect(page.querySelector('[data-enemy-slot="2"]')?.getAttribute('data-dead')).toBe('false');
    render({ ...baseFrame(), enemies: enemies.map(enemy => enemy.slot === 2 ? { ...enemy, hp: 0 } : enemy) });
    expect(page.querySelector('[data-enemy-slot="2"]')?.getAttribute('data-dead')).toBe('true');
    expect(page.querySelector('[data-enemy-slot="0"]')?.getAttribute('data-dead')).toBe('false');
  });

  it('does not guess missing actors or targets and keeps an enemy self cast off the hero', () => {
    const unknownActor = { ...enemyHit0, id: 'unknown-actor', actorSlot: 9 };
    const unknownTarget = { ...heroHit, id: 'unknown-target', targetSlot: 9 };
    const selfCast = { ...enemyHit1, id: 'self-cast', actorSlot: 1, targetSlot: 1, damage: 0 };
    const page = render({ ...baseFrame(), action: selfCast, actions: [unknownActor, unknownTarget, selfCast] });
    expect(page.querySelectorAll('[data-horde-action-id]')).toHaveLength(1);
    expect(page.querySelector('[data-horde-action-id="self-cast"]')).not.toBeNull();
    expect(page.querySelector('.adventure-horde-hero [data-hit-target]')).toBeNull();
    expect(page.querySelector('[data-enemy-slot="1"] [data-hit-target]')).toBeNull();
  });

  it('consumes stale, paused and reduced-motion events without replay; keeps current resources readable', () => {
    const page = render({ ...baseFrame(), actions: [{ ...heroHit, elapsedMs: 1300 }] });
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    render(baseFrame());
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    const pausedAction = { ...heroHit, id: 'paused', elapsedMs: 100 };
    render({ ...baseFrame(), action: pausedAction, actions: [pausedAction] }, true);
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    render({ ...baseFrame(), action: pausedAction, actions: [pausedAction] });
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    motionPreference.reduced = true;
    const reducedAction = { ...heroHit, id: 'reduced' };
    render({ ...baseFrame(), action: reducedAction, actions: [reducedAction] });
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    motionPreference.reduced = false;
    render({ ...baseFrame(), action: reducedAction, actions: [reducedAction] });
    expect(page.querySelector('[data-horde-action-id]')).toBeNull();
    const fresh = { ...heroHit, id: 'fresh' };
    render({ ...baseFrame(), action: fresh, actions: [fresh] });
    expect(page.querySelector('[data-horde-action-id="fresh"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Heroína: 32 de 50 HP"]')).not.toBeNull();
  });

  it('keeps consumption bounded during a long battle and does not replay an old event', () => {
    const consumed = new HordeConsumedActions();
    for (let index = 0; index < 500; index++) {
      consumed.observe([{ ...heroHit, id: `battle-1-event-${index}`, elapsedMs: 1300 }], false);
    }
    expect(consumed.retainedIdCount).toBe(0);
    expect(consumed.trackedBattles).toBe(1);
    expect(consumed.has('battle-1-event-0')).toBe(true);
    expect(consumed.has('battle-1-event-499')).toBe(true);
    expect(consumed.has('battle-1-event-500')).toBe(false);
    consumed.observe([{ ...heroHit, id: 'battle-1-event-500', elapsedMs: 800 }], false);
    expect(consumed.has('battle-1-event-0')).toBe(true);
    consumed.observe([{ ...heroHit, id: 'battle-2-event-0', elapsedMs: 800 }], false);
    expect(consumed.has('battle-2-event-0')).toBe(false);
    expect(consumed.has('battle-1-event-0')).toBe(true);
    for (let battle = 3; battle <= 40; battle++) {
      consumed.observe([{ ...heroHit, id: `battle-${battle}-event-0`, elapsedMs: 1300 }], false);
    }
    expect(consumed.trackedBattles).toBe(8);
  });

  it('starts received VFX at its actual age and retains particle offsets', () => {
    const page = render(baseFrame());
    expect((page.querySelector('[data-horde-action-id="battle-1-event-0"]') as HTMLElement).style.getPropertyValue('--horde-elapsed')).toBe('-800ms');
    expect((page.querySelector('.adventure-horde-hero .adventure-horde-action') as HTMLElement).style.animationDelay).toBe('-800ms');
    expect((page.querySelector('.adventure-horde-hero .adventure-horde-action') as HTMLElement).style.getPropertyValue('--horde-action-elapsed')).toBe('-800ms');
    const later = { ...heroHit, elapsedMs: 1000 };
    render({ ...baseFrame(), action: later, actions: [later], actionElapsedMs: 1000 });
    expect((page.querySelector('[data-horde-action-id="battle-1-event-0"]') as HTMLElement).style.getPropertyValue('--horde-elapsed')).toBe('-800ms');
    expect((page.querySelector('.adventure-horde-hero .adventure-horde-action') as HTMLElement).style.animationDelay).toBe('-800ms');
    const next = { ...heroHit, id: 'battle-1-event-1', elapsedMs: 100 };
    render({ ...baseFrame(), action: next, actions: [next], actionElapsedMs: 100 });
    expect((page.querySelector('[data-horde-action-id="battle-1-event-1"]') as HTMLElement).style.getPropertyValue('--horde-elapsed')).toBe('-100ms');
    expect((page.querySelector('.adventure-horde-hero .adventure-horde-action') as HTMLElement).style.animationDelay).toBe('-100ms');
    const css = readFileSync('src/components/adventure/adventureScene.css', 'utf8');
    expect(css).toMatch(/\.adventure-horde-action > \.adventure-damage-shell :is\(\*, \*::before, \*::after\)\s*\{\s*animation-delay:var\(--horde-action-elapsed\) !important/);
    expect(css).toMatch(/\.adventure-horde-event-layer :is\(\*, \*::before, \*::after\)\s*\{\s*animation-delay:calc\(var\(--horde-elapsed\) \+ var\(--horde-phase, 0ms\)\) !important/);
    expect(css).toMatch(/\.adventure-horde-event-layer \.vfx-aprendiz__ember--two,[\s\S]*?--horde-phase:55ms/);
    expect(css).toMatch(/\.adventure-horde-event-layer \.vfx-arqueiro__rain > span:nth-child\(5\)\s*\{ --horde-phase:140ms/);
  });

  it('uses continuous copy and slot resources for a one-enemy v4 boss; keeps no-list legacy copy', () => {
    const vulnerable = { ...heroHit, effectNote: 'vulnerable' };
    const boss = { ...enemies[0], boss_id: '00000000-0000-0000-0000-000000000001', name: 'Boss 1', hp: 95, max_hp: 150 };
    const page = render({ ...baseFrame(), enemies: [boss], action: vulnerable, actions: [vulnerable] }, false, 'floresta', true);
    expect(page.querySelector('.adventure-horde')).not.toBeNull();
    expect(page.querySelector('[data-enemy-count="1"] [data-enemy-slot="0"] [aria-label="Boss 1: 95 de 150 HP"]')).not.toBeNull();
    expect(page.textContent).toContain('Alvo vulnerável temporariamente');
    expect(page.textContent).not.toContain('turnos');
    expect(page.querySelector('.adventure-boss-badge')).not.toBeNull();
    render({ ...baseFrame(), enemies: undefined, action: vulnerable, actions: undefined });
    expect(page.querySelector('.adventure-horde')).toBeNull();
    expect(page.textContent).toContain('Alvo recebe mais dano por 2 turnos');
  });

  it('renders the confirmed actors from both real PG17 battle fixtures', () => {
    for (const name of ['horde', 'boss'] as const) {
      const battle = JSON.parse(readFileSync(`docs/qa/hordes/${name}.json`, 'utf8')) as AdventureBattle;
      const first = battle.events[0];
      const frame = projectAdventureSceneFrame(battle, Date.parse(first.at), 'fighting');
      const page = render(frame, false, 'floresta', name === 'boss');
      expect(page.querySelectorAll('.adventure-horde-fighters [data-enemy-slot]')).toHaveLength(name === 'boss' ? 1 : 3);
      expect(page.querySelector(`[data-enemy-slot="0"] [aria-label="${battle.enemies![0].name}: ${first.enemies_hp![0]} de ${battle.enemies![0].max_hp} HP"]`)).not.toBeNull();
      expect(page.querySelector('[data-horde-action-id]')?.getAttribute('data-actor')).toBe('enemy');
    }
  });
});
