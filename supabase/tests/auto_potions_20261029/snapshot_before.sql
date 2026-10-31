\set ON_ERROR_STOP on
-- Run on frozen v4 before AoE and before the auto-potion migration.
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000b910'),
  ('a0000000-0000-0000-0000-00000000b911');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b910',1,'novato'),
  ('a0000000-0000-0000-0000-00000000b911',1,'novato');
WITH v3 AS (
  SELECT app_private.adventure_simulate_v3(clock_timestamp(),15,5,130,64,
    42,100,'[]'::jsonb,'{}'::jsonb,'physical',0,NULL) AS events
)
INSERT INTO app_private.adventure_battles
  (user_id,stage,attempt,kind,status,replay,biome,started_at,ends_at,
   hero_power,hero_class,hero_level,enemy_power,hero_max_hp,enemy_max_hp,
   enemy_name,skills,events,hero_attack,hero_defense,hero_max_mp,
   enemy_resistances,engine_version,rules_snapshot)
SELECT 'a0000000-0000-0000-0000-00000000b910',15,0,'normal','fighting',false,
  'desert',(events->0->>'at')::timestamptz-interval '800 milliseconds',
  (events->-1->>'at')::timestamptz,30,'novato',1,42,130,100,'Inimigo v3',
  '[]'::jsonb,events,15,5,64,'{}'::jsonb,'v3',
  jsonb_build_object('version','v3','hero_attack',15,'hero_defense',5,
    'hero_max_hp',130,'hero_max_mp',64,'skills','[]'::jsonb,'default_effect','physical')
FROM v3;
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b911',15,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b911';
SELECT public.sync_auto_adventure() AS v4 \gset potion_
RESET ROLE;
CREATE TABLE app_private.auto_potions_snapshot_marker AS
  SELECT id,engine_version,md5(events::text) events_md5,
    md5(rules_snapshot::text) rules_md5,md5(skills::text) skills_md5
  FROM app_private.adventure_battles WHERE user_id IN
    ('a0000000-0000-0000-0000-00000000b910',
     'a0000000-0000-0000-0000-00000000b911');
DO $test$
BEGIN
  IF (SELECT count(*) FROM app_private.auto_potions_snapshot_marker)<>2 OR
    (SELECT count(DISTINCT engine_version) FROM app_private.auto_potions_snapshot_marker)<>2 THEN
    RAISE EXCEPTION 'AUTO_POTION_SNAPSHOT_FIXTURE'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_SNAPSHOT_BEFORE_PASS';
END $test$;
