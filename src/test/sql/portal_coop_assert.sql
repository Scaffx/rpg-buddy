\set ON_ERROR_STOP on
BEGIN;
-- Real PostgreSQL fixture, all writes roll back.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
  BEGIN UPDATE public.profiles SET level=99 WHERE user_id=auth.uid();
    RAISE EXCEPTION 'profile level forgery accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Colunas de progressão são protegidas — use os RPCs do jogo.' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.profiles(user_id,display_name,level,total_xp)
    VALUES('00000000-0000-0000-0000-000000000007','Forged',50,0);
    RAISE EXCEPTION 'profile insert forgery accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Initial progression values must be server defaults' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.portal_coop_config
    WHERE min_level<>CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 20
      WHEN 'hard' THEN 30 WHEN 'legendary' THEN 40 WHEN 'ultra' THEN 50 END)
    OR (SELECT count(*) FROM public.portal_coop_config)<>5 THEN
    RAISE EXCEPTION 'cooperative minimum levels drifted'; END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='portal_coop_guard_profile_progression') THEN
    RAISE EXCEPTION 'duplicate progression guard introduced'; END IF;
  IF has_schema_privilege('anon','app_private','USAGE') OR
     NOT has_schema_privilege('authenticated','app_private','USAGE') OR
     has_function_privilege('authenticated','app_private.portal_coop_member_snapshot(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'private schema or snapshot ACL wrong'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','app_private') AND p.proname IN
      ('portal_coop_create','portal_coop_join','portal_coop_start','portal_coop_state',
       'portal_coop_my_sessions','portal_coop_action') AND
      (p.prosecdef<>(n.nspname='app_private') OR
       NOT has_function_privilege('authenticated',p.oid,'EXECUTE') OR
       has_function_privilege('anon',p.oid,'EXECUTE'))) OR
     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','app_private') AND p.proname LIKE 'portal_coop_%')<>13 THEN
    RAISE EXCEPTION 'portal wrapper/core privilege boundary wrong'; END IF;
END $$;
SET ROLE authenticated;
SELECT (public.portal_coop_create('daily',NULL,'30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->>'session_id') AS daily_sid \gset
SELECT set_config('test.daily_sid',:'daily_sid',false);
SELECT (public.portal_coop_state(:'daily_sid'::uuid)->>'invite_code') AS daily_code \gset
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_start(current_setting('test.daily_sid')::uuid);
    RAISE EXCEPTION 'solo start accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Portal exige 2 a 4 jogadores' THEN RAISE; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.portal_coop_join(:'daily_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.portal_coop_start(:'daily_sid'::uuid);
SELECT public.portal_coop_action(:'daily_sid'::uuid,'50000000-0000-0000-0000-000000000001',1);
SELECT public.portal_coop_action(:'daily_sid'::uuid,'50000000-0000-0000-0000-000000000001',1);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.portal_runs WHERE event_id='30000000-0000-0000-0000-000000000001')<>2
    THEN RAISE EXCEPTION 'daily winners were not exactly 2'; END IF;
  IF EXISTS(SELECT 1 FROM public.portal_runs WHERE xp_earned<>0 OR gold_earned<>0)
    THEN RAISE EXCEPTION 'portal granted XP or gold'; END IF;
  IF (SELECT portal_color FROM public.portal_runs WHERE user_id='00000000-0000-0000-0000-000000000001')<>'blue'
    OR (SELECT portal_color FROM public.portal_runs WHERE user_id='00000000-0000-0000-0000-000000000002')<>'yellow'
    THEN RAISE EXCEPTION 'personal portal colors lost'; END IF;
  IF (SELECT count(*) FROM public.portal_coop_actions WHERE session_id=current_setting('test.daily_sid')::uuid)<>1
    THEN RAISE EXCEPTION 'duplicate action was recorded'; END IF;
  IF (SELECT count(*) FROM public.portal_coop_members WHERE session_id=current_setting('test.daily_sid')::uuid)<>2
    THEN RAISE EXCEPTION 'invited member lost'; END IF;
  IF has_function_privilege('authenticated','public.complete_portal_run(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.create_fragment_dungeon(text,boolean,text,integer,integer,integer,integer,integer,text)','EXECUTE')
    OR has_function_privilege('authenticated','public._get_or_roll_portal_color(uuid,uuid)','EXECUTE')
    THEN RAISE EXCEPTION 'legacy solo RPC executable'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT (public.portal_coop_create('fragments','hard',NULL,
  '40000000-0000-0000-0000-000000000002',NULL)->>'session_id') AS hard_sid \gset
SELECT set_config('test.hard_sid',:'hard_sid',false);
SELECT (public.portal_coop_state(:'hard_sid'::uuid)->>'invite_code') AS hard_code \gset
SELECT set_config('test.hard_code',:'hard_code',false);
-- Replay creation does not spend fragments again.
SELECT public.portal_coop_create('fragments','hard',NULL,'40000000-0000-0000-0000-000000000002',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_join(current_setting('test.hard_code'),NULL);
    RAISE EXCEPTION 'low-level player accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Nível mínimo não atendido' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_join(current_setting('test.hard_code'),'10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'foreign companion accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Companheiro de combate indisponível' THEN RAISE; END IF; END;
END $$;
SELECT public.portal_coop_join(:'hard_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.portal_coop_start(:'hard_sid'::uuid);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.hard_sid')::uuid AND wave=1)<>1
    OR (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.hard_sid')::uuid AND wave=2)<>2
    THEN RAISE EXCEPTION 'hard boss layout wrong'; END IF;
  IF (SELECT fragments FROM public.player_portal_fragments WHERE user_id='00000000-0000-0000-0000-000000000001')<90
    THEN RAISE EXCEPTION 'fragment debit duplicated'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.portal_coop_action(:'hard_sid'::uuid,'50000000-0000-0000-0000-000000000002',1);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.portal_coop_action(:'hard_sid'::uuid,'50000000-0000-0000-0000-000000000003',1);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT pg_sleep(2.1);
SELECT public.portal_coop_action(:'hard_sid'::uuid,'50000000-0000-0000-0000-000000000004',2);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_state(current_setting('test.hard_sid')::uuid); RAISE EXCEPTION 'outsider read accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Não pertence à sala' THEN RAISE; END IF; END;
  BEGIN PERFORM public.portal_coop_action(current_setting('test.hard_sid')::uuid,gen_random_uuid(),1); RAISE EXCEPTION 'outsider attack accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Não pertence à sala' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT status FROM public.portal_coop_sessions WHERE id=current_setting('test.hard_sid')::uuid)<>'completed'
    THEN RAISE EXCEPTION 'hard portal did not complete after both bosses'; END IF;
  IF (SELECT count(*) FROM public.portal_runs WHERE coop_session_id=current_setting('test.hard_sid')::uuid)<>0
    THEN RAISE EXCEPTION 'fragment portal wrote daily reward'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT (public.portal_coop_create('fragments','ultra',NULL,
  '40000000-0000-0000-0000-000000000003',NULL)->>'session_id') AS ultra_sid \gset
SELECT set_config('test.ultra_sid',:'ultra_sid',false);
SELECT (public.portal_coop_state(:'ultra_sid'::uuid)->>'invite_code') AS ultra_code \gset
SELECT set_config('test.ultra_code',:'ultra_code',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.portal_coop_join(:'ultra_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.portal_coop_join(:'ultra_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.portal_coop_join(:'ultra_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$ BEGIN
  BEGIN PERFORM public.portal_coop_join(current_setting('test.ultra_code'),NULL);
    RAISE EXCEPTION 'fifth player accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Sala cheia: máximo 4 jogadores' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.portal_coop_start(:'ultra_sid'::uuid);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.portal_coop_members WHERE session_id=current_setting('test.ultra_sid')::uuid)<>4
    THEN RAISE EXCEPTION 'four-player roster wrong'; END IF;
  IF (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.ultra_sid')::uuid AND wave=1)<>2
    OR (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.ultra_sid')::uuid AND wave=2)<>2
    OR (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.ultra_sid')::uuid AND wave=3)<>1
    THEN RAISE EXCEPTION 'ultra encounter layout wrong'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT (public.portal_coop_create('fragments','medium',NULL,
  '40000000-0000-0000-0000-000000000004',NULL)->>'session_id') AS medium_sid \gset
SELECT set_config('test.medium_sid',:'medium_sid',false);
SELECT (public.portal_coop_state(:'medium_sid'::uuid)->>'invite_code') AS medium_code \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.portal_coop_join(:'medium_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.portal_coop_join(:'medium_code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.portal_coop_start(:'medium_sid'::uuid);
SELECT public.portal_coop_action(:'medium_sid'::uuid,'50000000-0000-0000-0000-000000000005',1);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.portal_coop_members WHERE session_id=current_setting('test.medium_sid')::uuid)<>3
    OR (SELECT wave FROM public.portal_coop_sessions WHERE id=current_setting('test.medium_sid')::uuid)<>2
    OR (SELECT count(*) FROM public.portal_coop_enemies WHERE session_id=current_setting('test.medium_sid')::uuid AND wave=2)<>1
    THEN RAISE EXCEPTION 'three-player medium sequential encounter failed'; END IF;
END $$;
ROLLBACK;
