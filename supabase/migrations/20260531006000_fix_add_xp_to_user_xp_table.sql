-- Corrige add_xp_to_user para usar a tabela de XP oficial (get_level_from_xp_v2),
-- em vez da curva minúscula antiga que inflava o nível nas recompensas de
-- dungeon/NPC. Mantém: auth.uid(), clamp e GREATEST(level, ...).
CREATE OR REPLACE FUNCTION public.add_xp_to_user(p_user_id uuid, p_xp integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_current_xp int;
  v_new_xp     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > 100000 THEN
    RAISE EXCEPTION 'Valor de XP inválido: %', p_xp;
  END IF;

  SELECT COALESCE(total_xp, 0) INTO v_current_xp FROM public.profiles WHERE user_id = v_uid;
  v_new_xp := COALESCE(v_current_xp, 0) + p_xp;

  UPDATE public.profiles
     SET total_xp = v_new_xp,
         level    = GREATEST(level, public.get_level_from_xp_v2(v_new_xp))
   WHERE user_id = v_uid;
END;
$$;
