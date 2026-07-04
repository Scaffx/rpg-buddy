// Pets — bônus passivos (Fase 1, client-only).
//
// Regras invioláveis (spec "Rotina é a Torneira"): pet NUNCA dá XP, ouro nem
// multiplicador deles. Aqui o pet ativo só ajusta os STATS INICIAIS do combate
// solo (atk/def/hp/mp), que são computados no cliente (computeSoloCombatStats /
// useBossCombat). NÃO toca na edge (processar_turno). 1 pet ativo por vez.
//
// Números (10%) são chute inicial — Murillo calibra na revisão.

export type PetStat = 'mp' | 'hp' | 'atk' | 'def';
export type PetBonus = { stat: PetStat; pct: number };

/**
 * Catálogo Fase 1: cada `companion_type` → UM bônus passivo de stat.
 * Comentário "Fase 2" = pet que ganha um efeito de assinatura na edge depois
 * (regen/cooldown/custo-MP/flask); por ora carrega um bônus de stat equivalente.
 */
export const PET_BONUS: Record<string, PetBonus> = {
  // ── Mágicos / mana ──
  spirit_fox:          { stat: 'mp', pct: 0.10 },
  calopsita:           { stat: 'mp', pct: 0.10 },
  mini_necromante:     { stat: 'mp', pct: 0.10 }, // Fase 2: regen de MP/turno
  mini_leviata:        { stat: 'mp', pct: 0.10 }, // Fase 2: -custo de MP
  // ── Vida / tanque ──
  golem_guardian:      { stat: 'hp', pct: 0.10 },
  mini_kraken:         { stat: 'hp', pct: 0.10 }, // Fase 2: regen de HP/turno
  dog:                 { stat: 'hp', pct: 0.10 }, // Fase 2: +1 carga flask_hp/dia
  // ── Ataque ──
  mini_dragao_sombrio: { stat: 'atk', pct: 0.10 },
  mini_demonio_fome:   { stat: 'atk', pct: 0.10 }, // Fase 1.5: forrageio
  // ── Defesa / esquiva ──
  mini_relampago:      { stat: 'def', pct: 0.10 },
  mini_wyrm_gelo:      { stat: 'def', pct: 0.10 }, // Fase 2: -cooldown de skills
  cat:                 { stat: 'def', pct: 0.10 }, // Fase 1.5: forrageio
};

export function getPetBonus(companionType: string | null | undefined): PetBonus | null {
  if (!companionType) return null;
  return PET_BONUS[companionType] ?? null;
}

export type CombatBaseStats = {
  ataqueBase: number;
  defesaBase: number;
  hpMax: number;
  mpMax: number;
};

/**
 * Aplica o bônus percentual do pet ao stat correspondente. Puro e determinístico.
 * Preserva quaisquer campos extras do objeto (ex.: offenseAttr).
 */
export function applyPetBonus<T extends CombatBaseStats>(base: T, bonus: PetBonus | null): T {
  if (!bonus) return base;
  const bump = (v: number) => Math.round(v * (1 + bonus.pct));
  return {
    ...base,
    ataqueBase: bonus.stat === 'atk' ? bump(base.ataqueBase) : base.ataqueBase,
    defesaBase: bonus.stat === 'def' ? bump(base.defesaBase) : base.defesaBase,
    hpMax:      bonus.stat === 'hp'  ? bump(base.hpMax)      : base.hpMax,
    mpMax:      bonus.stat === 'mp'  ? bump(base.mpMax)      : base.mpMax,
  };
}

const STAT_LABEL: Record<PetStat, string> = { mp: 'MP máx', hp: 'HP máx', atk: 'ATK', def: 'DEF' };

/** Rótulo legível e neutro de idioma (MP/HP/ATK/DEF são universais). Ex.: "+10% MP máx". */
export function petBonusLabel(bonus: PetBonus | null): string | null {
  if (!bonus) return null;
  return `+${Math.round(bonus.pct * 100)}% ${STAT_LABEL[bonus.stat]}`;
}

// ── Pet ativo (Fase 1: localStorage por usuário) ──────────────────────────────
// Produtização: promover para profiles.active_companion_id (cross-device) quando
// o feel estiver validado. Aqui fica client-only pra não mexer no schema em prod.

const activeKey = (userId: string) => `active_pet:${userId}`;

export function getActivePetType(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try { return localStorage.getItem(activeKey(userId)); } catch { return null; }
}

export function setActivePetType(userId: string, companionType: string | null): void {
  try {
    if (companionType) localStorage.setItem(activeKey(userId), companionType);
    else localStorage.removeItem(activeKey(userId));
  } catch { /* localStorage indisponível — pet ativo apenas na sessão */ }
}

// ── Sustain em combate (Fase 2) ───────────────────────────────────────────────
// Efeitos POR TURNO aplicados na EDGE processar_turno (regen/-custo de MP). O
// cliente manda o companion_type ativo no corpo; a edge VERIFICA posse e aplica.
// A edge inline os MESMOS valores (Deno não importa este módulo) — estas funções
// puras existem pra teste e pra rotular a UI. Números = chute (Murillo calibra).

export type SustainEffect =
  | { kind: 'regen_hp'; pct: number } // % do HP máx curado ao fim de cada turno sobrevivido
  | { kind: 'regen_mp'; pct: number } // % do MP máx devolvido ao fim de cada turno
  | { kind: 'mp_cost';  pct: number }; // fração de REDUÇÃO do custo de MP das skills

export const PET_SUSTAIN: Record<string, SustainEffect> = {
  mini_kraken:     { kind: 'regen_hp', pct: 0.05 }, // tinta curativa
  mini_necromante: { kind: 'regen_mp', pct: 0.08 }, // dreno dos mortos
  mini_leviata:    { kind: 'mp_cost',  pct: 0.20 }, // marés aliviam o esforço arcano
};

export function getSustainEffect(companionType: string | null | undefined): SustainEffect | null {
  if (!companionType) return null;
  return PET_SUSTAIN[companionType] ?? null;
}

/** Custo de MP após a redução do pet (nunca negativo, arredondado). */
export function applyMpCostReduction(cost: number, eff: SustainEffect | null): number {
  if (!eff || eff.kind !== 'mp_cost') return Math.max(0, Math.round(cost));
  return Math.max(0, Math.round(cost * (1 - eff.pct)));
}

/** Recurso (HP ou MP) após o regen do pet no fim do turno, capado no máximo. */
export function applyRegen(
  current: number,
  max: number,
  eff: SustainEffect | null,
  kind: 'regen_hp' | 'regen_mp',
): number {
  if (!eff || eff.kind !== kind) return current;
  return Math.min(max, current + Math.round(max * eff.pct));
}

/** Rótulo legível e neutro de idioma. Ex.: "-20% custo de MP", "+5% HP/turno". */
export function sustainLabel(eff: SustainEffect | null): string | null {
  if (!eff) return null;
  const p = Math.round(eff.pct * 100);
  if (eff.kind === 'mp_cost')  return `-${p}% custo de MP`;
  if (eff.kind === 'regen_hp') return `+${p}% HP/turno`;
  return `+${p}% MP/turno`;
}

// ── Forrageio (Fase 1.5) ──────────────────────────────────────────────────────
// Pets caçadores trazem 1 item equipável por dia. A raridade escala com AFINIDADE,
// que sobe +1 a cada "dia perfeito" (todas as âncoras completas). Client-only:
// grant via insert em user_inventory (mesmo padrão de useGrantBossLoot). Zero
// XP/ouro. Números (thresholds/pesos) são chute — Murillo calibra.

/** Pets com forrageio. (Ambos também têm bônus de stat em PET_BONUS quando ativos.) */
export const FORAGE_PETS = ['cat', 'mini_demonio_fome'] as const;
export function isForagePet(companionType: string | null | undefined): boolean {
  return !!companionType && (FORAGE_PETS as readonly string[]).includes(companionType);
}

export type ForageRarity = 'comum' | 'incomum' | 'raro' | 'epico';
const FORAGE_RANK: Record<ForageRarity, number> = { comum: 0, incomum: 1, raro: 2, epico: 3 };
/** Ordem decrescente p/ fallback quando não há item da raridade sorteada. */
export const FORAGE_RARITY_DESC: ForageRarity[] = ['epico', 'raro', 'incomum', 'comum'];

/**
 * Teto de raridade por afinidade (thresholds = chute; calibrar). Guardrail:
 * épico só com afinidade ALTA; forrageio NUNCA dropa lendário. Tiers comum→raro→épico.
 */
export function forageRarityCap(affinity: number): ForageRarity {
  const a = affinity || 0;
  if (a >= 15) return 'epico';
  if (a >= 5) return 'raro';
  return 'comum';
}

/** Pesos base de drop (antes do teto por afinidade). Ajustáveis. */
const FORAGE_WEIGHTS: Array<{ rarity: ForageRarity; weight: number }> = [
  { rarity: 'comum', weight: 58 },
  { rarity: 'incomum', weight: 28 },
  { rarity: 'raro', weight: 11 },
  { rarity: 'epico', weight: 3 },
];

/** Sorteia a raridade do forrageio respeitando o teto por afinidade. rng() ∈ [0,1). */
export function rollForageRarity(affinity: number, rng: () => number = Math.random): ForageRarity {
  const cap = FORAGE_RANK[forageRarityCap(affinity)];
  const table = FORAGE_WEIGHTS.filter((t) => FORAGE_RANK[t.rarity] <= cap);
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of table) {
    if (r < t.weight) return t.rarity;
    r -= t.weight;
  }
  return table[table.length - 1].rarity;
}

/** Já forrageou hoje? (compara a data YYYY-MM-DD). */
export function hasForagedToday(lastForageAt: string | null | undefined, todayStr: string): boolean {
  return !!lastForageAt && String(lastForageAt).slice(0, 10) === todayStr;
}

/**
 * Afinidade após um "dia perfeito" (todas as âncoras completas). +1/dia, UMA vez.
 * Retorna null se não deve mudar (dia não-perfeito ou já ganhou hoje).
 */
export function accrueAffinity(
  current: number,
  lastAffinityDate: string | null | undefined,
  perfectDayToday: boolean,
  todayStr: string,
): { affinity: number; lastAffinityDate: string } | null {
  if (!perfectDayToday) return null;
  if (lastAffinityDate && String(lastAffinityDate).slice(0, 10) === todayStr) return null;
  return { affinity: (current || 0) + 1, lastAffinityDate: todayStr };
}
