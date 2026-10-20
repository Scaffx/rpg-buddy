-- Local-only, after A12 + live talent overlay + P13. All state rolls back.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7410000-0000-0000-0000-000000000001','talent-threshold@example.invalid'),
 ('c7410000-0000-0000-0000-000000000002','talent-other@example.invalid'),
 ('c7410000-0000-0000-0000-000000000003','talent-buy@example.invalid'),
 ('c7410000-0000-0000-0000-000000000004','talent-effects@example.invalid'),
 ('c7410000-0000-0000-0000-000000000005','talent-insert@example.invalid');
INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito)
SELECT ('c7410000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'Talento ' || n,'Fixture de catalogo ' || n,
       CASE n WHEN 1 THEN 'presenca_inspiradora' ELSE 'fixture_effect_' || n END
  FROM generate_series(1,7) AS n;

-- Signed threshold: 3590 + 25 -> 3615, and undo returns to level 4.
UPDATE public.profiles SET total_xp=3590,level=4
 WHERE user_id='c7410000-0000-0000-0000-000000000001';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,
                            frequency_type,days_of_week,mission_category)
SELECT ('c7410000-0000-0000-0001-' || lpad(n::text,12,'0'))::uuid,
       a.user_id,'Talent threshold ' || n,a.id,'media','daily',
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'geral'
  FROM public.attributes a CROSS JOIN generate_series(1,2) n
 WHERE a.user_id='c7410000-0000-0000-0000-000000000001'
   AND a.name='Disciplina';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7410000-0000-0000-0000-000000000001';
DO $threshold$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a uuid := 'c7410000-0000-0000-0001-000000000001';
  b uuid := 'c7410000-0000-0000-0001-000000000002';
  p record;
  v_result jsonb;
  v_denied boolean := false;
BEGIN
  PERFORM public.complete_mission(a,d);
  SELECT level,total_xp,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
  IF (p.level,p.total_xp,p.pontos_talento) IS DISTINCT FROM (5,3615,1) THEN
    RAISE EXCEPTION '4->5 credit wrong: %',row_to_json(p);
  END IF;
  PERFORM public.undo_mission(a,d);
  SELECT level,total_xp,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
  IF (p.level,p.total_xp,p.pontos_talento) IS DISTINCT FROM (4,3590,0) THEN
    RAISE EXCEPTION '5->4 debit wrong: %',row_to_json(p);
  END IF;
  PERFORM public.complete_mission(a,d);
  SELECT level,total_xp,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
  IF (p.level,p.total_xp,p.pontos_talento) IS DISTINCT FROM (5,3615,1) THEN
    RAISE EXCEPTION 'redo duplicated point: %',row_to_json(p);
  END IF;
  -- B keeps the canonical range, so undo A must leave the one free point.
  PERFORM public.complete_mission(b,d);
  PERFORM public.undo_mission(a,d);
  SELECT level,total_xp,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
  IF p.level <> 5 OR p.pontos_talento <> 1 OR p.total_xp < 3600 THEN
    RAISE EXCEPTION 'A/B range incorrectly debited: %',row_to_json(p);
  END IF;
  PERFORM public.undo_mission(b,d);
  SELECT level,total_xp,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
  IF (p.level,p.total_xp,p.pontos_talento) IS DISTINCT FROM (4,3590,0) THEN
    RAISE EXCEPTION 'A/B final debit wrong: %',row_to_json(p);
  END IF;

  PERFORM public.complete_mission(a,d);
  v_result := public.buy_talent('c7410000-0000-0000-0000-000000000001');
  IF (v_result->>'purchased')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'buy failed: %',v_result;
  END IF;
  v_result := public.buy_talent('c7410000-0000-0000-0000-000000000001');
  IF (v_result->>'already_owned')::boolean IS DISTINCT FROM true
     OR (SELECT pontos_talento FROM public.profiles WHERE user_id=auth.uid()) <> 0
     OR (SELECT count(*) FROM public.talentos_jogador
          WHERE personagem_id=auth.uid()) <> 1 THEN
    RAISE EXCEPTION 'retry charged or duplicated talent: %',v_result;
  END IF;
  BEGIN
    PERFORM public.undo_mission(a,d);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'TALENT_POINTS_SPENT: desfazer reduziria pontos de talento ja usados%'
    THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied OR (SELECT (level,total_xp,pontos_talento) FROM public.profiles
      WHERE user_id=auth.uid()) IS DISTINCT FROM ROW(5,3615,0)
     OR NOT EXISTS (SELECT 1 FROM public.mission_daily_completions
                   WHERE mission_id=a AND completion_date=d)
  THEN RAISE EXCEPTION 'spent-point undo was not atomically denied'; END IF;
END;
$threshold$;
RESET ROLE;
DO $receipt$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.mission_effect_receipts
    WHERE mission_id='c7410000-0000-0000-0001-000000000001') THEN
    RAISE EXCEPTION 'spent-point undo removed the receipt';
  END IF;
END;
$receipt$;

-- Catalogue has no per-class or level requirement: only an existing complete
-- catalog row with a unique id/name/effect is eligible. Price is one server-side.
UPDATE public.profiles SET pontos_talento=7
 WHERE user_id='c7410000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7410000-0000-0000-0000-000000000003';
DO $buy_equip$
DECLARE
  n integer;
  v_result jsonb;
  v_denied boolean;
  v_row uuid;
BEGIN
  FOR n IN 1..6 LOOP
    v_result := public.buy_talent(('c7410000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid);
    IF (v_result->>'purchased')::boolean IS DISTINCT FROM true
       OR (v_result->>'equipped')::boolean IS DISTINCT FROM (n<=5) THEN
      RAISE EXCEPTION 'catalog buy/autoequip failed n=% result=%',n,v_result;
    END IF;
  END LOOP;
  IF (SELECT pontos_talento FROM public.profiles WHERE user_id=auth.uid()) <> 1
     OR (SELECT count(*) FROM public.talentos_jogador
         WHERE personagem_id=auth.uid() AND equipped) <> 5 THEN
    RAISE EXCEPTION 'six buys did not cost six and equip five';
  END IF;
  SELECT id INTO v_row FROM public.talentos_jogador WHERE personagem_id=auth.uid()
    AND talento_id='c7410000-0000-0000-0000-000000000006';
  v_denied := false;
  BEGIN PERFORM public.set_talent_equipped(v_row,true);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'TALENT_EQUIP_LIMIT:%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'sixth equipped'; END IF;
  PERFORM public.set_talent_equipped((SELECT id FROM public.talentos_jogador
    WHERE personagem_id=auth.uid() AND talento_id='c7410000-0000-0000-0000-000000000001'),false);
  PERFORM public.set_talent_equipped(v_row,true);
  IF (SELECT count(*) FROM public.talentos_jogador
      WHERE personagem_id=auth.uid() AND equipped) <> 5 THEN
    RAISE EXCEPTION 'equip slot reuse failed';
  END IF;
  v_denied := false;
  BEGIN PERFORM public.buy_talent('c7410000-0000-0000-0000-999999999999');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='TALENT_NOT_FOUND' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'unknown catalog id bought'; END IF;
END;
$buy_equip$;

-- Historical >5 equipment is kept intact. A new buy remains unequipped;
-- adding equipment is denied until the owner frees enough slots.
RESET ROLE;
UPDATE public.talentos_jogador SET equipped=true
 WHERE personagem_id='c7410000-0000-0000-0000-000000000003'
   AND talento_id='c7410000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $legacy$
DECLARE v_result jsonb; v_denied boolean := false;
BEGIN
  v_result := public.buy_talent('c7410000-0000-0000-0000-000000000007');
  IF (v_result->>'equipped')::boolean IS DISTINCT FROM false
     OR (SELECT count(*) FROM public.talentos_jogador
       WHERE personagem_id=auth.uid() AND equipped) <> 6 THEN
    RAISE EXCEPTION 'legacy >5 equipment was rewritten or autoequipped: %',v_result;
  END IF;
  BEGIN PERFORM public.set_talent_equipped((SELECT id FROM public.talentos_jogador
    WHERE personagem_id=auth.uid()
      AND talento_id='c7410000-0000-0000-0000-000000000007'),true);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'TALENT_EQUIP_LIMIT:%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'legacy >5 granted seventh equipped'; END IF;
END;
$legacy$;

-- A different tenant cannot equip or read ownership through the public RPC.
RESET ROLE;
UPDATE public.talentos_jogador SET id='c7410000-0000-0000-0002-000000000001'
 WHERE personagem_id='c7410000-0000-0000-0000-000000000003'
   AND talento_id='c7410000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7410000-0000-0000-0000-000000000002';
DO $tenant$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_talent_equipped('c7410000-0000-0000-0002-000000000001',false);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='TALENT_NOT_OWNED' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'foreign talent equipment succeeded'; END IF;
END;
$tenant$;
SET LOCAL request.jwt.claim.sub='';
DO $no_jwt$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN PERFORM public.buy_talent('c7410000-0000-0000-0000-000000000001');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='NOT_AUTHENTICATED' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'JWT-less buy succeeded'; END IF;
END;
$no_jwt$;

SET LOCAL request.jwt.claim.sub='c7410000-0000-0000-0000-000000000003';
DO $client_guard$
DECLARE v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN UPDATE public.profiles SET pontos_talento=999 WHERE user_id=auth.uid();
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'TALENT_POINTS_SERVER_ONLY:%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'direct points forge accepted'; END IF;
  v_denied := false;
  BEGIN INSERT INTO public.talentos_jogador(personagem_id,talento_id)
    VALUES(auth.uid(),'c7410000-0000-0000-0000-000000000007');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'direct talent insert accepted'; END IF;
  v_denied := false;
  BEGIN UPDATE public.talentos_jogador SET equipped=false
    WHERE personagem_id=auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'direct equipment update accepted'; END IF;
  UPDATE public.profiles SET display_name='Editado legitimamente' WHERE user_id=auth.uid();
  IF (SELECT display_name FROM public.profiles WHERE user_id=auth.uid()) <>
     'Editado legitimamente' THEN RAISE EXCEPTION 'normal profile edit blocked'; END IF;
END;
$client_guard$;

RESET ROLE;
DO $acl$
BEGIN
  IF has_function_privilege('anon','public.buy_talent(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.set_talent_equipped(uuid,boolean)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.buy_talent(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.set_talent_equipped(uuid,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'talent RPC ACL wrong'; END IF;
END;
$acl$;
DELETE FROM public.profiles
 WHERE user_id='c7410000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7410000-0000-0000-0000-000000000005';
DO $initial$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN INSERT INTO public.profiles(user_id,pontos_talento)
    VALUES(auth.uid(),999);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'TALENT_POINTS_SERVER_ONLY:%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'initial point forge accepted'; END IF;
  INSERT INTO public.profiles(user_id,pontos_talento) VALUES(auth.uid(),0);
END;
$initial$;
RESET ROLE;
DO $signup$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id='c7410000-0000-0000-0000-000000000004'
    AND pontos_talento<>0) THEN RAISE EXCEPTION 'signup point default changed'; END IF;
END;
$signup$;
ROLLBACK;
