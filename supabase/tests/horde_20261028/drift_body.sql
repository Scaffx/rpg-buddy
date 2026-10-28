\set ON_ERROR_STOP on
DO $drift$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  IF strpos(v_source,'-- Shared first lock')=0 THEN
    RAISE EXCEPTION 'fixture source changed';
  END IF;
  EXECUTE replace(v_source,'-- Shared first lock','-- Fixture changed first lock');
END $drift$;
