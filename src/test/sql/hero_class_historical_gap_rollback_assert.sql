\set ON_ERROR_STOP on
-- Run after the migration fails under psql -1 -v ON_ERROR_STOP=1.
DO $$
BEGIN
  IF to_regclass('app_private.hero_class_identity') IS NOT NULL
     OR to_regprocedure('app_private.class_path_matches(uuid,text,integer)') IS NOT NULL
     OR (SELECT count(*) FROM public.profiles WHERE user_id=
         '00000000-0000-0000-0000-000000000005'::uuid
         AND starter_class='mago' AND level=35
         AND current_class_id='00000003-0000-0000-0000-000000000003'::uuid) <> 1
     OR (SELECT column_index FROM public.classes WHERE id=
         '00000003-0000-0000-0000-000000000003'::uuid) <> 4
  THEN RAISE EXCEPTION 'HERO_CLASS_GAP_ROLLBACK_FAILED'; END IF;
END $$;
SELECT 'HERO_CLASS_GAP_ROLLBACK_PASS' AS result;
