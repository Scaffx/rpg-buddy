import type { FragmentTier } from '@/hooks/usePortalEvent';

/**
 * Lupas de Revelação.
 *
 * Desde que cair no portal passou a fechá-lo de vez (F6), entrar às cegas é uma
 * aposta cara. Informação vira mercadoria: três lupas, cada uma revelando um
 * degrau a mais do que espera lá dentro, pagas em ouro — mais um ralo saudável.
 *
 * O preço acompanha o risco: é um percentual do custo em fragmentos da própria
 * masmorra, então nunca fica obsoleto quando a economia mudar.
 */

export type RevealLevel = 0 | 1 | 2 | 3;

export type RevealTier = {
  level: Exclude<RevealLevel, 0>;
  /** Fração do valor em ouro dos fragmentos gastos na masmorra. */
  pricePct: number;
  labelKey: string;
};

export const REVEAL_TIERS: RevealTier[] = [
  { level: 1, pricePct: 0.1,  labelKey: 'basic' },
  { level: 2, pricePct: 0.25, labelKey: 'medium' },
  { level: 3, pricePct: 0.5,  labelKey: 'superior' },
];

/**
 * Valor de referência, em ouro, dos 10 fragmentos que abrem uma masmorra.
 * É a âncora do preço das lupas — mexer aqui reprecifica as três de uma vez.
 */
export const DUNGEON_FRAGMENT_GOLD_VALUE = 600;

/** Preço em ouro de uma lupa, arredondado para dezena (fica legível na loja). */
export function revealPrice(tier: RevealTier): number {
  return Math.round((DUNGEON_FRAGMENT_GOLD_VALUE * tier.pricePct) / 10) * 10;
}

/**
 * Andares de cada tier, na ordem. Espelha FLOOR_DUNGEON_MAP do
 * FragmentDungeonArena — o último é sempre o andar do boss.
 */
export const TIER_FLOORS: Record<FragmentTier, string[]> = {
  medium:    ['portal_blue',   'portal_yellow', 'portal_red'],
  hard:      ['portal_yellow', 'portal_red',    'portal_red',       'portal_legendary'],
  legendary: ['portal_red',    'portal_red',    'portal_legendary', 'portal_legendary', 'portal_legendary'],
  ultra:     ['portal_red',    'portal_legendary', 'portal_legendary', 'portal_legendary', 'portal_legendary', 'portal_legendary'],
};

export function finalFloorDungeonId(tier: FragmentTier): string {
  const floors = TIER_FLOORS[tier] ?? [];
  return floors[floors.length - 1] ?? 'portal_blue';
}

export type RevealedInfo = {
  /** Nível 1+: quantos andares e qual o andar final. */
  floors: number | null;
  /** Nível 2+: nomes dos inimigos que aparecem no caminho. */
  enemies: string[] | null;
  /** Nível 3: boss final e a fraqueza dele. */
  finalBoss: { name: string; icon: string; weakness: string } | null;
};

type BossLike = { name: string; icon: string; hp: number };
type DungeonLike = {
  layouts: Array<Array<{ enemy?: { name: string } }>>;
  boss: { primary: BossLike };
};

/**
 * Monta o que cada nível de lupa mostra. Recebe o catálogo por parâmetro para
 * ficar puro e testável — quem chama passa o DUNGEON_DATA real.
 */
export function buildRevealedInfo(
  tier: FragmentTier,
  level: RevealLevel,
  catalog: Record<string, DungeonLike>,
  weaknessOf: (index: number) => string,
): RevealedInfo {
  const floors = TIER_FLOORS[tier] ?? [];
  const info: RevealedInfo = { floors: null, enemies: null, finalBoss: null };
  if (level >= 1) info.floors = floors.length;

  if (level >= 2) {
    const names = new Set<string>();
    for (const dungeonId of floors) {
      for (const layout of catalog[dungeonId]?.layouts ?? []) {
        for (const room of layout) {
          if (room.enemy?.name) names.add(room.enemy.name);
        }
      }
    }
    info.enemies = Array.from(names);
  }

  if (level >= 3) {
    const finalId = finalFloorDungeonId(tier);
    const boss = catalog[finalId]?.boss?.primary;
    if (boss) {
      info.finalBoss = {
        name: boss.name,
        icon: boss.icon,
        // Mesma regra do motor de combate, para a lupa não mentir.
        weakness: weaknessOf(floors.length + boss.hp),
      };
    }
  }

  return info;
}
