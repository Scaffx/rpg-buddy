import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AdventureScene, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function render(frame: AdventureSceneFrame) {
  if (!container) { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); }
  act(() => root!.render(<AdventureScene stage={39} biome="gelo" heroClass="mago" heroName="Heroína" enemyName="Golem de gelo" isBoss={false} frame={frame} paused={false} />));
  return container;
}
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = null; container = null; });
const frame: AdventureSceneFrame = { status: 'fighting', heroHp: 88, heroMaxHp: 130, heroMp: 24, heroMaxMp: 64, enemyHp: 70, enemyMaxHp: 100 };

describe('resources inside the animated scene', () => {
  it('keeps all HP/MP meters inside the fight and preserves confirmed values', () => {
    const page = render(frame);
    const scene = page.querySelector('.adventure-scene')!;
    expect(scene.querySelectorAll('[role="meter"]')).toHaveLength(3);
    expect(page.querySelectorAll('[role="meter"]')).toHaveLength(3);
    expect(scene.querySelector('[aria-label="Heroína: 88 de 130 HP"]')).not.toBeNull();
    expect(scene.querySelector('[aria-label="Mana: 24 de 64 MP"]')).not.toBeNull();
    expect(scene.querySelector('[aria-label="Golem de gelo: 70 de 100 HP"]')).not.toBeNull();
    expect(scene.querySelector('.adventure-combat-hud-enemy .adventure-resource-mp')).toBeNull();
  });

  it('shows enemy mana only when the enemy has a positive mana capacity', () => {
    const page = render({ ...frame, enemyMp: 11, enemyMaxMp: 35 });
    expect(page.querySelector('.adventure-scene [aria-label="Mana de Golem de gelo: 11 de 35 MP"]')).not.toBeNull();
    for (const enemyMaxMp of [undefined, null, 0, -1, NaN, Infinity]) {
      render({ ...frame, enemyMp: 0, enemyMaxMp });
      expect(page.querySelector('.adventure-combat-hud-enemy .adventure-resource-mp')).toBeNull();
    }
  });

  it('does not fabricate a current value for an unknown resource', () => {
    const page = render({ ...frame, heroHp: null, enemyMp: null, enemyMaxMp: 35 });
    expect(page.querySelector('[aria-label^="Mana de Golem de gelo:"]')).toBeNull();
    expect(page.querySelector('.adventure-combat-hud-enemy .adventure-resource-unknown')?.textContent).toContain('MP —');
    expect(page.querySelector('[aria-label^="Heroína:"]')).toBeNull();
  });
});
