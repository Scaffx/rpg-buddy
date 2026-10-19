-- Composition variant of A12's 20261019_effect_undo_inspiration_sources.sql.
-- Only its first mission gains is_anchor=true: the captured live helper
-- requires an eligible anchor, unlike the historical author fixture helper.
-- A prior perfect-day inspiration, an already consumed charge and a later
-- unrelated charge must all survive undo of another mission's own grant.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7200000-0000-0000-0000-000000000001','inspiration-source@example.invalid');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category,is_anchor)
SELECT 'c7200000-0000-0000-0000-000000000101',a.user_id,'Only scheduled routine',
       a.id,'media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'geral',true
  FROM public.attributes a
 WHERE a.user_id='c7200000-0000-0000-0000-000000000001' AND a.name='Disciplina';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7200000-0000-0000-0000-000000000001';
SELECT public.complete_mission('c7200000-0000-0000-0000-000000000101',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $perfect$
BEGIN
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'perfect-day helper did not grant inspiration'; END IF;
END;
$perfect$;
RESET ROLE;
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
 ('c7200000-0000-0000-0000-000000000011','presenca_inspiradora');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
 ('c7200000-0000-0000-0000-000000000001','c7200000-0000-0000-0000-000000000011');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category)
SELECT 'c7200000-0000-0000-0000-000000000102',a.user_id,'Social later routine',
       a.id,'media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'social'
  FROM public.attributes a
 WHERE a.user_id='c7200000-0000-0000-0000-000000000001' AND a.name='Disciplina';
CREATE TEMP TABLE prior_inspiration AS
SELECT inspired_earned_at FROM public.profiles
 WHERE user_id='c7200000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
SELECT public.undo_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
DO $preserved$
BEGIN
  IF (SELECT inspired_available FROM public.profiles
        WHERE user_id='c7200000-0000-0000-0000-000000000001') IS DISTINCT FROM true
     OR (SELECT inspired_earned_at FROM public.profiles
        WHERE user_id='c7200000-0000-0000-0000-000000000001')
       IS DISTINCT FROM (SELECT inspired_earned_at FROM prior_inspiration)
  THEN RAISE EXCEPTION 'prior perfect-day inspiration was removed'; END IF;
END;
$preserved$;

-- Spend that legitimate charge. A new social grant is then spent as well;
-- undo may not restore either spent charge.
UPDATE public.profiles SET inspired_available=false,inspired_earned_at=NULL
 WHERE user_id='c7200000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
UPDATE public.profiles SET inspired_available=false,inspired_earned_at=NULL
 WHERE user_id='c7200000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $consumed$
BEGIN
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'consumed inspiration was restored'; END IF;
END;
$consumed$;
RESET ROLE;

-- A different source grants after this mission. Its new timestamp owns the
-- live charge; undo of the earlier social completion must not clear it.
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
UPDATE public.profiles SET inspired_available=true,
                           inspired_earned_at=clock_timestamp()+interval '1 second'
 WHERE user_id='c7200000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('c7200000-0000-0000-0000-000000000102',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DO $later$
BEGIN
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'later inspiration was removed'; END IF;
  RAISE NOTICE 'perfect-day prior, consumed charge and later source PASS';
END;
$later$;
ROLLBACK;
