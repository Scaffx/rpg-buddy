-- Run once against a dedicated clone of catchup_fixed.
BEGIN;
INSERT INTO auth.users(id) VALUES ('bbbbbbbb-0000-0000-0000-000000000020');
INSERT INTO public.profiles(user_id,level,starter_class)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000020',50,'guerreiro');
INSERT INTO public.attributes(user_id,name,level)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000020','forca',50);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000020',1,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000020';
SELECT public.sync_auto_adventure()->>'stage' AS initial_stage;
RESET ROLE;
UPDATE app_private.adventure_battles b
 SET started_at=b.started_at-interval '1 hour', ends_at=b.ends_at-interval '1 hour',
     events=(SELECT jsonb_agg(jsonb_set(e,'{at}',to_jsonb((e->>'at')::timestamptz-interval '1 hour')) ORDER BY ord)
             FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
 WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
             WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020');
COMMIT;
