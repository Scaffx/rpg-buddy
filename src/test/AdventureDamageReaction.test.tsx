import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdventureScene, type AdventureSceneAction, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => motionPreference.reduced,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(action: AdventureSceneAction | null, options: {
  animateAction?: boolean;
  paused?: boolean;
  heroHp?: number;
  enemyHp?: number;
  status?: AdventureSceneFrame['status'];
  strict?: boolean;
} = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const frame: AdventureSceneFrame = {
    status: options.status ?? 'fighting',
    heroHp: options.heroHp ?? 80, heroMaxHp: 100,
    enemyHp: options.enemyHp ?? 70, enemyMaxHp: 100,
    animateAction: options.animateAction,
    action,
  };
  const scene = <AdventureScene stage={3} biome="floresta" heroClass="guerreiro"
    heroName="Herói" enemyName="Lobo" isBoss={false} frame={frame} paused={options.paused ?? false} />;
  act(() => root!.render(options.strict ? <StrictMode>{scene}</StrictMode> : scene));
  return container;
}

function hit() {
  return container?.querySelector('.adventure-damage-shell[data-hit-target]');
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  motionPreference.reduced = false;
  vi.useRealTimers();
});

describe('adventure damage reaction', () => {
  it('reacts once on the damaged enemy, then ends without replay on the same event or HP changes', () => {
    vi.useFakeTimers();
    const action: AdventureSceneAction = { id: 'battle-1-event-0', actor: 'hero', damage: 9 };
    render(action, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('enemy');
    expect(hit()?.getAttribute('data-hit-id')).toBe(action.id);
    expect(container?.querySelector('.adventure-fighter-hero [data-hit-id]')).toBeNull();
    expect(hit()?.querySelector('.adventure-damage-marks')).not.toBeNull();

    act(() => vi.advanceTimersByTime(1121));
    expect(hit()).toBeNull();
    render({ ...action }, { animateAction: true, enemyHp: 50 });
    expect(hit()).toBeNull();
    render(null, { animateAction: true, enemyHp: 20 });
    expect(hit()).toBeNull();
    render({ ...action }, { animateAction: true, enemyHp: 50 });
    expect(hit()).toBeNull();
  });

  it('finishes under React StrictMode without replaying the consumed id', () => {
    vi.useFakeTimers();
    const action: AdventureSceneAction = { id: 'strict-hit', actor: 'enemy', damage: 2 };
    render(action, { animateAction: true, strict: true });
    expect(hit()?.getAttribute('data-hit-id')).toBe('strict-hit');
    act(() => vi.advanceTimersByTime(1121));
    expect(hit()).toBeNull();
    render(action, { animateAction: true, strict: true });
    expect(hit()).toBeNull();
  });

  it('targets the hero for enemy damage and allows a new confirmed event', () => {
    render({ id: 'hero-hit', actor: 'enemy', damage: 5 }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('hero');
    expect(container?.querySelector('.adventure-fighter-enemy [data-hit-id]')).toBeNull();
    render({ id: 'enemy-hit', actor: 'hero', damage: 7 }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('enemy');
    expect(hit()?.getAttribute('data-hit-id')).toBe('enemy-hit');
  });

  it('requires positive finite confirmed damage, including for control skills', () => {
    const quiet: AdventureSceneAction[] = [
      { id: 'zero', actor: 'hero', damage: 0, rawDamage: 12 },
      { id: 'heal', actor: 'hero', damage: 0, healing: 10, skillType: 'heal' },
      { id: 'buff', actor: 'hero', skillType: 'buff' },
      { id: 'stun', actor: 'enemy', damage: 8, effectNote: 'stunned' },
      { id: 'blocked', actor: 'enemy', damage: 8, damageMultiplier: 0 },
      { id: 'nan', actor: 'hero', damage: Number.NaN },
      { id: 'infinite', actor: 'enemy', damage: Number.POSITIVE_INFINITY },
      { id: 'negative', actor: 'hero', damage: -3 },
    ];
    for (const action of quiet) {
      render(action, { animateAction: true });
      expect(hit(), action.id).toBeNull();
    }
    render({ id: 'control-with-damage', actor: 'hero', damage: 4, effectNote: 'stunned', skillType: 'cc' }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('enemy');
  });

  it('consumes a stale frame and never replays it when animation authorization changes', () => {
    const action: AdventureSceneAction = { id: 'stale', actor: 'hero', damage: 6 };
    render(action, { animateAction: false });
    expect(hit()).toBeNull();
    render(action, { animateAction: true });
    expect(hit()).toBeNull();
    render({ id: 'unconfirmed', actor: 'hero', damage: 6 });
    expect(hit()).toBeNull();
    render({ id: 'transition', actor: 'enemy', damage: 5 }, { animateAction: true, status: 'transition' });
    expect(hit()).toBeNull();
    render({ id: 'fresh', actor: 'enemy', damage: 5 }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('hero');
    render({ id: 'fresh', actor: 'enemy', damage: 5 }, { animateAction: false });
    expect(hit()).toBeNull();
    render({ id: 'fresh', actor: 'enemy', damage: 5 }, { animateAction: true });
    expect(hit()).toBeNull();
  });

  it('suppresses paused and reduced motion events and does not replay them on resume', () => {
    render({ id: 'paused-first', actor: 'enemy', damage: 3 }, { animateAction: true, paused: true });
    expect(hit()).toBeNull();
    render({ id: 'paused-first', actor: 'enemy', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();
    render({ id: 'active', actor: 'enemy', damage: 3 }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('hero');
    render({ id: 'active', actor: 'enemy', damage: 3 }, { animateAction: true, paused: true });
    expect(hit()).toBeNull();
    render({ id: 'active', actor: 'enemy', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();

    motionPreference.reduced = true;
    render({ id: 'reduced-first', actor: 'hero', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();
    motionPreference.reduced = false;
    render({ id: 'reduced-first', actor: 'hero', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();
    render({ id: 'reduced-active', actor: 'hero', damage: 3 }, { animateAction: true });
    expect(hit()?.getAttribute('data-hit-target')).toBe('enemy');
    motionPreference.reduced = true;
    render({ id: 'reduced-active', actor: 'hero', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();
    motionPreference.reduced = false;
    render({ id: 'reduced-active', actor: 'hero', damage: 3 }, { animateAction: true });
    expect(hit()).toBeNull();
    expect(container?.querySelector('[aria-label="Herói: 80 de 100 HP"]')).not.toBeNull();
  });
});
