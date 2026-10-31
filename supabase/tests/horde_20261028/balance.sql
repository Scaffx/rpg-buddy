\set ON_ERROR_STOP on
WITH scenarios AS (
  SELECT b.*,
    app_private.adventure_simulate_v3(
      b.started_at,b.hero_attack,b.hero_defense,b.hero_max_hp,b.hero_max_mp,
      b.enemy_power,CASE WHEN b.kind='boss' THEN 150 ELSE 100 END,
      b.skills,b.enemy_resistances,
      coalesce(b.rules_snapshot->>'default_effect','physical'),0,
      b.rules_snapshot->'pet'->'sustain') old_events
  FROM app_private.adventure_battles b
  WHERE b.user_id IN ('a0000000-0000-0000-0000-00000000a411',
    'a0000000-0000-0000-0000-00000000a412',
    'a0000000-0000-0000-0000-00000000a431')
), durations AS (
  SELECT stage,kind,hero_class,hero_level,
    extract(epoch FROM ((events->-1->>'at')::timestamptz-started_at)) v4_s,
    extract(epoch FROM ((old_events->-1->>'at')::timestamptz-started_at)) v3_s,
    (events->-1->>'hero_hp')::integer v4_hp,
    (events->-1->>'enemy_hp')::integer v4_enemy_hp,
    (old_events->-1->>'hero_hp')::integer v3_hp,
    (old_events->-1->>'enemy_hp')::integer v3_enemy_hp
  FROM scenarios
), rewards AS (
  SELECT *,
    greatest(1,least(48,floor((12+least(stage,50)::numeric/25+
      CASE WHEN kind='boss' THEN 2 ELSE 0 END)
      *sqrt(greatest(v4_s,0.1)/20)
      *least(1.1,greatest(0.1,stage::numeric/greatest(hero_level,1)))))::integer) v4_gold,
    greatest(1,least(48,floor((12+least(stage,50)::numeric/25+
      CASE WHEN kind='boss' THEN 2 ELSE 0 END)
      *sqrt(greatest(v3_s,0.1)/20)
      *least(1.1,greatest(0.1,stage::numeric/greatest(hero_level,1)))))::integer) v3_gold
  FROM durations
)
SELECT stage,kind,hero_class,hero_level,
  round(v3_s::numeric,2) v3_seconds,round(v4_s::numeric,2) v4_seconds,
  v3_hp,v4_hp,v3_enemy_hp,v4_enemy_hp,v3_gold,v4_gold,
  round((v3_gold*3600/v3_s)::numeric,1) v3_gold_per_active_hour,
  round((v4_gold*3600/v4_s)::numeric,1) v4_gold_per_active_hour
FROM rewards ORDER BY stage,hero_class,hero_level;
