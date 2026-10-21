import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdventureScene } from '@/components/adventure/AdventureScene';
import { adventureBiome, adventureHeroClass } from '@/lib/adventureVisuals';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => motionPreference.reduced,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function renderScene(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(element));
  return container;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  motionPreference.reduced = false;
});

describe('cena 2D da aventura', () => {
  it('desenha heróis distintos para as seis classes', () => {
    for (const heroClass of ['guerreiro', 'mago', 'gatuno', 'arqueiro', 'clerico', 'ferreiro'] as const) {
      const scene = renderScene(<AdventureScene stage={1} biome="floresta" heroClass={heroClass} heroName="Heroína" enemyName="Guardião" isBoss={false} paused frame={{ status: 'exploring' }} />);
      expect(scene.querySelector('.adventure-hero-svg')).not.toBeNull();
      expect(adventureHeroClass(heroClass)).toBe(heroClass);
    }
    expect(adventureHeroClass('novato')).toBe('clerico');
  });

  it('varia cenário e criatura em todos os biomas; etapa dez mostra chefe', () => {
    for (const biome of ['floresta', 'aquatico', 'ruinas', 'vulcanico'] as const) {
      const scene = renderScene(<AdventureScene stage={10} biome={biome} heroClass="mago" heroName="Heroína" enemyName="Guardião" isBoss paused={false} frame={{ status: 'fighting', heroHp: 32, heroMaxHp: 40, enemyHp: 90, enemyMaxHp: 100 }} />);
      expect(scene.querySelector(`[data-biome=${biome}]`)).not.toBeNull();
      expect(scene.querySelector(`[data-enemy-variant=${biome}-3]`)).not.toBeNull();
      expect(scene.textContent).toContain('Chefe');
      expect(scene.querySelector('[aria-valuenow="32"]')).not.toBeNull();
    }
    expect(adventureBiome(11)).toBe('deserto');
    expect(adventureBiome(21)).toBe('aquatico');
    expect(adventureBiome(31)).toBe('gelo');
    expect(adventureBiome(1, 'aquatic')).toBe('aquatico');
    expect(adventureBiome(1, 'ruins')).toBe('ruinas');
    expect(adventureBiome(1, 'volcanic')).toBe('vulcanico');
  });

  it('pausa visual e não inventa dano ou habilidade sem evento', () => {
    const scene = renderScene(<AdventureScene stage={2} biome="floresta" heroClass="arqueiro" heroName="Heroína" enemyName="Lobo" isBoss={false} paused frame={{ status: 'fighting' }} />);
    expect(scene.querySelector('.adventure-still')).not.toBeNull();
    expect(scene.textContent).not.toContain('dano');
    expect(scene.querySelector('[role=meter]')).toBeNull();
    renderScene(<AdventureScene stage={2} biome="floresta" heroClass="arqueiro" heroName="Heroína" enemyName="Lobo" isBoss={false} paused={false} frame={{ status: 'fighting', action: { id: 'server-event-1', actor: 'hero', kind: 'skill', skillName: 'Tiro Vetor', damage: 12, effect: 'physical' } }} />);
    expect(scene.textContent).toContain('Tiro Vetor');
    expect(scene.textContent).toContain('12 de dano');
  });

  it('desliga animação quando a preferência do sistema pede menos movimento', () => {
    motionPreference.reduced = true;
    const scene = renderScene(<AdventureScene stage={1} biome="floresta" heroClass="guerreiro" heroName="Heroína" enemyName="Lobo" isBoss={false} paused={false} frame={{ status: 'fighting', action: { id: 'event-1', actor: 'hero', damage: 5 } }} />);
    expect(scene.querySelector('.adventure-still')).not.toBeNull();
  });

  it('representa os sete efeitos normalizados somente a partir do evento', () => {
    const base = { stage: 8, biome: 'vulcanico' as const, heroClass: 'mago' as const, heroName: 'Heroína', enemyName: 'Golem', isBoss: false, paused: false };
    for (const effect of ['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'] as const) {
      const scene = renderScene(<AdventureScene {...base} frame={{ status: 'fighting', action: { id: `event-${effect}`, actor: 'hero', damage: 9, effect } }} />);
      expect(scene.querySelector(`.adventure-vfx-${effect}`)).not.toBeNull();
    }
    renderScene(<AdventureScene {...base} frame={{ status: 'fighting' }} />);
    expect(container!.querySelector('[class*=adventure-vfx-]')).toBeNull();
  });
});
