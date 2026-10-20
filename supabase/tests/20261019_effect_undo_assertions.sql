-- Public RPC integration against reduced fixture + all eleven 19-Oct migrations
-- + A12. All changes are rolled back. Run with psql -X -v ON_ERROR_STOP=1.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7000000-0000-0000-0000-000000000001','effect-owner@example.invalid'),
 ('c7000000-0000-0000-0000-000000000002','effect-other@example.invalid');
INSERT INTO public.shop_items(id,effect) VALUES
 ('c7000000-0000-0000-0000-000000000011','estado_fluxo_xp');
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
 ('c7000000-0000-0000-0000-000000000021','presenca_inspiradora'),
 ('c7000000-0000-0000-0000-000000000022','estado_de_fluxo');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
 ('c7000000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000021'),
 ('c7000000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000022');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category)
SELECT v.id,'c7000000-0000-0000-0000-000000000001',v.title,a.id,v.priority,'daily',
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,v.category
  FROM (VALUES
    ('c7000000-0000-0000-0000-000000000101'::uuid,'Social A','media','social'),
    ('c7000000-0000-0000-0000-000000000102'::uuid,'Social B','media','social'),
    ('c7000000-0000-0000-0000-000000000103'::uuid,'Creative A','media','criativo'),
    ('c7000000-0000-0000-0000-000000000104'::uuid,'Creative B','media','criativo'),
    ('c7000000-0000-0000-0000-000000000105'::uuid,'Ordinary','media','geral'))
       v(id,title,priority,category)
  CROSS JOIN public.attributes a
 WHERE a.user_id='c7000000-0000-0000-0000-000000000001' AND a.name='Disciplina';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,
                            days_of_week,mission_category,target_count,max_count,weekly_started_at)
SELECT 'c7000000-0000-0000-0000-000000000106',a.user_id,'Creative weekly D-1',a.id,
       'baixa','weekly','[]'::jsonb,'criativo',1,2,now()-interval '1 day'
  FROM public.attributes a WHERE a.user_id='c7000000-0000-0000-0000-000000000001'
    AND a.name='Disciplina';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7000000-0000-0000-0000-000000000002';
DO $tenant$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  BEGIN
    PERFORM public.complete_mission('c7000000-0000-0000-0000-000000000101',d);
    RAISE EXCEPTION 'other tenant completed mission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='other tenant completed mission' THEN RAISE; END IF;
  END;
END;
$tenant$;

SET LOCAL request.jwt.claim.sub='c7000000-0000-0000-0000-000000000001';
DO $effects$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a uuid := 'c7000000-0000-0000-0000-000000000101';
  b uuid := 'c7000000-0000-0000-0000-000000000102';
  c uuid := 'c7000000-0000-0000-0000-000000000103';
  e uuid := 'c7000000-0000-0000-0000-000000000104';
  ordinary uuid := 'c7000000-0000-0000-0000-000000000105';
  weekly uuid := 'c7000000-0000-0000-0000-000000000106';
  u uuid := auth.uid();
  prior_at timestamptz;
  later_at timestamptz;
  r jsonb;
BEGIN
  r := public.complete_mission(a,d);
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=u) IS DISTINCT FROM true
     OR (r->>'xp_gained')::integer<>25 THEN RAISE EXCEPTION 'social award failed'; END IF;
  BEGIN
    PERFORM public.complete_mission(a,d);
    RAISE EXCEPTION 'duplicate completion succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='duplicate completion succeeded' THEN RAISE; END IF;
  END;
  SELECT inspired_earned_at INTO prior_at FROM public.profiles WHERE user_id=u;
  PERFORM public.complete_mission(b,d);
  SELECT inspired_earned_at INTO later_at FROM public.profiles WHERE user_id=u;
  IF later_at IS NOT DISTINCT FROM prior_at THEN RAISE EXCEPTION 'origin marker not refreshed'; END IF;
  PERFORM public.undo_mission(a,d);
  IF (SELECT inspired_earned_at FROM public.profiles WHERE user_id=u) IS DISTINCT FROM later_at
     OR (SELECT inspired_available FROM public.profiles WHERE user_id=u) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'earlier undo removed later inspiration'; END IF;
  PERFORM public.undo_mission(b,d);
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=u) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'later undo resurrected revoked predecessor'; END IF;
  PERFORM public.complete_mission(a,d);
  PERFORM public.undo_mission(a,d);
  BEGIN
    PERFORM public.undo_mission(a,d);
    RAISE EXCEPTION 'second undo succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='second undo succeeded' THEN RAISE; END IF;
  END;

  PERFORM public.complete_mission(c,d);
  IF (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>1
  THEN RAISE EXCEPTION 'flow grant missing'; END IF;
  PERFORM public.undo_mission(c,d);
  IF (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>0
  THEN RAISE EXCEPTION 'flow survives own undo'; END IF;
  r := public.complete_mission(ordinary,d);
  IF (r->>'xp_gained')::integer<>25 THEN RAISE EXCEPTION 'undone buff affected later XP: %',r; END IF;
  PERFORM public.undo_mission(ordinary,d);

  -- The second creative completion consumes A's buff, creates its own buff,
  -- and legitimately earns 30 XP. Undo A cannot recalculate that later award.
  PERFORM public.complete_mission(c,d);
  r := public.complete_mission(e,d);
  IF (r->>'xp_gained')::integer<>30 THEN RAISE EXCEPTION 'flow was not consumed: %',r; END IF;
  PERFORM public.undo_mission(c,d);
  IF (SELECT total_xp FROM public.profiles WHERE user_id=u)<>30
     OR (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>1
  THEN RAISE EXCEPTION 'consumed A or live B effect changed on A undo'; END IF;
  PERFORM public.undo_mission(e,d);
  IF (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>0
  THEN RAISE EXCEPTION 'later flow effect survived own undo'; END IF;

  r := public.complete_mission(weekly,d-1);
  IF (r->>'frequency_type')<>'weekly' OR (r->>'is_backfill')::boolean IS DISTINCT FROM true
     OR (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>1
  THEN RAISE EXCEPTION 'weekly D-1 flow grant failed: %',r; END IF;
  PERFORM public.undo_mission(weekly,d-1);
  IF (SELECT count(*) FROM public.user_buffs WHERE user_id=u AND active)<>0
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u)<>0
     OR (SELECT missions_completed FROM public.profiles WHERE user_id=u)<>0
     OR (SELECT xp FROM public.attributes WHERE user_id=u AND name='Disciplina')<>0
  THEN RAISE EXCEPTION 'weekly D-1 or attribute compatibility failed'; END IF;
  RAISE NOTICE 'social origin/chain, redo, consumed and later flow, tenant, weekly D-1, attributes PASS';
END;
$effects$;
RESET ROLE;
DO $privacy$
BEGIN
  IF has_table_privilege('authenticated','private.mission_effect_receipts','SELECT')
     OR has_function_privilege('authenticated','private.undo_mission_effects(uuid,date,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','private.grant_mission_flow_buff(uuid,uuid,date)','EXECUTE')
  THEN RAISE EXCEPTION 'derived receipt API exposed'; END IF;
  IF EXISTS (SELECT 1 FROM private.mission_effect_receipts)
  THEN RAISE EXCEPTION 'effect receipts survived completed undo cycle'; END IF;
END;
$privacy$;

-- Simulate a verified pre-A12 completion: the monetary/attribute ledgers
-- exist, but derived effects have no provenance receipt. Undo must refuse.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7000000-0000-0000-0000-000000000001';
SELECT public.complete_mission('c7000000-0000-0000-0000-000000000101',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS historical_xp;
RESET ROLE;
DELETE FROM private.mission_effect_receipts
 WHERE mission_id='c7000000-0000-0000-0000-000000000101';
SET LOCAL ROLE authenticated;
DO $historical$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  before_xp integer;
  denied boolean := false;
BEGIN
  SELECT total_xp INTO before_xp FROM public.profiles WHERE user_id=auth.uid();
  BEGIN
    PERFORM public.undo_mission('c7000000-0000-0000-0000-000000000101',d);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'DERIVED_EFFECT_RECEIPT_MISSING:%' THEN denied := true;
    ELSE RAISE; END IF;
  END;
  IF NOT denied OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid())<>before_xp
     OR (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'historical effect provenance was guessed/debited'; END IF;
  RAISE NOTICE 'missing historical effect receipt refuses atomically PASS';
END;
$historical$;
ROLLBACK;
