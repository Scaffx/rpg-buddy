-- apply_xp_penalty: deduz XP do usuário autenticado (penalidade por missão
-- fracassada). Nível nunca diminui. Escrita server-side para a trava de RLS.
CREATE OR REPLACE FUNCTION public.apply_xp_penalty(p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_txp int; v_new int; v_amt int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_amt := LEAST(100000, GREATEST(0, COALESCE(p_amount, 0)));
  IF v_amt = 0 THEN RETURN; END IF;
  SELECT total_xp INTO v_txp FROM public.profiles WHERE user_id = v_uid;
  v_new := GREATEST(0, COALESCE(v_txp, 0) - v_amt);
  UPDATE public.profiles
     SET total_xp = v_new, level = GREATEST(COALESCE(level, 1), public.get_level_from_xp_v2(v_new))
   WHERE user_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_xp_penalty(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_xp_penalty(integer) TO authenticated;
