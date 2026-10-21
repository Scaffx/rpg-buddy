import type { AdventureBiome } from '@/lib/adventureVisuals';
import type { EnemyAnimationDefinition, EnemyPresentation } from './types';

// Names and biome/slot pairs mirror catalog.snapshot.json. These are visual labels only.
const BIOMES: readonly AdventureBiome[] = ['floresta', 'aquatico', 'ruinas', 'vulcanico', 'deserto', 'gelo'];
const CREATURES = [
  { biome: 0, slot: 0, name: 'Lobo da mata', motion: 'lunge', description: 'Mordida do lobo.' },
  { biome: 0, slot: 1, name: 'Javali selvagem', motion: 'lunge', description: 'Investida com as presas.' },
  { biome: 0, slot: 2, name: 'Espírito da floresta', motion: 'cast', description: 'Folha lançada pelo espírito.' },
  { biome: 1, slot: 0, name: 'Criatura marinha', motion: 'lunge', description: 'Choque de barbatana entre gotas visuais.' },
  { biome: 1, slot: 1, name: 'Ave costeira', motion: 'flight', description: 'Rasante da ave.' },
  { biome: 1, slot: 2, name: 'Serpente aquática', motion: 'lunge', description: 'Golpe de cauda da serpente.' },
  { biome: 2, slot: 0, name: 'Esqueleto antigo', motion: 'slam', description: 'Golpe com osso.' },
  { biome: 2, slot: 1, name: 'Morcego das ruínas', motion: 'flight', description: 'Batida de asa do morcego.' },
  { biome: 2, slot: 2, name: 'Sentinela de pedra', motion: 'slam', description: 'Pedra arremessada pela sentinela.' },
  { biome: 3, slot: 0, name: 'Criatura de fogo', motion: 'lunge', description: 'Garra envolta em brasa visual.' },
  { biome: 3, slot: 1, name: 'Asa de brasa', motion: 'flight', description: 'Rasante com penas incandescentes.' },
  { biome: 3, slot: 2, name: 'Golem vulcânico', motion: 'slam', description: 'Soco de rocha vulcânica.' },
  { biome: 4, slot: 0, name: 'Escorpião das dunas', motion: 'lunge', description: 'Pinça e golpe do ferrão.' },
  { biome: 4, slot: 1, name: 'Cobra da areia', motion: 'lunge', description: 'Bote da serpente entre grãos de areia.' },
  { biome: 4, slot: 2, name: 'Besouro do deserto', motion: 'slam', description: 'Investida da carapaça.' },
  { biome: 5, slot: 0, name: 'Lobo da neve', motion: 'lunge', description: 'Mordida do lobo entre flocos de neve.' },
  { biome: 5, slot: 1, name: 'Coruja glacial', motion: 'flight', description: 'Rasante de asas nevadas.' },
  { biome: 5, slot: 2, name: 'Golem de gelo', motion: 'slam', description: 'Soco de cristal glacial.' },
] as const;

export const creaturesEnemies: EnemyPresentation[] = CREATURES.map(({ biome, slot, name }) => ({
  key: `creature:${biome}:${slot}`,
  name,
  kind: 'creature',
  biome: BIOMES[biome],
  slot,
}));

export const creaturesAnimations: EnemyAnimationDefinition[] = CREATURES.map(({ biome, slot, motion, description }) => ({
  id: `creature:${biome}:${slot}:attack`,
  enemyKey: `creature:${biome}:${slot}`,
  name: 'Ataque básico',
  kind: 'attack',
  element: 'physical',
  motion,
  target: 'hero',
  description,
}));
