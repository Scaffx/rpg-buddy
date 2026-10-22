\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GOLD_BOUND_ASSERT: %',p_label; END IF;
END $$;

-- Schema-bound probes use synthetic rows only; no client-provided win is paid.
INSERT INTO public.adventure_encounters
  (user_id,stage,attempt,kind,won,hero_power,enemy_power,gold)
VALUES ('33333333-3333-3333-3333-333333333333',101,0,'normal',false,1,1,48),
       ('33333333-3333-3333-3333-333333333333',102,0,'normal',false,1,1,0);
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.adventure_encounters
  WHERE user_id='33333333-3333-3333-3333-333333333333'
    AND stage IN (101,102) AND gold IN (0,48)), '0 and 48 accepted');
DO $test$
DECLARE v_name text;
BEGIN
  BEGIN
    INSERT INTO public.adventure_encounters
      (user_id,stage,attempt,kind,won,hero_power,enemy_power,gold)
    VALUES ('33333333-3333-3333-3333-333333333333',103,0,'normal',false,1,1,49);
    RAISE EXCEPTION '49_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_name=CONSTRAINT_NAME;
    PERFORM pg_temp.ok(v_name='adventure_encounters_gold_check','49 rejected by target CHECK');
  END;
  BEGIN
    INSERT INTO public.adventure_encounters
      (user_id,stage,attempt,kind,won,hero_power,enemy_power,gold)
    VALUES ('33333333-3333-3333-3333-333333333333',104,0,'normal',false,1,1,-1);
    RAISE EXCEPTION 'NEGATIVE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_name=CONSTRAINT_NAME;
    PERFORM pg_temp.ok(v_name='adventure_encounters_gold_check','negative rejected by target CHECK');
  END;
END;
$test$;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.adventure_encounters
  WHERE user_id='33333333-3333-3333-3333-333333333333'
    AND stage IN (103,104)), 'invalid rows absent');
SELECT 'GOLD_RANGE_BOUNDS_PASS' AS result;
ROLLBACK;
