-- Conquistas que não exigem rotina saem da torneira e passam a pagar fragmento.
--
-- A regra de ouro (DESIGN_ROTINA_TORNEIRA §1.1): só gera XP/ouro aquilo que EXIGE
-- a ação da rotina ser cumprida. "Completou 7 dias" pode pagar XP porque é a
-- rotina agregada; "matou um boss" não, porque combate é ralo.
--
-- Auditoria das 12 conquistas em produção:
--
--   EXIGEM rotina  → mantêm XP/ouro
--     missions_total   (first_mission, missions_30_total)
--     missions_streak  (missions_7_streak)
--     water_streak     (water_7_days)      -- âncora de saúde: ação diária real
--     level_reached    (level_5/10/20)     -- ver nota abaixo
--
--   NÃO exigem rotina → viram fragmento de portal
--     boss_kills       (boss_first_kill 100 XP/60 ouro, boss_5_kills 150/80)
--     friends_total    (friend_first 40/25)
--     loadout_full     (full_loadout 30/20)
--     journal_entries  (journal_7_entries 50/30)
--
-- Somadas, essas cinco entregavam 370 XP e 215 de ouro sem que a pessoa
-- precisasse cumprir uma única missão — o vazamento que o invariante da
-- torneira única proíbe.
--
-- Nota sobre level_reached: chegar ao nível 10 só acontece pela rotina, então
-- passa na regra de ouro. Mas é XP pago por ter acumulado XP, ou seja,
-- amplificação da própria torneira. Fica como está por ora; se a curva de
-- progressão for reaberta, este é o primeiro lugar a revisitar.
--
-- Fragmento é o mesmo ralo que o bônus diário já usa em produção: alimenta
-- portais e dungeons, que devolvem variedade, não progressão. Conversão usada:
-- ~50 XP = 1 fragmento, mínimo 1 (dungeon custa 10).

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS fragment_reward integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.achievements.fragment_reward IS
  'Fragmentos de portal concedidos. Usado por conquistas que NÃO exigem rotina '
  'cumprida — elas não podem pagar XP/ouro (torneira única).';

UPDATE public.achievements SET xp_reward = 0, gold_reward = 0, fragment_reward = 2
 WHERE slug = 'boss_first_kill';
UPDATE public.achievements SET xp_reward = 0, gold_reward = 0, fragment_reward = 3
 WHERE slug = 'boss_5_kills';
UPDATE public.achievements SET xp_reward = 0, gold_reward = 0, fragment_reward = 1
 WHERE slug IN ('friend_first', 'full_loadout', 'journal_7_entries');


-- O tipo de retorno muda, então CREATE OR REPLACE não serve.
DROP FUNCTION IF EXISTS public.claim_achievement(uuid);

CREATE FUNCTION public.claim_achievement(p_user_achievement_id uuid)
RETURNS TABLE (xp_reward int, gold_reward int, fragment_reward int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid;
  v_ach_id     uuid;
  v_user_id    uuid;
  v_claimed    timestamptz;
  v_xp         int;
  v_gold       int;
  v_frags      int;
  v_week_start date := date_trunc('week', now())::date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Lock da linha do user_achievement para impedir resgate duplo concorrente.
  SELECT ua.user_id, ua.achievement_id, ua.claimed_at
    INTO v_user_id, v_ach_id, v_claimed
  FROM public.user_achievements ua
  WHERE ua.id = p_user_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Conquista não encontrada'; END IF;
  IF v_user_id <> v_uid THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_claimed IS NOT NULL THEN RAISE EXCEPTION 'Conquista já resgatada'; END IF;

  SELECT a.xp_reward, a.gold_reward, a.fragment_reward
    INTO v_xp, v_gold, v_frags
  FROM public.achievements a
  WHERE a.id = v_ach_id;

  -- Marca como resgatada antes de conceder a recompensa (idempotência).
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

  -- Mesmo caminho que claim_daily_bonus usa: a semana precisa ser respeitada,
  -- senão o contador semanal de fragmentos carrega valor de semana passada.
  IF COALESCE(v_frags, 0) > 0 THEN
    INSERT INTO public.player_portal_fragments (
      user_id, fragments, lifetime_fragments, weekly_fragments, week_start
    )
    VALUES (v_uid, v_frags, v_frags, v_frags, v_week_start)
    ON CONFLICT (user_id) DO UPDATE SET
      fragments          = player_portal_fragments.fragments + v_frags,
      lifetime_fragments = player_portal_fragments.lifetime_fragments + v_frags,
      weekly_fragments   = CASE
                             WHEN player_portal_fragments.week_start = v_week_start
                             THEN player_portal_fragments.weekly_fragments + v_frags
                             ELSE v_frags
                           END,
      week_start = v_week_start,
      updated_at = now();
  END IF;

  RETURN QUERY SELECT v_xp, v_gold, COALESCE(v_frags, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement(uuid) TO authenticated;
