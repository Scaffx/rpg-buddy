-- Independent, rollback-only probe against the composed PostgreSQL 17 fixture.
-- Run with psql -X -v ON_ERROR_STOP=1 -f this_file after the eleven migrations.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
  ('44444444-4444-4444-4444-444444444444','audit-derived@example.invalid');
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
  ('44444444-4444-4444-4444-444444444445','presenca_inspiradora');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
  ('44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444445');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES ('44444444-4444-4444-4444-444444444446',
        '44444444-4444-4444-4444-444444444444','Auditoria: social',
        'baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,'social');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
DO $audit$
DECLARE
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_after_completion boolean;
  v_after_undo boolean;
  v_total_xp integer;
BEGIN
  PERFORM public.complete_mission('44444444-4444-4444-4444-444444444446',v_day);
  SELECT inspired_available INTO v_after_completion FROM public.profiles
   WHERE user_id=auth.uid();
  IF v_after_completion IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Fixture did not grant social inspiration';
  END IF;
  PERFORM public.undo_mission('44444444-4444-4444-4444-444444444446',v_day);
  SELECT inspired_available,total_xp INTO v_after_undo,v_total_xp
    FROM public.profiles WHERE user_id=auth.uid();
  RAISE NOTICE 'after completion inspiration=%, after undo inspiration=%, total_xp=%',
    v_after_completion,v_after_undo,v_total_xp;
  IF v_total_xp <> 0 THEN RAISE EXCEPTION 'XP residual after undo'; END IF;
  IF v_after_undo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'AUDIT_DERIVED_EFFECT_REMAINS: inspiration survives undo';
  END IF;
END;
$audit$;
ROLLBACK;
