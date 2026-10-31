\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reform_ok(value boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'REFORM_CHAIN_ASSERT %',label; END IF;
END $$;
INSERT INTO public.adventure_state(user_id,stage)
VALUES('11111111-1111-1111-1111-111111111111',35)
ON CONFLICT(user_id) DO UPDATE SET stage=35;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.reform_ok((public.get_adventure_journey(1)->>'stage')::integer=35,'journey uses authoritative stage');
SELECT pg_temp.reform_ok(public.save_adventure_journey_choice(1,4,'restore')->>'choice'='restore','journey choice persists');
SELECT pg_temp.reform_ok((public.save_adventure_journey_choice(1,4,'restore')->>'replayed')::boolean,'journey replay');
SELECT pg_temp.reform_ok((public.get_adventure_chests()->>'slots_total')::integer=4,'chests remain callable with journey');
RESET ROLE;
UPDATE public.adventure_state SET stage=10 WHERE user_id='11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
SELECT pg_temp.reform_ok(public.get_adventure_journey(1)->'choices' @> '[{"chapter":4,"choice":"restore"}]'::jsonb,'retreat preserves chapter choice');
RESET ROLE;
SELECT pg_temp.reform_ok(NOT has_function_privilege('authenticated',
  'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE'),'journey does not expose cash grant');
ROLLBACK;
SELECT 'REFORM_CHAIN_PASS' AS result;
