-- Apply after v3 migration in a fresh isolated database, before parallel calls.
INSERT INTO auth.users(id) VALUES('cccccccc-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('cccccccc-0000-0000-0000-000000000001',50,'guerreiro');
INSERT INTO public.attributes(user_id,name,level)
VALUES('cccccccc-0000-0000-0000-000000000001','forca',5);
SET ROLE authenticated;
SET request.jwt.claim.sub='cccccccc-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
WITH timing AS (
  SELECT b.id,(clock_timestamp()-interval '2 seconds')-b.ends_at AS delta
  FROM app_private.adventure_battles b
  WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
    WHERE user_id='cccccccc-0000-0000-0000-000000000001')
)
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at+timing.delta,
  ends_at=b.ends_at+timing.delta,
  events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
    to_jsonb((e->>'at')::timestamptz+timing.delta)) ORDER BY ord)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
FROM timing WHERE b.id=timing.id;
