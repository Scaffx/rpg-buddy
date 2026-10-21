export type AdventureBiome = 'floresta' | 'aquatico' | 'ruinas' | 'vulcanico' | 'deserto' | 'gelo';
export type AdventureHeroClass = 'guerreiro' | 'mago' | 'gatuno' | 'arqueiro' | 'clerico' | 'ferreiro' | 'aprendiz';

const BIOMES: AdventureBiome[] = ['floresta', 'deserto', 'aquatico', 'gelo', 'vulcanico'];

/** Biome is scenery only. The server decides the opponent, fight and rewards. */
export function adventureBiome(stage: number, serverBiome?: string | null): AdventureBiome {
  const normalized = serverBiome?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const serverBiomes: Record<string, AdventureBiome> = { forest: 'floresta', aquatic: 'aquatico', ruins: 'ruinas', volcanic: 'vulcanico', desert: 'deserto', ice: 'gelo' };
  if (normalized && Object.prototype.hasOwnProperty.call(serverBiomes, normalized)) return serverBiomes[normalized];
  if (normalized === 'floresta' || normalized === 'aquatico' || normalized === 'ruinas' || normalized === 'vulcanico' || normalized === 'deserto' || normalized === 'gelo') return normalized;
  return BIOMES[Math.floor((Math.max(1, stage) - 1) / 10) % BIOMES.length];
}

export function adventureHeroClass(starter?: string | null, displayName?: string | null): AdventureHeroClass {
  const normalized = `${starter ?? ''} ${displayName ?? ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/aprendiz/.test(normalized)) return 'aprendiz';
  if (/mago|feitice|bruxo|arcan/.test(normalized)) return 'mago';
  if (/gatuno|ladino|assassin/.test(normalized)) return 'gatuno';
  if (/arqueiro|cacador|atirador/.test(normalized)) return 'arqueiro';
  if (/clerico|clerigo|novico|novato|sacerdot|templar/.test(normalized)) return 'clerico';
  if (/ferreiro|forjador/.test(normalized)) return 'ferreiro';
  return 'guerreiro';
}

export const BIOME_LABELS: Record<AdventureBiome, string> = {
  floresta: 'Reino normal',
  aquatico: 'Reino da água',
  ruinas: 'Ruínas',
  vulcanico: 'Reino do fogo',
  deserto: 'Reino do deserto',
  gelo: 'Reino de gelo',
};

export function enemyVisualVariant(stage: number, isBoss: boolean): 0 | 1 | 2 | 3 {
  if (isBoss) return 3;
  return ((Math.max(1, stage) - 1) % 3) as 0 | 1 | 2;
}
