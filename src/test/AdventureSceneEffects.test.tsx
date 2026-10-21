import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AdventureScene, type AdventureSceneAction, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';
import type { AdventureHeroClass } from '@/lib/adventureVisuals';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseFrame: AdventureSceneFrame = {
  status: 'fighting', heroHp: 90, heroMaxHp: 120, heroMp: 18, heroMaxMp: 30,
  enemyHp: 72, enemyMaxHp: 100,
};

function renderScene(action: AdventureSceneAction | null, heroClass: AdventureHeroClass = 'mago', paused = false, frame: AdventureSceneFrame = baseFrame) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(<AdventureScene stage={3} biome="floresta" heroClass={heroClass} heroName="Herói" enemyName="Asa de Brasa" isBoss={false} frame={{ ...frame, action }} paused={paused} />));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('AdventureScene effects', () => {
  it('casts protection on the hero without firing it at the enemy', () => {
    const page = renderScene({ id: 'guard', actor: 'hero', kind: 'skill', skillName: 'Bênção Protetora',
      skillType: 'buff', effect: 'light', damage: 0, mpCost: 7, effectNote: 'guard' }, 'clerico');
    expect(page.querySelector('.adventure-effect-self-support')).not.toBeNull();
    expect(page.querySelector('.adventure-projectile')).toBeNull();
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('Proteção aplicada ao próximo golpe recebido');
  });

  it('renders server skill, mana spend, healing and resistance evidence outside the sprites', () => {
    const page = renderScene({
      id: 'cast-1', actor: 'hero', kind: 'skill', skillName: 'Dardo Arcano', effect: 'fire',
      damage: 12, mpCost: 8, healing: 3, rawDamage: 20, damageMultiplier: .6,
      effectNote: 'Asa de Brasa resiste ao fogo', skillType: 'offensive',
    });
    expect(page.querySelector('[data-action-style="cast"]')).not.toBeNull();
    expect(page.querySelector('.adventure-cast-orb')).not.toBeNull();
    expect(page.querySelector('.adventure-projectile')).not.toBeNull();
    expect(page.querySelector('.adventure-impact')).not.toBeNull();
    expect(page.querySelector('[aria-label="Mana: 18 de 30 MP"]')).not.toBeNull();
    const readout = page.querySelector('.adventure-action-strip')!;
    expect(readout.textContent).toContain('Dardo Arcano');
    expect(readout.textContent).toContain('−8 MP');
    expect(readout.textContent).toContain('12 de dano');
    expect(readout.textContent).toContain('+3 HP curado');
    expect(readout.textContent).toContain('Antes dos efeitos: 20 de dano');
    expect(readout.textContent).toContain('Dano após efeitos: ×0.6');
    expect(readout.textContent).toContain('Asa de Brasa resiste ao fogo');
    expect(page.querySelector('.adventure-scene')?.textContent).not.toContain('12 de dano');
    expect(page.querySelector('.adventure-scene-fighters')?.textContent).not.toContain('Herói');
  });

  it('distinguishes all seven effects and basic class attacks from a cast', () => {
    const effects = ['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'] as const;
    for (const effect of effects) {
      const page = renderScene({ id: effect, actor: 'hero', kind: 'skill', skillName: 'Teste', damage: 4, effect });
      expect(page.querySelector(`.adventure-effect-${effect}`)).not.toBeNull();
    }
    const basic = renderScene({ id: 'basic', actor: 'hero', kind: 'attack', skillName: null, damage: 6, effect: 'physical' });
    expect(basic.querySelector('[data-action-style="melee"]')).not.toBeNull();
    expect(basic.querySelector('.adventure-action-strip')?.textContent).toContain('Ataque básico do herói');
    expect(basic.querySelector('.adventure-cast-orb')).toBeNull();
    const bow = renderScene({ id: 'bow', actor: 'hero', kind: 'attack', damage: 6, effect: 'physical' }, 'arqueiro');
    expect(bow.querySelector('[data-action-style="bow"]')).not.toBeNull();
    expect(bow.querySelector('.adventure-projectile')).not.toBeNull();
  });

  it('keeps legacy battles without mana and freezes visual animation when paused', () => {
    const legacy = { status: 'fighting', heroHp: 90, heroMaxHp: 100, enemyHp: 80, enemyMaxHp: 100 } as AdventureSceneFrame;
    const page = renderScene({ id: 'old', actor: 'hero', kind: 'attack', damage: 8, effect: 'physical' }, 'guerreiro', true, legacy);
    expect(page.querySelector('.adventure-resource-mp')).toBeNull();
    expect(page.querySelector('.adventure-action-strip')?.textContent).not.toContain('MP');
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    expect(page.querySelector('[aria-label="Herói: 90 de 100 HP"]')).not.toBeNull();
  });

  it('keeps the last skill readable after its animation window', () => {
    const page = renderScene({ id: 'past-skill', actor: 'hero', kind: 'skill', skillName: 'Chama', damage: 7, mpCost: 5, effect: 'fire' }, 'mago', false, { ...baseFrame, animateAction: false });
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('Chama');
    expect(page.querySelector('.adventure-action-strip')?.textContent).toContain('−5 MP');
    expect(page.querySelector('.adventure-projectile')).toBeNull();
    expect(page.querySelector('[data-action-style="idle"]')).not.toBeNull();
  });
});
