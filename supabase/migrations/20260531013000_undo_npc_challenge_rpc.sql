-- undo_npc_challenge: desfaz conclusão de desafio de NPC revertendo o XP/ouro
-- exatos creditados (lidos do registro). Reversão de item de inventário no client.
CREATE OR REPLACE FUNCTION public.undo_npc_challenge(p_npc_id text, p_challenge_id text, p_week_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp int; v_gold int; v_txp int; v_new int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT xp_earned, gold_earned INTO v_xp, v_gold
  FROM public.npc_challenge_completions
  WHERE user_id = v_uid AND npc_id = p_npc_id AND challenge_id = p_challenge_id AND week_token = p_week_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  DELETE FROM public.npc_challenge_completions
  WHERE user_id = v_uid AND npc_id = p_npc_id AND challenge_id = p_challenge_id AND week_token = p_week_token;

  SELECT total_xp INTO v_txp FROM public.profiles WHERE user_id = v_uid;
  v_new := GREATEST(0, COALESCE(v_txp, 0) - COALESCE(v_xp, 0));
  UPDATE public.profiles
     SET total_xp = v_new, level = GREATEST(COALESCE(level, 1), public.get_level_from_xp_v2(v_new))
   WHERE user_id = v_uid;

  UPDATE public.user_balance
     SET gold = GREATEST(0, COALESCE(gold, 0) - COALESCE(v_gold, 0)), updated_at = now()
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'xp', COALESCE(v_xp, 0), 'gold', COALESCE(v_gold, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_npc_challenge(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_npc_challenge(text, text, text) TO authenticated;
