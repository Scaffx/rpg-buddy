UPDATE public.profiles SET level=50 WHERE user_id='33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;
UPDATE app_private.adventure_battles b
 SET started_at=b.started_at-interval '17 seconds',
     ends_at=b.ends_at-interval '17 seconds',
     events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
       to_jsonb((e->>'at')::timestamptz-interval '17 seconds')) ORDER BY ord)
       FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
 WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333');
