-- Separate effect semantics test after P13, with A12 public wrappers.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7420000-0000-0000-0000-000000000001','talent-effect-test@example.invalid');
UPDATE public.profiles SET pontos_talento=1
 WHERE user_id='c7420000-0000-0000-0000-000000000001';
INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito) VALUES
 ('c7420000-0000-0000-0000-000000000011','Presenca teste','Inspira social','presenca_inspiradora');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,
                            frequency_type,days_of_week,mission_category)
SELECT ('c7420000-0000-0000-0001-' || lpad(n::text,12,'0'))::uuid,
       a.user_id,'Social ' || n,a.id,'media','daily',
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'social'
  FROM public.attributes a CROSS JOIN generate_series(1,2) n
 WHERE a.user_id='c7420000-0000-0000-0000-000000000001'
   AND a.name='Disciplina';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7420000-0000-0000-0000-000000000001';
DO $effect$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  m uuid := 'c7420000-0000-0000-0001-000000000001';
  t uuid := 'c7420000-0000-0000-0000-000000000011';
  v_row uuid;
  v_reward jsonb;
BEGIN
  PERFORM public.buy_talent(t);
  SELECT id INTO v_row FROM public.talentos_jogador
   WHERE personagem_id=auth.uid() AND talento_id=t;
  PERFORM public.set_talent_equipped(v_row,false);
  v_reward := public.complete_mission(m,d);
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'learned but unequipped talent granted social inspiration';
  END IF;
  PERFORM public.undo_mission(m,d);
  PERFORM public.set_talent_equipped(v_row,true);
  v_reward := public.complete_mission(m,d);
  IF NOT (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'equipped talent did not grant social inspiration';
  END IF;
  PERFORM public.undo_mission(m,d);
  IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid())
     OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0 THEN
    RAISE EXCEPTION 'A12 did not reverse equipped talent effect';
  END IF;
END;
$effect$;
ROLLBACK;
