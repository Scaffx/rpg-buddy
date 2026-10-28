\set ON_ERROR_STOP on
CREATE TEMP TABLE horde_benchmark(label text,elapsed_ms numeric);
DO $bench$
DECLARE b app_private.adventure_battles%ROWTYPE; v_start timestamptz;
  v_heavy jsonb;
BEGIN
  FOR b IN SELECT * FROM app_private.adventure_battles
    WHERE user_id IN ('a0000000-0000-0000-0000-00000000a411',
      'a0000000-0000-0000-0000-00000000a412')
    ORDER BY stage LOOP
    FOR i IN 1..30 LOOP
      v_start:=clock_timestamp();
      PERFORM app_private.adventure_simulate_horde(
        b.started_at,b.hero_attack,b.hero_defense,b.hero_max_hp,b.hero_max_mp,
        b.rules_snapshot->'enemies',b.skills,
        coalesce(b.rules_snapshot->>'default_effect','physical'),0,
        b.rules_snapshot->'pet'->'sustain');
      INSERT INTO horde_benchmark VALUES(
        CASE WHEN b.kind='boss' THEN 'boss_real' ELSE 'horde_real' END,
        extract(epoch FROM clock_timestamp()-v_start)*1000);
    END LOOP;
  END LOOP;
  SELECT jsonb_agg(e||jsonb_build_object('max_hp',10000,'power',1)
    ORDER BY (e->>'slot')::integer) INTO v_heavy
    FROM jsonb_array_elements((SELECT rules_snapshot->'enemies'
      FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a411')) e;
  FOR i IN 1..30 LOOP
    v_start:=clock_timestamp();
    PERFORM app_private.adventure_simulate_horde(
      '2026-10-28 12:00Z',1,100000,100000,0,v_heavy,'[]'::jsonb,
      'physical',0,NULL);
    INSERT INTO horde_benchmark VALUES('clock_15m',
      extract(epoch FROM clock_timestamp()-v_start)*1000);
  END LOOP;
END $bench$;
SELECT label,count(*) samples,round(percentile_cont(0.95) WITHIN GROUP
  (ORDER BY elapsed_ms)::numeric,3) p95_ms,round(max(elapsed_ms),3) max_ms
  FROM horde_benchmark GROUP BY label ORDER BY label;
SELECT CASE WHEN b.kind='boss' THEN 'boss_mago' ELSE 'horde_mago' END scenario,
  jsonb_array_length(b.events) v4_events,
  round(extract(epoch FROM ((b.events->-1->>'at')::timestamptz-b.started_at))::numeric,3) v4_seconds,
  (b.events->-1->>'hero_hp')::integer v4_hero_hp,
  jsonb_array_length(v3.e) v3_events,
  round(extract(epoch FROM ((v3.e->-1->>'at')::timestamptz-b.started_at))::numeric,3) v3_seconds,
  (v3.e->-1->>'hero_hp')::integer v3_hero_hp
  FROM app_private.adventure_battles b
  CROSS JOIN LATERAL (SELECT app_private.adventure_simulate_v3(
    b.started_at,b.hero_attack,b.hero_defense,b.hero_max_hp,b.hero_max_mp,
    b.enemy_power,CASE WHEN b.kind='boss' THEN 150 ELSE 100 END,
    b.skills,b.enemy_resistances,
    coalesce(b.rules_snapshot->>'default_effect','physical'),0,
    b.rules_snapshot->'pet'->'sustain') e) v3
  WHERE b.user_id IN ('a0000000-0000-0000-0000-00000000a411',
    'a0000000-0000-0000-0000-00000000a412') ORDER BY b.stage;
