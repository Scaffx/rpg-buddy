-- Registra no repositório a versão VIVA de claim_daily_bonus (e as colunas de
-- player_portal_fragments que a acompanham). Não muda comportamento nenhum em
-- produção: é o repositório passando a reproduzir o que o banco já tem.
--
-- Por que era um risco: 20260531003000_claim_daily_bonus_rpc.sql é a última
-- migration versionada que define a função, e ela paga 15 + (nível−1)*3 de XP e
-- ouro por nível. A troca para "1 fragmento, xp 0, gold 0" foi aplicada direto
-- no banco, sem migration. Qualquer `supabase db reset`, ambiente novo ou replay
-- da ordem cronológica ressuscitava o vazamento — bônus de login pagando
-- progressão, contra o invariante da torneira única (DESIGN_ROTINA_TORNEIRA §1.1
-- e REGRAS_DE_NEGOCIO §2.1: login é gancho de retorno, devolve fragmento).
--
-- Corpo copiado de pg_get_functiondef na produção, não reescrito.
--
-- Fica de fora, por não ter definição viva capturada: o helper
-- public._anchor_status_today(uuid, date), que esta função chama e que nenhuma
-- migration do repositório cria. Enquanto ele não for versionado, um ambiente
-- novo levanta a função mas quebra na chamada. Ver REGRAS_DE_NEGOCIO §2.3.

-- Colunas que a produção já tem e o CREATE TABLE versionado não: o IF NOT EXISTS
-- deixa a migration segura contra o banco atual e completa contra um banco novo.
ALTER TABLE public.player_portal_fragments
  ADD COLUMN IF NOT EXISTS weekly_fragments integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS pending_dungeon text,
  ADD COLUMN IF NOT EXISTS dungeon_revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dungeon_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dungeon_reveal_level smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_today date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_last timestamptz;
  v_frags int := 1;
  v_week_start date := date_trunc('week', now())::date;
  v_has_anchors boolean;
  v_anchors_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  SELECT created_at INTO v_last FROM public.activity_log
   WHERE user_id = v_uid AND action = 'daily_bonus'
   ORDER BY created_at DESC LIMIT 1;
  IF v_last IS NOT NULL AND (now() - v_last) < interval '24 hours' THEN
    RAISE EXCEPTION 'Aguarde 24h desde a última coleta para coletar novamente!';
  END IF;

  SELECT a.has_anchors, a.all_complete INTO v_has_anchors, v_anchors_ok
  FROM public._anchor_status_today(v_uid, p_today) a;
  IF v_has_anchors AND NOT v_anchors_ok THEN
    RAISE EXCEPTION 'Complete suas âncoras de hoje para liberar o bônus';
  END IF;

  INSERT INTO public.player_portal_fragments (user_id, fragments, lifetime_fragments, weekly_fragments, week_start)
  VALUES (v_uid, v_frags, v_frags, v_frags, v_week_start)
  ON CONFLICT (user_id) DO UPDATE SET
    fragments          = player_portal_fragments.fragments + v_frags,
    lifetime_fragments = player_portal_fragments.lifetime_fragments + v_frags,
    weekly_fragments   = CASE WHEN player_portal_fragments.week_start = v_week_start
                              THEN player_portal_fragments.weekly_fragments + v_frags
                              ELSE v_frags END,
    week_start = v_week_start, updated_at = now();

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'daily_bonus', 'Bônus diário: +' || v_frags || ' fragmento de portal', 0);

  RETURN jsonb_build_object('xp', 0, 'gold', 0, 'fragments', v_frags);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_bonus(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_daily_bonus(date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_daily_bonus(date) TO authenticated;
