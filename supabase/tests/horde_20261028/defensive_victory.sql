\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  v_start timestamptz := '2026-10-28 12:00Z';
  v_boss jsonb := jsonb_build_array(jsonb_build_object(
    'slot',0,'id','boss','name','Boss','icon',NULL,'boss_id',NULL,
    'power',1000,'max_hp',150,'max_mp',0,'resistances',jsonb_build_object(),
    'skill',NULL));
  v_horde jsonb;
  v_events jsonb;
  v_count integer;
  v_duration numeric;
BEGIN
  v_events := app_private.adventure_simulate_horde(v_start,1,100000,100000,0,
    v_boss,'[]'::jsonb,'physical',0,NULL);
  v_count := jsonb_array_length(v_events);
  v_duration := extract(epoch FROM (v_events->-1->>'at')::timestamptz-v_start);
  IF v_count<=192 OR v_count>1200 OR v_duration<>418.7
    OR (v_events->-1->>'enemy_hp')::integer<>0
    OR (v_events->-1->>'hero_hp')::integer<=0
    OR (SELECT count(*) FROM jsonb_array_elements(v_events) e
        WHERE e->>'actor'='hero' AND (e->>'damage')::integer=1)<>150
  THEN RAISE EXCEPTION 'DEFENSIVE_BOSS_REGRESSION events=% seconds=%',v_count,v_duration;
  END IF;
  RAISE NOTICE 'DEFENSIVE_BOSS_PASS events=% seconds=%',v_count,v_duration;

  SELECT jsonb_agg(jsonb_build_object('slot',slot,'id','horde-'||slot,
    'name','Horde '||slot,'icon',NULL,'boss_id',NULL,'power',1000,
    'max_hp',34,'max_mp',0,'resistances',jsonb_build_object(),'skill',NULL)
    ORDER BY slot) INTO v_horde FROM generate_series(0,2) slot;
  v_events := app_private.adventure_simulate_horde(v_start,1,100000,100000,0,
    v_horde,'[]'::jsonb,'physical',0,NULL);
  v_count := jsonb_array_length(v_events);
  v_duration := extract(epoch FROM (v_events->-1->>'at')::timestamptz-v_start);
  IF v_count<=192 OR v_count>1200 OR v_duration>=900
    OR (v_events->-1->>'enemy_hp')::integer<>0
    OR (v_events->-1->>'hero_hp')::integer<=0
    OR (v_events->-1->'enemies_hp')<>'[0, 0, 0]'::jsonb
    OR (SELECT count(*) FROM jsonb_array_elements(v_events) e
        WHERE e->>'actor'='hero' AND (e->>'damage')::integer=1)<>102
  THEN RAISE EXCEPTION 'DEFENSIVE_HORDE_REGRESSION events=% seconds=%',v_count,v_duration;
  END IF;
  RAISE NOTICE 'DEFENSIVE_HORDE_PASS events=% seconds=%',v_count,v_duration;
END $test$;
ROLLBACK;
