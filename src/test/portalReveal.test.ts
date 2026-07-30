import { describe, it, expect } from 'vitest';
import {
  REVEAL_TIERS,
  revealPrice,
  finalFloorDungeonId,
  buildRevealedInfo,
  TIER_FLOORS,
} from '@/lib/portalReveal';

const catalog = {
  portal_blue: {
    layouts: [[{ enemy: { name: 'Slime' } }, {}]],
    boss: { primary: { name: 'Chefe Azul', icon: '🔵', hp: 100 } },
  },
  portal_yellow: {
    layouts: [[{ enemy: { name: 'Constructo' } }]],
    boss: { primary: { name: 'Chefe Amarelo', icon: '🟡', hp: 200 } },
  },
  portal_red: {
    layouts: [[{ enemy: { name: 'Demônio' } }, { enemy: { name: 'Slime' } }]],
    boss: { primary: { name: 'Lorde Carmesim', icon: '🔴', hp: 750 } },
  },
};

const weaknessOf = (i: number) => `attr_${i}`;

describe('lupas de revelação', () => {
  it('preço escala com o tier e sai arredondado', () => {
    const [basica, media, superior] = REVEAL_TIERS.map(revealPrice);
    expect(basica).toBeLessThan(media);
    expect(media).toBeLessThan(superior);
    for (const p of [basica, media, superior]) expect(p % 10).toBe(0);
  });

  it('o andar final é o último da lista do tier', () => {
    expect(finalFloorDungeonId('medium')).toBe('portal_red');
    expect(finalFloorDungeonId('medium')).toBe(TIER_FLOORS.medium[TIER_FLOORS.medium.length - 1]);
  });

  it('nível 0 não revela nada', () => {
    const info = buildRevealedInfo('medium', 0, catalog, weaknessOf);
    expect(info).toEqual({ floors: null, enemies: null, finalBoss: null });
  });

  it('nível 1 revela só a quantidade de andares', () => {
    const info = buildRevealedInfo('medium', 1, catalog, weaknessOf);
    expect(info.floors).toBe(3);
    expect(info.enemies).toBeNull();
    expect(info.finalBoss).toBeNull();
  });

  it('nível 2 acrescenta os inimigos, sem repetir', () => {
    const info = buildRevealedInfo('medium', 2, catalog, weaknessOf);
    expect(info.floors).toBe(3);
    expect(info.enemies).toEqual(['Slime', 'Constructo', 'Demônio']);
    expect(info.finalBoss).toBeNull();
  });

  it('nível 3 acrescenta o boss final e a fraqueza', () => {
    const info = buildRevealedInfo('medium', 3, catalog, weaknessOf);
    expect(info.finalBoss).toEqual({
      name: 'Lorde Carmesim',
      icon: '🔴',
      // 3 andares + 750 de HP, pela mesma regra do motor de combate
      weakness: 'attr_753',
    });
  });

  it('não quebra com tier cujo catálogo está incompleto', () => {
    const info = buildRevealedInfo('ultra', 3, {}, weaknessOf);
    expect(info.enemies).toEqual([]);
    expect(info.finalBoss).toBeNull();
  });
});
