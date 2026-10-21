import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AdventureScene, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';
import { ENEMY_ANIMATION_GROUPS, ENEMY_ANIMATIONS, ENEMY_PRESENTATIONS, findEnemyAnimation, resolveEnemyPresentation } from '@/components/adventure/enemies/registry';
import catalog from '@/components/adventure/enemies/catalog.snapshot.json';
import EnemyAnimationGallery from '@/pages/EnemyAnimationGallery';
import { enemyActionMotion } from '@/components/adventure/enemies/enemyMotion';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function render(content: React.ReactNode) {
  if (!container) { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); }
  act(() => root!.render(content));
  return container;
}
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = null; container = null; });

const boss = catalog.bosses[0];
const bossKey = `boss:${boss.id}`;
const creature = catalog.creatures[0];
const creatureKey = `creature:${creature.biome}:${creature.slot}`;
const props = { stage: 10, biome: 'floresta' as const, heroClass: 'mago' as const, heroName: 'Herói', enemyName: boss.name, isBoss: true, bossId: boss.id, paused: false };
const frame: AdventureSceneFrame = { status: 'fighting', heroHp: 87, heroMaxHp: 130, heroMp: 18, heroMaxMp: 30, enemyHp: 140, enemyMaxHp: 150,
  action: { id: 'confirmed-enemy-event', actor: 'enemy', kind: 'attack', damage: 13, effect: 'physical' }, animateAction: true };

describe('enemy animations: catalog, identity and confirmed actions', () => {
  it('covers every live boss skill and each enemy basic once, preserving names and indices', () => {
    const expected = catalog.bosses.flatMap(item => [{ id: `boss:${item.id}:attack`, name: 'Ataque básico' }, ...item.skills.map((skill, index) => ({ id: `boss:${item.id}:skill:${index}`, name: skill.name }))]);
    expected.push(...catalog.creatures.map(item => ({ id: `creature:${item.biome}:${item.slot}:attack`, name: 'Ataque básico' })));
    expect(ENEMY_ANIMATIONS.map(item => ({ id: item.id, name: item.name })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected.sort((a, b) => a.id.localeCompare(b.id)));
    expect(new Set(ENEMY_ANIMATIONS.map(item => item.id)).size).toBe(252);
    expect(ENEMY_PRESENTATIONS.filter(item => item.kind === 'boss')).toHaveLength(60);
    expect(ENEMY_PRESENTATIONS.filter(item => item.kind === 'creature')).toHaveLength(12);
    expect(ENEMY_ANIMATIONS.filter(item => item.kind === 'skill')).toHaveLength(180);
    const expectedEnemies = [...catalog.bosses.map(item => ({ key: `boss:${item.id}`, name: item.name })), ...catalog.creatures.map(item => ({ key: `creature:${item.biome}:${item.slot}`, name: item.name }))];
    expect(ENEMY_PRESENTATIONS.map(item => ({ key: item.key, name: item.name })).sort((a, b) => a.key.localeCompare(b.key))).toEqual(expectedEnemies.sort((a, b) => a.key.localeCompare(b.key)));
    expect(ENEMY_ANIMATIONS.filter(item => item.kind === 'attack').every(item => item.element === 'physical')).toBe(true);
    for (const [key, group] of Object.entries(ENEMY_ANIMATION_GROUPS)) {
      const Effect = group.Effect;
      const Sprite = group.Sprite;
      for (const item of group.animations) {
        const page = render(<Effect animationId={item.id} target={item.target} />);
        expect(page.querySelector('[data-enemy-animation]')?.getAttribute('data-enemy-animation'), `${key} ${item.id}`).toBe(item.id);
      }
      for (const enemy of group.enemies) {
        const page = render(<Sprite enemyKey={enemy.key} className="enemy-probe" />);
        expect(page.querySelector('svg.enemy-probe[viewBox="0 0 32 32"]'), enemy.key).not.toBeNull();
      }
      expect(render(<Effect animationId="unknown" target="hero" />).childElementCount).toBe(0);
      expect(render(<Sprite enemyKey="unknown" />).childElementCount).toBe(0);
    }
  });

  it('rejects inherited object keys as unknown sprites in every group', () => {
    for (const group of Object.values(ENEMY_ANIMATION_GROUPS)) {
      const Sprite = group.Sprite;
      for (const enemyKey of ['__proto__', 'constructor', 'toString']) {
        expect(render(<Sprite enemyKey={enemyKey} />).childElementCount, enemyKey).toBe(0);
      }
    }
  });

  it('requires exact boss identity or exact known creature name with biome', () => {
    expect(resolveEnemyPresentation({ ...props })?.key).toBe(bossKey);
    expect(resolveEnemyPresentation({ ...props, bossId: null })).toBeNull();
    expect(resolveEnemyPresentation({ ...props, bossId: 'unknown' })).toBeNull();
    expect(resolveEnemyPresentation({ ...props, isBoss: false, bossId: null })).toBeNull();
    expect(resolveEnemyPresentation({ isBoss: false, enemyName: creature.name, biome: 'floresta' })?.key).toBe(creatureKey);
    expect(resolveEnemyPresentation({ isBoss: false, enemyName: creature.name, biome: 'aquatico' })).toBeNull();
    expect(resolveEnemyPresentation({ isBoss: false, enemyName: `${creature.name} falso`, biome: 'floresta' })).toBeNull();
  });

  it('never upgrades a basic event to a special or accepts another enemy skill', () => {
    expect(findEnemyAnimation(bossKey, { kind: 'attack', skillId: `${bossKey}:skill:0`, skillName: boss.skills[0].name })?.definition.id).toBe(`${bossKey}:attack`);
    expect(findEnemyAnimation(bossKey, { kind: 'skill', skillName: boss.skills[0].name })?.definition.id).toBe(`${bossKey}:skill:0`);
    expect(findEnemyAnimation(bossKey, { kind: 'skill', skillId: `boss:${catalog.bosses[1].id}:skill:0` })).toBeNull();
    expect(findEnemyAnimation(bossKey, { kind: 'skill', skillId: `${bossKey}:skill:0`, skillName: 'Outra habilidade' })).toBeNull();
    expect(findEnemyAnimation(bossKey, { kind: 'skill', skillId: 'unknown', skillName: boss.skills[0].name })).toBeNull();
    expect(findEnemyAnimation('unknown', { kind: 'attack' })).toBeNull();
  });

  it('renders a confirmed basic with exact server damage and HP, then expires the VFX', () => {
    const page = render(<AdventureScene {...props} frame={frame} />);
    expect(page.querySelector('[data-enemy-effect]')?.getAttribute('data-enemy-effect')).toBe(`${bossKey}:attack`);
    expect(page.querySelector('[data-enemy-target="hero"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Herói: 87 de 130 HP"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Mana: 18 de 30 MP"]')).not.toBeNull();
    expect(page.textContent).toContain('13 de dano');
    expect(page.textContent).not.toContain(boss.skills[0].name);
    render(<AdventureScene {...props} frame={{ ...frame, animateAction: false }} />);
    expect(page.querySelector('[data-enemy-effect]')).toBeNull();
    expect(page.textContent).toContain('13 de dano');
  });

  it('suppresses effects while stunned and outside fighting, preserving fallback and hero skills', () => {
    const page = render(<AdventureScene {...props} frame={{ ...frame, action: { ...frame.action!, damage: 0, damageMultiplier: 0, effectNote: 'stunned' } }} />);
    expect(page.querySelector('[data-enemy-effect]')).toBeNull();
    expect(page.querySelector('[data-action-style="idle"]')).not.toBeNull();
    render(<AdventureScene {...props} frame={{ ...frame, status: 'victory' }} />);
    expect(page.querySelector('[data-enemy-effect]')).toBeNull();
    render(<AdventureScene {...props} bossId={null} frame={frame} />);
    expect(page.querySelector('[data-enemy-effect]')).toBeNull();
    expect(page.querySelector('.adventure-effect-enemy')).not.toBeNull();
    render(<AdventureScene {...props} frame={{ ...frame, action: { id: 'hero', actor: 'hero', kind: 'skill', skillId: 'm_bola_fogo', skillName: 'Bola de Fogo', damage: 7, mpCost: 8, effect: 'fire' } }} />);
    expect(page.querySelector('[data-enemy-effect]')).toBeNull();
    expect(page.querySelector('[data-animation-skill="m_bola_fogo"]')).not.toBeNull();
  });

  it('targets the enemy itself for support previews and respects visual pause', () => {
    const support = ENEMY_ANIMATIONS.find(item => item.kind === 'skill' && item.target === 'self')!;
    const enemy = ENEMY_PRESENTATIONS.find(item => item.key === support.enemyKey)!;
    const page = render(<AdventureScene {...props} bossId={enemy.bossId} enemyName={enemy.name} paused frame={{ ...frame, action: { id: 'support-preview', actor: 'enemy', kind: 'skill', skillId: support.id, skillName: support.name, damage: 0, skillType: 'buff' } }} />);
    expect(page.querySelector('[data-enemy-target="self"]')).not.toBeNull();
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    expect(page.querySelector('[aria-label="Herói: 87 de 130 HP"]')).not.toBeNull();
  });

  it('keeps self-target flight over the caster and retains an approach for offensive flight', () => {
    expect(enemyActionMotion('flight', 'self', 200)).toEqual({ x: [0, 0, 0], y: [0, -28, 0] });
    expect(enemyActionMotion('flight', 'hero', 200).x).toEqual([0, -70, 0]);
    for (const item of ENEMY_ANIMATIONS.filter(item => item.target === 'self')) {
      expect(enemyActionMotion(item.motion, item.target, 200).x[1], item.id).toBe(0);
    }
  });

  it('labels specials as previews and lets visitors switch to small creatures without game mutations', () => {
    const page = render(<MemoryRouter initialEntries={[`/previa-inimigos?grupo=early&inimigo=${bossKey}&habilidade=${bossKey}:skill:0`]}><EnemyAnimationGallery /></MemoryRouter>);
    expect(page.querySelector('#enemy-gallery-selection')?.textContent).toBe(boss.skills[0].name);
    expect(page.textContent).toContain('Esta habilidade especial ainda não é executada na aventura automática');
    expect(page.querySelector('.adventure-action-strip')?.getAttribute('aria-live')).toBe('off');
    const groupSelect = page.querySelector('select')!;
    act(() => { groupSelect.value = 'creatures'; groupSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(page.querySelector('[data-enemy-key]')?.getAttribute('data-enemy-key')).toBe(creatureKey);
    expect(page.querySelector('[data-enemy-effect]')?.getAttribute('data-enemy-effect')).toBe(`${creatureKey}:attack`);
    expect(page.textContent).toContain('Esta galeria não inicia combates nem altera seu personagem');
  });
});
