-- ================================================================
-- Securiza add_gold_to_user / add_xp_to_user.
--
-- Antes: SECURITY DEFINER, executáveis por `anon`, aceitavam um
-- p_user_id ARBITRÁRIO e uma quantidade arbitrária, SEM checar auth.uid().
-- Resultado: qualquer pessoa (até deslogada) podia conceder ouro/XP
-- ilimitado a QUALQUER conta — exploit aberto de economia.
--
-- Agora: exige autenticação; ignora p_user_id do cliente e sempre opera
-- na conta autenticada (auth.uid()); fixa search_path; clampa valores
-- absurdos; revoga acesso de anon.
--
-- Nota: a assinatura (uuid, integer) é mantida para não quebrar as chamadas
-- existentes do client (DungeonArena, NpcPage), que já passam o próprio id.
-- O resíduo (cliente ainda decide a QUANTIDADE) será eliminado quando o
-- cálculo de recompensa de combate migrar para o servidor.
-- ================================================================

CREATE OR REPLACE FUNCTION public.add_gold_to_user(p_user_id uuid, p_gold integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_gold IS NULL OR p_gold < 0 OR p_gold > 100000 THEN
    RAISE EXCEPTION 'Valor de ouro inválido: %', p_gold;
  END IF;
  -- p_user_id é ignorado de propósito: a operação é sempre na conta autenticada.
  UPDATE public.user_balance
     SET gold = COALESCE(gold, 0) + p_gold,
         updated_at = now()
   WHERE user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_xp_to_user(p_user_id uuid, p_xp integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_current_xp  int;
  v_new_xp      int;
  v_new_level   int;
  xp_table      int[] := ARRAY[
       0,   80,  180,  300,  440,  600,  775,  960, 1155, 1360,
    1575, 1800, 2040, 2295, 2565, 2855, 3165, 3495, 3850, 4230,
    4640, 5080, 5555, 6065, 6615, 7205, 7840, 8520, 9250,10035,
   10875,11775
  ];
  i             int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > 100000 THEN
    RAISE EXCEPTION 'Valor de XP inválido: %', p_xp;
  END IF;

  SELECT COALESCE(total_xp, 0) INTO v_current_xp
    FROM public.profiles WHERE user_id = v_uid;
  v_new_xp := COALESCE(v_current_xp, 0) + p_xp;
  v_new_level := 1;
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_new_xp >= xp_table[i] THEN
      v_new_level := i;
      EXIT;
    END IF;
  END LOOP;

  UPDATE public.profiles
     SET total_xp = v_new_xp,
         level    = GREATEST(level, v_new_level)
   WHERE user_id = v_uid;
END;
$$;

-- Revoga de PUBLIC (e anon): toda função nasce com EXECUTE para PUBLIC,
-- então revogar só de anon não basta — anon herda via PUBLIC.
REVOKE EXECUTE ON FUNCTION public.add_gold_to_user(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(uuid, integer)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_gold_to_user(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(uuid, integer)  FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_gold_to_user(uuid, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.add_xp_to_user(uuid, integer)  TO authenticated;
