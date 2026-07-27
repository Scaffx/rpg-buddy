-- Corrige o resgate de conquistas para usar a curva oficial de XP.
-- Também reconcilia perfis que ficaram com level inflado pela fórmula linear antiga.

CREATE OR REPLACE FUNCTION public.claim_achievement(p_user_achievement_id uuid)
RETURNS TABLE (xp_reward int, gold_reward int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid;
  v_ach_id    uuid;
  v_user_id   uuid;
  v_claimed   timestamptz;
  v_xp        int;
  v_gold      int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT ua.user_id, ua.achievement_id, ua.claimed_at
    INTO v_user_id, v_ach_id, v_claimed
  FROM public.user_achievements ua
  WHERE ua.id = p_user_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Conquista não encontrada'; END IF;
  IF v_user_id <> v_uid THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_claimed IS NOT NULL THEN RAISE EXCEPTION 'Conquista já resgatada'; END IF;

  SELECT a.xp_reward, a.gold_reward
    INTO v_xp, v_gold
  FROM public.achievements a
  WHERE a.id = v_ach_id;

  UPDATE public.user_achievements
  SET claimed_at = now()
  WHERE id = p_user_achievement_id
    AND claimed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conquista já resgatada (race condition)';
  END IF;

  IF v_xp > 0 THEN
    UPDATE public.profiles
    SET total_xp = COALESCE(total_xp, 0) + v_xp,
        level = public.get_level_from_xp_v2(COALESCE(total_xp, 0) + v_xp)
    WHERE user_id = v_uid;
  END IF;

  IF v_gold > 0 THEN
    INSERT INTO public.user_balance (user_id, gold, updated_at)
    VALUES (v_uid, v_gold, now())
    ON CONFLICT (user_id) DO UPDATE
    SET gold = public.user_balance.gold + v_gold,
        updated_at = now();
  END IF;

  RETURN QUERY SELECT v_xp, v_gold;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_achievement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement(uuid) TO authenticated;

UPDATE public.profiles AS p
SET level = public.get_level_from_xp_v2(COALESCE(p.total_xp, 0))
WHERE p.level IS DISTINCT FROM
  public.get_level_from_xp_v2(COALESCE(p.total_xp, 0));
