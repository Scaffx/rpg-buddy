\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a431');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a431',100,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a431';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
UPDATE app_private.adventure_battles b
  SET started_at=b.started_at-make_interval(secs=>s.seconds),
      ends_at=b.ends_at-make_interval(secs=>s.seconds),
      events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
        to_jsonb((e->>'at')::timestamptz-make_interval(secs=>s.seconds))) ORDER BY ord)
        FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
  FROM (SELECT greatest(1,ceil(extract(epoch FROM max(ends_at)-clock_timestamp()))::integer) seconds
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a431') s
  WHERE b.user_id='a0000000-0000-0000-0000-00000000a431';
