\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT (public.portal_coop_create('fragments','ultra',NULL,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa50',NULL)->>'session_id') AS sid \gset
SELECT (public.portal_coop_state(:'sid'::uuid)->>'invite_code') AS code \gset
SELECT set_config('test.sid',:'sid',false);
SELECT set_config('test.code',:'code',false);
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_start(current_setting('test.sid')::uuid);
    RAISE EXCEPTION 'solo start accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Portal exige 2 a 4 jogadores' THEN RAISE; END IF;
  END;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_join(current_setting('test.code'),NULL);
    RAISE EXCEPTION 'low level joined';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Nível mínimo não atendido' THEN RAISE; END IF;
  END;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT public.portal_coop_join(:'code',NULL);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.portal_coop_join(:'code',NULL);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
SELECT public.portal_coop_join(:'code',NULL);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_join(current_setting('test.code'),NULL);
    RAISE EXCEPTION 'fifth player joined';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Sala cheia: máximo 4 jogadores' THEN RAISE; END IF;
  END;
  BEGIN PERFORM public.portal_coop_state(current_setting('test.sid')::uuid);
    RAISE EXCEPTION 'outsider read room';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Não pertence à sala' THEN RAISE; END IF;
  END;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT public.portal_coop_start(:'sid'::uuid);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*)<>4 OR min(level_at_start)<50 FROM public.portal_coop_members
    WHERE session_id=current_setting('test.sid')::uuid) THEN RAISE EXCEPTION 'roster/level wrong'; END IF;
END $$;
SELECT 'solo, low level, fifth, outsider and roster passed' AS result;
ROLLBACK;
