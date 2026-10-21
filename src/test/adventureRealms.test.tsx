import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { adventureBiome } from '@/lib/adventureVisuals';
import { AdventureScenery } from '@/components/adventure/AdventureScenery';
import { creaturesEnemies } from '@/components/adventure/enemies/creatures.data';
import { resolveEnemyPresentation } from '@/components/adventure/enemies/registry';

describe('five adventure realms', () => {
  it('keeps ten-stage blocks and repeats the realm cycle without resetting the stage', () => {
    const realms = ['floresta', 'deserto', 'aquatico', 'gelo', 'vulcanico'];
    for (let stage = 1; stage <= 151; stage++) {
      expect(adventureBiome(stage), `stage ${stage}`).toBe(realms[Math.floor((stage - 1) / 10) % 5]);
    }
  });

  it('uses authoritative in-flight biome, including the previous ruins realm', () => {
    expect(adventureBiome(31, 'volcanic')).toBe('vulcanico');
    expect(adventureBiome(31, 'ruins')).toBe('ruinas');
    expect(adventureBiome(1, 'desert')).toBe('deserto');
    expect(adventureBiome(1, 'ice')).toBe('gelo');
    expect(adventureBiome(21, '__proto__')).toBe('aquatico');
    expect(adventureBiome(41, 'constructor')).toBe('vulcanico');
  });

  it('provides three identifiable creatures per active realm and retains legacy identities', () => {
    for (const biome of ['floresta', 'deserto', 'aquatico', 'gelo', 'vulcanico'] as const) {
      const creatures = creaturesEnemies.filter(enemy => enemy.biome === biome);
      expect(creatures).toHaveLength(3);
      for (const enemy of creatures) {
        expect(resolveEnemyPresentation({ isBoss: false, enemyName: enemy.name, biome })?.key).toBe(enemy.key);
      }
      expect(renderToStaticMarkup(<AdventureScenery biome={biome} />)).toContain(`data-realm-scenery="${biome}"`);
    }
    expect(creaturesEnemies.filter(enemy => enemy.biome === 'ruinas')).toHaveLength(3);
  });
});
