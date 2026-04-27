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
export const NPC_XP_REWARD = 25;
export const NPC_GOLD_REWARD = 15;
export const NPC_REFRESH_DAY = 1; // segunda-feira (0=Dom, 1=Seg)

// === Daily bonus ===
export const DAILY_BONUS_XP = 15;
export const DAILY_BONUS_GOLD = 5;
export const HEALTH_CHALLENGE_XP = 35;
