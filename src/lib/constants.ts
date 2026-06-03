// ============================================================
// Constantes globais do jogo — toda "magic number" deve
// ficar aqui para facilitar balanceamento e manutenção.
// ============================================================

// === Perfil / Respec ===
export const RESPEC_COST = 120;
export const MAX_COMBAT_SKILLS = 4;
export const NAME_CHANGE_COOLDOWN_DAYS = 7;

// === Saúde / Cuidado ===
/** ml de água por kg de peso corporal */
export const WATER_ML_PER_KG = 35;
/** Penalidade de HP por refeição faltante (níveis 1–15) */
export const MEAL_PENALTY_HP_FLAT = 10;
/** Penalidade de HP por refeição faltante como % do HP máx (nível > 15) */
export const MEAL_PENALTY_HP_PCT = 0.05;
/** Penalidade de MP como % do MP máx por água insuficiente (nível > 15) */
export const WATER_PENALTY_MP_PCT = 0.10;
/** A partir de qual nível as penalidades dinâmicas (%) se aplicam */
export const DYNAMIC_PENALTY_MIN_LEVEL = 15;

// === Missões / Falhas ===
/** Custo em ouro para recuperar uma missão falhada */
export const MISSION_FAILURE_PENALTY_GOLD = 10;
/** Cargas máximas do Streak Protector por semana */
export const STREAK_PROTECTOR_MAX_CHARGES = 3;

// === Combate ===
/** MP mínimo para poder usar uma skill (custo = 0 = Ataque Básico) */
export const MIN_MP_FOR_SKILL = 1;

// === Conquistas ===
export const ACHIEVEMENT_XP_REWARD = 30;
export const ACHIEVEMENT_GOLD_REWARD = 20;

// === Amigos ===
export const MAX_FRIENDS = 50;
export const MAX_PENDING_REQUESTS = 20;

// === NPCs ===
/** Base usada como default no schema do Supabase; consumers em runtime devem usar getNpcXpReward(level). */
export const NPC_XP_REWARD = 25;
export const NPC_GOLD_REWARD = 15;
export const NPC_REFRESH_DAY = 1; // segunda-feira (0=Dom, 1=Seg)

// === Daily bonus ===
export const DAILY_BONUS_XP = 15;
export const DAILY_BONUS_GOLD = 5;
export const HEALTH_CHALLENGE_XP = 35;

// === XP Multiplier ===
/** Cap do multiplicador de XP por nível (aplicado em useCompleteMission). */
export const XP_LEVEL_MULTIPLIER_CAP = 3.5;

// === Reward scaling ===
/** Bônus de XP do Daily Bonus por nível além do 1. */
export function getDailyBonusXp(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return DAILY_BONUS_XP + (safeLevel - 1) * 3;
}

/** Ouro do Daily Bonus: ganha +1 a cada 5 níveis. */
export function getDailyBonusGold(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return DAILY_BONUS_GOLD + Math.floor((safeLevel - 1) / 5);
}

/** Recompensa de XP de missão de NPC escalada por nível do jogador. */
export function getNpcXpReward(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return NPC_XP_REWARD + (safeLevel - 1) * 5;
}

/** Recompensa de ouro de missão de NPC escalada por nível do jogador. */
export function getNpcGoldReward(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return NPC_GOLD_REWARD + Math.floor((safeLevel - 1) / 4);
}

/** XP do Health Challenge escala devagar com nível. */
export function getHealthChallengeXp(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return HEALTH_CHALLENGE_XP + (safeLevel - 1) * 4;
}
