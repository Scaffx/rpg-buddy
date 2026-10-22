\set ON_ERROR_STOP on
-- Commit these server-owned battle rows before two independent psql sessions.
ALTER TABLE public.profiles
  ADD COLUMN permanent_strength integer NOT NULL DEFAULT 7,
  ADD COLUMN permanent_intelligence integer NOT NULL DEFAULT 9;
DO $test$
DECLARE v_user uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  IF app_private.hero_class_key(v_user) <> 'mago'
     OR EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks WHERE user_id=v_user) THEN
    RAISE EXCEPTION 'concurrency identity already has right'; END IF;
END;
$test$;
INSERT INTO app_private.adventure_battles
  (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
VALUES
  ('00000000-0000-0000-0000-000000000341',
   '22222222-2222-2222-2222-222222222222',10,'boss','fighting',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','mago',80,'forest',
   '2026-10-22 11:00+00','2026-10-22 11:01+00'),
  ('00000000-0000-0000-0000-000000000342',
   '22222222-2222-2222-2222-222222222222',10,'boss','fighting',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','mago',80,'forest',
   '2026-10-22 11:02+00','2026-10-22 11:04+00');
\echo RECIPE_CLASS_TRANSITION_CONCURRENCY_PREPARED
