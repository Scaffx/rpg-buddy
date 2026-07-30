-- F6 — Derrota com peso.
--
-- Cair numa dungeon não custava nada: o perfil voltava com HP cheio, MP cheio e
-- fadiga zerada. Sem consequência, entrar no portal não é uma decisão — é só um
-- botão. Agora a queda cobra do CORPO, nunca do XP.
--
-- XP fica intocado de propósito (spec §4/§5, "Rotina é a Torneira"): o XP foi
-- ganho acordando cedo e estudando; um dado ruim numa masmorra não pode apagar
-- rotina passada, senão o combate — que é ralo — passaria a taxar a torneira.
-- A recuperação passa por descanso, refeição, água e pets, e é isso que devolve
-- o jogador à rotina.

-- Graça única: a PRIMEIRA queda em portal da vida do jogador devolve o portal
-- (não os fragmentos). Mesma filosofia do "nunca falhe duas vezes" das missões.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_defeat_grace_used boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.portal_defeat_grace_used IS
  'A primeira derrota em portal devolve o portal (sem os fragmentos). Depois disso, cair fecha o portal de vez.';

CREATE OR REPLACE FUNCTION public.resolve_combat_defeat(p_context text DEFAULT 'boss')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_max_hp       int;
  v_fatigue      int;
  v_grace_used   boolean;
  v_grace_now    boolean := false;
  v_portal_lost  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  -- Corpo: sai vivo por um fio e exausto.
  SELECT COALESCE(max_hp, 100), COALESCE(fatigue, 0)
    INTO v_max_hp, v_fatigue
  FROM public.user_health_stats
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_health_stats (user_id, current_hp, fatigue)
    VALUES (v_uid, 1, 80)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    UPDATE public.user_health_stats
    SET current_hp = 1,
        fatigue    = LEAST(100, GREATEST(COALESCE(fatigue, 0), 80)),
        updated_at = now()
    WHERE user_id = v_uid;
  END IF;

  -- Encerra a luta em aberto, liberando o jogador para a próxima.
  UPDATE public.combates_ativos
  SET status = 'derrota', updated_at = now()
  WHERE personagem_id = v_uid
    AND status = 'em_andamento';

  -- No portal, a queda também consome os fragmentos e fecha a passagem —
  -- salvo na primeira vez da vida, que serve para ensinar a regra.
  IF p_context = 'portal' THEN
    SELECT COALESCE(portal_defeat_grace_used, false) INTO v_grace_used
    FROM public.profiles WHERE user_id = v_uid FOR UPDATE;

    IF NOT COALESCE(v_grace_used, false) THEN
      v_grace_now := true;
      UPDATE public.profiles SET portal_defeat_grace_used = true WHERE user_id = v_uid;
    ELSE
      v_portal_lost := true;
      UPDATE public.player_portal_fragments
      SET pending_dungeon      = NULL,
          dungeon_revealed_at  = NULL,
          dungeon_expires_at   = NULL,
          updated_at           = now()
      WHERE user_id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'hp_restante',  1,
    'fatigue',      LEAST(100, GREATEST(v_fatigue, 80)),
    'grace_used',   v_grace_now,
    'portal_lost',  v_portal_lost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_combat_defeat(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_combat_defeat(text) TO authenticated;

-- Limpeza: apply_xp_penalty era o único caminho que tirava XP do jogador e está
-- órfã desde a spec da torneira (nenhuma chamada no app; missionFailNoPenalty
-- garante isso em teste). Código morto de penalidade é convite a religar a
-- coisa errada mais tarde.
DROP FUNCTION IF EXISTS public.apply_xp_penalty(integer);
