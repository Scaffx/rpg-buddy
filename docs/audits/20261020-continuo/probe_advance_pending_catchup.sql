\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('88888888-8888-8888-8888-888888888888');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('88888888-8888-8888-8888-888888888888',50,'guerreiro');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
  VALUES('88888888-8888-8888-8888-888888888888',9,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='88888888-8888-8888-8888-888888888888';
SELECT public.sync_auto_adventure() AS initial_snapshot \gset
RESET ROLE;
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '2 hours',
  ends_at=b.ends_at-interval '2 hours',
  events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
    to_jsonb((e->>'at')::timestamptz-interval '2 hours')) ORDER BY ord)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.user_id='88888888-8888-8888-8888-888888888888' AND b.status='fighting';
SET ROLE authenticated;
SELECT public.sync_auto_adventure() AS pending_snapshot \gset
SELECT 'pending=' || (:'pending_snapshot'::jsonb->'catchup'->>'pending') ||
  ' mode=' || (:'pending_snapshot'::jsonb->>'mode') ||
  ' stage=' || (:'pending_snapshot'::jsonb->>'stage') ||
  ' battle_ended=' ||
    ((:'pending_snapshot'::jsonb->'battle'->>'ends_at')::timestamptz <
     (:'pending_snapshot'::jsonb->>'server_now')::timestamptz)::text AS before_request;
SELECT set_config('test.request_at',clock_timestamp()::text,false);
SELECT public.advance_auto_adventure(
  (:'pending_snapshot'::jsonb->'battle'->>'id')::uuid) AS advanced_snapshot \gset
RESET ROLE;
SELECT 'stage_after_request=' || stage || ' mode=' || adventure_mode AS after_request
FROM public.adventure_state WHERE user_id='88888888-8888-8888-8888-888888888888';
SELECT 'historical_clears_after_request=' || count(*) AS result
FROM public.adventure_encounters WHERE user_id='88888888-8888-8888-8888-888888888888'
  AND stage>=10 AND fought_at<current_setting('test.request_at')::timestamptz;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.adventure_encounters
    WHERE user_id='88888888-8888-8888-8888-888888888888' AND stage>=10
      AND fought_at<current_setting('test.request_at')::timestamptz) THEN
    RAISE EXCEPTION 'retroactive advance not reproduced'; END IF;
END $$;
ROLLBACK;
