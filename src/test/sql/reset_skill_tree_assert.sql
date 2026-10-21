\set ON_ERROR_STOP on
INSERT INTO public.skill_tree_nodes(id,cost,node_type,tree) VALUES
  ('point_a',2,'skill','aprendiz'), ('point_b',1,'skill','mago'),
  ('scroll_a',1,'skill','cinzas');
INSERT INTO public.profiles(user_id,level,xp,current_class_id,permanent_strength,combat_skill_loadout) VALUES
  ('00000000-0000-0000-0000-000000000010',10,1234,'mago',9,
   '[{"id":"point_a"},{"id":"scroll_a"},{"id":"weapon_1"},{"id":"point_b"}]'),
  ('00000000-0000-0000-0000-000000000011',11,2234,'mago',8,
   '[{"id":"point_a"},{"id":"scroll_a"}]'),
  ('00000000-0000-0000-0000-000000000012',11,3234,'mago',7,
   '[{"id":"point_a"}]'),
  ('00000000-0000-0000-0000-000000000013',10,4234,'mago',6,
   '[{"id":"point_b"}]');
INSERT INTO public.user_balance(user_id,gold) VALUES
  ('00000000-0000-0000-0000-000000000010',500),
  ('00000000-0000-0000-0000-000000000011',500),
  ('00000000-0000-0000-0000-000000000012',100),
  ('00000000-0000-0000-0000-000000000013',777);
INSERT INTO public.player_skill_nodes(user_id,node_id,rank,source) VALUES
  ('00000000-0000-0000-0000-000000000010','point_a',2,'points'),
  ('00000000-0000-0000-0000-000000000010','point_b',1,'points'),
  ('00000000-0000-0000-0000-000000000010','scroll_a',1,'scroll'),
  ('00000000-0000-0000-0000-000000000011','point_a',1,'points'),
  ('00000000-0000-0000-0000-000000000011','scroll_a',1,'drop'),
  ('00000000-0000-0000-0000-000000000012','point_a',1,'points'),
  ('00000000-0000-0000-0000-000000000013','point_b',1,'points');
INSERT INTO public.battle_snapshot(user_id,snapshot)
VALUES ('00000000-0000-0000-0000-000000000010','{"skill":"point_a","hero_hp":80}');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
SET ROLE authenticated;
SELECT public.reset_skill_tree() AS level10_first;
SELECT public.reset_skill_tree() AS level10_repeat;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false);
SET ROLE authenticated;
SELECT public.reset_skill_tree() AS level11_first;
SELECT public.reset_skill_tree() AS level11_repeat;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
SET ROLE authenticated;
DO $test$
BEGIN
  PERFORM public.reset_skill_tree();
  RAISE EXCEPTION 'Expected INSUFFICIENT_GOLD';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'INSUFFICIENT_GOLD' THEN RAISE; END IF;
END;
$test$;
RESET ROLE;

DO $assert$
BEGIN
  IF EXISTS (SELECT 1 FROM public.player_skill_nodes WHERE user_id='00000000-0000-0000-0000-000000000010' AND source='points')
     OR (SELECT count(*) FROM public.player_skill_nodes WHERE user_id='00000000-0000-0000-0000-000000000010' AND source='scroll') <> 1
     OR (SELECT gold FROM public.user_balance WHERE user_id='00000000-0000-0000-0000-000000000010') <> 500
     OR (SELECT combat_skill_loadout FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000010')
        <> '[{"id":"scroll_a"},{"id":"weapon_1"}]'::jsonb
  THEN RAISE EXCEPTION 'Level 10 free reset or selective cleanup failed'; END IF;
  IF (SELECT gold FROM public.user_balance WHERE user_id='00000000-0000-0000-0000-000000000011') <> 200
     OR EXISTS (SELECT 1 FROM public.player_skill_nodes WHERE user_id='00000000-0000-0000-0000-000000000011' AND source='points')
     OR (SELECT combat_skill_loadout FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000011') <> '[{"id":"scroll_a"}]'::jsonb
  THEN RAISE EXCEPTION 'Level 11 charge/repeated reset failed'; END IF;
  IF (SELECT gold FROM public.user_balance WHERE user_id='00000000-0000-0000-0000-000000000012') <> 100
     OR (SELECT count(*) FROM public.player_skill_nodes WHERE user_id='00000000-0000-0000-0000-000000000012') <> 1
     OR (SELECT combat_skill_loadout FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000012') <> '[{"id":"point_a"}]'::jsonb
  THEN RAISE EXCEPTION 'Insufficient gold was not atomic'; END IF;
  IF (SELECT count(*) FROM public.player_skill_nodes WHERE user_id='00000000-0000-0000-0000-000000000013') <> 1
     OR (SELECT gold FROM public.user_balance WHERE user_id='00000000-0000-0000-0000-000000000013') <> 777
     OR (SELECT xp FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000010') <> 1234
     OR (SELECT current_class_id FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000010') <> 'mago'
     OR (SELECT permanent_strength FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000010') <> 9
     OR (SELECT snapshot FROM public.battle_snapshot WHERE user_id='00000000-0000-0000-0000-000000000010') <> '{"skill":"point_a","hero_hp":80}'::jsonb
  THEN RAISE EXCEPTION 'Other hero, permanent state or battle snapshot changed'; END IF;
  IF has_function_privilege('anon','public.reset_skill_tree()','EXECUTE')
     OR has_function_privilege('anon','app_private.reset_skill_tree_core()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.reset_skill_tree()','EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid='public.reset_skill_tree()'::regprocedure)
  THEN RAISE EXCEPTION 'RPC privileges changed'; END IF;
  RAISE NOTICE 'RESET_SKILL_TREE_ASSERT_PASS';
END;
$assert$;
