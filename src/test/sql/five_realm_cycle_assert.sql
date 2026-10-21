-- Apply after five_realm_inflight_setup.sql and the migration.
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FIVE_REALMS_ASSERT: %',m; END IF; END $$;

SELECT pg_temp.ok((SELECT count(*)=18 FROM app_private.adventure_enemy_catalog),
  'exactly 18 catalog rows');
SELECT pg_temp.ok((SELECT md5(string_agg(biome::text||':'||slot::text||':'||name||':'||icon||':'||resistances::text,
  '|' ORDER BY biome,slot))='621a73d2352993ddbb473ed991e55cff'
  FROM app_private.adventure_enemy_catalog WHERE biome<=3),
  'legacy catalog unchanged');
SELECT pg_temp.ok((SELECT array_agg(name ORDER BY biome,slot)=ARRAY[
  'Escorpião das dunas','Cobra da areia','Besouro do deserto',
  'Lobo da neve','Coruja glacial','Golem de gelo']
  FROM app_private.adventure_enemy_catalog WHERE biome IN (4,5)),
  'new names and slot order exact');
SELECT pg_temp.ok((SELECT count(*)=6 FROM app_private.adventure_enemy_catalog
  WHERE biome IN (4,5) AND resistances='{}'::jsonb AND icon<>'') ,
  'new creatures have icons and no added resistances');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.five_realm_inflight_probe p
  JOIN app_private.adventure_battles b USING(id)
  WHERE p.row_hash=md5(to_jsonb(b)::text)
    AND (p.stage,p.biome) IN ((11,'aquatic'),(21,'ruins'),(31,'volcanic'))),
  'all in-flight old biomes and full snapshots unchanged');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_battles
  WHERE stage=1 AND user_id='aaaaaaaa-0000-0000-0000-000000000001'
    AND biome='forest' AND engine_version IS NULL),
  'pre-v3 forest battle survives');

CREATE TEMP TABLE expected_realm(stage integer PRIMARY KEY, biome text NOT NULL,
  catalog_biome integer, kind text NOT NULL);
INSERT INTO expected_realm VALUES
  (1,'forest',0,'normal'),(9,'forest',0,'normal'),(10,'forest',NULL,'boss'),
  (11,'desert',4,'normal'),(19,'desert',4,'normal'),(20,'desert',NULL,'boss'),
  (21,'aquatic',1,'normal'),(29,'aquatic',1,'normal'),(30,'aquatic',NULL,'boss'),
  (31,'ice',5,'normal'),(39,'ice',5,'normal'),(40,'ice',NULL,'boss'),
  (41,'volcanic',3,'normal'),(42,'volcanic',3,'normal'),
  (49,'volcanic',3,'normal'),(50,'volcanic',NULL,'boss'),
  (51,'forest',0,'normal'),(100,'volcanic',NULL,'boss'),
  (101,'forest',0,'normal'),(110,'forest',NULL,'boss'),
  (111,'desert',4,'normal'),(150,'volcanic',NULL,'boss'),
  (151,'forest',0,'normal');

INSERT INTO auth.users(id)
SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid
FROM expected_realm;
INSERT INTO public.profiles(user_id,level,starter_class)
SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid,50,'guerreiro'
FROM expected_realm;
INSERT INTO public.attributes(user_id,name,level)
SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid,'forca',5
FROM expected_realm;
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid,stage,0,clock_timestamp()
FROM expected_realm;

SET ROLE authenticated;
DO $$
DECLARE s integer;
BEGIN
  FOR s IN SELECT unnest(ARRAY[1,9,10,11,19,20,21,29,30,31,39,40,41,42,49,50,51,100,101,110,111,150,151]) LOOP
    PERFORM set_config('request.jwt.claim.sub',
      ('bbbbbbbb-0000-0000-0000-'||lpad(s::text,12,'0'))::text,true);
    PERFORM public.sync_auto_adventure();
    PERFORM public.sync_auto_adventure(); -- retry before deadline must be inert
  END LOOP;
END $$;
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*)=23 FROM expected_realm e
  JOIN public.adventure_state s ON s.user_id=('bbbbbbbb-0000-0000-0000-'||lpad(e.stage::text,12,'0'))::uuid
  JOIN app_private.adventure_battles b ON b.id=s.current_battle_id
  LEFT JOIN app_private.adventure_enemy_catalog c ON c.biome=e.catalog_biome
    AND c.slot=(e.stage-1)%3
  WHERE s.stage=e.stage AND s.attempt=0 AND b.stage=e.stage AND b.kind=e.kind
    AND b.biome=e.biome AND b.status='fighting' AND b.gold_awarded=0
    AND (e.kind='boss' OR (b.enemy_name=c.name AND b.enemy_icon=c.icon
      AND b.enemy_resistances=c.resistances))),
  'every boundary, enemy slot and stage stays correct');
SELECT pg_temp.ok((SELECT count(*)=23 FROM expected_realm e
  JOIN app_private.adventure_battles b ON b.user_id=('bbbbbbbb-0000-0000-0000-'||lpad(e.stage::text,12,'0'))::uuid
  WHERE b.stage=e.stage), 'one battle after duplicate sync');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.gold_history
  WHERE user_id IN (SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid
    FROM expected_realm)), 'no gold at battle allocation');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.adventure_encounters
  WHERE user_id IN (SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid
    FROM expected_realm)), 'no encounter receipt at battle allocation');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.boss_battles
  WHERE user_id IN (SELECT ('bbbbbbbb-0000-0000-0000-'||lpad(stage::text,12,'0'))::uuid
    FROM expected_realm)), 'no boss receipt at battle allocation');

SELECT pg_temp.ok((SELECT count(*)=8 FROM expected_realm e
  JOIN app_private.adventure_battles b ON b.user_id=('bbbbbbbb-0000-0000-0000-'||lpad(e.stage::text,12,'0'))::uuid
  JOIN LATERAL (SELECT id FROM public.bosses WHERE is_world_event=false
    ORDER BY level,id OFFSET ((e.stage/10-1) %
      (SELECT count(*) FROM public.bosses WHERE is_world_event=false)) LIMIT 1) boss ON true
  WHERE e.kind='boss' AND b.boss_id=boss.id),
  'existing boss order and IDs stay unchanged');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE')
  AND has_function_privilege('authenticated','public.sync_auto_adventure()','EXECUTE')
  AND NOT has_table_privilege('authenticated','app_private.adventure_enemy_catalog','INSERT')
  AND NOT has_table_privilege('authenticated','app_private.adventure_battles','INSERT'),
  'RPC and private table ACL remain closed');
SELECT set_config('test.other_battle',
  (SELECT current_battle_id::text FROM public.adventure_state
    WHERE user_id='bbbbbbbb-0000-0000-0000-000000000009'),false);
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000001';
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure(current_setting('test.other_battle')::uuid);
    RAISE EXCEPTION 'CROSS_IDENTITY_ADVANCE_ACCEPTED';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
END $$;
RESET request.jwt.claim.sub;
DO $$ BEGIN
  BEGIN
    PERFORM public.sync_auto_adventure();
    RAISE EXCEPTION 'UNAUTHENTICATED_ACCEPTED';
  EXCEPTION WHEN sqlstate '28000' THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.sync_auto_adventure();
    RAISE EXCEPTION 'ANON_EXECUTE_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'FIVE_REALMS_CYCLE_PASS';
