-- Align first-clear encounter receipts with the server's 0..48 win award.
-- Run after Recipes 022416, Economy 022614 and Chests 022726.
BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $guard$
DECLARE
  v_encounter oid := to_regclass('public.adventure_encounters');
  v_gold_attnum smallint;
BEGIN
  IF v_encounter IS NULL
     OR to_regclass('app_private.adventure_battles') IS NULL
     OR to_regclass('public.adventure_state') IS NULL
     OR to_regprocedure('app_private.sync_auto_adventure()') IS NULL
     OR to_regprocedure('public.sync_auto_adventure()') IS NULL
  THEN RAISE EXCEPTION 'ENCOUNTER_GOLD_SOURCE_OR_SCHEMA_DRIFT' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid='app_private.sync_auto_adventure()'::regprocedure
         AND md5(pg_get_functiondef(p.oid))='59914430e3b78e96f69deaf770f82910'
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND p.prorettype='jsonb'::regtype AND p.pronargs=0
         AND p.proconfig=ARRAY['search_path=""']::text[]
         AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
         AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid='public.sync_auto_adventure()'::regprocedure
         AND md5(pg_get_functiondef(p.oid))='1879a24abc08fec402ea5d96f4a199c6'
         AND p.proowner='postgres'::regrole AND NOT p.prosecdef
         AND p.prorettype='jsonb'::regtype AND p.pronargs=0
         AND p.proconfig=ARRAY['search_path=""']::text[]
         AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
         AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','app_private')
           AND p.proname='sync_auto_adventure')<>2
  THEN RAISE EXCEPTION 'ENCOUNTER_GOLD_SYNC_DRIFT' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=v_encounter
       AND c.relkind='r' AND c.relowner='postgres'::regrole
       AND c.relrowsecurity AND NOT c.relforcerowsecurity
       AND has_table_privilege('authenticated',c.oid,'SELECT')
       AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
     OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_encounter
       AND a.attnum>0 AND NOT a.attisdropped
       AND (has_column_privilege('anon',a.attrelid,a.attname,'INSERT,UPDATE')
         OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')))
     OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=v_encounter)<>1
     OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=v_encounter
       AND p.polname='adventure_encounters_own_read' AND p.polcmd='r'
       AND p.polpermissive AND p.polroles=ARRAY['authenticated'::regrole::oid]
       AND pg_get_expr(p.polqual,p.polrelid)='(( SELECT auth.uid() AS uid) = user_id)'
       AND p.polwithcheck IS NULL)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_encounter
       AND a.attname='gold' AND a.atttypid='integer'::regtype
       AND a.attnotnull AND NOT a.attisdropped)
  THEN RAISE EXCEPTION 'ENCOUNTER_GOLD_OWNER_ACL_RLS_DRIFT' USING ERRCODE='22023';
  END IF;

  SELECT a.attnum INTO STRICT v_gold_attnum FROM pg_attribute a
    WHERE a.attrelid=v_encounter AND a.attname='gold' AND NOT a.attisdropped;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=v_encounter
       AND c.conname='adventure_encounters_gold_check' AND c.contype='c'
       AND c.convalidated AND c.conislocal AND c.coninhcount=0
       AND c.conparentid=0 AND NOT c.condeferrable AND NOT c.condeferred
       AND c.conkey=ARRAY[v_gold_attnum]::smallint[]
       AND pg_get_constraintdef(c.oid)='CHECK (((gold >= 0) AND (gold <= 12)))')
     OR (SELECT count(*) FROM pg_constraint c WHERE c.conrelid=v_encounter
         AND c.conname='adventure_encounters_gold_check')<>1
     OR (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
         WHERE c.conrelid='app_private.adventure_battles'::regclass
           AND c.conname='adventure_battles_gold_awarded_check')
         IS DISTINCT FROM 'CHECK (((gold_awarded >= 0) AND (gold_awarded <= 48)))'
     OR (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
         WHERE c.conrelid='public.adventure_state'::regclass
           AND c.conname='adventure_state_gold_today_check')
         IS DISTINCT FROM 'CHECK ((gold_today >= 0))'
  THEN RAISE EXCEPTION 'ENCOUNTER_GOLD_CHECK_DRIFT' USING ERRCODE='22023';
  END IF;
END;
$guard$;

ALTER TABLE public.adventure_encounters
  DROP CONSTRAINT adventure_encounters_gold_check;
ALTER TABLE public.adventure_encounters
  ADD CONSTRAINT adventure_encounters_gold_check CHECK (gold BETWEEN 0 AND 48);
COMMIT;
