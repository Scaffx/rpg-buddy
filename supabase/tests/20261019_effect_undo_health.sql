-- The live health helper body is installed by 20261019_effect_undo_fixture.sql.
-- Rollback-only public RPC exercise after the eleven migrations and A12.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7100000-0000-0000-0000-000000000001','health-effects@example.invalid');
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
 ('c7100000-0000-0000-0000-000000000011','corpo_de_ferro'),
 ('c7100000-0000-0000-0000-000000000012','rato_biblioteca'),
 ('c7100000-0000-0000-0000-000000000013','pulmoes_de_aco');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
 ('c7100000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000011'),
 ('c7100000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000012'),
 ('c7100000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000013');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category)
SELECT v.id,a.user_id,v.title,a.id,'baixa','daily',
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,v.category
  FROM (VALUES
    ('c7100000-0000-0000-0000-000000000101'::uuid,'Physical A','fisico'),
    ('c7100000-0000-0000-0000-000000000102'::uuid,'Physical B','fisico'),
    ('c7100000-0000-0000-0000-000000000103'::uuid,'Study A','estudo'))
       v(id,title,category)
  CROSS JOIN public.attributes a
 WHERE a.user_id='c7100000-0000-0000-0000-000000000001' AND a.name='Disciplina';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7100000-0000-0000-0000-000000000001';
DO $stack$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a uuid := 'c7100000-0000-0000-0000-000000000101';
  b uuid := 'c7100000-0000-0000-0000-000000000102';
  study uuid := 'c7100000-0000-0000-0000-000000000103';
  u uuid := auth.uid();
BEGIN
  PERFORM public.complete_mission(a,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>102
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=u)<>102
  THEN RAISE EXCEPTION 'first HP +2 absent'; END IF;
  PERFORM public.complete_mission(b,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>104
  THEN RAISE EXCEPTION 'later HP +2 absent'; END IF;
  PERFORM public.undo_mission(a,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>102
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=u)<>102
  THEN RAISE EXCEPTION 'A+2 B+2 undo A removed later grant'; END IF;
  PERFORM public.undo_mission(b,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>100
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=u)<>100
  THEN RAISE EXCEPTION 'HP baseline not restored'; END IF;
  PERFORM public.complete_mission(study,d);
  IF (SELECT max_mp FROM public.user_health_stats WHERE user_id=u)<>11
     OR (SELECT current_mp FROM public.user_health_stats WHERE user_id=u)<>11
  THEN RAISE EXCEPTION 'MP +1 absent'; END IF;
  PERFORM public.undo_mission(study,d);
  IF (SELECT max_mp FROM public.user_health_stats WHERE user_id=u)<>10
     OR (SELECT current_mp FROM public.user_health_stats WHERE user_id=u)<>10
  THEN RAISE EXCEPTION 'MP baseline not restored'; END IF;
END;
$stack$;

-- Exact +2 max HP and 10% recovery of the missing 50 HP: 50 -> 57.
RESET ROLE;
UPDATE public.user_health_stats SET current_hp=50
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $recovery$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM public.complete_mission('c7100000-0000-0000-0000-000000000101',d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>102
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>57
  THEN RAISE EXCEPTION 'live helper recovery calculation changed'; END IF;
  PERFORM public.undo_mission('c7100000-0000-0000-0000-000000000101',d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>100
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>50
  THEN RAISE EXCEPTION 'untouched recovery was not reversed'; END IF;
END;
$recovery$;
RESET ROLE;
UPDATE public.user_health_stats SET current_hp=100
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- Current HP has been spent after completion. Do not heal it during undo.
SELECT public.complete_mission('c7100000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
UPDATE public.user_health_stats SET current_hp=90
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('c7100000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $spent$
BEGIN
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>100
     OR (SELECT current_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>90
  THEN RAISE EXCEPTION 'spent HP restored or permanent +2 remained'; END IF;
END;
$spent$;

-- Real helper caps +2 at 200. Receipt must contain +1 then +0, not guesses.
RESET ROLE;
UPDATE public.user_health_stats SET max_hp=199,current_hp=199,
                                    max_mp=59,current_mp=59
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $cap$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a uuid := 'c7100000-0000-0000-0000-000000000101';
  b uuid := 'c7100000-0000-0000-0000-000000000102';
  study uuid := 'c7100000-0000-0000-0000-000000000103';
  u uuid := auth.uid();
BEGIN
  PERFORM public.complete_mission(a,d);
  PERFORM public.complete_mission(b,d);
  PERFORM public.complete_mission(study,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>200
     OR (SELECT max_mp FROM public.user_health_stats WHERE user_id=u)<>60
  THEN RAISE EXCEPTION 'cap at 200/60 failed'; END IF;
  PERFORM public.undo_mission(a,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>199
  THEN RAISE EXCEPTION 'capped HP +1 was not reversed'; END IF;
  PERFORM public.undo_mission(b,d);
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=u)<>199
  THEN RAISE EXCEPTION 'zero HP grant was debited'; END IF;
  PERFORM public.undo_mission(study,d);
  IF (SELECT max_mp FROM public.user_health_stats WHERE user_id=u)<>59
  THEN RAISE EXCEPTION 'capped MP +1 was not reversed'; END IF;
END;
$cap$;

-- An external maximum overwrite below this receipt's post-state means the
-- +2 is no longer provably present. Do not debit a newer 100 down to 98.
RESET ROLE;
UPDATE public.user_health_stats SET max_hp=100,current_hp=100
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('c7100000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
UPDATE public.user_health_stats SET max_hp=100,current_hp=100
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('c7100000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $overwrite$
BEGIN
  IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=auth.uid())<>100
  THEN RAISE EXCEPTION 'external maximum overwrite was debited'; END IF;
END;
$overwrite$;

-- A changed MP current value is preserved; only its proven maximum is debited.
RESET ROLE;
UPDATE public.user_health_stats SET max_hp=100,current_hp=100,max_mp=10,current_mp=10
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('c7100000-0000-0000-0000-000000000103',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
UPDATE public.user_health_stats SET current_mp=5
 WHERE user_id='c7100000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('c7100000-0000-0000-0000-000000000103',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $mp_spent$
BEGIN
  IF (SELECT max_mp FROM public.user_health_stats WHERE user_id=auth.uid())<>10
     OR (SELECT current_mp FROM public.user_health_stats WHERE user_id=auth.uid())<>5
     OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid())<>0
  THEN RAISE EXCEPTION 'spent MP or XP residual'; END IF;
  RAISE NOTICE 'HP/MP additive later grant, spent current, caps 200/60 PASS';
END;
$mp_spent$;
ROLLBACK;
