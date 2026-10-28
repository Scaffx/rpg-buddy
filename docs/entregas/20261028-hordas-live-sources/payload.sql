CREATE OR REPLACE FUNCTION app_private.adventure_battle_payload(p_battle app_private.adventure_battles, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id',p_battle.id,'stage',p_battle.stage,'attempt',p_battle.attempt,
    'kind',p_battle.kind,'status',p_battle.status,'replay',p_battle.replay,
    'biome',p_battle.biome,
    'started_at',p_battle.started_at,'ends_at',p_battle.ends_at,
    'hero_power',p_battle.hero_power,'hero_class',p_battle.hero_class,
    'enemy_power',p_battle.enemy_power,
    'hero_max_hp',p_battle.hero_max_hp,'enemy_max_hp',p_battle.enemy_max_hp,
    'hero_hp',coalesce((SELECT (event->>'hero_hp')::integer
      FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
      WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.hero_max_hp),
    'enemy_hp',coalesce((SELECT (event->>'enemy_hp')::integer
      FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
      WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.enemy_max_hp),
    'enemy_name',p_battle.enemy_name,'enemy_icon',p_battle.enemy_icon,
    'boss_id',p_battle.boss_id,'events',p_battle.events)
    || CASE WHEN p_battle.engine_version='v3' THEN jsonb_build_object(
      'hero_max_mp',p_battle.hero_max_mp,
      'hero_mp',coalesce((SELECT (event->>'hero_mp')::integer
        FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
        WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.hero_max_mp),
      'hero_attack',p_battle.hero_attack,'hero_defense',p_battle.hero_defense,
      'engine_version',p_battle.engine_version,
      'end_reason',CASE WHEN p_battle.status='draw' THEN 'turn_limit' ELSE NULL END,
      'enemy_resistances',p_battle.enemy_resistances,
      'pet',p_battle.rules_snapshot->'pet') ELSE jsonb_build_object('pet',NULL) END;
$function$
