-- Public-RPC compensation probe on disposable composed local DB.
-- psql -X -v ON_ERROR_STOP=1 -f this_file; all writes roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','audit-spend@example.invalid');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Audit spend','baixa','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
INSERT INTO public.game_items(id,name,category,rarity,shop_price)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac','Audit consumable price','weapon','comum',1);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.complete_mission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'gold_gained' AS routine_gold;
RESET ROLE;
-- Price equal to the whole current balance models a legitimate full spend.
UPDATE public.game_items SET shop_price=(SELECT gold FROM public.user_balance
 WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';
SET LOCAL ROLE authenticated;
SELECT public.purchase_game_item('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad')->>'gold' AS after_purchase;
DO $audit$
DECLARE
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_refused boolean := false;
  v_gold integer;
  v_xp integer;
BEGIN
  BEGIN
    PERFORM public.undo_mission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',v_day);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Saldo de ouro insuficiente%' THEN v_refused := true;
    ELSE RAISE; END IF;
  END;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=auth.uid();
  IF NOT v_refused OR v_gold<>0 THEN
    RAISE EXCEPTION 'AUDIT_SPEND_UNDO_UNEXPECTED_STATE';
  END IF;
  -- One real adventure victory adds four gold; compensation can now succeed.
  PERFORM public.sync_auto_adventure();
  PERFORM public.undo_mission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',v_day);
  PERFORM public.complete_mission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',v_day);
  SELECT gold,total_xp INTO v_gold,v_xp FROM public.user_balance b
    JOIN public.profiles p USING(user_id) WHERE b.user_id=auth.uid();
  RAISE NOTICE 'full spend blocks undo; after legitimate +4, undo/redo gold=%, xp=%',
    v_gold,v_xp;
  IF v_gold<>4 OR v_xp<>5 THEN
    RAISE EXCEPTION 'AUDIT_SPEND_UNDO_REDO_NET_GAIN';
  END IF;
END;
$audit$;
RESET ROLE;
ROLLBACK;
