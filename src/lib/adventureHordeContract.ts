/** Contrato aditivo da aventura v4. Campos singulares continuam presentes para replays v3. */
export type HordeActor = 'hero' | 'enemy';

export type HordeEnemy = {
  slot: number;
  id: string;
  name: string;
  icon: string | null;
  boss_id: string | null;
  max_hp: number;
  hp: number;
  max_mp: number;
  mp: number;
  resistances: Record<string, number>;
};

export type HordeHit = {
  target_slot: number;
  damage: number;
  raw_damage: number;
  damage_multiplier: number;
};

export type HordeEvent = {
  at: string;
  actor: HordeActor;
  actor_slot: number | null;
  target_slot: number | null;
  target_slots?: number[];
  hits?: HordeHit[];
  kind: 'attack' | 'skill';
  damage: number;
  hero_hp: number;
  hero_mp: number;
  enemy_hp: number;
  enemy_mp: number;
  enemies_hp: number[];
  enemies_mp: number[];
  skill_id: string | null;
  skill_name: string | null;
  effect: string;
  mp_cost?: number;
  skill_type?: string | null;
  healing?: number;
  raw_damage?: number;
  damage_multiplier?: number;
  effect_note?: string | null;
};

export type HordeBattleExtension = {
  engine_version: 'v4_horde';
  end_reason: 'event_limit' | null;
  enemies: HordeEnemy[];
  events: HordeEvent[];
  /** Legado: soma do HP restante do encontro para consumidores ainda singulares. */
  enemy_hp: number;
  enemy_max_hp: number;
  enemy_name: string;
  enemy_icon: string | null;
};

export function isHordeBattle(value: { engine_version?: string }): value is typeof value & HordeBattleExtension {
  return value.engine_version === 'v4_horde';
}
