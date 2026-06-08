-- Respec da árvore: grátis até o nível 15; depois custa ouro fixo (anti-troca-livre tardia).
CREATE OR REPLACE FUNCTION public.reset_skill_tree()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_level int;
  v_cost int := 150;
  v_gold int;
  v_charged int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT GREATEST(1, COALESCE(level, 1)) INTO v_level FROM public.profiles WHERE user_id = v_uid;
  IF v_level > 15 THEN
    SELECT COALESCE(gold, 0) INTO v_gold FROM public.user_balance WHERE user_id = v_uid;
    IF COALESCE(v_gold, 0) < v_cost THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
    UPDATE public.user_balance SET gold = gold - v_cost, updated_at = now() WHERE user_id = v_uid;
    v_charged := v_cost;
  END IF;
  DELETE FROM public.player_skill_nodes WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'charged', v_charged);
END;
$fn$;
